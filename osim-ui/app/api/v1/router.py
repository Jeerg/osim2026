"""API-v1-Router-Aggregator.

Phase 1: Auth + Models + Locks. Sim-Lauf-/Trace-Router kommen in Phase 2+.

Der Health-Endpoint wird NICHT hier eingebunden — er haengt direkt an der
App in ``main.py`` (3fls-Konvention: ``/health`` bleibt absolut, nicht
unter ``/api/v1/``).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.locks import router as locks_router
from app.api.v1.models import router as models_router
from app.api.v1.schemas import router as schemas_router
from app.auth.router import router as auth_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(models_router, prefix="/models")
# Lock-Router enthaelt Pfade unter ``/models/{id}/lock`` — Pfad bereits
# komplett im Router-Decorator. Kein zusaetzlicher Prefix.
api_router.include_router(locks_router)
# Schemas-Router liefert /api/v1/schemas/v1 — Pfad ist bereits komplett im
# Router-Decorator, kein zusaetzlicher Prefix.
api_router.include_router(schemas_router)
