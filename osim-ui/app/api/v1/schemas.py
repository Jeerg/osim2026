"""GET /api/v1/schemas/v1 — PropertySchema-Auslieferung.

Phase 1 nutzt eine hand-curated JSON-Datei unter
``app/static/schemas/v1/schemas.json`` (siehe Plan 01-07). Das Schema
beschreibt pro OSim-Klasse die Property-Layout-Metadaten (Label, OCtrl-Typ,
Enum-Werte, Link-Ziel-Klasse), die der dynamische OViewer-Frontend-Code
fuer Property-Editor-Rendering benoetigt.

Phase 3 ersetzt die Hand-Pflege durch Engine-Reflection (E2.1-E2.6); bis
dahin ist die JSON-Datei der einzige Vertrag zwischen Backend und
Frontend-Viewer-Schicht.

Der Endpoint liefert ``Cache-Control: public, max-age=86400`` (Schema ist
statisch fuer die Laufzeit des Servers). Frontend kombiniert das mit
``staleTime: Infinity`` in TanStack-Query (Plan 01-07 Task 2).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

# Schema-Datei liegt unter ``app/static/schemas/v1/schemas.json``.
# Pfad-Aufloesung relativ zum Modul-Pfad ``app/api/v1/schemas.py`` -> drei
# Ebenen rauf zum ``app/``-Root.
_SCHEMAS_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "static"
    / "schemas"
    / "v1"
    / "schemas.json"
)

# Eager-Load beim Modul-Import. Der Datei-Read passiert genau einmal pro
# Server-Lifetime; danach wird das Dict aus dem Speicher serviert. Bei
# fehlender / ungueltiger Datei wirft der Import einen verstaendlichen
# Fehler beim App-Start (statt erst beim ersten Request).
def _load_schemas() -> dict[str, Any]:
    if not _SCHEMAS_PATH.is_file():  # pragma: no cover
        raise FileNotFoundError(
            f"PropertySchema-Datei nicht gefunden: {_SCHEMAS_PATH}. "
            "Plan 01-07 erwartet ``app/static/schemas/v1/schemas.json``."
        )
    return json.loads(_SCHEMAS_PATH.read_text(encoding="utf-8"))


_SCHEMAS_CACHE: dict[str, Any] = _load_schemas()


router = APIRouter(tags=["schemas"])


@router.get("/schemas/v1")
def get_schemas_v1() -> JSONResponse:
    """Liefert die PropertySchema-Liste fuer alle Phase-1-Klassen.

    Antwort-Form (siehe ``portal/src/viewers/core/types.ts`` ``ClassSchema``):

        {
          "version": 1,
          "note": "...",
          "schemas": [
            {"klass": "ASimulator", "label_de": "Simulator", "viewer_hints": ["std"],
             "properties": [{"name": "m_name", "label_de": "Name",
                             "octrl_type": "Variable", "value_type": "string"}, ...]},
            ...
          ]
        }

    Cache-Strategie: ``public, max-age=86400`` — Schema-Datei aendert sich
    nur bei Server-Deployment, Frontend kann den Response 24h cachen.
    """
    return JSONResponse(
        content=_SCHEMAS_CACHE,
        headers={"Cache-Control": "public, max-age=86400"},
    )


__all__ = ["router"]
