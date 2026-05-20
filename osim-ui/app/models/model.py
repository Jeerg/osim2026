"""Model — OSim-Modell-Stammsatz im Tenant-Schema.

Ein Model entspricht einem OTX-Modell, das ein User hochgeladen hat.
Der eigentliche OTX-Inhalt liegt im Object-Storage (siehe Storage-Service)
und wird über ModelVersion-Rows referenziert. Pro Save-back-Zyklus entsteht
eine neue Version (D-14: Original bleibt unverändert).

Schema-Strategie: KEIN ``__table_args__ = {"schema": "..."}``. Die Tabelle
landet im jeweiligen Tenant-Schema, weil ``get_db`` den ``search_path``
auf ``tenant_{slug},public`` setzt. Die DDL wird beim Tenant-Bootstrap
(``ensure_tenant_bootstrap`` → ``_create_tenant_schema_tables``) im
Tenant-Schema angelegt.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class Model(Base):
    """OSim-Modell-Stammsatz im Tenant-Schema.

    Felder:
        id: Auto-Increment-PK (pro Tenant unabhängig).
        name: User-sichtbarer Modell-Name (default = OTX-Dateiname ohne Suffix).
        original_filename: Filename beim Upload (für Download).
        owner_uid: Firebase-UID des Erstellers; nicht-Owner sehen Read-Only.
        coverage_ratio_at_upload: Wieviel % der Klassen vom Loader unterstützt sind.
        loaded_summary: Counter ``{klass: anzahl}`` aus dem Initial-Load.
        unsupported_summary: Counter ``{klass: anzahl}`` aus dem Initial-Load.
        current_version_id: FK auf die aktuelle (zuletzt geschriebene) Version.
        created_at, updated_at: Lifecycle-Timestamps.
    """

    __tablename__ = "models"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    owner_uid: Mapped[str] = mapped_column(
        String(128), nullable=False, index=True
    )
    coverage_ratio_at_upload: Mapped[float] = mapped_column(
        Float, nullable=False
    )
    loaded_summary: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    unsupported_summary: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    current_version_id: Mapped[int | None] = mapped_column(
        # FK ohne Schema-Prefix -- Resolution erfolgt über search_path.
        ForeignKey("model_versions.id", use_alter=True, name="fk_models_current_version"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
