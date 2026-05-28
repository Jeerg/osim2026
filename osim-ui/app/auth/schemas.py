"""Auth-Schemas: ``UserRole``, ``CurrentUser``.

3fls-1:1-Übernahme aus ``tbx_stzrim/app/auth/schemas.py``. Einzige Änderung:
``UserRole``-Werte sind ``user`` (statt ``viewer``) + ``admin`` — passt
besser zum osim-ui-Self-Service-Pattern (D-17: jeder neue Firebase-User
landet als ``user`` im eigenen Tenant; Admin kommt später).

``AuthMeResponse`` lebt in ``app/auth/router.py`` (lokal zum Endpoint).
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class UserRole(StrEnum):
    """User-Rolle. Erweiterbar in späteren Phasen (z.B. ``analyst``)."""

    USER = "user"
    ADMIN = "admin"


class CurrentUser(BaseModel):
    """Authentifizierter User-Kontext aus Firebase-JWT-Custom-Claims.

    Wird von ``TenantAuthMiddleware`` auf ``request.state`` gesetzt und von
    FastAPI-Dependencies in ``app.auth.dependencies`` gelesen.
    """

    tenant_id: str
    role: UserRole
    email: str
    uid: str
