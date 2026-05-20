"""FastAPI-Entry-Point für osim-ui.

Phase 1: minimaler Stand mit Health-Check und Auth-Stub.
Routen-Aufbau folgt in `app/api/v1/router.py`.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="osim-ui",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "osim-ui"}


# Auth-Middleware + Router werden in Phase 1 ergänzt:
# from app.auth.middleware import TenantAuthMiddleware
# from app.api.v1.router import api_router
# app.add_middleware(TenantAuthMiddleware)
# app.include_router(api_router, prefix="/api/v1")
