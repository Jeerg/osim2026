"""EditLock — Single-Editor-Lock auf Modell-Ebene (D-13).

Wer ein Modell zum Editieren öffnet, hält einen Lock. Andere User/Sessions
sehen "Modell wird gerade von [User] bearbeitet" und können nur Read-Only
zugreifen (GET /tree erlaubt, PUT /tree gibt 403).

TTL: 15 min Inaktivität. Periodisches Heartbeat (POST /lock/heartbeat)
verschiebt ``expires_at``. Ist ``expires_at`` überschritten, gilt der Lock
als frei und der nächste ``acquire`` setzt ihn neu.

Schema-Strategie: ohne ``__table_args__ = {"schema": ...}`` (Tenant-Schema).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class EditLock(Base):
    """Modell-Edit-Lock im Tenant-Schema.

    PK auf model_id sichert die Single-Editor-Invariante über UNIQUE
    -- parallele acquire-Requests racen über IntegrityError ab.
    """

    __tablename__ = "edit_locks"

    model_id: Mapped[int] = mapped_column(
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    holder_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    holder_email: Mapped[str] = mapped_column(String(256), nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_heartbeat_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
