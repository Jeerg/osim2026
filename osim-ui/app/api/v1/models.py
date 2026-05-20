"""/api/v1/models/* -- Modell-CRUD + Tree-Endpoints.

Endpunkte:
  POST   /api/v1/models/upload-otx       Upload + Parse + Storage
  GET    /api/v1/models                  List (Tenant-isoliert via search_path)
  GET    /api/v1/models/{id}             Detail + Coverage + Lock-Status
  GET    /api/v1/models/{id}/tree        JSON-Tree der aktuellen Version
  PUT    /api/v1/models/{id}/tree        JSON-Tree → neue Version (Save-back)
  GET    /api/v1/models/{id}/download-original  Originale (v1) als Bytes
  POST   /api/v1/models/{id}/lock        Edit-Lock akquirieren
  DELETE /api/v1/models/{id}/lock        Edit-Lock freigeben
  POST   /api/v1/models/{id}/lock/heartbeat  Lock-TTL refreshen

Lock-Endpoints + PUT-Lock-Pflicht werden in Task 3 ergaenzt.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_tenant_id, get_user_email, get_user_uid
from app.core.database import get_db
from app.schemas.json_tree import JsonTreeDocument
from app.schemas.model import (
    LockInfo,
    ModelDetail,
    ModelListItem,
    TreePutRequest,
    TreePutResponse,
    TreeResponse,
    UploadResponse,
)
from app.services.json_tree_service import (
    apply_tree_to_simulator,
    serialize_simulator_to_tree,
)
from app.services.lock_service import (
    acquire_lock,
    get_lock_status,
    heartbeat_lock,
    release_lock,
)
from app.services.model_service import (
    create_new_version,
    get_current_version_bytes,
    get_initial_version_bytes,
    get_model,
    list_models,
    register_model_from_otx,
)
from app.services.otx_service import dump_simulator_bytes, parse_otx_bytes
from app.services.storage import Storage, get_storage

router = APIRouter()


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


@router.post(
    "/upload-otx",
    response_model=UploadResponse,
    summary="Lade ein OTX-Modell hoch.",
)
async def upload_otx(
    file: UploadFile = File(..., description="OTX-Datei (Latin-1)."),
    tenant_id: str = Depends(get_tenant_id),
    user_uid: str = Depends(get_user_uid),
    db: AsyncSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> UploadResponse:
    """Akzeptiert Multipart-Upload, legt Modell + Version 1 an, schreibt Bytes
    in den Storage. Antwortet mit Coverage-Report.
    """
    raw = await file.read()
    model = await register_model_from_otx(
        file_bytes=raw,
        filename=file.filename or "unbenannt.otx",
        tenant_id=tenant_id,
        user_uid=user_uid,
        db=db,
        storage=storage,
    )
    return UploadResponse(
        id=model.id,
        name=model.name,
        coverage_ratio=model.coverage_ratio_at_upload,
        loaded_summary=model.loaded_summary,
        unsupported_summary=model.unsupported_summary,
    )


# ---------------------------------------------------------------------------
# List + Detail
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[ModelListItem],
    summary="Liste aller Modelle des aktuellen Tenants.",
)
async def list_models_endpoint(
    db: AsyncSession = Depends(get_db),
) -> list[ModelListItem]:
    models = await list_models(db)
    return [ModelListItem.model_validate(m) for m in models]


@router.get(
    "/{model_id}",
    response_model=ModelDetail,
    summary="Detail eines Modells inkl. Coverage und Lock-Status.",
)
async def get_model_endpoint(
    model_id: int,
    user_uid: str = Depends(get_user_uid),
    db: AsyncSession = Depends(get_db),
) -> ModelDetail:
    model = await get_model(model_id, db)
    lock = await get_lock_status(model_id, db)
    detail = ModelDetail.model_validate(model)
    if lock is not None:
        detail.lock_status = LockInfo(
            holder_uid=lock.holder_uid,
            holder_email=lock.holder_email,
            acquired_at=lock.acquired_at,
            last_heartbeat_at=lock.last_heartbeat_at,
            expires_at=lock.expires_at,
            is_self=(lock.holder_uid == user_uid),
        )
    return detail


# ---------------------------------------------------------------------------
# Tree (Browser-Editor-Vertrag)
# ---------------------------------------------------------------------------


@router.get(
    "/{model_id}/tree",
    response_model=TreeResponse,
    summary="Aktuelle Modell-Version als JSON-Tree.",
)
async def get_tree(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> TreeResponse:
    model = await get_model(model_id, db)
    version, data = await get_current_version_bytes(model, db, storage)
    load_result = parse_otx_bytes(data)
    tree = serialize_simulator_to_tree(
        load_result.simulator,
        load_result=load_result,
        original_otx=load_result.otx,
    )
    return TreeResponse(model_id=model.id, version=version.version, tree=tree)


@router.put(
    "/{model_id}/tree",
    response_model=TreePutResponse,
    summary="JSON-Tree zurueckspielen -> neue Modell-Version.",
)
async def put_tree(
    model_id: int,
    payload: TreePutRequest,
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    user_uid: str = Depends(get_user_uid),
    db: AsyncSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> TreePutResponse:
    # Validate tree schema (rekursiv).
    try:
        validated = JsonTreeDocument.model_validate(payload.tree)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid tree: {exc}") from exc

    model = await get_model(model_id, db)

    # Edit-Lock-Pflicht (Task 3): wenn ein anderer User den Lock haelt, 403.
    # Wenn niemand den Lock haelt, akzeptieren wir den Save (Browser kann
    # ohne Lock GET; PUT sollte aber nur mit Lock kommen -- der Frontend-
    # Client setzt ihn vor dem Edit).
    from app.services.lock_service import check_lock_for_edit  # lazy: Task 3
    await check_lock_for_edit(model_id=model.id, user_uid=user_uid, db=db)

    # Laden des aktuellen OTX (fuer original_otx-Pass-Through + instance-OIDs).
    _version, data = await get_current_version_bytes(model, db, storage)
    load_result = parse_otx_bytes(data)

    # Tree-Properties auf Sim anwenden.
    apply_tree_to_simulator(validated.model_dump(), load_result=load_result)

    # Serialisieren und neue Version anlegen.
    new_bytes = dump_simulator_bytes(
        load_result.simulator,
        original_otx=load_result.otx,
        instances=load_result.instances,
    )
    new_version = await create_new_version(
        model=model,
        otx_bytes=new_bytes,
        tenant_id=tenant_id,
        user_uid=user_uid,
        db=db,
        storage=storage,
    )

    # expected_version-Hint: Phase 1 nur Warning-Header.
    if payload.expected_version is not None and payload.expected_version != _version.version:
        request.state.tree_version_warning = (
            f"expected_version={payload.expected_version}, was={_version.version}"
        )

    return TreePutResponse(
        model_id=model.id,
        version=new_version.version,
        storage_key=new_version.storage_key,
        bytes_size=new_version.bytes_size,
    )


# ---------------------------------------------------------------------------
# Download Original
# ---------------------------------------------------------------------------


@router.get(
    "/{model_id}/download-original",
    summary="Originale OTX-Bytes (Version 1) als latin-1 application/octet-stream.",
)
async def download_original(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    storage: Storage = Depends(get_storage),
) -> Response:
    model = await get_model(model_id, db)
    initial, data = await get_initial_version_bytes(model, db, storage)
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{model.original_filename}"',
            "X-Storage-Key": initial.storage_key,
        },
    )


# ---------------------------------------------------------------------------
# Edit-Lock Endpoints (D-13)
# ---------------------------------------------------------------------------


def _to_lock_info(lock, user_uid: str) -> LockInfo:
    return LockInfo(
        holder_uid=lock.holder_uid,
        holder_email=lock.holder_email,
        acquired_at=lock.acquired_at,
        last_heartbeat_at=lock.last_heartbeat_at,
        expires_at=lock.expires_at,
        is_self=(lock.holder_uid == user_uid),
    )


@router.post(
    "/{model_id}/lock",
    response_model=LockInfo,
    summary="Edit-Lock akquirieren (15 min TTL, heartbeat-faehig).",
)
async def acquire_lock_endpoint(
    model_id: int,
    user_uid: str = Depends(get_user_uid),
    user_email: str = Depends(get_user_email),
    db: AsyncSession = Depends(get_db),
) -> LockInfo:
    # Existenz des Modells validieren -> 404 wenn unbekannt.
    await get_model(model_id, db)
    lock = await acquire_lock(
        model_id=model_id, user_uid=user_uid, user_email=user_email, db=db
    )
    return _to_lock_info(lock, user_uid)


@router.delete(
    "/{model_id}/lock",
    status_code=204,
    summary="Edit-Lock freigeben (idempotent).",
)
async def release_lock_endpoint(
    model_id: int,
    user_uid: str = Depends(get_user_uid),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await get_model(model_id, db)
    await release_lock(model_id=model_id, user_uid=user_uid, db=db)
    return Response(status_code=204)


@router.post(
    "/{model_id}/lock/heartbeat",
    response_model=LockInfo,
    summary="Lock-TTL refreshen (verschiebt expires_at).",
)
async def heartbeat_lock_endpoint(
    model_id: int,
    user_uid: str = Depends(get_user_uid),
    db: AsyncSession = Depends(get_db),
) -> LockInfo:
    await get_model(model_id, db)
    lock = await heartbeat_lock(model_id=model_id, user_uid=user_uid, db=db)
    return _to_lock_info(lock, user_uid)
