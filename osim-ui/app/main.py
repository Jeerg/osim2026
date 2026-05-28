"""FastAPI-Entry-Point für osim-ui.

App-Factory nach 3fls-Pattern (siehe ``tbx_stzrim/main.py``, Z.120-241,
adaptiert in PATTERNS.md §``app/main.py``). Phase 1 enthält:

    * ``configure_logging()`` (structlog).
    * ``initialize_firebase()`` (Admin SDK).
    * RFC-7807 ``ProblemDetail``-Response für alle ``HTTPException``.
    * ``CORSMiddleware`` (outer; lässt OPTIONS-Preflight durch).
    * ``TenantAuthMiddleware`` (inner; setzt ``tenant_id`` auf
      ``scope["state"]``).
    * Root- + Health-Endpoint (whitelisted).
    * API-v1-Router unter ``/api/v1`` (auth-protected).

KEIN GZipMiddleware (3fls hat das auskommentiert), KEIN Rate-Limit, KEIN
CORSWrapper (Starlette-CORSMiddleware reicht für Phase 1).
"""

from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.schemas.common import ProblemDetail
from app.api.v1.health import router as health_router
from app.api.v1.router import api_router
from app.auth.firebase import initialize_firebase
from app.auth.middleware import TenantAuthMiddleware
from app.core.config import settings
from app.core.logging import configure_logging

_logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan-Pflicht-Pattern (3fls-Konvention).

    Phase 1: leer (kein BridgeClient, kein GraphService, kein BackgroundTask).
    Phase 2+ hängt hier StorageService-Init und Worker-Pool-Setup ein.
    """
    yield


def create_app() -> FastAPI:
    """App-Factory: konfiguriert Logging, Firebase, Error-Handler, Middleware
    und Router."""
    configure_logging()
    initialize_firebase()

    app = FastAPI(
        title="osim-ui API",
        version="0.1.0",
        description="Web-UI Orchestrator für osim-engine",
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
    )

    # ------------------------------------------------------------------
    # RFC-7807-Handler für HTTPException
    # ------------------------------------------------------------------
    # Plan-24-04.2-Pattern aus 3fls: structured detail (`{code, message}`)
    # wird in {code, title, detail} aufgesplittet. `code` ist Top-Level-
    # Extension-Member (RFC 7807 §3.2). Plain-String-Details fallen auf
    # title = detail-Text zurück.
    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request, exc: HTTPException
    ) -> ORJSONResponse:
        code: str | None = None
        title: str = "Error"
        detail_text: str = ""
        if isinstance(exc.detail, str):
            detail_text = exc.detail
            title = exc.detail or "Error"
        elif isinstance(exc.detail, dict):
            code = exc.detail.get("code")
            detail_text = str(exc.detail.get("message") or exc.detail)
            title = code or "Error"
        else:
            detail_text = str(exc.detail)
        problem = ProblemDetail(
            type="about:blank",
            title=title,
            status=exc.status_code,
            detail=detail_text,
            instance=str(request.url),
            code=code,
        )
        return ORJSONResponse(
            status_code=exc.status_code,
            content=problem.model_dump(),
            media_type="application/problem+json",
        )

    # ------------------------------------------------------------------
    # Middleware-Order
    # ------------------------------------------------------------------
    # FastAPI's `app.add_middleware` prepends — last added = outermost.
    # Wir wollen:
    #   [outer] CORSMiddleware  (muss bei OPTIONS antworten, OHNE Auth)
    #   [inner] TenantAuthMiddleware (Bearer-Token-Check, setzt tenant_id)
    #   [base]  FastAPI-App
    # → erst TenantAuthMiddleware adden (wird inner), dann CORSMiddleware
    #   (wird outermost).
    app.add_middleware(TenantAuthMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------
    # Router-Inclusion
    # ------------------------------------------------------------------
    # Root-Endpoint (whitelisted, kein Auth-Check) — primär für die
    # Sanity-Check-Curl "ist die App online".
    @app.get("/")
    def root() -> dict[str, str]:
        return {"message": "osim-ui API", "docs": "/docs"}

    # Health-Endpoint absolut (NICHT unter /api/v1 — 3fls-Konvention).
    app.include_router(health_router)

    # API-v1 — auth-protected via TenantAuthMiddleware.
    app.include_router(api_router, prefix="/api/v1")

    _logger.info(
        "app.started",
        environment=settings.environment,
        cors_origins=settings.cors_origins,
    )
    return app


app = create_app()
