"""Edit-Lock-Service (D-13): Single-Editor-Lock auf Modell-Ebene.

Vertrag:
  - acquire_lock: legt eine EditLock-Row an oder uebernimmt einen abgelaufenen
    Lock; race-safe via PK-Constraint + IntegrityError-Retry.
  - release_lock: loescht die EditLock-Row, wenn der Caller der Holder ist.
  - heartbeat_lock: aktualisiert last_heartbeat + expires_at, wenn der Caller
    der Holder ist; sonst 409.
  - get_lock_status: liefert die aktuelle EditLock-Row oder None (mit auto-
    expire-Loeschung wenn abgelaufen).
  - check_lock_for_edit: PUT-/tree-Pflichtcheck. Fail-fast 403, wenn der
    Caller den Lock nicht haelt (oder ein anderer User ihn haelt).

TTL: 15 Minuten ab acquired_at; Heartbeat verlaengert um weitere 15 Minuten.
Konstante ``LOCK_TTL_SECONDS`` kann ueber Settings-/Env-Override geschoben
werden, falls Tests einen kurzen TTL brauchen.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.edit_lock import EditLock

logger = structlog.get_logger(__name__)


# 15 Minuten = 900 Sekunden. In Tests via monkeypatch direkt im Modul aenderbar.
LOCK_TTL_SECONDS: int = 15 * 60


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _expires_in(seconds: int) -> datetime:
    return _now_utc() + timedelta(seconds=seconds)


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


async def get_lock_status(
    model_id: int, db: AsyncSession
) -> EditLock | None:
    """Liefert den aktiven Lock fuer ein Modell oder None.

    Side-Effect: wenn der gefundene Lock bereits abgelaufen ist, wird er
    geloescht und None zurueckgegeben (Lazy-Expire-Cleanup -- vermeidet
    Geister-Locks).
    """
    row = (
        await db.execute(
            select(EditLock).where(EditLock.model_id == model_id)
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    now = _now_utc()
    # Datetime aus DB ist tz-aware (TIMESTAMPTZ). Defensive Comparison.
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires <= now:
        await db.execute(delete(EditLock).where(EditLock.model_id == model_id))
        await db.commit()
        logger.info("lock_auto_expired", model_id=model_id, holder=row.holder_uid)
        return None
    return row


# ---------------------------------------------------------------------------
# Acquire
# ---------------------------------------------------------------------------


class LockHeldByOtherError(HTTPException):
    """Lock ist von einem anderen User belegt -- 409 mit Lock-Info."""

    def __init__(self, lock: EditLock) -> None:
        super().__init__(
            status_code=409,
            detail={
                "type": "https://osim-ui.local/problems/lock-held",
                "title": "Modell ist gerade von einem anderen User in Bearbeitung.",
                "holder_uid": lock.holder_uid,
                "holder_email": lock.holder_email,
                "expires_at": lock.expires_at.isoformat(),
            },
        )


async def acquire_lock(
    *,
    model_id: int,
    user_uid: str,
    user_email: str,
    db: AsyncSession,
) -> EditLock:
    """Akquiriert einen Edit-Lock.

    Verhalten:
      - Frei oder abgelaufen oder von demselben User gehalten:
        existing-Lock wird upgedatet (verlaengert + heartbeat); kein
        zweites Row.
      - Von anderem User gehalten und nicht abgelaufen:
        raised LockHeldByOtherError (-> HTTP 409 mit Lock-Info).
    """
    # Erster Versuch: existierenden Lock holen.
    existing = await get_lock_status(model_id, db)
    if existing is not None and existing.holder_uid != user_uid:
        raise LockHeldByOtherError(existing)

    now = _now_utc()
    new_expires = _expires_in(LOCK_TTL_SECONDS)

    if existing is not None:
        # Eigener Lock -> verlaengern.
        existing.last_heartbeat_at = now
        existing.expires_at = new_expires
        await db.commit()
        logger.info("lock_extended", model_id=model_id, holder=user_uid)
        return existing

    # Insert. Race-Window: ein anderer Request koennte parallel inserten.
    lock = EditLock(
        model_id=model_id,
        holder_uid=user_uid,
        holder_email=user_email,
        acquired_at=now,
        last_heartbeat_at=now,
        expires_at=new_expires,
    )
    db.add(lock)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Race-Resolved: parallelen Lock holen, pruefen.
        other = await get_lock_status(model_id, db)
        if other is None:
            # Sehr unwahrscheinlich (gerade expired) -> retry-Insert.
            lock = EditLock(
                model_id=model_id,
                holder_uid=user_uid,
                holder_email=user_email,
                acquired_at=now,
                last_heartbeat_at=now,
                expires_at=new_expires,
            )
            db.add(lock)
            await db.commit()
            return lock
        if other.holder_uid != user_uid:
            raise LockHeldByOtherError(other) from None
        return other
    logger.info("lock_acquired", model_id=model_id, holder=user_uid)
    return lock


# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------


async def release_lock(
    *,
    model_id: int,
    user_uid: str,
    db: AsyncSession,
) -> bool:
    """Loescht den Lock, wenn er vom Caller gehalten wird.

    Returns:
        True, wenn ein Lock entfernt wurde. False, wenn kein eigener Lock
        existierte (idempotent -- 204 ist auch dann legitim).
    """
    result = await db.execute(
        delete(EditLock).where(
            EditLock.model_id == model_id,
            EditLock.holder_uid == user_uid,
        )
    )
    await db.commit()
    deleted = (result.rowcount or 0) > 0
    if deleted:
        logger.info("lock_released", model_id=model_id, holder=user_uid)
    return deleted


# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------


async def heartbeat_lock(
    *,
    model_id: int,
    user_uid: str,
    db: AsyncSession,
) -> EditLock:
    """Verlaengert die TTL des bestehenden Locks.

    Raises:
        HTTPException(404): wenn kein Lock fuer das Modell existiert.
        HTTPException(409): wenn der Lock von einem anderen User gehalten wird.
    """
    existing = await get_lock_status(model_id, db)
    if existing is None:
        raise HTTPException(
            status_code=404, detail="Kein aktiver Lock fuer dieses Modell."
        )
    if existing.holder_uid != user_uid:
        raise LockHeldByOtherError(existing)
    existing.last_heartbeat_at = _now_utc()
    existing.expires_at = _expires_in(LOCK_TTL_SECONDS)
    await db.commit()
    return existing


# ---------------------------------------------------------------------------
# Pflicht-Check fuer PUT/tree
# ---------------------------------------------------------------------------


async def check_lock_for_edit(
    *,
    model_id: int,
    user_uid: str,
    db: AsyncSession,
) -> None:
    """Stellt sicher, dass der Caller den aktiven Lock fuer das Modell haelt.

    Raises:
        HTTPException(403): wenn der Caller den Lock nicht haelt (kein Lock
            oder Lock-Held-By-Other).
    """
    existing = await get_lock_status(model_id, db)
    if existing is None:
        raise HTTPException(
            status_code=403,
            detail={
                "type": "https://osim-ui.local/problems/lock-required",
                "title": "Edit-Lock erforderlich.",
                "detail": (
                    "Bitte erst POST /api/v1/models/{id}/lock aufrufen, "
                    "bevor Save-back-Operationen erlaubt sind."
                ),
            },
        )
    if existing.holder_uid != user_uid:
        raise LockHeldByOtherError(existing)
