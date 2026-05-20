"""Async SQLAlchemy-Engine + tenant-scoped Sessions.

Pattern aus tbx_stzrim/app/core/database.py auf async + asyncpg portiert.

Bereitstellt:
- ``engine`` -- async SQLAlchemy-Engine (asyncpg-Dialekt, Pool 20+10)
- ``AsyncSessionLocal`` -- async_sessionmaker
- ``Base`` -- DeclarativeBase für SQLAlchemy 2 typed Models
- ``get_db`` -- Dependency, setzt search_path={tenant_id},public pro Request
- ``get_db_unscoped`` -- Dependency ohne search_path-Switch (für /auth/me-Bootstrap,
  wenn Tenant noch nicht existiert; arbeitet nur in public)

Sicherheit:
- ``tenant_id`` ist auf ``[a-z0-9_]{1,63}`` whitelisted (siehe SCHEMA_PATTERN).
  Verhindert SQL-Injection in dem unvermeidlichen f-String-SET-Statement
  (Schema-Namen sind in PostgreSQL nicht parametrisierbar).
"""

from __future__ import annotations

import re
from collections.abc import AsyncGenerator

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import AsyncAdaptedQueuePool, NullPool
from sqlalchemy.sql import text

from app.core.config import settings

# Schema-Namen müssen alphanumerisch + underscore sein.
# Wird in ensure_tenant_bootstrap *und* in get_db verifiziert.
SCHEMA_PATTERN = re.compile(r"^[a-z0-9_]{1,63}$")


class Base(DeclarativeBase):
    """Basis-Klasse für alle ORM-Models."""


# Pool-Strategie:
# - In TEST-Umgebung: NullPool -- jede Connection wird fresh geoeffnet und
#   sofort geschlossen. Verhindert cross-loop-Probleme auf Windows.
# - In Prod/Dev: AsyncAdaptedQueuePool mit 20+10 fuer 50-User-Concurrency
#   (siehe 3fls D-CC08). Kein pool_pre_ping (Bug auf Win/ProactorEventLoop),
#   stattdessen pool_recycle=1800 fuer stale-Connection-Vermeidung.
_IS_TEST = settings.environment == "test"

if _IS_TEST:
    engine: AsyncEngine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        future=True,
    )
else:
    engine = create_async_engine(
        settings.database_url,
        poolclass=AsyncAdaptedQueuePool,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=False,
        pool_recycle=1800,
        future=True,
    )

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


def _validate_schema_name(name: str) -> None:
    """Whitelist-Check für PostgreSQL-Schema-Namen.

    Schema-Identifier können NICHT parametrisiert werden -- daher diese
    strenge Validierung an jeder Stelle, wo der Name in SQL landet.
    """
    if not SCHEMA_PATTERN.match(name):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tenant_id format: {name!r}",
        )


async def get_db(request: Request) -> AsyncGenerator[AsyncSession]:
    """FastAPI-Dependency: tenant-scoped Session mit gesetztem search_path.

    Liest ``tenant_id`` aus ``request.state`` (gesetzt von TenantAuthMiddleware).
    Endpoints in der Middleware-Whitelist (z.B. /health) haben keinen tenant_id
    -- diese dürfen ``get_db`` NICHT verwenden; nutze stattdessen
    ``get_db_unscoped``.
    """
    tenant_id: str | None = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        # Kein tenant_id im State -- entweder Whitelist-Endpoint nutzt
        # versehentlich get_db, oder /auth/me-Bootstrap-Pfad. Letzteres
        # MUSS get_db_unscoped nutzen.
        raise HTTPException(status_code=401, detail="No tenant context")

    _validate_schema_name(tenant_id)

    async with AsyncSessionLocal() as session:
        # search_path setzen -- die quote_ident-Variante via f-string ist
        # safe, weil tenant_id durch SCHEMA_PATTERN validiert ist.
        await session.execute(text(f'SET search_path TO "{tenant_id}", public'))
        try:
            yield session
        finally:
            await session.close()


async def get_db_unscoped(request: Request) -> AsyncGenerator[AsyncSession]:
    """FastAPI-Dependency ohne tenant-search_path-Switch.

    Verwendung:
    - /api/v1/auth/me (Tenant existiert noch nicht beim ersten Call)
    - /readiness (Health-Check ohne Tenant-Kontext)
    - Cross-Tenant-Admin-Endpoints (Phase 4+)
    """
    async with AsyncSessionLocal() as session:
        # Default-search_path explizit setzen, falls eine ältere Connection
        # noch einen Tenant-Pfad gesetzt hatte.
        default_schema = settings.database_default_schema
        _validate_schema_name(default_schema)
        await session.execute(text(f'SET search_path TO "{default_schema}"'))
        try:
            yield session
        finally:
            await session.close()
