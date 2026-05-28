"""Unit-Tests für ``app/services/lock_service.py``.

Tests laufen gegen ein SQLite-in-memory-Backend mit einer SQLite-angepassten
``model_locks``-DDL (Postgres-spezifische Typen wie ``UUID`` werden auf
``TEXT`` heruntergemappt, ``NOW()`` auf ``CURRENT_TIMESTAMP``).

Echte Postgres-Integration kommt in Plan 05 (``test_lock_endpoints.py``)
mit laufendem docker compose.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterator


def _utcnow() -> datetime:
    """UTC-now naiv (Python 3.12+-kompatible Variante)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from app.services.lock_service import LockService


# ---------------------------------------------------------------------------
# SQLite-Fixture
# ---------------------------------------------------------------------------


# Wir registrieren NOW() als SQLite-Function, damit die Postgres-NOW()-Aufrufe
# im LockService 1:1 funktionieren. CURRENT_TIMESTAMP würde funktionieren,
# aber wir wollen das Service-Code-NOW()-Pattern testen.


def _install_now_function(engine: Engine) -> None:
    """Registriere eine ``NOW()``-SQL-Function auf SQLite (Connect-Listener)."""
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def _register(dbapi_connection, _):
        def _now():
            return _utcnow().isoformat(sep=" ", timespec="microseconds")

        dbapi_connection.create_function("now", 0, _now)


# DDL — SQLite-Variante der model_locks-Tabelle.
# Postgres: model_id UUID, owner_user_uid TEXT, acquired_at TIMESTAMP DEFAULT
#   NOW(), expires_at TIMESTAMP NOT NULL, token UUID DEFAULT gen_random_uuid()
# SQLite:   model_id TEXT, owner_user_uid TEXT, acquired_at TEXT DEFAULT
#   NOW(), expires_at TEXT NOT NULL, token TEXT NOT NULL
# Wir generieren `token` Python-seitig (uuid4) und übergeben ihn dem Insert,
# weil SQLite keine UUID-Default-Funktion hat. Der echte Service nutzt
# Postgres' `gen_random_uuid()` (Default in der DDL).
SQLITE_DDL = """
CREATE TABLE model_locks (
    model_id TEXT PRIMARY KEY,
    owner_user_uid TEXT NOT NULL,
    acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    token TEXT NOT NULL
);
"""


@pytest.fixture
def sqlite_conn() -> Iterator[Connection]:
    """Liefere eine SQLite-Connection mit model_locks-Tabelle + NOW()-Func."""
    engine = create_engine("sqlite:///:memory:")
    _install_now_function(engine)

    with engine.connect() as conn:
        conn.execute(text(SQLITE_DDL))
        conn.commit()
        yield conn


@pytest.fixture
def lock_service(
    sqlite_conn: Connection, monkeypatch
) -> LockService:
    """LockService gegen die SQLite-Connection.

    Patche ``settings.lock_ttl_seconds`` auf 60 (Default) für deterministische
    Tests.
    """
    from app.core import config as config_module

    monkeypatch.setattr(config_module.settings, "lock_ttl_seconds", 60)
    return LockService(sqlite_conn)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_acquire_succeeds_on_free_model(lock_service: LockService) -> None:
    """acquire auf ein freies Modell → success=True, token gesetzt."""
    model_id = uuid.uuid4()
    result = lock_service.acquire(model_id, user_uid="alice")
    assert result.success is True
    assert result.token is not None
    assert result.expires_at is not None
    assert result.conflict is None


def test_acquire_conflicts_if_held_by_other(lock_service: LockService) -> None:
    """acquire(model, user_A) success; acquire(model, user_B) → conflict."""
    model_id = uuid.uuid4()
    result_a = lock_service.acquire(model_id, user_uid="alice")
    assert result_a.success is True

    result_b = lock_service.acquire(model_id, user_uid="bob")
    assert result_b.success is False
    assert result_b.conflict is not None
    assert result_b.conflict.owner_user_uid == "alice"


def test_acquire_reentrant_same_user_refreshes_lock(
    lock_service: LockService,
) -> None:
    """Re-entrant Acquire (Welle 1.2-I): derselbe User re-acquired seinen
    eigenen, noch nicht abgelaufenen Lock (F5/Tab-Close-Szenario) → kein
    409-Conflict, sondern success=True mit FRISCHEM Token.
    """
    model_id = uuid.uuid4()
    first = lock_service.acquire(model_id, user_uid="alice")
    assert first.success is True and first.token is not None

    # Zweiter Acquire durch DENSELBEN User — alter Lock ist noch da (kein
    # cleanup_stale-Treffer, weil < TTL), normalerweise IntegrityError.
    second = lock_service.acquire(model_id, user_uid="alice")
    assert second.success is True
    assert second.conflict is None
    assert second.token is not None
    # Frischer Token — der alte Tab-Token ist damit invalidiert.
    assert second.token != first.token

    # Alter Token funktioniert nicht mehr (Heartbeat → None → expired).
    assert (
        lock_service.heartbeat(model_id, first.token, user_uid="alice") is None
    )
    # Neuer Token ist gültig.
    assert lock_service.validate_token(model_id, second.token, user_uid="alice")


def test_acquire_other_user_still_conflicts(lock_service: LockService) -> None:
    """Re-entrant gilt NUR same-user: ein anderer User bekommt weiterhin den
    409-Conflict (kein Lock-Hijack durch die Welle-1.2-I-Änderung)."""
    model_id = uuid.uuid4()
    lock_service.acquire(model_id, user_uid="alice")
    other = lock_service.acquire(model_id, user_uid="bob")
    assert other.success is False
    assert other.conflict is not None
    assert other.conflict.owner_user_uid == "alice"


def test_heartbeat_extends_expires_at(lock_service: LockService) -> None:
    """heartbeat verlängert expires_at gegenüber dem acquire-Wert."""
    model_id = uuid.uuid4()
    acquired = lock_service.acquire(model_id, user_uid="alice")
    assert acquired.success and acquired.token and acquired.expires_at

    time.sleep(0.05)  # damit der zweite Timestamp wirklich später ist
    hb = lock_service.heartbeat(model_id, acquired.token, user_uid="alice")
    assert hb is not None
    assert hb.expires_at >= acquired.expires_at


def test_heartbeat_fails_with_wrong_token(lock_service: LockService) -> None:
    """heartbeat mit fremdem Token → None (kein silent extend)."""
    model_id = uuid.uuid4()
    lock_service.acquire(model_id, user_uid="alice")
    hb = lock_service.heartbeat(model_id, uuid.uuid4(), user_uid="alice")
    assert hb is None


def test_heartbeat_fails_with_wrong_user(lock_service: LockService) -> None:
    """heartbeat mit korrektem Token aber falschem User → None."""
    model_id = uuid.uuid4()
    acquired = lock_service.acquire(model_id, user_uid="alice")
    hb = lock_service.heartbeat(model_id, acquired.token, user_uid="bob")
    assert hb is None


def test_release_removes_lock(lock_service: LockService) -> None:
    """release durch Owner entfernt den Lock → freies Modell."""
    model_id = uuid.uuid4()
    acquired = lock_service.acquire(model_id, user_uid="alice")
    assert acquired.success

    released = lock_service.release(model_id, acquired.token, user_uid="alice")
    assert released is True

    # Anderer User kann jetzt acquiren.
    new_acquired = lock_service.acquire(model_id, user_uid="bob")
    assert new_acquired.success is True


def test_release_with_wrong_token_returns_false(
    lock_service: LockService,
) -> None:
    """release mit falschem Token → False (Lock bleibt bestehen)."""
    model_id = uuid.uuid4()
    lock_service.acquire(model_id, user_uid="alice")
    released = lock_service.release(model_id, uuid.uuid4(), user_uid="alice")
    assert released is False


def test_validate_token_true_for_owner(lock_service: LockService) -> None:
    """validate_token mit korrekten Daten → True."""
    model_id = uuid.uuid4()
    acquired = lock_service.acquire(model_id, user_uid="alice")
    assert lock_service.validate_token(
        model_id, acquired.token, user_uid="alice"
    )


def test_validate_token_false_for_wrong_owner(lock_service: LockService) -> None:
    """validate_token mit fremdem User → False."""
    model_id = uuid.uuid4()
    acquired = lock_service.acquire(model_id, user_uid="alice")
    assert (
        lock_service.validate_token(model_id, acquired.token, user_uid="bob")
        is False
    )


def test_cleanup_stale_removes_expired(
    sqlite_conn: Connection, monkeypatch
) -> None:
    """Manuell als expired markierte Locks werden von cleanup_stale entfernt."""
    from app.core import config as config_module

    monkeypatch.setattr(config_module.settings, "lock_ttl_seconds", 60)
    service = LockService(sqlite_conn)

    model_id = uuid.uuid4()
    # Manuell einen abgelaufenen Lock einfügen (expires_at = NOW - 1s).
    past = (_utcnow() - timedelta(seconds=1)).isoformat(
        sep=" ", timespec="microseconds"
    )
    sqlite_conn.execute(
        text(
            "INSERT INTO model_locks(model_id, owner_user_uid, expires_at, token) "
            "VALUES(:mid, :uid, :exp, :tok)"
        ),
        {
            "mid": str(model_id),
            "uid": "stale_alice",
            "exp": past,
            "tok": str(uuid.uuid4()),
        },
    )

    removed = service.cleanup_stale()
    assert removed >= 1

    # Jetzt darf ein neuer Acquire durchgehen.
    new = service.acquire(model_id, user_uid="bob")
    assert new.success is True
