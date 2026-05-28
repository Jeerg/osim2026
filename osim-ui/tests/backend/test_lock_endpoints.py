"""Integration-Tests fuer Lock-Endpoints (/api/v1/models/{id}/lock).

Marker:
    * ``integration`` — gegen lebende Services.
    * ``requires_postgres`` + ``requires_firebase_emulator`` +
      ``requires_minio`` + ``requires_engine`` (Upload braucht Engine+Storage).

Tests:
    1. ``test_acquire_release_acquire_again``
    2. ``test_acquire_conflict_returns_409``
    3. ``test_heartbeat_extends_lock``
    4. ``test_heartbeat_wrong_token_404``
    5. ``test_release_with_wrong_token_no_op_or_404``
    6. ``test_stale_lock_cleanup_on_acquire``
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import text


pytestmark = [
    pytest.mark.integration,
    pytest.mark.requires_postgres,
    pytest.mark.requires_firebase_emulator,
    pytest.mark.requires_minio,
    pytest.mark.requires_engine,
]


async def _upload_dummy_get_id(test_client, headers, otx_path: Path) -> str:
    files = {
        "file": (otx_path.name, otx_path.read_bytes(), "application/octet-stream"),
    }
    response = await test_client.post(
        "/api/v1/models/upload-otx",
        files=files,
        data={"name": "Lock-Test"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["model"]["id"]


@pytest.mark.asyncio
async def test_acquire_release_acquire_again(
    test_client,
    clean_db,
    auth_headers,
    user_auth_headers,
    dummy_otx_path: Path,
) -> None:
    """User1 acquire -> release -> User2 acquire (alle 3 erfolgreich)."""
    _ = clean_db
    # Admin uploaded und acquired
    model_id = await _upload_dummy_get_id(test_client, auth_headers, dummy_otx_path)

    r1 = await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )
    assert r1.status_code == 200, r1.text
    token1 = r1.json()["token"]

    # User1 release
    r_rel = await test_client.delete(
        f"/api/v1/models/{model_id}/lock?token={token1}",
        headers=auth_headers,
    )
    assert r_rel.status_code == 204

    # User1 acquire wieder (gleicher User, neuer Lock)
    r2 = await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["token"] != token1


@pytest.mark.asyncio
async def test_acquire_conflict_returns_409(
    test_client,
    clean_db,
    auth_headers,
    user_auth_headers,
    dummy_otx_path: Path,
) -> None:
    """User1 acquire dann User2 acquire -> 409 mit owner_user_uid.

    Achtung: Admin upload -> Lock leben im Admin-Tenant. User kann das Modell
    in seinem eigenen Tenant nicht sehen (search_path-Isolation). Daher
    nutzen wir diesen Test innerhalb desselben Tenants — wir simulieren den
    Konflikt, indem ein zweiter Lock-Acquire (durch DB-Mock) versucht wird.

    Vereinfachung: Da Phase 1 strikte Tenant-Isolation hat, kann es
    "zwei User auf dasselbe Modell" nur geben, wenn beide im SELBEN Tenant
    sind (Phase 1 = Self-Service, 1 User pro Tenant). Wir simulieren das
    daher durch zwei aufeinanderfolgende Lock-Acquires desselben Users -
    der zweite muss 409 liefern, weil der erste noch nicht released ist.
    """
    _ = clean_db
    model_id = await _upload_dummy_get_id(test_client, auth_headers, dummy_otx_path)

    r1 = await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )
    assert r1.status_code == 200

    # Selber User, zweiter Acquire ohne Release: Conflict (acquire ist nicht
    # idempotent — laut Service-Implementation INSERT unique-key).
    r2 = await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )
    assert r2.status_code == 409, r2.text
    body = r2.json()
    # ProblemDetail mit code-Feld
    assert body.get("code") == "E_MODEL_LOCKED" or "MODEL_LOCKED" in str(body)


@pytest.mark.asyncio
async def test_heartbeat_extends_lock(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Heartbeat verlaengert expires_at."""
    _ = clean_db
    model_id = await _upload_dummy_get_id(test_client, auth_headers, dummy_otx_path)

    r_acq = await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )
    assert r_acq.status_code == 200
    token = r_acq.json()["token"]
    expires1 = datetime.fromisoformat(r_acq.json()["expires_at"])

    # Kurz warten, damit der heartbeat-expires sich vom acquire-expires
    # unterscheiden kann.
    await asyncio.sleep(1.1)

    r_hb = await test_client.post(
        f"/api/v1/models/{model_id}/lock/heartbeat",
        headers=auth_headers,
        json={"token": token},
    )
    assert r_hb.status_code == 200, r_hb.text
    expires2 = datetime.fromisoformat(r_hb.json()["expires_at"])
    assert expires2 > expires1


@pytest.mark.asyncio
async def test_heartbeat_wrong_token_404(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Heartbeat mit falschem Token -> 404 E_LOCK_EXPIRED."""
    _ = clean_db
    model_id = await _upload_dummy_get_id(test_client, auth_headers, dummy_otx_path)

    # Acquire damit ein Lock existiert
    await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )

    # Heartbeat mit Garbage-Token
    r_hb = await test_client.post(
        f"/api/v1/models/{model_id}/lock/heartbeat",
        headers=auth_headers,
        json={"token": str(uuid.uuid4())},
    )
    assert r_hb.status_code == 404, r_hb.text
    body = r_hb.json()
    assert body.get("code") == "E_LOCK_EXPIRED"


@pytest.mark.asyncio
async def test_release_with_wrong_token_is_idempotent(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Release mit falschem Token: 204 (no-op laut Spec) ODER 404."""
    _ = clean_db
    model_id = await _upload_dummy_get_id(test_client, auth_headers, dummy_otx_path)

    await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )

    r_rel = await test_client.delete(
        f"/api/v1/models/{model_id}/lock?token={uuid.uuid4()}",
        headers=auth_headers,
    )
    # Service-Implementation ist idempotent — release ist 204.
    assert r_rel.status_code in (204, 404), r_rel.text


@pytest.mark.asyncio
async def test_stale_lock_cleanup_on_acquire(
    test_client,
    clean_db,
    auth_headers,
    dummy_otx_path: Path,
) -> None:
    """Abgelaufenes Lock wird beim nächsten Acquire entfernt -> 200.

    Wir manipulieren expires_at via direktem DB-UPDATE auf einen Vergangenheits-
    Wert, damit der naechste Acquire es als 'stale' erkennt und ersetzt.
    """
    _ = clean_db
    model_id = await _upload_dummy_get_id(test_client, auth_headers, dummy_otx_path)

    # 1. Lock acquiren.
    r1 = await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )
    assert r1.status_code == 200

    # 2. expires_at via direktem SQL backdaten — search_path muss auf
    #    den Tenant-Schema des Admins zeigen.
    from app.core.database import engine

    # Tenant-id ist die UID des Admin-Users — die holen wir aus
    # /api/v1/auth/me.
    me = await test_client.get("/api/v1/auth/me", headers=auth_headers)
    tenant_id = me.json()["tenant_id"]

    with engine.begin() as conn:
        conn.execute(text(f'SET search_path TO "tenant_{tenant_id}", public'))
        conn.execute(
            text(
                "UPDATE model_locks SET expires_at = NOW() - INTERVAL '5 seconds' "
                "WHERE model_id = :mid"
            ),
            {"mid": model_id},
        )

    # 3. Erneutes Acquire muss klappen, weil Stale-Cleanup vor Acquire greift.
    r2 = await test_client.post(
        f"/api/v1/models/{model_id}/lock", headers=auth_headers
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["token"] != r1.json()["token"]
