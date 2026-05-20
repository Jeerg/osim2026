"""initial schema: tenants + users (public)

Revision ID: 001_initial
Revises:
Create Date: 2026-05-20 00:00:00.000000

Phase-1-Plan-01-02-Task-2: legt die beiden Stammtabellen ``public.tenants``
und ``public.users`` an. Pro-Tenant-Schemata werden zur Laufzeit von
``app.services.tenant_service.ensure_tenant_bootstrap`` per
``CREATE SCHEMA IF NOT EXISTS`` angelegt -- nicht ueber Alembic.

Modell- und Run-Tabellen kommen in Plan 01-03.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("owner_uid", sa.String(length=128), nullable=False),
        sa.Column("owner_email", sa.String(length=256), nullable=False),
        sa.Column("schema_name", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("owner_uid", name="uq_tenants_owner_uid"),
        sa.UniqueConstraint("schema_name", name="uq_tenants_schema_name"),
        schema="public",
    )
    op.create_index(
        "ix_public_tenants_owner_uid",
        "tenants",
        ["owner_uid"],
        schema="public",
    )

    op.create_table(
        "users",
        sa.Column("uid", sa.String(length=128), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=256), nullable=False),
        sa.Column("tenant_id", sa.String(length=64), nullable=False),
        sa.Column(
            "role",
            sa.String(length=32),
            nullable=False,
            server_default="owner",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["public.tenants.id"],
            name="fk_users_tenant_id",
            ondelete="CASCADE",
        ),
        schema="public",
    )
    op.create_index(
        "ix_public_users_tenant_id",
        "users",
        ["tenant_id"],
        schema="public",
    )


def downgrade() -> None:
    op.drop_index("ix_public_users_tenant_id", table_name="users", schema="public")
    op.drop_table("users", schema="public")

    op.drop_index("ix_public_tenants_owner_uid", table_name="tenants", schema="public")
    op.drop_table("tenants", schema="public")
