"""Pydantic-Schemas fuer Tree-Validation.

Sehr leichtgewichtig: das JSON-Tree-Format ist intern reichhaltig
(rekursiv, generic properties). Wir validieren nur die TOP-LEVEL-Struktur
+ Pflichtfelder pro Knoten. Den eigentlichen Property-Inhalt validiert
``apply_tree_to_simulator`` ueber TYPE_MAP.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class JsonTreeNode(BaseModel):
    """Rekursiver Tree-Knoten."""

    model_config = ConfigDict(extra="allow")

    oid: int
    klass: str
    name: str
    properties: dict[str, Any] = Field(default_factory=dict)
    children: list[JsonTreeNode] = Field(default_factory=list)
    unsupported: bool = False

    @field_validator("klass")
    @classmethod
    def _klass_non_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("klass darf nicht leer sein.")
        return v


class JsonTreeDocument(BaseModel):
    """Top-Level-Dokument."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str
    root: JsonTreeNode

    @field_validator("schema_version")
    @classmethod
    def _schema_version_supported(cls, v: str) -> str:
        if v != "1.0":
            raise ValueError(f"Nicht-unterstuetzte schema_version: {v!r}")
        return v


JsonTreeNode.model_rebuild()
