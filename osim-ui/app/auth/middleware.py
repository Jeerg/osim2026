"""Pure-ASGI ``TenantAuthMiddleware`` für Firebase-JWT-Validierung.

3fls-Pattern (siehe ``tbx_stzrim/app/auth/middleware.py``), reduziert für
osim-ui:
    * KEIN Billing-/Subscription-/Grace-Period-Code (Phase 5+).
    * KEIN ``auth_tenant_fallback_default`` (D-17 Lazy-Bootstrap liefert
      echten ``tenant_id``).
    * KEIN ``/api/v1/webhooks/stripe`` in der Whitelist (kein Stripe).

osim-ui-spezifische Erweiterung gegenüber 3fls (D-17 Self-Service):
    * Wenn das Firebase-JWT KEINEN ``tenant_id``-Claim hat, wird
      ``bootstrap_tenant_if_missing(uid, email)`` synchron aufgerufen und der
      neu angelegte ``tenant_id`` in ``scope["state"]`` gesetzt. Der Aufruf
      läuft via ``asyncio.to_thread`` (sync SQLAlchemy nach D-18 darf den
      Event-Loop nicht blockieren).

KEIN ``BaseHTTPMiddleware`` — Pure-ASGI per Starlette-#1678 / PATTERNS.md
§Stack-Drift.
"""

from __future__ import annotations

import asyncio
import json
import logging

import structlog
from firebase_admin import auth

from app.auth.firebase import verify_token

logger = structlog.get_logger(__name__)

# Pfade, die ohne Authentifizierung durchgelassen werden.
WHITELIST_PATHS: frozenset[str] = frozenset(
    {
        "/",
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/favicon.ico",
    }
)


class TenantAuthMiddleware:
    """Pure-ASGI-Middleware für Firebase-JWT-Validierung + Tenant-Kontext.

    Für jede HTTP-Request, die NICHT in ``WHITELIST_PATHS`` ist und NICHT
    OPTIONS (CORS-Preflight):

    1. Bearer-Token aus ``Authorization``-Header extrahieren.
    2. Token via Firebase Admin SDK verifizieren (``verify_token``).
    3. ``tenant_id`` aus Custom-Claims lesen; wenn fehlt → Lazy-Bootstrap
       via ``bootstrap_tenant_if_missing`` (D-17 Self-Service).
    4. Tenant-Kontext auf ``scope["state"]`` setzen für nachgelagerte
       Handler.
    5. structlog-contextvars binden (tenant_id, user_email, method, path).
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        # Whitelist-Pfade ohne Auth durchlassen.
        if path in WHITELIST_PATHS:
            await self.app(scope, receive, send)
            return

        # CORS-Preflight (OPTIONS) ohne Auth durchlassen.
        method = scope.get("method", "")
        if method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        # Authorization-Header aus ASGI-Scope extrahieren.
        headers = dict(
            (
                k.decode("latin-1") if isinstance(k, bytes) else k,
                v.decode("latin-1") if isinstance(v, bytes) else v,
            )
            for k, v in scope.get("headers", [])
        )
        auth_header = headers.get("authorization", "")

        if not auth_header.startswith("Bearer "):
            await self._send_error(scope, receive, send, 401, "Missing token")
            return

        token = auth_header[7:]  # "Bearer " strippen

        try:
            # verify_token ist sync (firebase-admin SDK) — in to_thread wrappen,
            # damit der Event-Loop frei bleibt (3fls-Phase-17.8.5-Lesson).
            decoded = await asyncio.to_thread(verify_token, token)
        except auth.ExpiredIdTokenError:
            await self._send_error(scope, receive, send, 401, "Token expired")
            return
        except (auth.InvalidIdTokenError, Exception):
            await self._send_error(scope, receive, send, 401, "Invalid token")
            return

        # osim-ui-Erweiterung gegenüber 3fls: Lazy-Bootstrap wenn kein
        # tenant_id-Claim im Token. CREATE SCHEMA IF NOT EXISTS + ON CONFLICT
        # macht den Bootstrap idempotent gegen Race.
        tenant_id = decoded.get("tenant_id")
        if not tenant_id:
            # Lazy-Bootstrap per D-17 (Self-Service): erstmaliger Login eines
            # Firebase-Users → tenant_{uid}-Schema wird angelegt.
            # Lazy-Import vermeidet Circular (auth_service importiert engine,
            # engine importiert config — middleware muss bootstrap nicht zum
            # Module-Import-Zeitpunkt kennen).
            try:
                from app.services.auth_service import (
                    bootstrap_tenant_if_missing,
                )

                tenant_id = await asyncio.to_thread(
                    bootstrap_tenant_if_missing,
                    decoded["uid"],
                    decoded.get("email", ""),
                )
            except Exception:
                # DB-/Bootstrap-Fehler — defensiv 500, NICHT 401 (User ist
                # authentifiziert, das System hat das Problem).
                logging.getLogger(__name__).error(
                    "tenant.bootstrap_failed", exc_info=True
                )
                await self._send_error(
                    scope, receive, send, 500, "Tenant bootstrap failed"
                )
                return

        # Tenant-Kontext auf request.state setzen.
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["tenant_id"] = tenant_id
        scope["state"]["user_role"] = decoded.get("role", "user")
        scope["state"]["user_email"] = decoded.get("email", "")
        scope["state"]["user_uid"] = decoded.get("uid", decoded.get("user_id", ""))

        # Request-Kontext für strukturiertes Logging binden.
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            tenant_id=tenant_id,
            user_email=decoded.get("email", ""),
            method=method,
            path=path,
        )

        await self.app(scope, receive, send)

    @staticmethod
    async def _send_error(
        scope, receive, send, status_code: int, detail: str
    ) -> None:
        """JSON-Error-Response senden.

        KEIN RFC-7807-Format hier — die Middleware antwortet vor dem
        FastAPI-HTTPException-Handler. Der Handler liefert RFC-7807 für
        Errors, die innerhalb der App entstehen; Middleware-Errors sind
        bewusst einfach (``{"detail": "..."}``).
        """
        body = json.dumps({"detail": detail}).encode("utf-8")
        response_headers = [
            [b"content-type", b"application/json"],
            [b"content-length", str(len(body)).encode("utf-8")],
        ]
        await send(
            {
                "type": "http.response.start",
                "status": status_code,
                "headers": response_headers,
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": body,
            }
        )
