"""HTTP-Endpoints fuer Single-Editor-Lock (``/api/v1/models/{id}/lock``).

Drei Endpoints — siehe ``.planning/phases/01-vertical-slice/01-04-...-PLAN.md``
Task 5:

    POST   /api/v1/models/{id}/lock              (acquire)
    POST   /api/v1/models/{id}/lock/heartbeat    (extend TTL)
    DELETE /api/v1/models/{id}/lock              (release; token als Query)

Pfad-Konvention: ``/models/{id}/lock`` lebt im Lock-Router, NICHT als
sub-router unter Models — damit dort keine Konflikte mit dem ``/{id}``-
catch-all-Path entstehen.
"""

from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.schemas.lock import (
    HeartbeatRequest,
    HeartbeatResponse,
    LockOut,
)
from app.api.v1.models import get_lock_service
from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser
from app.services.lock_service import LockService

log = structlog.get_logger(__name__)

router = APIRouter(tags=["locks"])


@router.post("/models/{model_id}/lock", response_model=LockOut)
def acquire_lock(
    model_id: UUID,
    lock_service: LockService = Depends(get_lock_service),
    user: CurrentUser = Depends(get_current_user),
) -> LockOut:
    """Lock acquiren.

    Erfolg → 200 ``LockOut(token, expires_at)``.
    Konflikt → 409 ``{code, owner_user_uid, expires_at}``.
    """
    result = lock_service.acquire(model_id, user.uid)
    if not result.success:
        # 409 mit Conflict-Body (Mitigation T-04-06: owner_user_uid ist
        # gewuenscht; Frontend zeigt "Modell wird gerade von [User] bearbeitet").
        conflict = result.conflict
        if conflict is None:  # defensive; sollte nicht passieren
            raise HTTPException(
                status_code=409,
                detail={"code": "E_MODEL_LOCKED", "message": "Modell ist gesperrt."},
            )
        raise HTTPException(
            status_code=409,
            detail={
                "code": conflict.code,
                "message": "Modell wird gerade von einem anderen Nutzer bearbeitet.",
                "owner_user_uid": conflict.owner_user_uid,
                "expires_at": conflict.expires_at.isoformat(),
            },
        )

    assert result.token is not None and result.expires_at is not None  # noqa: S101
    return LockOut(token=result.token, expires_at=result.expires_at)


@router.post(
    "/models/{model_id}/lock/heartbeat", response_model=HeartbeatResponse
)
def heartbeat_lock(
    model_id: UUID,
    body: HeartbeatRequest,
    lock_service: LockService = Depends(get_lock_service),
    user: CurrentUser = Depends(get_current_user),
) -> HeartbeatResponse:
    """Lock-TTL verlaengern.

    Erfolg → 200 ``HeartbeatResponse(expires_at)``.
    Falscher Token / abgelaufen → 404 ``E_LOCK_EXPIRED``.
    """
    response = lock_service.heartbeat(model_id, body.token, user.uid)
    if response is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "E_LOCK_EXPIRED",
                "message": (
                    "Ihre Bearbeitungs-Sperre ist abgelaufen. Bitte das "
                    "Modell neu oeffnen."
                ),
            },
        )
    return response


@router.delete("/models/{model_id}/lock", status_code=204)
def release_lock(
    model_id: UUID,
    token: UUID,
    lock_service: LockService = Depends(get_lock_service),
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Lock freigeben.

    ``token`` ist Query-Parameter (DELETE-Requests sollten keinen Body
    haben). Erfolg → 204.

    Hinweis: kein Fehler, wenn der Lock nicht (mehr) existiert oder das
    Token falsch ist — der Endpoint ist idempotent aus Client-Sicht. So
    kann das Frontend defensiv beim ``unmount`` einen Release schicken,
    ohne sich um Race-Conditions zu kuemmern.
    """
    lock_service.release(model_id, token, user.uid)
    return Response(status_code=204)
