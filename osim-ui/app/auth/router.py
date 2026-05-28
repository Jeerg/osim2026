"""Auth-API-Router: ``/api/v1/auth/me``.

Lazy-Bootstrap passiert bereits in der ``TenantAuthMiddleware`` (D-17
Self-Service). Der ``/auth/me``-Endpoint bleibt minimal und liefert den
authentifizierten User-Kontext + ``tenant_status`` (in Phase 1 immer
``"active"`` — Bootstrap stellt das sicher).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser

router = APIRouter(prefix="/auth", tags=["auth"])


class AuthMeResponse(BaseModel):
    """API-Response für ``GET /api/v1/auth/me``.

    ``tenant_status`` ist in Phase 1 immer ``"active"`` (Lazy-Bootstrap
    stellt das sicher). Frontend (``auth-provider.tsx``) erwartet das Feld
    laut PATTERNS.md §``app/auth/router.py``.
    """

    tenant_id: str
    role: str
    email: str
    tenant_status: str = "active"


@router.get("/me", response_model=AuthMeResponse)
def auth_me(
    user: CurrentUser = Depends(get_current_user),
) -> AuthMeResponse:
    """Return authentifizierten User + Tenant-Status.

    Lazy-Bootstrap wird bereits von ``TenantAuthMiddleware`` ausgelöst, falls
    der Firebase-User noch keinen ``tenant_id``-Claim hat — bis dieser
    Endpoint aufgerufen wird, ist das Tenant-Schema garantiert vorhanden.
    """
    return AuthMeResponse(
        tenant_id=user.tenant_id,
        role=user.role.value,
        email=user.email,
        tenant_status="active",
    )
