"""ModelVersion — Versionierte OTX-Snapshots eines Modells.

Pro Save-back oder Upload wird eine neue Version angelegt (D-14: Original
bleibt unverändert). ``storage_key`` ist der vollständige Pfad im
Object-Storage (Format: ``tenants/{tenant_id}/models/{model_id}/v{N}-{ts}.otx``).

Schema-Strategie: ohne ``__table_args__ = {"schema": ...}`` (siehe Model-Doku).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class ModelVersion(Base):
    """OTX-Version eines Modells im Tenant-Schema.

    source-Werte:
        - ``"upload"``  -- initialer Upload, Version 1 jedes Modells.
        - ``"save_back"`` -- Browser-Edit → Server-Serialisierung → neue Version.
        - ``"import"`` -- (reserviert für spätere Phasen, z.B. CLI-Import).
    """

    __tablename__ = "model_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    model_id: Mapped[int] = mapped_column(
        # FK ohne Schema-Prefix -- gleiche Schema-Strategie wie Model.
        ForeignKey("models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    bytes_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_by_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("model_id", "version", name="uq_model_version"),
    )
