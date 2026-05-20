"""Health- und Readiness-Endpoints (versioniert).

Beide Endpoints sind in TenantAuthMiddleware.WHITELIST_PATHS gespiegelt --
also OHNE Auth erreichbar. Das Top-Level ``/health`` in app.main.py ist
fuer Container-Liveness gedacht; ``/api/v1/health`` ist die versionierte
API-Version.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text

from app.core.database import AsyncSessionLocal

router = APIRouter()


async def _get_probe_session() -> AsyncGenerator[AsyncSession]:
    """Probe-Session ohne tenant-search_path -- nur fuer Readiness-Check."""
    async with AsyncSessionLocal() as session:
        yield session


@router.get("/health", summary="Liveness-Check")
async def health() -> dict[str, str]:
    """Liveness: Server antwortet -- sagt NICHTS ueber Abhaengigkeiten aus."""
    return {"status": "ok", "service": "osim-ui", "version": "0.1.0"}


@router.get("/readiness", summary="Readiness-Check mit DB-Connectivity")
async def readiness(
    session: AsyncSession = Depends(_get_probe_session),
) -> JSONResponse:
    """Readiness: prueft DB-Connectivity.

    Erfolg: 200 + ``{"status":"ok","db":"up"}``.
    DB unreachable: 503 + ``{"status":"degraded","db":"down","error":"..."}``.
    """
    try:
        result = await session.execute(text("SELECT 1"))
        result.scalar_one()
    except Exception as exc:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "degraded",
                "db": "down",
                "error": f"{type(exc).__name__}: {exc}",
            },
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "ok", "db": "up"},
    )
