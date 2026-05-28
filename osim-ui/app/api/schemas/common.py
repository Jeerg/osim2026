"""Gemeinsame Pydantic-v2-Schemas: ``ProblemDetail`` (RFC 7807), Pagination.

3fls-1:1-Übernahme aus ``tbx_stzrim/app/api/schemas/common.py`` (Z.41-90).
``code``-Feld in ``ProblemDetail`` ist die Plan-24-04.2-Lesson aus 3fls
(Frontend liest ``err.body.code`` typsicher für DE-Toast-Mapping).

Phase 1 nutzt nur ``ProblemDetail``; ``PaginationMeta`` ist hier registriert
für Konsistenz mit Phase-4+-Listen-Endpoints, aber wird in Phase 1 nicht
referenziert.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PaginationMeta(BaseModel):
    """Pagination-Metadaten für List-Responses (Phase-4+-Use-Case)."""

    model_config = ConfigDict(from_attributes=True)

    total: int = Field(..., ge=0, description="Gesamtanzahl der Datensätze")
    offset: int = Field(..., ge=0, description="Versatz ab dem ersten Datensatz")
    limit: int = Field(
        ..., ge=1, le=500, description="Maximale Anzahl Datensätze pro Seite"
    )


class ProblemDetail(BaseModel):
    """RFC 7807 Problem Details for HTTP APIs.

    See: https://datatracker.ietf.org/doc/html/rfc7807

    Plan-24-04.2-Lesson (aus 3fls): ``code`` als Top-Level-Extension-Member
    (RFC 7807 §3.2 erlaubt zusätzliche Felder). Frontend liest
    ``err.body.code`` typsicher; ``detail`` bleibt menschenlesbarer String.
    """

    model_config = ConfigDict(from_attributes=True)

    type: str = Field(..., description="URI-Referenz zum Fehlertyp")
    title: str = Field(..., description="Kurze menschenlesbare Zusammenfassung")
    status: int = Field(..., description="HTTP-Statuscode")
    detail: str = Field(..., description="Detaillierte Fehlerbeschreibung")
    instance: str | None = Field(
        None, description="URI-Referenz zur konkreten Fehlerinstanz"
    )
    code: str | None = Field(
        None,
        description="Stabiler maschinenlesbarer Error-Code (z.B. E_OTX_PARSE_FAILED)",
    )
