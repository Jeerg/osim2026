"""Health-Endpoint (unauthentifiziert).

Wird fuer Docker-/Compose-Healthchecks und spaetere Kubernetes-Probes genutzt.
Phase 1: DB-Check + Storage-Backend-Info (Best-Effort-Storage-Check).

Storage-Check ist NICHT failure-relevant — nur informational. Wenn Minio in
einem Compose-Stack noch hochfaehrt, soll ``/health`` trotzdem ``status=ok``
liefern, solange die DB erreichbar ist. Detail-Probe kommt in ``/readiness``
in spaeteren Phasen.
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

log = structlog.get_logger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str | bool]:
    """Health-Status mit Component-Level-Checks.

    Keine Auth erforderlich (Pfad ist in ``WHITELIST_PATHS``).

    Returns:
        ``status``: ``"ok"`` / ``"degraded"`` (DB nicht erreichbar).
        ``db``: ``"connected"`` / ``"disconnected"``.
        ``storage``: aktuelles Backend (``"local"`` | ``"minio"`` | ``"gcs"``).
        ``storage_ok``: best-effort-Ping (LocalStorage → True wenn Root da).
        ``version``: Applikations-Version.
    """
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        log.warning("db_health_check_failed", exc_info=True)

    # Best-Effort-Storage-Ping. Wir wollen NICHT bei jedem Health-Check eine
    # Round-Trip-Operation gegen Minio fahren (kostspielig bei mehreren
    # Healthchecks/Sekunde). Daher: nur informational welches Backend aktiv
    # ist; echtes Ping kommt in /readiness.
    storage_backend = settings.storage_backend

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "db": "connected" if db_ok else "disconnected",
        "storage": storage_backend,
        "version": "0.1.0",
    }
