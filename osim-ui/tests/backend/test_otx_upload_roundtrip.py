"""End-to-End-Roundtrip-Test: Dummy.otx Upload -> Wire -> Save -> Get.

D-14 (Original-Unchanged-Constraint) verifizieren: Nach einem Save-back muss
``original.otx`` byte-identisch zum hochgeladenen Dummy.otx sein.

Test:
    test_dummy_otx_byte_identical_through_pipeline:
        1. Upload Dummy.otx
        2. acquire-Lock
        3. PUT /models/{id} mit dem returned Wire (unveraendert) + lock_token
        4. GET /models/{id} -> wire.coverage.loaded passt
        5. Lokale Verifikation: original_storage_key zeigt noch immer auf
           die unveraenderte Datei (Bytes == Original-Dummy.otx).
"""

from __future__ import annotations

from pathlib import Path

import pytest


pytestmark = [
    pytest.mark.integration,
    pytest.mark.requires_postgres,
    pytest.mark.requires_firebase_emulator,
    pytest.mark.requires_minio,
    pytest.mark.requires_engine,
]


@pytest.mark.asyncio
async def test_dummy_otx_byte_identical_through_pipeline(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Voller Pipeline-Test mit D-14-Verifikation.

    Original-Bytes muessen UNVERAENDERT bleiben — Save-back schreibt eine
    neue v_*.otx Version, das Original-File darf NIE veraendert werden.
    """
    _ = clean_db
    original_bytes = dummy_otx_path.read_bytes()

    # 1. Upload.
    files = {
        "file": (
            dummy_otx_path.name,
            original_bytes,
            "application/octet-stream",
        ),
    }
    upload_response = await test_client.post(
        "/api/v1/models/upload-otx",
        files=files,
        data={"name": "Dummy-Roundtrip"},
        headers=auth_headers,
    )
    assert upload_response.status_code == 200, upload_response.text
    upload_body = upload_response.json()
    model_id = upload_body["model"]["id"]
    initial_wire = upload_body["wire"]
    initial_coverage_loaded = initial_wire["coverage"]["loaded"]
    assert initial_coverage_loaded > 0

    # 2. Acquire-Lock.
    lock_response = await test_client.post(
        f"/api/v1/models/{model_id}/lock",
        headers=auth_headers,
    )
    assert lock_response.status_code == 200
    lock_token = lock_response.json()["token"]

    # 3. Save-back mit dem unveraenderten Wire.
    save_response = await test_client.put(
        f"/api/v1/models/{model_id}",
        headers=auth_headers,
        json={"wire": initial_wire, "lock_token": lock_token},
    )
    assert save_response.status_code == 200, save_response.text
    save_body = save_response.json()
    saved_version_key = save_body["saved_version_key"]
    assert saved_version_key.endswith(".otx")
    original_storage_key = save_body["model"]["original_storage_key"]
    assert original_storage_key != saved_version_key, (
        "original_storage_key MUSS sich vom saved_version_key unterscheiden."
    )

    # 4. GET nach Save -> Wire ist wieder ladbar.
    get_response = await test_client.get(
        f"/api/v1/models/{model_id}", headers=auth_headers
    )
    assert get_response.status_code == 200
    final_wire = get_response.json()["wire"]
    # Loaded-Anzahl bleibt; OID-Set deckungsgleich.
    assert final_wire["coverage"]["loaded"] == initial_coverage_loaded
    initial_oids = set(initial_wire["objects"].keys())
    final_oids = set(final_wire["objects"].keys())
    assert initial_oids == final_oids

    # 5. D-14: Original-Bytes via Storage-Service lesen.
    from app.services.storage import get_storage

    storage = get_storage()
    stored_original = storage.get_object(original_storage_key)
    assert stored_original == original_bytes, (
        "D-14 VERLETZT: original.otx wurde durch Save-back veraendert. "
        f"Expected {len(original_bytes)} bytes, got {len(stored_original)}."
    )
