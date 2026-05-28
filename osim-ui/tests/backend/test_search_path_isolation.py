"""Integration-Test fuer Cross-Tenant-Isolation via search_path.

RESEARCH.md §Common Pitfalls #1 — die ``TenantAuthMiddleware`` + ``get_db``-
Dependency setzen ``search_path TO "tenant_<uid>", public`` pro Request.
Das stellt sicher, dass User-A die Daten von User-B NICHT sehen kann, auch
wenn beide dieselbe Connection-Pool-Connection teilen.

Test-Szenario:
    1. Admin loggt sich ein (Lazy-Bootstrap legt tenant_<admin_uid> an).
    2. User loggt sich ein (Lazy-Bootstrap legt tenant_<user_uid> an).
    3. Admin uploaded Dummy.otx.
    4. User uploaded Dummy.otx (gleicher Filename, eigener Tenant).
    5. Admin GET /models -> sieht NUR Admin-Modell.
    6. User GET /models -> sieht NUR User-Modell.
    7. Admin GET /models/<user_model_id> -> 404 (kein Cross-Leak).
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


async def _upload_dummy(test_client, token: str, otx_path: Path, name: str) -> dict:
    """Helper: Upload Dummy.otx mit Bearer-Token, returnt UploadOtxResponse."""
    files = {
        "file": (otx_path.name, otx_path.read_bytes(), "application/octet-stream"),
    }
    data = {"name": name}
    response = await test_client.post(
        "/api/v1/models/upload-otx",
        files=files,
        data=data,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_cross_tenant_isolation_no_leak(
    test_client,
    clean_db,
    admin_token: str,
    user_token: str,
    dummy_otx_path: Path,
) -> None:
    """Admin und User upload je ein Modell — kein Cross-Visibility.

    Bootstrap-Trigger: erster Call jedes Tokens an /api/v1/auth/me bootstrapt
    das Tenant-Schema. Wir machen das explizit, damit die Tenant-Anlage VOR
    dem Upload passiert ist.
    """
    _ = clean_db

    # 1. Bootstrap fuer beide Tenants.
    admin_hdrs = {"Authorization": f"Bearer {admin_token}"}
    user_hdrs = {"Authorization": f"Bearer {user_token}"}

    admin_me = await test_client.get("/api/v1/auth/me", headers=admin_hdrs)
    assert admin_me.status_code == 200
    user_me = await test_client.get("/api/v1/auth/me", headers=user_hdrs)
    assert user_me.status_code == 200
    admin_tenant = admin_me.json()["tenant_id"]
    user_tenant = user_me.json()["tenant_id"]
    assert admin_tenant != user_tenant, (
        "Admin und User MUESSEN unterschiedliche Tenants haben."
    )

    # 2. Beide laden je ein Dummy.otx hoch.
    admin_upload = await _upload_dummy(
        test_client, admin_token, dummy_otx_path, name="Admin-Modell"
    )
    user_upload = await _upload_dummy(
        test_client, user_token, dummy_otx_path, name="User-Modell"
    )
    admin_model_id = admin_upload["model"]["id"]
    user_model_id = user_upload["model"]["id"]

    # 3. Admin GET /models -> sieht NUR sein Modell.
    admin_list = await test_client.get("/api/v1/models", headers=admin_hdrs)
    assert admin_list.status_code == 200
    admin_models = admin_list.json()
    admin_model_ids = {m["id"] for m in admin_models}
    assert admin_model_id in admin_model_ids
    assert user_model_id not in admin_model_ids, (
        f"LEAK: Admin sieht User-Modell {user_model_id}."
    )
    # Strikter: GENAU ein Modell (clean_db hat geleert).
    assert len(admin_models) == 1

    # 4. User GET /models -> sieht NUR sein Modell.
    user_list = await test_client.get("/api/v1/models", headers=user_hdrs)
    assert user_list.status_code == 200
    user_models = user_list.json()
    user_model_ids = {m["id"] for m in user_models}
    assert user_model_id in user_model_ids
    assert admin_model_id not in user_model_ids, (
        f"LEAK: User sieht Admin-Modell {admin_model_id}."
    )
    assert len(user_models) == 1

    # 5. Admin GET /models/{user_model_id} -> 404 (Tabelle im falschen
    # Tenant-Schema nicht erreichbar; alternativ 403 wenn Service explizit
    # checked. Beides ist akzeptabel — Hauptsache nicht 200 mit Daten).
    cross_get = await test_client.get(
        f"/api/v1/models/{user_model_id}", headers=admin_hdrs
    )
    assert cross_get.status_code in (404, 403), (
        f"Cross-Tenant-Zugriff lieferte {cross_get.status_code} — erwartet 404/403."
    )
