"""Tenant-Bootstrap-Service (D-17 lazy Self-Service).

Beim ersten ``POST /api/v1/auth/me`` eines Firebase-Users wird automatisch:
1. ein Postgres-Schema ``tenant_{slug}`` angelegt,
2. eine ``public.tenants``-Row geschrieben,
3. eine ``public.users``-Row geschrieben (role=owner).

Idempotenz: Folge-Calls finden den User per uid und geben den existierenden
Tenant zurueck -- kein zweites Schema, keine zweite Row. Race-Conditions
zwischen parallelen Requests werden ueber den unique-Constraint auf
``users.uid`` aufgefangen (IntegrityError -> re-query).
"""

from __future__ import annotations

import hashlib
import re

import structlog
from sqlalchemy import MetaData, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text

from app.core.database import SCHEMA_PATTERN
from app.models.edit_lock import EditLock
from app.models.model import Model
from app.models.model_version import ModelVersion
from app.models.tenant import Tenant
from app.models.user import User

# Schema-lokale Tabellen, die pro Tenant einmal angelegt werden muessen.
# Reihenfolge ist relevant (FK-Kette: model_versions -> models -> edit_locks).
_TENANT_SCOPED_TABLES = (Model, ModelVersion, EditLock)

logger = structlog.get_logger(__name__)

# Firebase-UID kann theoretisch [-_a-zA-Z0-9] enthalten -- wir reduzieren
# es zum lowercase-Slug. Falls die Roh-UID nach Lowercase+Truncate kein
# legales Schema gibt (z.B. zu kurz, Sonderzeichen), greift der Hash-Fallback.
_SAFE_SLUG = re.compile(r"^[a-z0-9_]+$")


def _build_tenant_id(uid: str) -> str:
    """Generiert ``tenant_{slug}`` aus Firebase-UID.

    Strategie:
    1. Lowercase, alphanumerisch + underscore -> nimm erste 16 Zeichen
    2. Falls leer oder nicht safe -> SHA-256 der UID, erste 16 hex-Zeichen
    """
    raw = uid.lower()
    # Sonderzeichen rauswerfen
    cleaned = "".join(c if c.isalnum() or c == "_" else "" for c in raw)
    slug = cleaned[:16]
    if not slug or not _SAFE_SLUG.match(slug):
        slug = hashlib.sha256(uid.encode("utf-8")).hexdigest()[:16]
    tenant_id = f"tenant_{slug}"
    if not SCHEMA_PATTERN.match(tenant_id):  # defensive
        raise ValueError(f"Computed tenant_id is unsafe: {tenant_id!r}")
    return tenant_id


async def ensure_tenant_bootstrap(
    uid: str, email: str, db: AsyncSession
) -> tuple[Tenant, User]:
    """Idempotenter Lazy-Bootstrap fuer einen Firebase-User.

    Args:
        uid: Firebase-User-UID (aus ``request.state.user_uid``).
        email: User-E-Mail (aus ``request.state.user_email``).
        db: AsyncSession ohne tenant-search_path (``get_db_unscoped``),
            arbeitet im public-Schema.

    Returns:
        (tenant, user) -- existierend oder gerade angelegt.

    Raises:
        ValueError: wenn der berechnete Schema-Name unsicher waere.
    """
    # 1) Existiert der User schon? Dann fertig.
    existing_user = (
        await db.execute(select(User).where(User.uid == uid))
    ).scalar_one_or_none()
    if existing_user is not None:
        existing_tenant = (
            await db.execute(
                select(Tenant).where(Tenant.id == existing_user.tenant_id)
            )
        ).scalar_one()
        return existing_tenant, existing_user

    # 2) Neu -- berechne tenant_id und lege alles atomar an.
    tenant_id = _build_tenant_id(uid)

    try:
        # Schema-Anlage MUSS ausserhalb der Tx liegen, denn CREATE SCHEMA
        # wirkt sofort und ist nicht idempotent ohne IF NOT EXISTS.
        # Wir benutzen IF NOT EXISTS, weil bei einer Race-Condition zwei
        # Requests parallel das Schema anlegen wollen koennten.
        await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{tenant_id}"'))

        # Tenant-scoped Tabellen (models, model_versions, edit_locks) im neuen
        # Schema anlegen. Idempotent dank checkfirst=True.
        await _create_tenant_schema_tables(db, tenant_id)

        tenant = Tenant(
            id=tenant_id,
            owner_uid=uid,
            owner_email=email,
            schema_name=tenant_id,
        )
        user = User(
            uid=uid,
            email=email,
            tenant_id=tenant_id,
            role="owner",
        )
        db.add(tenant)
        db.add(user)
        await db.commit()

        logger.info(
            "tenant_bootstrapped",
            tenant_id=tenant_id,
            user_uid=uid,
        )
        return tenant, user

    except IntegrityError:
        # Race-Condition: ein paralleler Request hat User/Tenant bereits
        # angelegt. Rollback, dann re-query und zurueckgeben.
        await db.rollback()
        logger.info(
            "tenant_bootstrap_race_resolved",
            tenant_id=tenant_id,
            user_uid=uid,
        )
        user_row = (
            await db.execute(select(User).where(User.uid == uid))
        ).scalar_one()
        tenant_row = (
            await db.execute(
                select(Tenant).where(Tenant.id == user_row.tenant_id)
            )
        ).scalar_one()
        return tenant_row, user_row


async def _create_tenant_schema_tables(db: AsyncSession, tenant_id: str) -> None:
    """Legt die Tenant-scoped Tabellen (models, model_versions, edit_locks)
    im angegebenen Tenant-Schema an.

    Strategie: Wir bauen eine *frische* MetaData, klonen die Table-Definitionen
    aus ``Base.metadata`` per ``Table.to_metadata(schema=tenant_id)`` und
    rufen ``metadata.create_all(connection, checkfirst=True)``. Damit landet
    die DDL deterministisch im richtigen Schema, ohne ``Base.metadata`` zu
    mutieren (Multi-Tenant-Safe).

    Idempotenz: ``checkfirst=True`` skipt bereits existierende Tabellen --
    der zweite ``ensure_tenant_bootstrap``-Call eines Users (oder ein
    Race-Resolved-Pfad) ist ungefaehrlich.

    Args:
        db: AsyncSession (typischerweise ``get_db_unscoped``).
        tenant_id: Ziel-Schema (whitelisted via SCHEMA_PATTERN -- Caller
                  ist verantwortlich).
    """
    if not SCHEMA_PATTERN.match(tenant_id):  # defensive
        raise ValueError(f"Unsafe tenant_id: {tenant_id!r}")

    target = MetaData(schema=tenant_id)
    for model_cls in _TENANT_SCOPED_TABLES:
        # to_metadata kopiert die Table-Definition + Constraints in den
        # Ziel-Namespace mit explizitem schema-Override.
        model_cls.__table__.to_metadata(target, schema=tenant_id)

    # create_all braucht eine sync-Connection -- bei async-Session per
    # connection().run_sync(...) ausfuehren.
    conn = await db.connection()
    await conn.run_sync(
        lambda sync_conn: target.create_all(sync_conn, checkfirst=True)
    )


async def drop_tenant_schema_tables(db: AsyncSession, tenant_id: str) -> None:
    """Spiegel zu ``_create_tenant_schema_tables`` -- droppt die Tenant-
    scoped Tabellen. Aktuell ungenutzt im Produktivpfad; nuetzlich fuer
    Tests und zukuenftige Tenant-Loeschung.
    """
    if not SCHEMA_PATTERN.match(tenant_id):
        raise ValueError(f"Unsafe tenant_id: {tenant_id!r}")

    target = MetaData(schema=tenant_id)
    for model_cls in _TENANT_SCOPED_TABLES:
        model_cls.__table__.to_metadata(target, schema=tenant_id)

    conn = await db.connection()
    await conn.run_sync(
        lambda sync_conn: target.drop_all(sync_conn, checkfirst=True)
    )
