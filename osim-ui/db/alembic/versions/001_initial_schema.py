"""initial schema — public.tenants + public.users

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-05-21

Phase 1 Plan 02 — siehe ``.planning/phases/01-vertical-slice/01-02-backend-foundation-PLAN.md``.

Legt das initiale ``public``-Schema an:
    * Extension ``pgcrypto`` für ``gen_random_uuid()``.
    * ``public.tenants(id UUID PK, slug TEXT UNIQUE, created_at)``.
    * ``public.users(id UUID PK, firebase_uid TEXT UNIQUE INDEX, email TEXT,
      tenant_id UUID FK → public.tenants.id, role TEXT default 'user',
      created_at)``.

Tenant-spezifische Schemata (``tenant_{uid}.models``,
``tenant_{uid}.model_locks``) werden NICHT hier verwaltet — sie werden
lazy-bootstrapped vom Service-Layer ``app.services.auth_service`` (D-17
Self-Service).
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # pgcrypto-Extension für gen_random_uuid() — wird zwar nicht direkt in
    # public.tenants/public.users genutzt (uuid.uuid4 generiert Python-seitig),
    # aber von app.services.auth_service.bootstrap_tenant_if_missing für die
    # tenant-spezifischen Tabellen `models` und `model_locks` gebraucht.
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "tenants",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("slug", name="uq_tenants_slug"),
        schema="public",
    )

    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("firebase_uid", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("public.tenants.id", name="fk_users_tenant_id"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.String(),
            nullable=False,
            server_default=sa.text("'user'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("firebase_uid", name="uq_users_firebase_uid"),
        schema="public",
    )
    op.create_index(
        "ix_users_firebase_uid",
        "users",
        ["firebase_uid"],
        unique=True,
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_users_firebase_uid", table_name="users", schema="public")
    op.drop_table("users", schema="public")
    op.drop_table("tenants", schema="public")
    # pgcrypto-Extension bleibt — könnte von anderen Schemas genutzt werden.
