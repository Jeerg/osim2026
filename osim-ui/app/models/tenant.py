"""Tenant-Model (public-Schema).

Ein Tenant entspricht einem Owner-User aus Firebase Auth (1:1 in Phase 1 --
Multi-User-pro-Tenant kommt in spaeteren Phasen). schema_name verweist auf
das zugehoerige PostgreSQL-Schema ``tenant_{slug}``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class Tenant(Base):
    """Tenant-Stammsatz im public-Schema."""

    __tablename__ = "tenants"
    __table_args__ = {"schema": "public"}

    # tenant_id = "tenant_" + uid[:16].lower() (siehe tenant_service).
    id: Mapped[str] = mapped_column(String(64), primary_key=True)

    # Firebase-UID des Owners (eindeutig).
    owner_uid: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True
    )
    owner_email: Mapped[str] = mapped_column(String(256), nullable=False)

    # Physisches Postgres-Schema (entspricht id; redundant fuer Klarheit).
    schema_name: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
