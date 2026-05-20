"""Pydantic-Schemas fuer Model/ModelVersion/EditLock-DTOs.

Konvention:
  - Snake_case in DB/Python, snake_case auch im JSON (kein Camel-Case-Aliasing
    in Phase 1 -- vereinfacht das Frontend-Mapping).
  - ``model_config = ConfigDict(from_attributes=True)`` fuer ORM-Konversion.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Lock
# ---------------------------------------------------------------------------


class LockInfo(BaseModel):
    """Aktuelles Lock-Bild fuer ein Modell (None, wenn frei)."""

    model_config = ConfigDict(from_attributes=True)

    holder_uid: str
    holder_email: str
    acquired_at: datetime
    last_heartbeat_at: datetime
    expires_at: datetime
    is_self: bool = Field(
        default=False,
        description="True, wenn der aktuelle Caller selbst den Lock haelt.",
    )


# ---------------------------------------------------------------------------
# Model / ModelVersion
# ---------------------------------------------------------------------------


class ModelVersionInfo(BaseModel):
    """Kurze Beschreibung einer Modell-Version (List-Use-Case)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    version: int
    source: str
    bytes_size: int
    created_by_uid: str
    created_at: datetime


class ModelListItem(BaseModel):
    """List-Eintrag fuer GET /api/v1/models."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    original_filename: str
    owner_uid: str
    coverage_ratio_at_upload: float
    current_version_id: int | None
    created_at: datetime
    updated_at: datetime


class ModelDetail(ModelListItem):
    """Detail-View fuer GET /api/v1/models/{id}, inkl. Coverage-Reports + Lock."""

    loaded_summary: dict[str, int]
    unsupported_summary: dict[str, int]
    lock_status: LockInfo | None = None


class UploadResponse(BaseModel):
    """Antwort fuer POST /api/v1/models/upload-otx."""

    id: int
    name: str
    coverage_ratio: float = Field(
        ..., description="Anteil vom Loader unterstuetzter Klassen-Instanzen."
    )
    loaded_summary: dict[str, int]
    unsupported_summary: dict[str, int]


# ---------------------------------------------------------------------------
# Tree-Endpoints
# ---------------------------------------------------------------------------


class TreeResponse(BaseModel):
    """Antwort fuer GET /api/v1/models/{id}/tree."""

    model_id: int
    version: int
    tree: dict[str, Any] = Field(
        ..., description="JsonTreeDocument: { schema_version, root }."
    )


class TreePutRequest(BaseModel):
    """Body fuer PUT /api/v1/models/{id}/tree."""

    tree: dict[str, Any]
    expected_version: int | None = Field(
        default=None,
        description=(
            "Optimistic-Concurrency-Hint: wenn gesetzt und != aktueller "
            "Version, antwortet der Server mit einem Warning-Header. "
            "Phase-1: nur Warning, kein Block."
        ),
    )


class TreePutResponse(BaseModel):
    """Antwort fuer PUT /api/v1/models/{id}/tree."""

    model_id: int
    version: int
    storage_key: str
    bytes_size: int
