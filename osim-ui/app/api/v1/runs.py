"""HTTP-Endpoints für Sim-Läufe (``/api/v1`` runs).

Plan 01-08 (GAP-2 + GAP-3) — drei Endpoints, Pfade vollständig im Decorator
(analog locks_router, kein zusätzlicher Prefix in router.py):

    POST   /api/v1/models/{model_id}/runs   (Lauf starten, paced)
    GET    /api/v1/runs/{run_id}/stream      (inkrementeller Byte-Range-Read)
    GET    /api/v1/runs/{run_id}/meta        (meta.json)

Alle Endpoints benötigen Auth (``TenantAuthMiddleware`` + ``get_current_user``).
Der über die API gestartete Lauf ist „paced" (Default aus ``settings.run_default_pace``)
und damit beobachtbar live.

AuthZ-Confinement (T-RUN-02): ein run_id wird nur unter dem Tenant-Prefix des
aufrufenden Users aufgelöst — ein fremder/manipulierter run_id → 404. Pfad-
Traversal (``..``/``/``/``\\``) → 404 (ValueError im Service, T-RUN-01).
"""

from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.engine import Connection

from app.api.schemas.run import StartRunResponse, StreamChunk
from app.api.v1.models import get_storage_dep
from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser
from app.core.config import settings
from app.core.database import get_db
from app.services.run_service import RunNotFound, RunService
from app.services.storage import StorageService

log = structlog.get_logger(__name__)

router = APIRouter(tags=["runs"])


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_run_service(
    request: Request,
    conn: Connection = Depends(get_db),
    storage: StorageService = Depends(get_storage_dep),
    user: CurrentUser = Depends(get_current_user),
) -> RunService:
    """Pro-Request-Instanz von RunService (Muster 1:1 wie get_model_service).

    Connection hat per ``get_db`` bereits den search_path auf das Tenant-Schema
    gesetzt; tenant_id + uid kommen aus dem Auth-Context. runs_dir/Pace/Cap aus
    den Settings (D-OP-2).
    """
    _ = request  # Dependency-Hierarchie
    return RunService(
        conn=conn,
        storage=storage,
        tenant_id=user.tenant_id,
        user_uid=user.uid,
        runs_dir=settings.runs_dir,
        default_pace=settings.run_default_pace,
        max_periods=settings.run_max_periods,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def _run_not_found() -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "code": "E_RUN_NOT_FOUND",
            "message": "Lauf nicht gefunden oder gehört nicht zu Ihrem Tenant.",
        },
    )


@router.post("/models/{model_id}/runs", response_model=StartRunResponse)
def start_run(
    model_id: UUID,
    service: RunService = Depends(get_run_service),
) -> StartRunResponse:
    """Startet einen paced Lauf des Modells (beobachtbar live).

    404 E_MODEL_NOT_FOUND wenn das Modell nicht im Tenant existiert
    (ModelService.get_meta raised die HTTPException).
    """
    record = service.start_run(model_id)
    return StartRunResponse(
        run_id=record["run_id"],
        model_id=record["model_id"],
        coverage_ratio=record["coverage_ratio"],
        status=record["status"],
    )


@router.get("/runs/{run_id}/stream", response_model=StreamChunk)
def read_run_stream(
    run_id: str,
    offset: int = 0,
    service: RunService = Depends(get_run_service),
) -> StreamChunk:
    """Liest die ``stream.jsonl`` inkrementell ab ``offset`` (Byte-Offset).

    Ein Folge-Aufruf mit ``offset=<next_offset>`` liefert nur die nachgewachsenen
    Bytes (AC-3/AC-5-Basis). 404 bei fremdem/manipuliertem run_id.
    """
    try:
        chunk = service.read_stream(run_id, offset)
    except (RunNotFound, ValueError) as exc:
        raise _run_not_found() from exc
    return StreamChunk(text=chunk["text"], next_offset=chunk["next_offset"])


@router.get("/runs/{run_id}/meta")
def read_run_meta(
    run_id: str,
    service: RunService = Depends(get_run_service),
) -> dict:
    """Liefert die ``meta.json`` des Laufs (schema_version, streams, ...).

    404 bei fremdem/manipuliertem run_id.
    """
    try:
        return service.read_meta(run_id)
    except (RunNotFound, ValueError) as exc:
        raise _run_not_found() from exc


__all__ = ["router", "get_run_service"]
