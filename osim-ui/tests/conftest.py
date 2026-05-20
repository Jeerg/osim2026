"""Pytest-Fixtures fuer osim-ui-Tests.

Strategie:
- DB-Tests laufen gegen eine *separate* Postgres-Test-DB (env ``TEST_DATABASE_URL``,
  default ``postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/osim_ui_test``).
- Wenn die Test-DB nicht erreichbar ist, werden DB-Tests geskippt
  (sinnvoll fuer CI ohne Postgres).
- Schema wird pro Test-Session per ``Base.metadata.create_all`` aufgebaut --
  Alembic-Roundtrip wird in ``test_alembic.py`` separat verifiziert.
- Firebase-Tokens werden gemockt: ``verify_token`` wird via
  ``monkeypatch`` auf ``fake_verify`` umgeschaltet, das einen vorgefertigten
  Claims-Dict zurueckgibt.
"""

from __future__ import annotations

import asyncio
import os
import sys
from collections.abc import AsyncGenerator, Generator
from typing import Any
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

# Stelle sicher, dass Tests die Test-DB nehmen, BEVOR app.core.config Settings baut.
# WICHTIG: Wir FORCE-override DATABASE_URL, weil sonst eine Shell-Variable aus
# einem anderen Projekt (z.B. tbx_stzrim mit psycopg-Dialekt) hier
# durchschlaegt und SQLAlchemy einen falschen Driver-Lookup macht.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/osim_ui_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("FIREBASE_PROJECT_ID", "osim-dev")
os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")
os.environ.setdefault("ENVIRONMENT", "test")
# Storage: lokal in einem temp-Dir, damit Tests sich nicht ueber die echte
# ./local-storage-Hierarchie ins Knie schiessen.
os.environ.setdefault("STORAGE_BACKEND", "local")


# --- DB-Availability-Probe --------------------------------------------------


async def _probe_db(url: str) -> bool:
    """Versucht eine kurze Connection. Erfolg -> True."""
    eng = create_async_engine(url, pool_pre_ping=True)
    try:
        async with eng.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
    finally:
        await eng.dispose()


def _ensure_test_db() -> None:
    """Legt die Test-DB an (CREATE DATABASE), falls noch nicht da."""
    import asyncio as _aio

    from sqlalchemy.ext.asyncio import create_async_engine as _cae

    admin_url = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
    db_name = TEST_DATABASE_URL.rsplit("/", 1)[1]

    async def _do() -> None:
        eng = _cae(admin_url, isolation_level="AUTOCOMMIT")
        try:
            async with eng.connect() as conn:
                exists = (
                    await conn.execute(
                        text("SELECT 1 FROM pg_database WHERE datname = :n"),
                        {"n": db_name},
                    )
                ).scalar_one_or_none()
                if not exists:
                    await conn.execute(text(f'CREATE DATABASE "{db_name}"'))
        finally:
            await eng.dispose()

    _aio.run(_do())


_DB_AVAILABLE: bool | None = None


def _db_available() -> bool:
    global _DB_AVAILABLE
    if _DB_AVAILABLE is not None:
        return _DB_AVAILABLE
    # Erst admin-DB pruefen, dann test-DB anlegen.
    admin_url = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
    if not asyncio.run(_probe_db(admin_url)):
        _DB_AVAILABLE = False
        return False
    try:
        _ensure_test_db()
    except Exception:
        _DB_AVAILABLE = False
        return False
    _DB_AVAILABLE = asyncio.run(_probe_db(TEST_DATABASE_URL))
    return _DB_AVAILABLE


# --- pytest-Skip-Markers ----------------------------------------------------


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    """Skippe DB-Tests, wenn Postgres nicht erreichbar."""
    if _db_available():
        return
    skip_marker = pytest.mark.skip(reason="Test-DB nicht erreichbar (Postgres down?)")
    for item in items:
        if "requires_db" in item.keywords:
            item.add_marker(skip_marker)


# --- Async-Loop-Fixture -----------------------------------------------------


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop]:
    """Session-scoped event loop fuer pytest-asyncio."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# --- DB-Fixtures (require_db) -----------------------------------------------


@pytest_asyncio.fixture(scope="function")
async def db_engine() -> AsyncGenerator[AsyncEngine]:
    """Erzeugt eine frische Test-DB-Engine pro Test, dropt alles am Ende."""
    # WICHTIG: Modelle muessen importiert sein, damit Base.metadata sie kennt.
    import app.models  # noqa: F401
    from app.core.database import Base
    from app.services.storage import reset_storage_singleton

    engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True)

    # Public-scoped Tabellen vs. Tenant-scoped Tabellen unterscheiden:
    # - Public (Tenant, User) haben __table_args__ = {"schema": "public"}.
    # - Tenant-scoped (Model, ModelVersion, EditLock) haben schema=None;
    #   sie werden zur Laufzeit per tenant_service._create_tenant_schema_tables
    #   im jeweiligen tenant_{slug}-Schema angelegt -- NICHT in public!
    public_tables = [
        t for t in Base.metadata.sorted_tables
        if t.schema in (None, "public") and t.schema == "public"
    ]
    # Saubere Ausgangslage: alle Tenant-Schemata droppen + public-Tabellen
    # neu anlegen. Storage-Singleton resetten, damit Tests fresh starten.
    reset_storage_singleton()
    async with engine.begin() as conn:
        # Drop bekannte Tenant-Schemata (alles ausser system + public).
        await conn.execute(
            text(
                """
                DO $$
                DECLARE r record;
                BEGIN
                    FOR r IN
                        SELECT nspname FROM pg_namespace
                        WHERE nspname LIKE 'tenant_%'
                    LOOP
                        EXECUTE 'DROP SCHEMA IF EXISTS "' || r.nspname || '" CASCADE';
                    END LOOP;
                END $$;
                """
            )
        )
        # Nur die public-Tabellen droppen/anlegen. Tenant-Tabellen werden
        # spaeter pro Tenant ueber _create_tenant_schema_tables erzeugt.
        await conn.run_sync(
            lambda sync_conn: Base.metadata.drop_all(
                sync_conn, tables=public_tables
            )
        )
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn, tables=public_tables
            )
        )

    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
def fake_firebase_decoded() -> dict[str, Any]:
    """Default-Claims fuer einen Fake-Firebase-Token."""
    return {
        "uid": "abc123fake",
        "user_id": "abc123fake",
        "email": "test@example.com",
        "email_verified": True,
    }


@pytest.fixture
def patch_verify_token(fake_firebase_decoded: dict[str, Any]):
    """Monkey-patches app.auth.firebase.verify_token mit Fake-Claims.

    Usage::

        def test_xyz(patch_verify_token):
            with patch_verify_token(my_claims):
                ...
    """
    def _factory(claims: dict[str, Any] | None = None):
        return patch(
            "app.auth.firebase.verify_token",
            return_value=claims or fake_firebase_decoded,
        )
    return _factory
