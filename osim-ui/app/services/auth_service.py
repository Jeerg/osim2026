"""Lazy-Tenant-Bootstrap-Service (D-17 Self-Service).

``bootstrap_tenant_if_missing(uid, email)`` legt beim ersten Login eines
Firebase-Users ein Postgres-Schema ``tenant_{uid}`` an + die initialen
tenant-spezifischen Tabellen (``models``, ``model_locks``) + die User-Row
in ``public.users``. Idempotent gegen Race via ``CREATE SCHEMA IF NOT
EXISTS`` + ``ON CONFLICT DO NOTHING`` (RESEARCH §Pitfall #2).

Phase 1 nutzt explizites Per-Schema-DDL (kein Alembic-Programmatic-Upgrade)
für Einfachheit. Phase 2+ kann das mit
``alembic.command.upgrade(config, "head")`` mit ``search_path``-Override
ersetzen.

Stack: sync SQLAlchemy nach D-18. Wird in der Middleware via
``asyncio.to_thread`` aufgerufen, damit der Event-Loop frei bleibt.
"""

from __future__ import annotations

import re

import structlog
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, ProgrammingError

from app.core.database import engine

log = structlog.get_logger(__name__)

# Postgres-SQLSTATE-Codes fuer Race-Conditions die wir als "andere Transaktion
# war schneller, Tabelle/Schema existiert jetzt schon" interpretieren.
# 42P06 = duplicate_schema, 42P07 = duplicate_table, 23505 = unique_violation.
_RACE_SQLSTATES = frozenset({"42P06", "42P07", "23505"})


def _is_race_condition_error(exc: Exception) -> bool:
    """True wenn der Fehler ein bekannter Concurrent-DDL-Race ist.

    ``CREATE SCHEMA IF NOT EXISTS`` und ``CREATE TABLE IF NOT EXISTS`` sind
    in Postgres unter HIGH concurrency NICHT vollstaendig race-free — zwei
    parallele Sessions koennen beide den ``IF NOT EXISTS``-Check passieren
    und dann beide versuchen, das Objekt anzulegen. Eine schlaegt mit
    ``duplicate_schema`` / ``duplicate_table`` fehl. Das ist KEIN Bug, das
    ist Postgres-DDL-Verhalten (siehe PG-docs §5.9 Concurrent Updates).
    """
    orig = getattr(exc, "orig", None)
    sqlstate = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    return sqlstate in _RACE_SQLSTATES


# Whitelist-Regex für Tenant-Slug (= Firebase-UID).
# Firebase-UIDs sind 28 Zeichen, alphanumerisch — passt in dieses Pattern.
# Bindestrich zusätzlich erlaubt für defensive Robustheit (manche
# Firebase-Custom-Token enthalten Bindestriche). Aber: Postgres-
# Schema-Identifier müssen für ``f'CREATE SCHEMA IF NOT EXISTS "{slug}"'``
# in Doppel-Quotes stehen, was Bindestrich problemlos toleriert.
_VALID_SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_slug(slug: str) -> None:
    """Whitelist-Validierung für Tenant-Slugs vor f-string-Interpolation in
    raw SQL.

    Schema-Namen können in Postgres nicht parametrisiert werden — daher
    MUSS jeder Slug, der per f-string in ``CREATE SCHEMA`` / ``SET
    search_path`` landet, vorher hart validiert werden (T-02-02 Threat-
    Register).
    """
    if not _VALID_SLUG_PATTERN.match(slug):
        raise ValueError(f"Invalid tenant slug: {slug!r}")


def bootstrap_tenant_if_missing(uid: str, email: str) -> str:
    """Lege Tenant-Schema + initiale Tabellen + User-Row idempotent an.

    Args:
        uid: Firebase-UID des Users. Wird als ``tenant_id`` und Teil des
            Schema-Namens verwendet (Konvention D-17: ``tenant_id == uid``).
        email: User-E-Mail aus dem Firebase-JWT-Claim.

    Returns:
        ``tenant_id`` (= ``uid``) — wird vom Middleware-Caller in
        ``scope["state"]["tenant_id"]`` gesetzt.

    Idempotenz unter concurrent Aufrufen (Pitfall #2 aus RESEARCH.md):
        * ``CREATE SCHEMA IF NOT EXISTS`` — Race-tolerant via
          ``_is_race_condition_error``-Recovery: wenn zwei parallele
          Sessions beide den IF-NOT-EXISTS-Check passieren, schlaegt
          eine mit duplicate_schema fehl; wir fangen das und werten es
          als "Tenant existiert bereits" -> idempotenter Erfolg.
        * ``CREATE TABLE IF NOT EXISTS`` analog mit duplicate_table.
        * ``INSERT ... ON CONFLICT (slug) DO NOTHING`` fuer public.tenants.
        * ``INSERT ... ON CONFLICT (firebase_uid) DO NOTHING`` fuer
          public.users.

        Drei parallele Aufrufe fuer denselben ``uid`` liefern alle drei
        denselben ``tenant_id`` ohne IntegrityError nach aussen.
    """
    _validate_slug(uid)
    tenant_id = uid  # Convention D-17: tenant_id == firebase_uid in Phase 1.
    schema = f"tenant_{tenant_id}"

    # Race-tolerant Bootstrap: bei concurrent calls kann der erste CREATE
    # SCHEMA-Versuch mit duplicate_schema fehlschlagen, obwohl das Schema
    # gerade von einer anderen Transaktion angelegt wurde. Wir versuchen
    # bis zu 3 Mal — beim 2./3. Versuch existiert das Schema garantiert
    # und CREATE SCHEMA IF NOT EXISTS wird zum No-op.
    for attempt in range(3):
        try:
            _do_bootstrap(uid, email, tenant_id, schema)
            break
        except (IntegrityError, ProgrammingError) as exc:
            if not _is_race_condition_error(exc):
                raise
            if attempt == 2:  # letzter Versuch
                log.warning(
                    "tenant.bootstrap_race_persisted",
                    tenant_id=tenant_id,
                    attempt=attempt,
                )
                raise
            log.info(
                "tenant.bootstrap_race_retry",
                tenant_id=tenant_id,
                attempt=attempt,
            )

    log.info("tenant.bootstrapped", tenant_id=tenant_id, uid=uid)
    return tenant_id


def _do_bootstrap(uid: str, email: str, tenant_id: str, schema: str) -> None:
    """Single bootstrap attempt — gekapselt damit der Retry-Loop ihn re-runnen kann."""
    with engine.begin() as conn:
        # 1. Tenant-Schema anlegen (idempotent).
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))

        # 2. search_path auf das neue Schema setzen — die folgenden
        #    CREATE TABLE-Statements landen dort, NICHT in public.
        conn.execute(text(f'SET search_path TO "{schema}", public'))

        # 3. Tenant-spezifische Tabellen anlegen (Phase-1-DDL ohne Alembic
        #    per-Schema-Upgrade; siehe PATTERNS.md §auth_service.py).
        #
        #    `models` hat zusätzlich `original_storage_key` für D-14
        #    (Original-Unchanged-Constraint — Save-back legt eine neue
        #    Version unter `storage_key` ab, das Original-File bleibt
        #    immer unter `original_storage_key` erreichbar).
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS models (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name TEXT NOT NULL,
                    storage_key TEXT NOT NULL,
                    original_storage_key TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    created_by_uid TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS model_locks (
                    model_id UUID PRIMARY KEY
                        REFERENCES models(id) ON DELETE CASCADE,
                    owner_user_uid TEXT NOT NULL,
                    acquired_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMP NOT NULL,
                    token UUID NOT NULL DEFAULT gen_random_uuid()
                )
                """
            )
        )

        # 4. Tenant-Row in public.tenants registrieren (idempotent).
        conn.execute(
            text(
                """
                INSERT INTO public.tenants(slug)
                VALUES (:slug)
                ON CONFLICT (slug) DO NOTHING
                """
            ),
            {"slug": tenant_id},
        )

        # 5. User-Row in public.users registrieren (idempotent gegen Race —
        #    Pitfall #2 aus RESEARCH.md).
        conn.execute(
            text(
                """
                INSERT INTO public.users(firebase_uid, email, tenant_id)
                VALUES (
                    :uid,
                    :email,
                    (SELECT id FROM public.tenants WHERE slug = :slug)
                )
                ON CONFLICT (firebase_uid) DO NOTHING
                """
            ),
            {"uid": uid, "email": email, "slug": tenant_id},
        )

        # 6. search_path defensiv zurück auf public — engine-Pool-
        #    Reset-on-Return greift, aber explizit ist explizit.
        conn.execute(text("SET search_path TO public"))
