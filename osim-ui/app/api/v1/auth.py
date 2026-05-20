"""Auth-API: /api/v1/auth/me mit Lazy Tenant-Bootstrap.

Beim ersten Aufruf eines neu eingeloggten Firebase-Users wird automatisch:
1. ein Postgres-Schema ``tenant_{slug}`` angelegt,
2. eine ``public.tenants``-Row geschrieben,
3. eine ``public.users``-Row (role=owner) geschrieben,
4. ein Firebase-Custom-Claim ``tenant_id`` (+ ``role``) gesetzt (best-effort).

Bei Folge-Calls ist alles idempotent.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_user_email, get_user_uid
from app.auth.firebase import set_user_tenant_claims
from app.core.database import get_db_unscoped
from app.services.tenant_service import ensure_tenant_bootstrap

router = APIRouter()


class AuthMeResponse(BaseModel):
    """Antwort von POST /api/v1/auth/me."""

    tenant_id: str = Field(..., description="Postgres-Schema-Name = Tenant-ID.")
    user_uid: str = Field(..., description="Firebase-UID.")
    email: str = Field(..., description="User-E-Mail.")
    role: str = Field(..., description="Rolle im Tenant.")
    bootstrapped: bool = Field(
        ...,
        description="True, wenn dieser Call den Tenant gerade angelegt hat.",
    )


@router.post("/me", response_model=AuthMeResponse, summary="Lazy Tenant-Bootstrap")
async def auth_me(
    uid: str = Depends(get_user_uid),
    email: str = Depends(get_user_email),
    db: AsyncSession = Depends(get_db_unscoped),
) -> AuthMeResponse:
    """POST /api/v1/auth/me

    Idempotent. Beim ersten Call eines Users:
    - Schema anlegen
    - Tenant- und User-Row einfuegen
    - Firebase Custom Claims setzen

    Bei spaeteren Calls: nur den bestehenden Tenant/User zurueckgeben.
    """
    # Vorher pruefen, ob der User schon existiert (fuer ``bootstrapped``-Flag).
    from sqlalchemy import select

    from app.models.user import User

    existed = (
        await db.execute(select(User).where(User.uid == uid))
    ).scalar_one_or_none() is not None

    tenant, user = await ensure_tenant_bootstrap(uid, email, db)

    # Best-effort: Custom Claims aktualisieren, damit das naechste Token
    # tenant_id mitbringt und der DB-Lookup im Hot-Path entfaellt.
    if not existed:
        set_user_tenant_claims(uid, tenant.id, user.role)

    return AuthMeResponse(
        tenant_id=tenant.id,
        user_uid=user.uid,
        email=user.email,
        role=user.role,
        bootstrapped=not existed,
    )
