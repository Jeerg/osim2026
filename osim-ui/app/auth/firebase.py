"""Firebase Admin SDK -- idempotente Initialisierung + Token-Verifikation.

Pattern aus tbx_stzrim/app/auth/firebase.py uebernommen.

- ``initialize_firebase()``: idempotent, einmal in lifespan().
- ``verify_token(token)``: Wrapper um ``firebase_admin.auth.verify_id_token``.
- ``set_user_tenant_claims(uid, tenant_id, role)``: setzt Custom Claims
  nach erfolgreichem Bootstrap, damit nachfolgende Tokens (nach Client-
  Refresh) den tenant_id-Claim mitbringen.

Emulator-Modus:
- Wenn ``FIREBASE_AUTH_EMULATOR_HOST`` gesetzt ist (siehe app.core.config,
  spiegelt das Setting in os.environ vor SDK-Init), arbeitet das SDK ohne
  Service-Account-Credentials und akzeptiert unsignierte Tokens.

Phase-1-Compromise (siehe risks-Section in 01-02-PLAN.md):
``set_custom_user_claims`` koennte mit dem Emulator-Auth-Service eingeschraenkt
funktionieren. Wir setzen die Claims best-effort; bei Failure loggen wir
eine Warnung und der Server liest tenant_id im Folge-Request via DB-Lookup
(set_user_tenant_claims raised nicht).
"""

from __future__ import annotations

import firebase_admin
import structlog
from firebase_admin import auth as fb_auth

from app.core.config import settings

logger = structlog.get_logger(__name__)


def initialize_firebase() -> None:
    """Initialisiert das Firebase Admin SDK (idempotent)."""
    if firebase_admin._apps:  # type: ignore[attr-defined]
        return

    if settings.firebase_auth_emulator_host:
        # Emulator-Modus: nur Project-ID, keine Credentials.
        firebase_admin.initialize_app(
            options={"projectId": settings.firebase_project_id}
        )
        logger.info(
            "firebase_initialized_emulator",
            project_id=settings.firebase_project_id,
            emulator_host=settings.firebase_auth_emulator_host,
        )
        return

    # Produktion: Application Default Credentials.
    try:
        cred = firebase_admin.credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
        logger.info(
            "firebase_initialized_adc",
            project_id=settings.firebase_project_id,
        )
    except Exception as exc:
        # Letzter Fallback ohne Credentials -- nuetzlich fuer Tests.
        logger.warning(
            "firebase_init_fallback_no_credentials",
            error=str(exc),
        )
        firebase_admin.initialize_app(
            options={"projectId": settings.firebase_project_id}
        )


def verify_token(token: str) -> dict:
    """Verifiziert ein Firebase-ID-Token und gibt die Claims zurueck.

    Raised die Firebase-Exceptions roh weiter -- Middleware faengt sie.
    """
    return fb_auth.verify_id_token(token, check_revoked=False)


def set_user_tenant_claims(uid: str, tenant_id: str, role: str = "owner") -> None:
    """Setzt Custom Claims auf einem Firebase-User (best-effort).

    Wird nach erfolgreichem Tenant-Bootstrap aufgerufen, damit nachfolgende
    Tokens (nach Client-seitigem ``getIdToken(forceRefresh=true)``) den
    tenant_id-Claim direkt mitbringen und der Server keinen DB-Lookup
    pro Request mehr braucht.
    """
    try:
        fb_auth.set_custom_user_claims(uid, {"tenant_id": tenant_id, "role": role})
        logger.info(
            "firebase_claims_set",
            uid=uid,
            tenant_id=tenant_id,
            role=role,
        )
    except Exception as exc:
        # Phase-1: Emulator unterstuetzt set_custom_user_claims teils
        # eingeschraenkt -> tolerieren, Backend liest tenant_id beim
        # naechsten Request aus DB.
        logger.warning(
            "firebase_claims_set_failed",
            uid=uid,
            tenant_id=tenant_id,
            error=str(exc),
        )
