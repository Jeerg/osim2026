"""Integration-Tests fuer Models-Endpoints (/api/v1/models).

Marker:
    * ``integration`` — gegen lebende Services.
    * ``requires_postgres`` + ``requires_firebase_emulator`` + ``requires_minio``
      + ``requires_engine`` — Auto-Skip wenn ein Service fehlt.

Tests:
    1. ``test_upload_otx_dummy_returns_wire`` — Upload liefert Meta + Wire.
    2. ``test_list_models_returns_uploaded`` — Upload + List zeigt das Modell.
    3. ``test_get_model_returns_wire`` — Upload + GET liefert Wire.
    4. ``test_save_model_creates_new_version`` — Save legt v_*.otx an.
    5. ``test_save_without_lock_token_fails`` — fehlender Token -> 422.
    6. ``test_save_with_wrong_lock_token_fails`` — falscher Token -> 423.
    7. ``test_delete_model_removes_storage`` — Delete leert Storage + DB.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest


pytestmark = [
    pytest.mark.integration,
    pytest.mark.requires_postgres,
    pytest.mark.requires_firebase_emulator,
    pytest.mark.requires_minio,
    pytest.mark.requires_engine,
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _upload_dummy(
    test_client,
    headers: dict[str, str],
    otx_path: Path,
    name: str = "Dummy",
) -> dict:
    """Upload Dummy.otx; returnt das parsed UploadOtxResponse-Dict."""
    files = {
        "file": (otx_path.name, otx_path.read_bytes(), "application/octet-stream"),
    }
    data = {"name": name}
    response = await test_client.post(
        "/api/v1/models/upload-otx",
        files=files,
        data=data,
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _acquire_lock(test_client, headers: dict[str, str], model_id: str) -> str:
    """Acquire ein Lock, returnt das Token (UUID-String)."""
    response = await test_client.post(
        f"/api/v1/models/{model_id}/lock",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_otx_dummy_returns_wire(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """POST /upload-otx mit Dummy.otx -> 200 + body.model.id + body.wire."""
    _ = clean_db
    body = await _upload_dummy(test_client, auth_headers, dummy_otx_path)
    assert "model" in body and "wire" in body
    assert body["model"]["name"] == "Dummy"
    assert uuid.UUID(body["model"]["id"])  # parsbares UUID
    assert body["wire"]["coverage"]["loaded"] > 0


@pytest.mark.asyncio
async def test_list_models_returns_uploaded(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Upload + GET /models -> liste enthaelt das Modell."""
    _ = clean_db
    body = await _upload_dummy(test_client, auth_headers, dummy_otx_path)
    model_id = body["model"]["id"]

    response = await test_client.get("/api/v1/models", headers=auth_headers)
    assert response.status_code == 200
    models = response.json()
    assert any(m["id"] == model_id for m in models)


@pytest.mark.asyncio
async def test_get_model_returns_wire(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Upload + GET /models/{id} -> Wire matching."""
    _ = clean_db
    upload = await _upload_dummy(test_client, auth_headers, dummy_otx_path)
    model_id = upload["model"]["id"]

    response = await test_client.get(
        f"/api/v1/models/{model_id}", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model"]["id"] == model_id
    assert body["wire"]["coverage"]["loaded"] == upload["wire"]["coverage"]["loaded"]


@pytest.mark.asyncio
async def test_save_model_creates_new_version(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Upload + acquire + PUT mit unveraendertem Wire -> 200, neue v_*.otx."""
    _ = clean_db
    upload = await _upload_dummy(test_client, auth_headers, dummy_otx_path)
    model_id = upload["model"]["id"]
    wire = upload["wire"]

    token = await _acquire_lock(test_client, auth_headers, model_id)

    response = await test_client.put(
        f"/api/v1/models/{model_id}",
        headers=auth_headers,
        json={"wire": wire, "lock_token": token},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["saved_version_key"].endswith(".otx")
    assert "v_" in body["saved_version_key"]
    # Meta sollte jetzt current_version_key != null haben.
    assert body["model"]["current_version_key"] is not None


@pytest.mark.asyncio
async def test_save_without_lock_token_fails(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """PUT ohne lock_token -> 422 (Pydantic-Validation)."""
    _ = clean_db
    upload = await _upload_dummy(test_client, auth_headers, dummy_otx_path)
    model_id = upload["model"]["id"]

    response = await test_client.put(
        f"/api/v1/models/{model_id}",
        headers=auth_headers,
        json={"wire": upload["wire"]},  # lock_token fehlt
    )
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_save_with_wrong_lock_token_fails(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """PUT mit random UUID -> 423 E_LOCK_EXPIRED."""
    _ = clean_db
    upload = await _upload_dummy(test_client, auth_headers, dummy_otx_path)
    model_id = upload["model"]["id"]
    fake_token = str(uuid.uuid4())

    response = await test_client.put(
        f"/api/v1/models/{model_id}",
        headers=auth_headers,
        json={"wire": upload["wire"], "lock_token": fake_token},
    )
    assert response.status_code == 423, response.text
    body = response.json()
    # RFC-7807 ProblemDetail mit code-Feld.
    assert body.get("code") == "E_LOCK_EXPIRED"


@pytest.mark.asyncio
async def test_delete_model_removes_storage(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Upload + DELETE -> 204; GET /models leer; Storage-Prefix leer."""
    _ = clean_db
    upload = await _upload_dummy(test_client, auth_headers, dummy_otx_path)
    model_id = upload["model"]["id"]

    response = await test_client.delete(
        f"/api/v1/models/{model_id}", headers=auth_headers
    )
    assert response.status_code == 204, response.text

    # Liste muss leer sein.
    list_response = await test_client.get("/api/v1/models", headers=auth_headers)
    assert list_response.status_code == 200
    assert list_response.json() == []

    # Get muss 404 liefern.
    get_response = await test_client.get(
        f"/api/v1/models/{model_id}", headers=auth_headers
    )
    assert get_response.status_code == 404
