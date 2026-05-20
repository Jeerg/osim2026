"""FastAPI-Dependencies fuer Auth-Kontext.

Lesen aus ``request.state`` (gesetzt von TenantAuthMiddleware) -- kein
weiterer Token-Verify, weil das die Middleware schon erledigt hat.
"""

from __future__ import annotations

from fastapi import HTTPException, Request


def get_user_uid(request: Request) -> str:
    """Firebase-UID aus dem Request-Kontext."""
    uid = getattr(request.state, "user_uid", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return uid


def get_user_email(request: Request) -> str:
    """User-E-Mail aus dem Request-Kontext."""
    email = getattr(request.state, "user_email", None)
    if email is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return email


def get_user_role(request: Request) -> str:
    """User-Rolle (owner|editor|viewer)."""
    role = getattr(request.state, "user_role", None) or "owner"
    return role


def get_tenant_id(request: Request) -> str:
    """Tenant-ID aus dem Request-Kontext.

    Raised 401, wenn nicht gesetzt -- darf nur bei Endpoints aufgerufen
    werden, die einen vollstaendig bootstrapped Tenant verlangen.
    Endpoints wie ``/auth/me`` (Bootstrap-Pfad) duerfen diese Dependency
    NICHT verwenden.
    """
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    return tenant_id
