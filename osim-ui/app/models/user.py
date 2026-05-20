"""User-Model (public-Schema).

Verknuepft Firebase-UID mit einem Tenant + Rolle. In Phase 1 ist jeder
User Owner seines eigenen Tenants -- Multi-User-pro-Tenant kommt spaeter.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class User(Base):
    """User-Stammsatz im public-Schema."""

    __tablename__ = "users"
    __table_args__ = {"schema": "public"}

    # Firebase-UID als PK -- erspart Mapping-Tabelle.
    uid: Mapped[str] = mapped_column(String(128), primary_key=True)

    email: Mapped[str] = mapped_column(String(256), nullable=False)

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("public.tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # "owner" | "editor" | "viewer". Default owner fuer Phase-1-Self-Service.
    role: Mapped[str] = mapped_column(
        String(32), nullable=False, default="owner", server_default="owner"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
