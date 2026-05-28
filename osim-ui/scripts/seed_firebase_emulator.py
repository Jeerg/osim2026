"""Seed-Skript fuer den lokalen Firebase Auth-Emulator.

Legt Test-User in dem Emulator unter ``FIREBASE_AUTH_EMULATOR_HOST``
(Default: ``localhost:9099``) an:

    * ``jwfischer69@gmail.com``  Passwort ``123456``  Custom-Claim ``role=admin``   (Default-Owner)
    * ``admin@osim-dev``         Passwort ``admin123`` Custom-Claim ``role=admin``
    * ``user@osim-dev``          Passwort ``user123``  Custom-Claim ``role=user``

Idempotent — wenn ein User schon existiert, wird er nur noch mit den Claims
versorgt, NICHT neu angelegt.

Usage:
    uv run python scripts/seed_firebase_emulator.py

Hinweis zum Projekt-Routing:
    Der Firebase Auth Emulator ist multi-projektfaehig, aber die REST-Endpoints
    (signUp / signInWithPassword) routen alle Calls zum **default-Projekt**
    des Emulators (= ``--project``-Argument beim Start). Daher MUSS der
    Emulator beim Start mit ``--project osim-dev`` aufgesetzt sein (siehe
    ``docker-compose.yml`` und ``infra/firebase/.firebaserc``).

    Wenn ein anderes Default-Projekt (z. B. ``rim-dev`` aus dem 3fls-Stack)
    auf :9099 laeuft, scheitert das spaetere signInWithPassword mit
    EMAIL_NOT_FOUND. In dem Fall: docker compose down -> eigenen Emulator
    starten.

Sicherheit:
    Das Skript lehnt einen Lauf gegen Production ab (T-05-02 im Threat-Register).
"""

from __future__ import annotations

import os
import sys

import httpx


PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "osim-dev")
EMULATOR_HOST = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST", "localhost:19099")
# Demo-API-Key: der Emulator akzeptiert beliebige Keys, der String wird nur
# fuer das URL-Argument geliefert.
DEMO_API_KEY = "demo-api-key-for-emulator"

# Die zu seedenden User. Test-Credentials sind public-by-design (Emulator-only).
SEED_USERS: list[dict[str, str]] = [
    {"email": "jwfischer69@gmail.com", "password": "123456", "role": "admin"},
    {"email": "admin@osim-dev", "password": "admin123", "role": "admin"},
    {"email": "user@osim-dev", "password": "user123", "role": "user"},
]


def _require_emulator() -> None:
    """Verifiziert dass wir gegen den Emulator (und nicht Production) seeden."""
    if not EMULATOR_HOST:
        print(
            "FEHLER: FIREBASE_AUTH_EMULATOR_HOST ist nicht gesetzt. "
            "Dieses Skript ist NUR fuer den Emulator gedacht "
            "(T-05-02).",
            file=sys.stderr,
        )
        sys.exit(2)
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = EMULATOR_HOST


def _signup_via_rest(email: str, password: str) -> str:
    """Idempotent: REST-signUp im Default-Projekt des Emulators.

    Returns:
        ``localId`` (UID) des Users.

    Wenn der User schon existiert (EMAIL_EXISTS), suchen wir ihn via
    accounts:lookup und liefern dessen UID.
    """
    base = f"http://{EMULATOR_HOST}/identitytoolkit.googleapis.com/v1"
    signup_url = f"{base}/accounts:signUp?key={DEMO_API_KEY}"

    resp = httpx.post(
        signup_url,
        json={
            "email": email,
            "password": password,
            "returnSecureToken": True,
        },
        timeout=5.0,
    )
    if resp.status_code == 200:
        return resp.json()["localId"]

    # Bei EMAIL_EXISTS: signIn -> hole localId aus der Response.
    body = resp.json()
    err_msg = body.get("error", {}).get("message", "")
    if "EMAIL_EXISTS" in err_msg:
        signin_url = f"{base}/accounts:signInWithPassword?key={DEMO_API_KEY}"
        signin = httpx.post(
            signin_url,
            json={
                "email": email,
                "password": password,
                "returnSecureToken": True,
            },
            timeout=5.0,
        )
        signin.raise_for_status()
        return signin.json()["localId"]

    # Anderer Fehler -> weitergeben.
    resp.raise_for_status()
    raise RuntimeError(f"Unexpected response: {resp.text}")  # pragma: no cover


def _detect_emulator_project() -> str:
    """Bestimme das Default-Projekt des laufenden Emulators ueber einen
    Probe-signUp.

    Hintergrund: der Auth-Emulator kann mit mehreren Projekten hantieren;
    die REST-Endpoints routen aber alle zum default-Project. Wir machen einen
    Probe-signUp und lesen das ``aud``-Claim aus dem zurueckgelieferten Token
    (das nennt das tatsaechliche Projekt).

    Returns:
        Projekt-ID (z. B. ``"osim-dev"`` oder ``"rim-dev"``).
    """
    import base64
    import json
    import secrets

    probe_email = f"probe-{secrets.token_hex(4)}@osim-dev"
    base = f"http://{EMULATOR_HOST}/identitytoolkit.googleapis.com/v1"
    resp = httpx.post(
        f"{base}/accounts:signUp?key={DEMO_API_KEY}",
        json={
            "email": probe_email,
            "password": "probe123456",
            "returnSecureToken": True,
        },
        timeout=5.0,
    )
    resp.raise_for_status()
    token = resp.json()["idToken"]
    # JWT-Payload dekodieren (Header.Payload.Signature, base64url).
    payload_b64 = token.split(".")[1]
    # Padding ergaenzen.
    payload_b64 += "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    return payload["aud"]


def _set_claims_via_admin_sdk(target_project: str, uid: str, role: str) -> None:
    """Setze Custom-Claims im Ziel-Projekt via firebase_admin Admin SDK."""
    import firebase_admin
    from firebase_admin import auth, initialize_app

    # Nur einmal pro Lauf initialisieren.
    if not firebase_admin._apps:
        initialize_app(options={"projectId": target_project})
    auth.set_custom_user_claims(uid, {"role": role})


def main() -> int:
    _require_emulator()
    print(
        f"Seede Firebase-Emulator @ {EMULATOR_HOST} "
        f"(angefragtes Projekt={PROJECT_ID}) ..."
    )

    # Erkenne, welches Projekt der Emulator wirklich als Default fuehrt.
    actual_project = _detect_emulator_project()
    if actual_project != PROJECT_ID:
        print(
            f"  WARNUNG: Emulator-Default-Projekt ist '{actual_project}', "
            f"nicht '{PROJECT_ID}'. Seed laeuft trotzdem in '{actual_project}', "
            f"damit signInWithPassword spaeter klappt.",
            file=sys.stderr,
        )

    for spec in SEED_USERS:
        uid = _signup_via_rest(spec["email"], spec["password"])
        print(f"  User {spec['email']} bereit (uid={uid}).")
        _set_claims_via_admin_sdk(actual_project, uid, spec["role"])
        print(f"    -> Custom-Claim role={spec['role']} (in Projekt {actual_project})")

    print(
        f"Fertig. {len(SEED_USERS)} Test-User bereit in Projekt '{actual_project}'."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
