"""Firebase Admin SDK Initialisierung + Token-Verifikation.

3fls-1:1-Übernahme aus ``tbx_stzrim/app/auth/firebase.py``. Einzige Änderung:
``project_id`` und ``firebase_auth_emulator_host`` werden aus
``app.core.config.settings`` gelesen.

Verhalten:
    * Produktion: ``GOOGLE_APPLICATION_CREDENTIALS``-Service-Account oder ADC.
    * Emulator: ``settings.firebase_auth_emulator_host`` als ENV-Variable
      VOR ``firebase_admin.initialize_app(...)`` setzen — Pitfall #9 aus
      RESEARCH.md (nie in Prod-Deploy übernehmen!).
"""

from __future__ import annotations

import os

import firebase_admin
from firebase_admin import auth, credentials

from app.core.config import settings


def initialize_firebase() -> None:
    """Initialize Firebase Admin SDK (idempotent).

    Wenn ``settings.firebase_auth_emulator_host`` gesetzt ist (Dev-Modus),
    wird die ENV-Variable ``FIREBASE_AUTH_EMULATOR_HOST`` VOR
    ``initialize_app`` gesetzt — der SDK liest sie beim Init.
    """
    if firebase_admin._apps:
        return

    if settings.firebase_auth_emulator_host:
        # Emulator-Modus: keine Credentials nötig, nur Project-ID.
        # ENV-Variable muss vor initialize_app gesetzt sein.
        os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = (
            settings.firebase_auth_emulator_host
        )
        firebase_admin.initialize_app(
            options={"projectId": settings.firebase_project_id}
        )
    else:
        # Produktion: Application Default Credentials.
        try:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
        except Exception:
            # Fallback: ohne Credentials initialisieren (Emulator könnte
            # auch via ENV bereits gesetzt sein, ohne dass die Settings es
            # mitbekommen haben).
            firebase_admin.initialize_app(
                options={"projectId": settings.firebase_project_id}
            )


def verify_token(token: str) -> dict:
    """Verify a Firebase ID token and return the decoded claims.

    Re-raises spezifische Firebase-Exceptions für die Middleware:
        * ``auth.ExpiredIdTokenError`` — Token abgelaufen
        * ``auth.InvalidIdTokenError`` — Token malformed / invalid

    Returns:
        Decoded token dict mit User-Claims (uid, email, tenant_id, role, …).
    """
    return auth.verify_id_token(token, check_revoked=False)
