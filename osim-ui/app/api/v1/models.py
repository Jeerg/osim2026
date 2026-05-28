"""HTTP-Endpoints fuer Modell-Lifecycle (``/api/v1/models``).

Fuenf Endpoints — siehe ``.planning/phases/01-vertical-slice/01-04-...-PLAN.md``
Task 5:

    POST   /api/v1/models/upload-otx   (multipart)
    GET    /api/v1/models               (list)
    GET    /api/v1/models/{id}          (Meta + Wire)
    PUT    /api/v1/models/{id}          (Save-back; lock_token erforderlich)
    DELETE /api/v1/models/{id}          (204)

Alle Endpoints benoetigen Auth (``TenantAuthMiddleware`` setzt
``request.state``; ``get_current_user`` extrahiert).

Service-Lifecycle: ``get_model_service`` instanziiert pro Request einen neuen
``ModelService`` mit der per ``get_db`` etablierten Connection.
"""

from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from sqlalchemy.engine import Connection

from app.api.schemas.model import (
    GetModelResponse,
    ModelMeta,
    SaveModelRequest,
    SaveModelResponse,
    UploadOtxResponse,
)
from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser
from app.core.database import get_db
from app.services.lock_service import LockService
from app.services.model_service import ModelService
from app.services.storage import StorageService, get_storage

log = structlog.get_logger(__name__)

router = APIRouter(tags=["models"])


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def get_storage_dep() -> StorageService:
    """FastAPI-Dependency: liefert das StorageService-Backend.

    Nicht-cached — Phase 1 ist LocalStorage (billig). Bei Bedarf (z.B.
    Minio-Connection-Setup) kann hier ``functools.lru_cache`` ergaenzt
    werden.
    """
    return get_storage()


def get_model_service(
    request: Request,
    conn: Connection = Depends(get_db),
    storage: StorageService = Depends(get_storage_dep),
    user: CurrentUser = Depends(get_current_user),
) -> ModelService:
    """Pro-Request-Instanz von ModelService.

    Connection hat per ``get_db`` bereits ``search_path`` auf das Tenant-
    Schema gesetzt. ``tenant_id`` + ``user_uid`` kommen aus dem
    Auth-Context.
    """
    _ = request  # nicht direkt verwendet; Dependency-Hierarchie
    return ModelService(
        conn=conn,
        storage=storage,
        tenant_id=user.tenant_id,
        user_uid=user.uid,
    )


def get_lock_service(
    conn: Connection = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> LockService:
    """Pro-Request-Instanz von LockService (nutzt dieselbe Connection).

    tenant_id wird mitgegeben, damit der Service den search_path nach
    rollback wiederherstellen kann (Rule-1-Fix Plan 01-05 Task 7).
    """
    return LockService(conn, tenant_id=user.tenant_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/upload-otx", response_model=UploadOtxResponse)
async def upload_otx(
    file: UploadFile = File(...),
    name: str = Form(...),
    service: ModelService = Depends(get_model_service),
) -> UploadOtxResponse:
    """Upload einer ``.otx``-Datei.

    Multipart-Form-Felder:
        - ``file``: die OTX-Datei (binary, Latin-1).
        - ``name``: vom User vergebener Anzeige-Name.

    Antwort: ``ModelMeta`` + sofort der initiale ``ModelTreeWire`` (so
    erspart sich das Frontend den Folge-Get).

    Errors:
        413 E_UPLOAD_TOO_LARGE — > 30 MB
        415 E_INVALID_OTX_MIMETYPE — unbekannter MIME-Type
    """
    content = await file.read()
    meta = service.upload_otx(
        name=name,
        content=content,
        content_type=file.content_type,
    )
    wire = service.get_wire(meta.id)
    return UploadOtxResponse(model=meta, wire=wire)


@router.get("", response_model=list[ModelMeta])
def list_models(
    service: ModelService = Depends(get_model_service),
) -> list[ModelMeta]:
    """Liste aller Modelle des Tenants, DESC nach ``created_at``."""
    return service.list_models()


@router.get("/{model_id}", response_model=GetModelResponse)
def get_model(
    model_id: UUID,
    service: ModelService = Depends(get_model_service),
) -> GetModelResponse:
    """Modell-Meta + aktueller Wire-Stand.

    404 wenn ``model_id`` nicht existiert (im Tenant).
    """
    meta = service.get_meta(model_id)
    wire = service.get_wire(model_id)
    return GetModelResponse(model=meta, wire=wire)


@router.put("/{model_id}", response_model=SaveModelResponse)
def save_model(
    model_id: UUID,
    body: SaveModelRequest,
    service: ModelService = Depends(get_model_service),
    lock_service: LockService = Depends(get_lock_service),
    user: CurrentUser = Depends(get_current_user),
) -> SaveModelResponse:
    """Save-back: schreibt eine neue Version (``v_<ts>.otx``).

    Mitigation T-04-04: ``lock_token`` muss zum Owner passen — sonst 423.

    Aktivitaetsbeweis: erfolgreicher Save verlaengert die Lock-TTL (siehe
    PLAN Task 5 Behavior). Damit verliert ein langer Save bei knapper TTL
    den Lock nicht und nachfolgende Edits scheitern nicht mit 423.

    Errors:
        404 E_MODEL_NOT_FOUND
        422 E_OTX_COVERAGE_INCOMPLETE (is_save_safe = False)
        423 E_LOCK_EXPIRED (Token ungueltig / abgelaufen)
    """
    if not lock_service.validate_token(model_id, body.lock_token, user.uid):
        raise HTTPException(
            status_code=423,
            detail={
                "code": "E_LOCK_EXPIRED",
                "message": (
                    "Ihre Bearbeitungs-Sperre ist abgelaufen oder das Token "
                    "ist ungueltig. Bitte das Modell neu oeffnen."
                ),
            },
        )

    # Save = Aktivitaetsbeweis. Verlaengere die TTL, damit lange Saves den
    # Lock nicht verlieren.
    lock_service.heartbeat(model_id, body.lock_token, user.uid)

    new_key = service.save_wire(model_id, body.wire)
    meta = service.get_meta(model_id)
    return SaveModelResponse(model=meta, saved_version_key=new_key)


@router.delete("/{model_id}", status_code=204)
def delete_model(
    model_id: UUID,
    service: ModelService = Depends(get_model_service),
) -> Response:
    """Modell loeschen (Storage + DB-Row + Lock kaskadiert).

    Returns 204 No Content. 404 wenn das Modell nicht existiert.
    """
    service.delete_model(model_id)
    return Response(status_code=204)
