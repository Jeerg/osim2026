"""Tests fuer POST /api/v1/models/upload-otx + GET /api/v1/models.

Voraussetzungen:
  - DB erreichbar (requires_db).
  - OTX-Fixture verfuegbar (dummy_otx_bytes Fixture macht skip-if-missing).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.requires_db


def test_upload_otx_creates_model_and_version(authenticated_client, dummy_otx_bytes) -> None:
    client, tenant_id, user_uid = authenticated_client

    resp = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("test.otx", dummy_otx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] >= 1
    assert body["coverage_ratio"] > 0.5  # Loader-Coverage muss vernuenftig sein
    assert isinstance(body["loaded_summary"], dict)
    assert sum(body["loaded_summary"].values()) > 0


def test_list_models_returns_uploaded_one(authenticated_client, dummy_otx_bytes) -> None:
    client, tenant_id, user_uid = authenticated_client

    # Erst eins hochladen
    up = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("mymodel.otx", dummy_otx_bytes, "application/octet-stream")},
    )
    assert up.status_code == 200
    model_id = up.json()["id"]

    # Dann listen
    resp = client.get(
        "/api/v1/models",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 200
    items = resp.json()
    assert any(item["id"] == model_id for item in items)
    # Owner-Felder vorhanden
    me = next(i for i in items if i["id"] == model_id)
    assert me["owner_uid"] == user_uid
    assert me["name"] == "mymodel"
    assert me["original_filename"] == "mymodel.otx"
    assert me["current_version_id"] is not None


def test_get_model_detail_returns_summaries_and_no_lock(
    authenticated_client, dummy_otx_bytes
) -> None:
    client, _, _ = authenticated_client
    up = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("d.otx", dummy_otx_bytes, "application/octet-stream")},
    )
    model_id = up.json()["id"]

    resp = client.get(
        f"/api/v1/models/{model_id}",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == model_id
    assert "loaded_summary" in body
    assert "unsupported_summary" in body
    assert body["lock_status"] is None  # Task-3: Lock-Status separater Test


def test_get_model_404_for_unknown_id(authenticated_client) -> None:
    client, _, _ = authenticated_client
    resp = client.get(
        "/api/v1/models/9999999",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 404


def test_upload_rejects_empty_file(authenticated_client) -> None:
    client, _, _ = authenticated_client
    resp = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("empty.otx", b"", "application/octet-stream")},
    )
    assert resp.status_code == 422


def test_upload_rejects_garbage(authenticated_client) -> None:
    client, _, _ = authenticated_client
    resp = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("junk.otx", b"not an otx file at all", "application/octet-stream")},
    )
    # Parser-Error => 422
    assert resp.status_code == 422


def test_download_original_returns_uploaded_bytes(
    authenticated_client, dummy_otx_bytes
) -> None:
    client, _, _ = authenticated_client
    up = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("orig.otx", dummy_otx_bytes, "application/octet-stream")},
    )
    model_id = up.json()["id"]

    resp = client.get(
        f"/api/v1/models/{model_id}/download-original",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert resp.status_code == 200
    assert resp.content == dummy_otx_bytes
    # Filename im Content-Disposition
    cd = resp.headers.get("content-disposition", "")
    assert "orig.otx" in cd
