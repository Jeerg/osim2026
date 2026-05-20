"""API-v1-Router-Aggregator.

Spaetere Plans ergaenzen hier weitere Router (models, runs, viewer, ...).
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
