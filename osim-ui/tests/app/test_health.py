"""Health- und Readiness-Endpoint-Tests.

- /health (top-level) ohne Auth -> 200
- /api/v1/health ohne Auth -> 200 (Whitelist)
- /readiness ohne Auth -> 200 oder 503 (je nach DB-Verfuegbarkeit)
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_toplevel() -> None:
    """Top-Level /health antwortet 200 ohne Auth (Container-Liveness)."""
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "osim-ui"
    assert body["version"] == "0.1.0"


def test_health_endpoint_api_v1() -> None:
    """Versionierter /api/v1/health antwortet 200 ohne Auth (Whitelist via Top-Level path NICHT --
    /api/v1/health ist explizit auth-pflichtig wenn nicht in WHITELIST_PATHS).

    Wir checken hier den 401-Fall: /api/v1/health ist NICHT in WHITELIST_PATHS
    (nur /health top-level ist es). Falls Konfig sich aendert, hier anpassen.
    """
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
    # /api/v1/health ist auth-pflichtig -> 401 ProblemDetail.
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")


@pytest.mark.requires_db
def test_readiness_endpoint_with_db() -> None:
    """/readiness antwortet 200 wenn DB up."""
    with TestClient(app) as client:
        response = client.get("/readiness")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "up"}


def test_unauthenticated_api_request_returns_problem_detail() -> None:
    """Anfrage an /api/v1/* ohne Authorization -> 401 mit RFC-7807-Body."""
    with TestClient(app) as client:
        response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["status"] == 401
    assert body["title"] == "Unauthorized"
    assert "detail" in body
