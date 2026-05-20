"""FastAPI-Entry-Point fuer osim-ui.

Plan 01-02:
- Logging (structlog) konfigurieren in lifespan
- Firebase Admin SDK initialisieren in lifespan
- CORS + GZip + TenantAuthMiddleware
- RFC-7807 ProblemDetail-Exception-Handler
- Top-Level /health (Liveness-Probe fuer Container)
- /api/v1/* unter dem versionierten Router
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1.router import api_router
from app.auth.firebase import initialize_firebase
from app.auth.middleware import TenantAuthMiddleware
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    configure_logging()
    initialize_firebase()
    yield
    # Shutdown -- DB-Engine-Dispose
    from app.core.database import engine
    await engine.dispose()


app = FastAPI(
    title="osim-ui",
    version="0.1.0",
    description="Web-UI und Orchestrator-Backend fuer die osim-engine.",
    lifespan=lifespan,
)

# WICHTIG: Middleware-Reihenfolge -- CORS+GZip ZUERST registriert
# = AUSSERSTE Schicht (Starlette wraps in reverse order).
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantAuthMiddleware)

register_exception_handlers(app)


# Top-Level Liveness-Probe (Whitelist-Pfad in TenantAuthMiddleware).
@app.get("/health", tags=["liveness"])
async def health_toplevel() -> dict[str, str]:
    """Liveness-Probe fuer Container-/Orchestrator-Healthchecks."""
    return {"status": "ok", "service": "osim-ui", "version": "0.1.0"}


# Top-Level Readiness-Probe mit DB-Check.
@app.get("/readiness", tags=["liveness"])
async def readiness_toplevel():
    """Readiness-Probe: 200 wenn DB up, 503 sonst."""
    from fastapi import status as _status
    from fastapi.responses import JSONResponse as _JSON
    from sqlalchemy.sql import text as _text

    from app.core.database import AsyncSessionLocal as _Sess

    try:
        async with _Sess() as session:
            await session.execute(_text("SELECT 1"))
    except Exception as exc:
        return _JSON(
            status_code=_status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "db": "down", "error": f"{type(exc).__name__}: {exc}"},
        )
    return _JSON(status_code=200, content={"status": "ok", "db": "up"})


app.include_router(api_router, prefix="/api/v1")
