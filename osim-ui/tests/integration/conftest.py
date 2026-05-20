"""Fixtures fuer Integration-Tests.

Erweitert das Top-Level-conftest um:
  - ``client_for_user(uid, email)``-Helper: Liefert authentifizierten
    TestClient + tenant_id fuer eine beliebige Fake-Firebase-Identity.
    Damit lassen sich Tenant-Isolation- und Multi-User-Szenarien testen.
  - ``large_otx_bytes``-Fixture: laedt Bosch2_wechseln.otx (18 MB) wenn
    verfuegbar (Skip andernfalls).
  - ``fertigung_otx_bytes``-Fixture: laedt Fertigungsstruktur1_mit_AslFj.otx.

Vermeidet Konflikte mit der ``authenticated_client``-Fixture aus dem
Top-conftest (die immer denselben Fake-User benutzt).
"""

from __future__ import annotations

import os
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any
from unittest.mock import patch

import pytest

from tests.conftest import _find_otx_fixture  # type: ignore[import-untyped]

# -----------------------------------------------------------------------
# Multi-User-Helper: client_for_user
# -----------------------------------------------------------------------


@pytest.fixture
def client_for_user(db_engine):  # noqa: ARG001 -- db_engine bereitet DB vor
    """Liefert eine Factory ``make(uid, email) -> (client, tenant_id, uid)``.

    Jeder Call legt einen separaten Tenant an (lazy Bootstrap via /auth/me)
    und liefert einen TestClient zurueck, dessen Auth-Token diesen Tenant
    benutzt. Cleanup beim Yield-Ende.
    """
    from fastapi.testclient import TestClient

    from app.main import app

    patches: list[Any] = []
    clients: list[TestClient] = []

    @contextmanager
    def _make(uid: str, email: str) -> Generator[tuple[Any, str, str]]:
        # Schritt 1: Bootstrap via /auth/me ohne tenant_id-Claim.
        p_boot = patch(
            "app.auth.middleware.verify_token",
            return_value={"uid": uid, "user_id": uid, "email": email},
        )
        p_claims = patch(
            "app.api.v1.auth.set_user_tenant_claims", return_value=None
        )
        p_boot.start()
        p_claims.start()
        client = TestClient(app)
        try:
            r = client.post(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer fake-token"},
            )
            assert r.status_code == 200, r.text
            tenant_id = r.json()["tenant_id"]
        finally:
            p_boot.stop()
            p_claims.stop()

        # Schritt 2: Folge-Requests bekommen tenant_id mitgeschickt.
        p_user = patch(
            "app.auth.middleware.verify_token",
            return_value={
                "uid": uid,
                "user_id": uid,
                "email": email,
                "tenant_id": tenant_id,
                "role": "owner",
            },
        )
        p_user.start()
        patches.append(p_user)
        clients.append(client)
        try:
            yield client, tenant_id, uid
        finally:
            # Patch wird im Outer-Cleanup gestoppt.
            pass

    yield _make

    # Cleanup nach Test
    for p in patches:
        try:
            p.stop()
        except Exception:
            pass
    for c in clients:
        try:
            c.close()
        except Exception:
            pass


# -----------------------------------------------------------------------
# Optionale OTX-Fixtures fuer groesste / Realismus-Modelle
# -----------------------------------------------------------------------


@pytest.fixture(scope="session")
def fertigung_otx_bytes() -> bytes:
    """Mittel-grosses Real-World-Modell (272 KB).

    Skip wenn nicht erreichbar (CI ohne OSim2004-Mount).
    """
    p = _find_otx_fixture("Fertigungsstruktur1_mit_AslFj.otx")
    if p is None:
        pytest.skip("Fertigungsstruktur1_mit_AslFj.otx nicht verfuegbar")
    with open(p, "rb") as f:
        return f.read()


@pytest.fixture(scope="session")
def large_otx_bytes() -> bytes:
    """Grosses Real-World-Modell fuer Performance-Smoke (18 MB).

    Skip wenn nicht erreichbar oder explizit ausgeschaltet via
    ``OSIM_SKIP_LARGE_TESTS=1``.
    """
    if os.environ.get("OSIM_SKIP_LARGE_TESTS") == "1":
        pytest.skip("OSIM_SKIP_LARGE_TESTS=1 gesetzt")
    p = _find_otx_fixture("Bosch2_wechseln.otx")
    if p is None:
        pytest.skip("Bosch2_wechseln.otx nicht verfuegbar")
    with open(p, "rb") as f:
        return f.read()


@pytest.fixture(scope="session")
def dummy_otx_path() -> str:
    """Pfad zur Dummy.otx -- fuer Tests, die explizit den Filename brauchen."""
    p = _find_otx_fixture("Dummy.otx") or _find_otx_fixture("embb_pre_run.otx")
    if p is None:
        pytest.skip("Weder Dummy.otx noch embb_pre_run.otx verfuegbar")
    return p
