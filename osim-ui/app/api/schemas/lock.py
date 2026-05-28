"""Pydantic-v2-Schemas für Single-Editor-Lock-Endpoints.

Pattern: D-13 + RESEARCH §Example 3. Lock-Token ist UUID; Conflict-Response
enthält ``owner_user_uid`` damit das Frontend "Modell wird gerade von [User]
bearbeitet" anzeigen kann.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LockOut(BaseModel):
    """Antwort auf ``POST /api/v1/models/{id}/lock`` bei Erfolg."""

    token: UUID
    expires_at: datetime


class LockConflict(BaseModel):
    """Body von ``HTTPException(409)`` bei Lock-Konflikt."""

    code: str = Field("E_MODEL_LOCKED", description="Stabiler Error-Code")
    owner_user_uid: str = Field(
        ..., description="Firebase-UID des aktuellen Lock-Owners"
    )
    owner_email: str | None = Field(
        None,
        description=(
            "E-Mail des Lock-Owners (Phase 1: None, weil keine cross-tenant-"
            "Lookups; Frontend zeigt UID-Suffix)."
        ),
    )
    expires_at: datetime


class HeartbeatRequest(BaseModel):
    """Body von ``POST /api/v1/models/{id}/lock/heartbeat``."""

    token: UUID


class HeartbeatResponse(BaseModel):
    """Antwort bei erfolgreichem Heartbeat."""

    expires_at: datetime


class AcquireResult(BaseModel):
    """Service-Layer-Result für ``LockService.acquire``.

    Endpoint mapped ``success=False + conflict`` → HTTP 409 mit ``conflict``
    als Body, und ``success=True`` → HTTP 200 mit ``LockOut``.
    """

    success: bool
    token: UUID | None = None
    expires_at: datetime | None = None
    conflict: LockConflict | None = None


__all__ = [
    "AcquireResult",
    "HeartbeatRequest",
    "HeartbeatResponse",
    "LockConflict",
    "LockOut",
]
