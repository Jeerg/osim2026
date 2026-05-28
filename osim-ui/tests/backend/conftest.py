"""Shared test fixtures + Auto-Skip-Hook fuer Phase-1-Backend-Tests.

Inhalt:
    * ``pytest_collection_modifyitems``-Hook — handhabt vier Marker-Familien:
        - ``requires_engine`` -> skip wenn ``osim_engine`` nicht importierbar.
        - ``requires_postgres`` -> skip wenn :5432 tot.
        - ``requires_firebase_emulator`` -> skip wenn :9099 tot.
        - ``requires_minio`` -> skip wenn :9000 tot.
    * Drei OTX-Path-Fixtures: ``dummy_otx_path``,
      ``fertigungsstruktur1_otx_path``, ``bosch2_otx_path``.
    * ``test_client``: ``httpx.AsyncClient`` via ``ASGITransport`` ueber die
      FastAPI-App — kein echtes Network, aber laufender Postgres-Stack
      vorausgesetzt.
    * ``admin_token`` / ``user_token``: holen ID-Tokens vom Firebase-Auth-
      Emulator (signInWithPassword); brauchen lebenden Emulator + seed-User.
    * ``auth_headers``: liefert ``{"Authorization": "Bearer <admin_token>"}``.
    * ``clean_db``: TRUNCATE ``public.tenants``/``public.users`` + DROP aller
      ``tenant_%``-Schemas vor jedem Test.

Die Fixtures sind so geschrieben, dass die Tests gegen lebende Services
laufen, aber bei fehlendem Service deutlich ``skipped`` reporten (statt zu
fehlen). Marker-Auto-Skip in ``pytest_collection_modifyitems`` schaltet
das in einem zentralen Hook.
"""

from __future__ import annotations

import os
import socket
from pathlib import Path

import httpx
import pytest

from tests.backend.fixtures.otx_models import (
    BOSCH2_WECHSELN_OTX,
    DUMMY_OTX,
    FERTIGUNGSSTRUKTUR1_OTX,
    engine_available,
    require_otx,
)


# ---------------------------------------------------------------------------
# Konstanten / Service-Probes
# ---------------------------------------------------------------------------

# Firebase Auth Emulator akzeptiert jeden beliebigen API-Key — wir nutzen einen
# Demo-Key fuer alle Token-Requests. KEINE Production-Credentials.
_TEST_FIREBASE_API_KEY = "demo-api-key-for-emulator"

_SKIP_REASON_NO_ENGINE = (
    "osim_engine ist nicht importierbar — uv sync ausfuehren"
)
_SKIP_REASON_NO_POSTGRES = (
    "Postgres @ localhost:5432 nicht erreichbar — docker compose up -d postgres"
)
_SKIP_REASON_NO_FIREBASE = (
    "Firebase Auth Emulator @ localhost:19099 nicht erreichbar — "
    "docker compose up -d firebase-emulator"
)
_SKIP_REASON_NO_MINIO = (
    "Minio @ localhost:9000 nicht erreichbar — docker compose up -d minio"
)


def _tcp_alive(host: str, port: int, timeout: float = 1.5) -> bool:
    """TCP-Connect-Probe: liefert True wenn (host, port) Verbindungen annimmt.

    Wird vom ``pytest_collection_modifyitems``-Hook und vom Fixture-Setup
    benutzt, um zu pruefen, ob ein Service erreichbar ist. Macht KEIN
    Application-Level-Ping — TCP-Open reicht als Liveness-Signal.
    """
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, socket.timeout):
        return False


def _emulator_host() -> str:
    """``FIREBASE_AUTH_EMULATOR_HOST`` mit Fallback auf localhost:19099.

    Host-Port 19099 (statt 9099) wegen Kollision mit tbx_stzrim-Emulator.
    """
    return os.environ.get("FIREBASE_AUTH_EMULATOR_HOST", "localhost:19099")


def _emulator_host_port() -> tuple[str, int]:
    """Parse host:port aus ``_emulator_host()`` für ``_tcp_alive``-Probes."""
    raw = _emulator_host()
    host, _, port = raw.partition(":")
    return host or "localhost", int(port) if port else 19099


def _emulator_token(email: str, password: str) -> str:
    """Hole ein Firebase-ID-Token vom Auth-Emulator (signInWithPassword).

    Args:
        email: Email-Adresse eines vom Seed-Skript angelegten Users.
        password: Passwort aus dem Seed-Skript (admin123 / user123).

    Returns:
        ``idToken``-String, der als ``Authorization: Bearer <token>`` im
        Backend verifiziert werden kann (siehe ``app/auth/firebase.py``).

    Raises:
        ``httpx.HTTPError`` wenn der Emulator nicht antwortet oder die
        Credentials falsch sind (4xx).
    """
    host = _emulator_host()
    url = (
        f"http://{host}/identitytoolkit.googleapis.com/v1/"
        f"accounts:signInWithPassword?key={_TEST_FIREBASE_API_KEY}"
    )
    resp = httpx.post(
        url,
        json={
            "email": email,
            "password": password,
            "returnSecureToken": True,
        },
        timeout=5.0,
    )
    resp.raise_for_status()
    return resp.json()["idToken"]


_SKIP_REASON_NO_SEED = (
    "Firebase-Test-User existiert nicht — "
    "`uv run python scripts/seed_firebase_emulator.py` ausfuehren"
)


def _emulator_token_or_skip(email: str, password: str) -> str:
    """Wie ``_emulator_token`` aber skipped den Test mit klarem Hinweis,
    wenn der Emulator zwar lebt aber der Test-User noch nicht geseedet ist.

    Diese Variante ist fuer Fixtures gedacht — sie wandelt 400 (User
    unbekannt) in ein pytest.skip um, statt einen harten Fehler zu werfen.
    Andere Fehler (Connection-Refused, 5xx) propagieren weiterhin.
    """
    try:
        return _emulator_token(email, password)
    except httpx.HTTPStatusError as exc:
        # 4xx = wahrscheinlich User noch nicht angelegt
        if 400 <= exc.response.status_code < 500:
            pytest.skip(_SKIP_REASON_NO_SEED)
        raise


# ---------------------------------------------------------------------------
# Marker-Auto-Skip
# ---------------------------------------------------------------------------


def pytest_collection_modifyitems(config, items):  # noqa: ARG001
    """Auto-Skip fuer alle vier ``requires_*``-Marker-Familien.

    Probiert die Service-Liveness EINMAL pro Pytest-Lauf (caches im
    Closure-Capture) und haengt ein ``pytest.mark.skip`` an betroffene Items.

    Reihenfolge der Probes ist optimiert fuer "haeufig fehlend zuerst":
        engine > postgres > firebase > minio.
    """
    engine_ok = engine_available()
    postgres_ok = _tcp_alive("localhost", 5432)
    firebase_ok = _tcp_alive(*_emulator_host_port())
    minio_ok = _tcp_alive("localhost", 9000)

    skip_engine = pytest.mark.skip(reason=_SKIP_REASON_NO_ENGINE)
    skip_postgres = pytest.mark.skip(reason=_SKIP_REASON_NO_POSTGRES)
    skip_firebase = pytest.mark.skip(reason=_SKIP_REASON_NO_FIREBASE)
    skip_minio = pytest.mark.skip(reason=_SKIP_REASON_NO_MINIO)

    for item in items:
        if not engine_ok and item.get_closest_marker("requires_engine"):
            item.add_marker(skip_engine)
        if not postgres_ok and item.get_closest_marker("requires_postgres"):
            item.add_marker(skip_postgres)
        if not firebase_ok and item.get_closest_marker("requires_firebase_emulator"):
            item.add_marker(skip_firebase)
        if not minio_ok and item.get_closest_marker("requires_minio"):
            item.add_marker(skip_minio)


# ---------------------------------------------------------------------------
# OTX-Path-Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def dummy_otx_path() -> Path:
    """Pfad zu ``Vorstellung04/Dummy.otx`` — skip wenn fehlt."""
    return require_otx(DUMMY_OTX)


@pytest.fixture
def fertigungsstruktur1_otx_path() -> Path:
    """Pfad zu ``Vorstellung04/Fertigungsstruktur1_mit_AslFj.otx`` — skip wenn fehlt."""
    return require_otx(FERTIGUNGSSTRUKTUR1_OTX)


@pytest.fixture
def bosch2_otx_path() -> Path:
    """Pfad zu ``Vorstellung04/Bosch2_wechseln.otx`` — skip wenn fehlt."""
    return require_otx(BOSCH2_WECHSELN_OTX)


@pytest.fixture
def embb_pre_run_otx_path() -> Path:
    """Pfad zum Engine-Fixture ``embb_pre_run.otx`` (Belegung + Link-Status).

    Liegt im osim-engine-Repo (immer im Repo, enthält PAssozBeleg +
    PAssozBelegLinkStatusList/-LinkInfo) — Quelle für die P3-Persistenz-Tests
    des Belegungs-Status. Skip, wenn der Engine-Workspace nicht erreichbar ist.
    """
    candidate = Path(
        r"C:\Users\JörgWFischer\PycharmProjects\osim-engine"
        r"\engine\tests\fixtures\otx\embb_pre_run.otx"
    )
    return require_otx(candidate)


# ---------------------------------------------------------------------------
# HTTPX-Async-Test-Client (ASGI direkt, kein echtes Network)
# ---------------------------------------------------------------------------


@pytest.fixture
async def test_client():
    """Async-HTTP-Client gegen die FastAPI-App (ASGITransport).

    Yields:
        ``httpx.AsyncClient`` mit base_url=http://test. Macht KEIN echtes
        Network — Requests werden ueber ``ASGITransport`` direkt in die
        App-Pipeline geroutet. Trotzdem laufen die Middlewares + Endpoints
        + DB-Zugriffe wie in echt (Auth-Middleware verifiziert
        Tokens gegen den Firebase-Emulator, DB-Connections gehen an
        Postgres).
    """
    # Lazy-Import, damit Tests, die nur Helper-Existenz prüfen, NICHT die
    # ganze App laden müssen (App-Import triggert Firebase-Init + DB-Engine).
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ---------------------------------------------------------------------------
# Token-Fixtures (gegen lebenden Firebase-Emulator)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def admin_token() -> str:
    """ID-Token fuer ``admin@osim-dev``.

    Erfordert: docker compose up -d firebase-emulator UND
    `uv run python scripts/seed_firebase_emulator.py` vorher gelaufen.
    Skipped bei fehlendem Emulator oder fehlendem Seed.
    """
    if not _tcp_alive(*_emulator_host_port()):
        pytest.skip(_SKIP_REASON_NO_FIREBASE)
    return _emulator_token_or_skip("admin@osim-dev", "admin123")


@pytest.fixture(scope="session")
def user_token() -> str:
    """ID-Token fuer ``user@osim-dev``."""
    if not _tcp_alive(*_emulator_host_port()):
        pytest.skip(_SKIP_REASON_NO_FIREBASE)
    return _emulator_token_or_skip("user@osim-dev", "user123")


@pytest.fixture
def auth_headers(admin_token: str) -> dict[str, str]:
    """Convenience-Helper: ``{"Authorization": "Bearer <admin_token>"}``."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def user_auth_headers(user_token: str) -> dict[str, str]:
    """Convenience-Helper fuer den ``user``-User."""
    return {"Authorization": f"Bearer {user_token}"}


# ---------------------------------------------------------------------------
# DB-Reset (clean_db) — fuer Integration-Tests
# ---------------------------------------------------------------------------


@pytest.fixture
def clean_db():
    """TRUNCATE ``public.tenants``/``public.users`` + DROP aller ``tenant_%``-Schemas.

    Wird VOR jedem Test ausgefuehrt, der den Marker ``requires_postgres`` hat
    UND clean_db als Fixture anfordert. Yield-Body ist leer — Setup ist die
    eigentliche Arbeit.
    """
    from sqlalchemy import text

    from app.core.database import engine

    if not _tcp_alive("localhost", 5432):
        pytest.skip(_SKIP_REASON_NO_POSTGRES)

    with engine.begin() as conn:
        # 1. tenant_<uid>-Schemas droppen. CASCADE entfernt die Tabellen drin.
        schema_rows = conn.execute(
            text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name LIKE 'tenant_%'"
            )
        ).fetchall()
        for (schema_name,) in schema_rows:
            conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))

        # 2. public.users + public.tenants leeren (CASCADE wegen FK).
        # Fail-soft: wenn die Tabellen noch nicht migriert sind (alembic
        # upgrade head nicht gelaufen), ignorieren wir den Fehler — der
        # Test, der clean_db braucht, scheitert dann ohnehin am Backend.
        try:
            conn.execute(
                text(
                    "TRUNCATE public.users, public.tenants "
                    "RESTART IDENTITY CASCADE"
                )
            )
        except Exception:  # noqa: BLE001
            # Tabellen existieren noch nicht — Test wird selber merken.
            pass

    yield
    # Teardown: bewusst kein nochmaliges Cleanup (next test ruft setup).
