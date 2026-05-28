"""SQLAlchemy 2 declarative Models für die Phase-1-Public-Tabellen.

In Phase 1 leben hier nur die Installations-Meta-Tabellen ``public.tenants``
und ``public.users``. Die domänen-spezifischen Tabellen ``models`` und
``model_locks`` werden in Plan 04 (Storage/Models/Locks-API) ergänzt; sie
leben dann im tenant-spezifischen Schema (NICHT in public).

Konvention (Phase 1, D-17 Self-Service):
    * ``tenants.slug`` == ``users.firebase_uid`` (Lazy-Bootstrap legt beide
      gleichzeitig an; ein Tenant pro Firebase-User).
    * ``users.tenant_id`` ist FK auf ``tenants.id`` (UUID).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """SQLAlchemy 2 declarative Base für osim-ui."""


class Tenant(Base):
    """Ein Tenant = ein Firebase-User-Account = ein Postgres-Schema.

    Lazy-Bootstrap (D-17): wird beim ersten ``/api/v1/auth/me``-Aufruf
    angelegt. Idempotent gegen Race via ``ON CONFLICT (slug) DO NOTHING``.
    """

    __tablename__ = "tenants"
    __table_args__ = {"schema": "public"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    slug: Mapped[str] = mapped_column(unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class User(Base):
    """Firebase-User, gemappt auf einen Tenant.

    Phase 1: 1 User : 1 Tenant (Self-Service-Konvention D-17). Spätere Phasen
    können Multi-User-pro-Tenant einführen, indem ``role`` differenziert wird
    und ein eigener Invite-Flow geschaffen wird.
    """

    __tablename__ = "users"
    __table_args__ = {"schema": "public"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    firebase_uid: Mapped[str] = mapped_column(
        unique=True,
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("public.tenants.id"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(default="user", nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
