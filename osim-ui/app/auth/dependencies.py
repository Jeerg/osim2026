"""FastAPI-Dependencies für Authentifizierung + Autorisierung.

3fls-1:1-Übernahme aus ``tbx_stzrim/app/auth/dependencies.py``, plus zwei
Convenience-Helper ``get_tenant_id`` / ``get_user_uid`` für Endpoints, die
nur einen einzelnen Wert brauchen.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request

from app.auth.schemas import CurrentUser, UserRole


def get_current_user(request: Request) -> CurrentUser:
    """Extrahiere den authentifizierten User aus ``request.state``.

    ``TenantAuthMiddleware`` setzt die Felder. Fehlt ein Attribut, ist die
    Middleware-Kette gebrochen — 401 statt 500.
    """
    try:
        return CurrentUser(
            tenant_id=request.state.tenant_id,
            role=request.state.user_role,
            email=request.state.user_email,
            uid=request.state.user_uid,
        )
    except AttributeError:
        raise HTTPException(status_code=401, detail="Not authenticated")


def require_admin(
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Erzwinge Admin-Rolle. 403 für Nicht-Admins.

    Usage::

        @router.post(
            "/admin-only",
            dependencies=[Depends(require_admin)],
        )
    """
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions. Admin role required.",
        )
    return user


def get_tenant_id(request: Request) -> str:
    """Shortcut: nur die ``tenant_id`` aus ``request.state`` lesen."""
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return tenant_id


def get_user_uid(request: Request) -> str:
    """Shortcut: nur die ``user_uid`` aus ``request.state`` lesen."""
    user_uid = getattr(request.state, "user_uid", None)
    if not user_uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_uid
