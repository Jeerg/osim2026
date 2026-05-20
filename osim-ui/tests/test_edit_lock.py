"""Tests fuer den Edit-Lock-Service + /api/v1/models/{id}/lock-Endpoints."""

from __future__ import annotations

import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import app

pytestmark = pytest.mark.requires_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bootstrap_user(uid: str, email: str) -> tuple[TestClient, str]:
    """Macht /auth/me + setzt anschliessend einen permanent-token-patch."""
    p1 = patch(
        "app.auth.middleware.verify_token",
        return_value={"uid": uid, "user_id": uid, "email": email},
    )
    p2 = patch("app.api.v1.auth.set_user_tenant_claims", return_value=None)
    p1.start(); p2.start()
    client = TestClient(app)
    try:
        r = client.post(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer t"},
        )
        assert r.status_code == 200, r.text
        tenant_id = r.json()["tenant_id"]
    finally:
        p1.stop(); p2.stop()
    return client, tenant_id


def _patch_token(uid: str, email: str, tenant_id: str):
    return patch(
        "app.auth.middleware.verify_token",
        return_value={
            "uid": uid,
            "user_id": uid,
            "email": email,
            "tenant_id": tenant_id,
            "role": "owner",
        },
    )


def _upload_dummy(client: TestClient, dummy_otx_bytes: bytes) -> int:
    r = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer t"},
        files={"file": ("e.otx", dummy_otx_bytes, "application/octet-stream")},
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Acquire / Detail
# ---------------------------------------------------------------------------


def test_acquire_lock_first_time(authenticated_client, dummy_otx_bytes) -> None:
    client, _, uid = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    resp = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["holder_uid"] == uid
    assert body["is_self"] is True
    assert "expires_at" in body


def test_acquire_lock_idempotent_same_user(authenticated_client, dummy_otx_bytes) -> None:
    client, _, _ = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    r1 = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    assert r1.status_code == 200
    initial_expires = r1.json()["expires_at"]
    time.sleep(0.05)
    r2 = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    assert r2.status_code == 200
    # expires_at sollte nach dem 2. Acquire NEU sein (verlaengert),
    # aber holder bleibt gleich.
    assert r2.json()["holder_uid"] == r1.json()["holder_uid"]
    assert r2.json()["expires_at"] >= initial_expires


def test_acquire_lock_other_user_conflict_409(
    authenticated_client, dummy_otx_bytes
) -> None:
    """User A haelt den Lock. User B versucht zu akquirieren -> 409 mit
    Lock-Info, die User A als holder ausweist.

    Da der parallele "User B" denselben Tenant-Schema-Zugriff braucht,
    nutzen wir den gleichen Tenant aber mit anderem uid (Multi-User-pro-
    Tenant ist im Modell vorgesehen, auch wenn Phase-1 1:1 ist)."""
    client, tenant_id, uid_a = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)

    # User A akquiriert.
    r = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 200

    # User B als zweiter Holder im SELBEN Tenant.
    uid_b = "userb-conflict"
    p_b = _patch_token(uid_b, "b@example.com", tenant_id)
    p_b.start()
    try:
        # User B muss als public.users-Row existieren, damit der search_path
        # nicht stockt. Lazy: direkt SQL-Insert (kein zweiter /auth/me-Call
        # noetig, weil wir wissen, dass das Schema schon da ist).
        import asyncio

        from sqlalchemy.ext.asyncio import create_async_engine

        async def _add_user_b():
            from app.core.config import settings as _s
            eng = create_async_engine(_s.database_url, pool_pre_ping=False)
            try:
                async with eng.connect() as conn:
                    await conn.execute(text(
                        "INSERT INTO public.users (uid, email, tenant_id, role) "
                        "VALUES (:u, :e, :t, 'owner') ON CONFLICT DO NOTHING"
                    ), {"u": uid_b, "e": "b@example.com", "t": tenant_id})
                    await conn.commit()
            finally:
                await eng.dispose()

        asyncio.run(_add_user_b())

        b_resp = client.post(
            f"/api/v1/models/{model_id}/lock",
            headers={"Authorization": "Bearer t"},
        )
    finally:
        p_b.stop()

    assert b_resp.status_code == 409, b_resp.text
    body = b_resp.json()
    # RFC-7807-Extension-Felder (top-level): type, holder_uid, holder_email
    assert "lock-held" in body["type"]
    assert body["holder_uid"] == uid_a


def test_release_lock_removes_row(authenticated_client, dummy_otx_bytes) -> None:
    client, _, _ = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    r = client.delete(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 204

    # Detail darf jetzt kein lock_status haben.
    detail = client.get(
        f"/api/v1/models/{model_id}",
        headers={"Authorization": "Bearer t"},
    )
    assert detail.json()["lock_status"] is None


def test_release_lock_idempotent(authenticated_client, dummy_otx_bytes) -> None:
    """Zweiter DELETE ohne aktiven Lock liefert auch 204."""
    client, _, _ = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    r = client.delete(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 204


def test_heartbeat_extends_expires_at(authenticated_client, dummy_otx_bytes) -> None:
    client, _, _ = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    a = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    ).json()
    time.sleep(0.05)
    hb = client.post(
        f"/api/v1/models/{model_id}/lock/heartbeat",
        headers={"Authorization": "Bearer t"},
    )
    assert hb.status_code == 200
    # Neue expires_at > alte expires_at
    assert hb.json()["expires_at"] >= a["expires_at"]


def test_heartbeat_without_lock_returns_404(authenticated_client, dummy_otx_bytes) -> None:
    client, _, _ = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    r = client.post(
        f"/api/v1/models/{model_id}/lock/heartbeat",
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 404


def test_lock_expires_after_ttl_via_monkeypatch(
    authenticated_client, dummy_otx_bytes, monkeypatch
) -> None:
    """Mit kurz-gesetzem TTL (0 sec) wird der Lock direkt als expired
    erkannt und vom get_lock_status entfernt."""
    client, _, _ = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    # Vor dem Acquire: TTL auf -1 sek setzen (negative -> sofort expired).
    monkeypatch.setattr("app.services.lock_service.LOCK_TTL_SECONDS", -1)

    # Acquire: erzeugt einen Lock mit expires_at = now-1 -> bereits expired.
    r = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    assert r.status_code == 200

    # GET detail triggert get_lock_status -> Auto-Expire-Cleanup.
    detail = client.get(
        f"/api/v1/models/{model_id}",
        headers={"Authorization": "Bearer t"},
    )
    assert detail.json()["lock_status"] is None


def test_put_tree_without_lock_returns_403(authenticated_client, dummy_otx_bytes) -> None:
    client, _, _ = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    # GET tree erlaubt
    tree_resp = client.get(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer t"},
    )
    assert tree_resp.status_code == 200
    tree_doc = tree_resp.json()["tree"]
    # PUT ohne Lock -> 403
    put = client.put(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer t"},
        json={"tree": tree_doc},
    )
    assert put.status_code == 403, put.text
    body = put.json()
    assert "lock-required" in body.get("type", "")


def test_put_tree_with_lock_succeeds(authenticated_client, dummy_otx_bytes) -> None:
    client, _, _ = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    # Acquire
    al = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    assert al.status_code == 200
    tree_resp = client.get(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer t"},
    )
    tree_doc = tree_resp.json()["tree"]
    put = client.put(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer t"},
        json={"tree": tree_doc},
    )
    assert put.status_code == 200, put.text
    assert put.json()["version"] == 2


def test_detail_shows_lock_status_with_is_self(authenticated_client, dummy_otx_bytes) -> None:
    client, _, uid = authenticated_client
    model_id = _upload_dummy(client, dummy_otx_bytes)
    client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer t"},
    )
    detail = client.get(
        f"/api/v1/models/{model_id}",
        headers={"Authorization": "Bearer t"},
    )
    body = detail.json()
    lock_status = body["lock_status"]
    assert lock_status is not None
    assert lock_status["holder_uid"] == uid
    assert lock_status["is_self"] is True
