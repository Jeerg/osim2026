"""Integration-Tests fuer /health-Endpoint.

Marker: ``integration`` + ``requires_postgres`` (Health prueft DB).

Tests:
    * ``test_health_returns_storage_backend`` — body.storage in
      {"local","minio","gcs"}.
    * ``test_health_returns_db_connected_when_postgres_live`` — body.db ==
      "connected".
"""

from __future__ import annotations

import pytest


pytestmark = [
    pytest.mark.integration,
    pytest.mark.requires_postgres,
]


@pytest.mark.asyncio
async def test_health_returns_storage_backend(test_client) -> None:
    """/health antwortet mit Storage-Feld."""
    response = await test_client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert "storage" in body
    assert body["storage"] in {"local", "minio", "gcs"}


@pytest.mark.asyncio
async def test_health_returns_db_connected_when_postgres_live(test_client) -> None:
    """/health antwortet mit db=connected wenn Postgres lebt."""
    response = await test_client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["db"] == "connected"
    assert body["status"] in {"ok", "degraded"}
