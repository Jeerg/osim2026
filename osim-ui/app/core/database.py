"""DB-Engine + ``get_db``-Dependency mit Schema-per-Tenant.

3fls-Pattern-Parität (siehe ``tbx_stzrim/app/core/database.py``):
    * Sync SQLAlchemy + psycopg3 (D-18, korrigiert 2026-05-21 — NICHT async).
    * QueuePool mit ``pool_reset_on_return="rollback"`` für psycopg3-INTRANS.
    * Phase-19-final-Fix: ``connect_args.options=-c search_path="public"``
      pinnt den Default-search_path AM CONNECTION-STARTUP. Überlebt
      Commit/Rollback/Reset-Zyklen.
    * Per-Request ``SET search_path TO "tenant_<id>", public`` in ``get_db``
      mit Whitelist-Regex-Validierung (RESEARCH §Common Pitfalls #1).

NO async-Variante. NO async ``get_db``. NO ``SET LOCAL`` (siehe PATTERNS.md
§Stack-Drift und §``app/core/database.py`` für die Konflikt-Auflösung).
"""

from __future__ import annotations

import re
from collections.abc import Iterator

import structlog
from fastapi import Request
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

from app.core.config import settings

log = structlog.get_logger(__name__)

# Engine — sync, psycopg3, QueuePool mit Phase-19-final-Fix.
engine = create_engine(
    settings.database_url,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_reset_on_return="rollback",
    pool_timeout=10,
    # Phase 19-final fix (3fls 2026-05-16, übernommen für osim-ui 2026-05-21):
    # search_path-Default beim Connection-Startup pinnen — überlebt commit/
    # rollback/reset-Zyklen, die ein per-Session SET verlieren würden.
    # osim-ui-spezifisch: nur "public" als Default; tenant_<id> wird per Request
    # in get_db gesetzt.
    connect_args={
        "options": '-c search_path="public"',
    },
)

# Session-Factory für ORM-Use-Cases (Plan 04+ Service-Layer mit ORM-Queries).
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# Whitelist-Regex für Schema-Namen: alphanumerisch + Underscore.
# Firebase-UIDs sind 28 Zeichen, alphanumerisch — passt in dieses Pattern.
# Bindestrich bewusst NICHT erlaubt (Postgres-Identifier-Quote-Edge-Case);
# falls Firebase-UIDs mit Bindestrich auftreten, muss bootstrap_tenant_if_missing
# sie vorher normalisieren.
_SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")


def get_db(request: Request) -> Iterator[Connection]:
    """FastAPI-Dependency: yield eine DB-Connection mit ``search_path`` auf
    das Tenant-Schema gesetzt.

    Liest ``tenant_id`` aus ``request.state`` (gesetzt von
    ``TenantAuthMiddleware``). Validiert den Slug gegen ``_SLUG_PATTERN`` um
    SQL-Injection zu verhindern (Schema-Namen können nicht parametrisiert
    werden — ``SET search_path`` akzeptiert nur Identifier, keine Parameter).

    Defense-in-Depth gegen search_path-Leak (RESEARCH §Pitfall #1):
        1. Startup-Pin via ``connect_args.options`` (s.o.) → Default = public.
        2. Per-Request ``SET search_path TO "tenant_<id>", public`` → Tenant-
           Isolation.
        3. ``finally``-Block setzt zurück auf ``public`` → defensiv für den
           Fall, dass ``pool_reset_on_return`` mal nicht greift.
    """
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise ValueError("No tenant_id in request state")

    if not _SLUG_PATTERN.match(tenant_id):
        raise ValueError(f"Invalid tenant slug: {tenant_id!r}")

    schema_name = f"tenant_{tenant_id}"

    with engine.connect() as conn:
        conn.execute(text(f'SET search_path TO "{schema_name}", public'))
        try:
            yield conn
        finally:
            reset_search_path_default(conn)


def reset_search_path_default(conn: Connection) -> None:
    """Explizit ``search_path`` auf ``public`` zurücksetzen.

    Named-Function statt inline-Statement für Klarheit + späteres Mocking in
    Tests. Wird im ``finally``-Block von ``get_db`` aufgerufen.
    """
    conn.execute(text("SET search_path TO public"))
