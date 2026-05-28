"""Single-Editor-Lock-Service (D-13 + RESEARCH §Example 3).

Drei wesentliche Operationen:

    * ``acquire(model_id, user_uid)`` — versucht Insert in ``model_locks``;
      bei PK-Konflikt → ``AcquireResult.success=False`` mit Conflict-Info.
      Vor jedem Acquire wird ``cleanup_stale()`` gerufen, damit abgelaufene
      Locks nicht den neuen Owner blockieren (Pitfall #4).

    * ``heartbeat(model_id, token, user_uid)`` — UPDATE ``expires_at`` wenn
      (model, token, owner) matched UND noch nicht abgelaufen. Sonst
      ``None`` (Frontend → Re-Acquire-Flow).

    * ``release(model_id, token, user_uid)`` — DELETE wenn (model, token,
      owner) matched. Sonst ``False`` (kein Owner-Hijack möglich).

Plus zwei Helper:

    * ``validate_token(...)`` — read-only Check für den Save-Endpoint.
    * ``cleanup_stale()`` — DELETE aller abgelaufenen Locks.

Portabilitäts-Hinweis: Token wird Python-seitig (``uuid.uuid4()``) generiert
und als bound parameter ins Insert gegeben. Damit funktioniert der Service
sowohl gegen Postgres (das auch eine Default-``gen_random_uuid()``-Spalte
hätte) als auch gegen SQLite (keine UUID-Default-Function) — und Tests
laufen ohne docker.

Zeit-Handling: ``datetime.utcnow()`` Python-seitig statt Postgres' ``NOW()``,
damit der Service backend-agnostisch ist und sich gut testen lässt. Im
Service-Code taucht ``NOW()`` nur in einer Stelle auf: ``cleanup_stale()``
nutzt den DB-NOW(), weil die DELETE-Operation atomar in der DB stattfinden
soll und Python-NOW() vs DB-NOW() bei langen Connections driften kann.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID


def _utcnow() -> datetime:
    """UTC-now als naive datetime (kompatibel zu Postgres TIMESTAMP).

    ``datetime.utcnow()`` ist seit Python 3.12 deprecated. ``datetime.now(
    timezone.utc).replace(tzinfo=None)`` liefert dieselbe Semantik (UTC,
    naiv), ohne Deprecation-Warning.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)

import structlog
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError

from app.api.schemas.lock import AcquireResult, HeartbeatResponse, LockConflict
from app.core.config import settings

log = structlog.get_logger(__name__)


class LockService:
    """Single-Editor-Lock-Service. Sync. Eine Connection pro Instanz.

    Lifecycle: in FastAPI-Endpoints via ``Depends(get_lock_service)`` mit
    ``Depends(get_db)`` als Connection-Source (siehe Plan 04 Task 5). Jeder
    Request bekommt eine eigene Connection (search_path bereits auf Tenant
    gesetzt).
    """

    def __init__(self, conn: Connection, tenant_id: str | None = None) -> None:
        """Args:
            conn: SQLAlchemy-Connection mit bereits gesetztem search_path
                (search_path = "tenant_<id>", public — von get_db).
            tenant_id: Tenant-ID fuer search_path-Restore nach rollback
                (Rule-1-Fix Plan 01-05 Task 7). Optional, weil SQLite-Tests
                keinen search_path haben.
        """
        self.conn = conn
        self.tenant_id = tenant_id

    # ------------------------------------------------------------------
    # cleanup_stale
    # ------------------------------------------------------------------

    def cleanup_stale(self) -> int:
        """Lösche alle abgelaufenen Locks. Liefert Anzahl gelöschter Zeilen.

        Wird vor jedem Acquire aufgerufen — defensiv gegen Stale-Locks, die
        z.B. durch Tab-Crash oder Connection-Drop entstehen können.
        """
        result = self.conn.execute(
            text("DELETE FROM model_locks WHERE expires_at < NOW()")
        )
        # SQLAlchemy 2: rowcount kann -1 sein, wenn der Driver es nicht
        # weiß. Wir behandeln -1 als 0.
        return max(result.rowcount or 0, 0)

    # ------------------------------------------------------------------
    # acquire
    # ------------------------------------------------------------------

    def acquire(self, model_id: UUID, user_uid: str) -> AcquireResult:
        """Versuche einen Lock auf ``model_id`` für ``user_uid``.

        Strategie:
            1. cleanup_stale() — abgelaufene Locks räumen, damit der neue
               Owner den Slot bekommt.
            2. INSERT mit Python-generiertem token + expires_at.
            3. IntegrityError (PK-Konflikt auf ``model_id``) → lese den
               aktuellen Owner und liefere AcquireResult(success=False).

        Returns:
            AcquireResult mit ``success`` + entweder ``token/expires_at``
            (success) oder ``conflict`` (kein Lock).
        """
        self.cleanup_stale()

        token = uuid.uuid4()
        expires_at = _utcnow() + timedelta(
            seconds=settings.lock_ttl_seconds
        )

        try:
            self.conn.execute(
                text(
                    """
                    INSERT INTO model_locks(model_id, owner_user_uid, expires_at, token)
                    VALUES (:mid, :uid, :exp, :tok)
                    """
                ),
                {
                    "mid": str(model_id),
                    "uid": user_uid,
                    "exp": expires_at,
                    "tok": str(token),
                },
            )
            self.conn.commit()
        except IntegrityError:
            # Rule-1-Fix (Plan 01-05 Task 7): ``conn.rollback()`` aborted
            # die laufende Transaktion inkl. des ``SET search_path``, das
            # ``get_db`` beim Connection-Start aufgesetzt hat. Folgende
            # SELECTs landen dann im public-Schema und scheitern mit
            # "relation model_locks does not exist". Wir setzen den
            # search_path nach dem rollback wieder, wenn wir die
            # tenant_id kennen.
            self.conn.rollback()
            if self.tenant_id:
                # Whitelist-Validation in ``app.core.database._SLUG_PATTERN``
                # hat den Slug schon validiert (passed durch ``get_db``).
                self.conn.execute(
                    text(
                        f'SET search_path TO "tenant_{self.tenant_id}", public'
                    )
                )
            # Lock-Owner abfragen — der Conflict-Body soll dem Frontend
            # den aktuellen Owner zeigen.
            row = self.conn.execute(
                text(
                    """
                    SELECT owner_user_uid, expires_at
                    FROM model_locks
                    WHERE model_id = :mid
                    """
                ),
                {"mid": str(model_id)},
            ).one_or_none()

            if row is None:
                # Race: zwischen IntegrityError und Read wurde der Lock
                # gelöscht. Defensiv: noch ein Versuch.
                log.warning(
                    "lock.acquire_race_after_integrity_error",
                    model_id=str(model_id),
                )
                return self.acquire(model_id, user_uid)

            # Re-entrant Acquire (Welle 1.2-I — Fix Save-/Lock-Data-Loss):
            # Hält DERSELBE User den Lock bereits, ist das kein Foreign-
            # Konflikt, sondern ein Reclaim. Häufigster Fall: F5 / Tab-Close,
            # bei dem der beforeunload-Release (releaseLockSync) ohne Auth-
            # Header mit 401 scheitert und der alte Lock bis zum TTL (60 s)
            # bestehen bleibt. Ohne diesen Zweig sperrt sich der User aus
            # seinem EIGENEN Modell aus → 409 → status="foreign" → Save-Button
            # disabled → Cell-Edits gehen bei F5 verloren.
            #
            # Single-Editor == Single-USER, nicht Single-Tab: wir geben dem
            # Owner seinen Lock mit frischem Token + TTL zurück. Ein evtl.
            # zweiter Tab desselben Users invalidiert damit seinen alten Token
            # (nächster Heartbeat → 404 → Reload) — korrektes Single-Editor-
            # Verhalten ("last tab wins").
            if row.owner_user_uid == user_uid:
                new_token = uuid.uuid4()
                new_expires = _utcnow() + timedelta(
                    seconds=settings.lock_ttl_seconds
                )
                self.conn.execute(
                    text(
                        """
                        UPDATE model_locks
                        SET token = :tok, expires_at = :exp
                        WHERE model_id = :mid
                        """
                    ),
                    {
                        "tok": str(new_token),
                        "exp": new_expires,
                        "mid": str(model_id),
                    },
                )
                self.conn.commit()
                log.info(
                    "lock.reacquired_same_user",
                    model_id=str(model_id),
                    user_uid=user_uid,
                )
                return AcquireResult(
                    success=True,
                    token=new_token,
                    expires_at=new_expires,
                )

            expires = _coerce_datetime(row.expires_at)
            return AcquireResult(
                success=False,
                conflict=LockConflict(
                    code="E_MODEL_LOCKED",
                    owner_user_uid=row.owner_user_uid,
                    expires_at=expires,
                ),
            )

        log.info(
            "lock.acquired",
            model_id=str(model_id),
            user_uid=user_uid,
            expires_at=expires_at.isoformat(),
        )
        return AcquireResult(
            success=True,
            token=token,
            expires_at=expires_at,
        )

    # ------------------------------------------------------------------
    # heartbeat
    # ------------------------------------------------------------------

    def heartbeat(
        self, model_id: UUID, token: UUID, user_uid: str
    ) -> HeartbeatResponse | None:
        """Verlängere ``expires_at`` wenn (model_id, token, owner) matched.

        Returns:
            ``HeartbeatResponse`` mit neuem ``expires_at``, oder ``None``,
            wenn der Lock abgelaufen oder Token/Owner falsch ist (Frontend
            interpretiert ``None`` als E_LOCK_EXPIRED).
        """
        new_expires = _utcnow() + timedelta(
            seconds=settings.lock_ttl_seconds
        )

        # UPDATE … WHERE owner_uid + token + expires_at >= NOW() → entweder
        # 1 Zeile geupdated, oder 0 (token falsch / owner falsch / abgelaufen).
        # RETURNING ist Postgres-exclusive — wir nutzen rowcount + Folge-SELECT
        # für SQLite-Portabilität.
        result = self.conn.execute(
            text(
                """
                UPDATE model_locks
                SET expires_at = :new
                WHERE model_id = :mid
                  AND token = :tok
                  AND owner_user_uid = :uid
                  AND expires_at >= NOW()
                """
            ),
            {
                "new": new_expires,
                "mid": str(model_id),
                "tok": str(token),
                "uid": user_uid,
            },
        )
        self.conn.commit()

        if (result.rowcount or 0) == 0:
            return None

        return HeartbeatResponse(expires_at=new_expires)

    # ------------------------------------------------------------------
    # release
    # ------------------------------------------------------------------

    def release(self, model_id: UUID, token: UUID, user_uid: str) -> bool:
        """Lösche den Lock wenn (model_id, token, owner) matched.

        Returns:
            True bei erfolgreichem Release, False sonst (kein Owner-Hijack).
        """
        result = self.conn.execute(
            text(
                """
                DELETE FROM model_locks
                WHERE model_id = :mid
                  AND token = :tok
                  AND owner_user_uid = :uid
                """
            ),
            {
                "mid": str(model_id),
                "tok": str(token),
                "uid": user_uid,
            },
        )
        self.conn.commit()

        return (result.rowcount or 0) > 0

    # ------------------------------------------------------------------
    # validate_token
    # ------------------------------------------------------------------

    def validate_token(
        self, model_id: UUID, token: UUID, user_uid: str
    ) -> bool:
        """Prüfe ob Lock noch hält + Token + Owner stimmt.

        Wird vom Save-Endpoint (PUT /models/{id}) verwendet, um vor dem
        Schreiben sicher zu sein, dass der User noch das Edit-Recht hat
        (Mitigation T-04-04 — Lock-Bypass).
        """
        row = self.conn.execute(
            text(
                """
                SELECT 1
                FROM model_locks
                WHERE model_id = :mid
                  AND token = :tok
                  AND owner_user_uid = :uid
                  AND expires_at >= NOW()
                """
            ),
            {
                "mid": str(model_id),
                "tok": str(token),
                "uid": user_uid,
            },
        ).one_or_none()

        return row is not None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _coerce_datetime(value) -> datetime:
    """Konvertiere DB-Rückgabewerte ggf. zu datetime.

    Postgres+psycopg3 liefert bereits ``datetime``-Objekte. SQLite via
    SQLAlchemy gibt Strings zurück (ISO-Format), wenn die Spalte als TEXT
    deklariert ist (was bei unserem Test-Setup der Fall ist). Diese Helper-
    Funktion glättet den Unterschied.
    """
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # Tolerante ISO-Parser-Variante: ``datetime.fromisoformat`` akzeptiert
        # "2026-05-21 07:42:00.123456" auf Python 3.11+.
        return datetime.fromisoformat(value)
    raise TypeError(f"Unsupported expires_at type: {type(value)!r}")


__all__ = [
    "LockService",
]
