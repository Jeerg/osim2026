"""Pydantic-v2-Schemas für das Modell- und Wire-Format.

Wire-Format-Vertrag (siehe ``.planning/phases/01-vertical-slice/01-RESEARCH.md``
§Pattern 3 sowie PATTERNS.md §``app/services/otx_json_tree.py``):

    interface ModelTreeWire {
      version: 1;
      simulator_oid: number;       // Konvention: 0
      objects: Record<number, ModelObject>;
      coverage: ModelCoverage;
      schemas_url: string;         // /api/v1/schemas/v1 — implementiert in Plan 07
    }

Der Wire-Tree ist symmetrisch zum ``OtxObject``-Modell der Engine
(``osim_engine.io.otx_reader.OtxObject``). Damit ist ein Wire-Roundtrip
OID-stabil — Frontend kann ein Objekt editieren und der Server schreibt es
1:1 zurück.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# AttrValue: alle Werte, die im OTX-Format vorkommen können.
# Tuples werden vom Reader als ``list[int|float]`` repräsentiert (z.B.
# Farben ``(r,g,b)`` oder Rect-Werte ``(x,y,w,h)``). Strings, ints, floats,
# bools und None sind die anderen Primitive-Token-Typen.
AttrValue = int | str | float | bool | None | list[int] | list[float] | tuple


class ModelObject(BaseModel):
    """Ein einzelnes Objekt im Wire-Tree.

    Symmetrisch zu ``osim_engine.io.otx_reader.OtxObject``:
        * ``oid`` ist die stabile Identität.
        * ``klass`` ist der OTX-Klassen-Name (z.B. ``ASimulator``,
          ``PDurchlaufplan``, ``PDpKnKonstant``).
        * ``attrs`` ist das Attribut-Wert-Dict.
        * ``sub_refs`` ist die OID-Liste pro Basisklassen-Block.
    """

    model_config = ConfigDict(populate_by_name=True)

    oid: int = Field(..., description="OTX-Object-ID, stabile Identität")
    klass: str = Field(..., description="OTX-Klassen-Name")
    attrs: dict[str, AttrValue] = Field(
        default_factory=dict, description="Attribut-Wert-Map (Primitive)"
    )
    sub_refs: list[list[int]] = Field(
        default_factory=list,
        description="OID-Listen pro Basisklassen-Block",
    )


class ModelCoverage(BaseModel):
    """Coverage-Information zum Lade-Vorgang.

    ``loaded`` + ``skipped`` + len(``unsupported``-Klassen) = Gesamtanzahl
    OtxObjects im File. ``unsupported`` ist die Liste der Klassen-Namen
    (deduped), für die kein Loader-Handler registriert ist.
    """

    loaded: int = Field(..., ge=0, description="Anzahl geladener Instanzen")
    skipped: int = Field(..., ge=0, description="Anzahl bewusst übersprungener")
    unsupported: list[str] = Field(
        default_factory=list,
        description="Klassen ohne Loader-Handler (deduped)",
    )


class ModelTreeWire(BaseModel):
    """Wire-Form des kompletten Modells.

    Phase 1 nutzt ``schemas_url`` als Vorgriff für Plan 07 — der Endpoint
    ``/api/v1/schemas/v1`` wird in Plan 07 ergänzt und liefert die
    Klassen-Schemas für die OViewer-Property-Editoren.
    """

    version: Literal[1] = 1
    simulator_oid: int = Field(0, description="OID des Sim-Roots (Konvention 0)")
    objects: dict[int, ModelObject] = Field(
        ..., description="Alle Objekte des Modells, OID → ModelObject"
    )
    coverage: ModelCoverage
    schemas_url: str = Field(
        "/api/v1/schemas/v1",
        description="URL des Klassen-Schemas (Plan 07)",
    )


class ModelMeta(BaseModel):
    """Modell-Metadaten ohne Wire-Daten — für List-Endpoints + Save-Response."""

    id: UUID
    name: str
    created_at: datetime
    original_storage_key: str = Field(
        ..., description="Storage-Key für das ursprüngliche Upload-File (D-14)"
    )
    current_version_key: str | None = Field(
        None,
        description=(
            "Storage-Key für die aktuell aktive Version (nach Save-back). "
            "None, wenn noch nicht gespeichert wurde — dann ist "
            "``original_storage_key`` der aktive Stand."
        ),
    )
    created_by_uid: str


class UploadOtxResponse(BaseModel):
    """Antwort auf ``POST /api/v1/models/upload-otx``."""

    model: ModelMeta
    wire: ModelTreeWire


class GetModelResponse(BaseModel):
    """Antwort auf ``GET /api/v1/models/{id}``."""

    model: ModelMeta
    wire: ModelTreeWire


class SaveModelRequest(BaseModel):
    """Body von ``PUT /api/v1/models/{id}``.

    ``lock_token`` ist obligatorisch — Save-back ohne gültigen Lock liefert
    HTTP 423 (Locked).
    """

    wire: ModelTreeWire
    lock_token: UUID


class SaveModelResponse(BaseModel):
    """Antwort auf ``PUT /api/v1/models/{id}``."""

    model: ModelMeta
    saved_version_key: str = Field(
        ..., description="Storage-Key der neuen Versions-Datei (v_<ts>.otx)"
    )


__all__ = [
    "AttrValue",
    "GetModelResponse",
    "ModelCoverage",
    "ModelMeta",
    "ModelObject",
    "ModelTreeWire",
    "SaveModelRequest",
    "SaveModelResponse",
    "UploadOtxResponse",
]
