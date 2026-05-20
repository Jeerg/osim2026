"""TenantAuthMiddleware -- pure ASGI, Firebase JWT-Validierung + Tenant-Kontext.

Pattern aus tbx_stzrim/app/auth/middleware.py uebernommen, fuer osim-ui
vereinfacht (kein Stripe-Webhook, kein Billing-State-Machine).

Verantwortung:
1. Whitelist-Pfade (/health, /readiness, /docs, ...) durchlassen.
2. Bearer-Token aus Authorization-Header extrahieren -> verify_token.
3. ``request.state`` populieren: user_uid, user_email, tenant_id (aus Claims).
4. **Sonderfall /api/v1/auth/me**: Wenn der User noch keinen
   tenant_id-Claim hat (= erster Login), trotzdem durchlassen, damit
   der Handler lazy-bootstrappen kann. Fuer alle anderen API-Pfade
   ohne tenant_id -> 401.
5. Bei Verification-Fehler -> 401 mit RFC-7807 ProblemDetail-Body.

ProblemDetail-Body wird hier *inline* gebaut, weil die Middleware vor der
FastAPI-Exception-Handler-Pipeline laeuft.
"""

from __future__ import annotations

import asyncio
import json
import logging

import structlog
from firebase_admin import auth as fb_auth

from app.auth.firebase import verify_token

logger = structlog.get_logger(__name__)
_stdlib_log = logging.getLogger(__name__)

# Pfade, die ohne Authorization durchgelassen werden.
WHITELIST_PATHS = frozenset({
    "/",
    "/health",
    "/readiness",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/favicon.ico",
})

# Pfade, die auch ohne tenant_id-Claim durchgelassen werden (Bootstrap-Self-Service).
TENANT_BOOTSTRAP_PATHS = frozenset({
    "/api/v1/auth/me",
})

PROBLEM_CONTENT_TYPE = b"application/problem+json"


class TenantAuthMiddleware:
    """Pure ASGI-Middleware. Setzt tenant_id, user_uid, user_email, user_role auf scope['state']."""

    def __init__(self, app):  # noqa: ANN001 (ASGI app-Typ)
        self.app = app

    async def __call__(self, scope, receive, send):  # noqa: ANN001
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        method: str = scope.get("method", "")

        # Whitelist: ohne jegliche Auth durchlassen.
        if path in WHITELIST_PATHS:
            await self.app(scope, receive, send)
            return

        # CORS-Preflight ohne Auth.
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        # Authorization-Header lesen.
        auth_header = ""
        for k, v in scope.get("headers", []):
            key = k.decode("latin-1") if isinstance(k, bytes) else k
            if key.lower() == "authorization":
                auth_header = v.decode("latin-1") if isinstance(v, bytes) else v
                break

        if not auth_header.startswith("Bearer "):
            await self._send_problem(
                send, 401, "Unauthorized", "Missing or malformed Authorization header.",
                instance=path,
            )
            return

        token = auth_header[len("Bearer "):]

        try:
            # firebase-admin verify_token ist sync -> in to_thread, damit der
            # Event-Loop nicht blockiert.
            decoded = await asyncio.to_thread(verify_token, token)
        except fb_auth.ExpiredIdTokenError:
            await self._send_problem(send, 401, "Unauthorized", "Token expired.", instance=path)
            return
        except fb_auth.InvalidIdTokenError:
            await self._send_problem(send, 401, "Unauthorized", "Invalid token.", instance=path)
            return
        except Exception as exc:
            _stdlib_log.warning("token_verify_unexpected_error", exc_info=True)
            await self._send_problem(
                send, 401, "Unauthorized", f"Token verification failed: {type(exc).__name__}",
                instance=path,
            )
            return

        uid = decoded.get("uid") or decoded.get("user_id")
        email = decoded.get("email", "")
        if not uid:
            await self._send_problem(
                send, 401, "Unauthorized", "Token has no uid claim.", instance=path,
            )
            return

        tenant_id = decoded.get("tenant_id")
        role = decoded.get("role") or "owner"  # Phase-1-Default

        # Sonderbehandlung /auth/me: Bootstrap-Pfad, tenant_id darf fehlen.
        if path not in TENANT_BOOTSTRAP_PATHS and not tenant_id:
            await self._send_problem(
                send, 401, "Unauthorized",
                "Token has no tenant_id claim. Call POST /api/v1/auth/me first.",
                instance=path,
            )
            return

        # State populieren.
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["user_uid"] = uid
        scope["state"]["user_email"] = email
        scope["state"]["user_role"] = role
        if tenant_id:
            scope["state"]["tenant_id"] = tenant_id
        # Wenn tenant_id fehlt UND wir auf /auth/me sind: tenant_id NICHT
        # setzen -- der Handler muss get_db_unscoped benutzen und legt
        # den Tenant per ensure_tenant_bootstrap an.

        # structlog-Context binden (request-scoped).
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            user_uid=uid,
            tenant_id=tenant_id or "<bootstrap>",
            method=method,
            path=path,
        )

        await self.app(scope, receive, send)

    @staticmethod
    async def _send_problem(
        send,  # noqa: ANN001
        status: int,
        title: str,
        detail: str,
        instance: str | None = None,
    ) -> None:
        """Sendet eine RFC-7807-ProblemDetail-Response."""
        payload = {
            "type": "about:blank",
            "title": title,
            "status": status,
            "detail": detail,
        }
        if instance:
            payload["instance"] = instance
        body = json.dumps(payload).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", PROBLEM_CONTENT_TYPE),
                (b"content-length", str(len(body)).encode("utf-8")),
            ],
        })
        await send({"type": "http.response.body", "body": body})
