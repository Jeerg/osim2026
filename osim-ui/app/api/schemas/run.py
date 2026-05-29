"""Pydantic-v2-Schemas für die Sim-Run-Endpoints (``/api/v1`` runs).

Minimaler HTTP-Polling-Transport (Plan 01-08, GAP-2 + GAP-3):
    * ``StartRunResponse`` — Antwort auf ``POST /models/{id}/runs``.
    * ``StreamChunk`` — inkrementeller Byte-Range-Read der ``stream.jsonl``
      (``{text, next_offset}``); der ReadFn-Vertrag für 01-09.

Es gibt KEINE DB-Tabelle für Runs — die Ownership wird über den
tenant-präfixierten run-dir-Pfad + eine ``run_meta.json`` im run-dir
durchgesetzt (siehe ``app/services/run_service.py``).
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class StartRunResponse(BaseModel):
    """Antwort auf ``POST /api/v1/models/{model_id}/runs``."""

    run_id: str = Field(..., description="run-id (= Basename des run-dir)")
    model_id: UUID = Field(..., description="ID des gestarteten Modells")
    coverage_ratio: float | None = Field(
        None,
        description=(
            "Loader-Coverage des Modells (0..1); None solange der Lauf die "
            "finale meta.json noch nicht geschrieben hat."
        ),
    )
    status: str = Field(
        "running",
        description="Lauf-Status — 'running' (paced, beobachtbar live).",
    )


class StreamChunk(BaseModel):
    """Inkrementeller Byte-Range-Read der ``stream.jsonl`` eines Laufs.

    ReadFn-Vertrag (für 01-09): ein Client pollt mit ``offset=next_offset`` des
    vorigen Reads und erhält nur die nachgewachsenen Bytes. Solange der paced
    Lauf noch schreibt, liefert ein erneuter Read ab ``next_offset`` die neuen
    Frames (AC-3/AC-5-Basis).
    """

    text: str = Field(..., description="Roh-Text ab dem angefragten Byte-Offset")
    next_offset: int = Field(
        ..., description="Byte-Offset für den nächsten inkrementellen Read"
    )


__all__ = ["StartRunResponse", "StreamChunk"]
