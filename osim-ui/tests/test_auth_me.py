"""Tests fuer POST /api/v1/auth/me + lazy Tenant-Bootstrap.

Strategie: verify_token wird gemockt, damit wir ohne Firebase-Emulator
deterministische Claims setzen koennen. (Integration-Test gegen den
echten Emulator: separat, marked @pytest.mark.integration.)
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.main import app

pytestmark = pytest.mark.requires_db


def _fake_token_decode(uid: str, email: str) -> dict[str, Any]:
    return {
        "uid": uid,
        "user_id": uid,
        "email": email,
        "email_verified": True,
    }


def _client_with_token(uid: str, email: str) -> tuple[TestClient, Any]:
    """Liefert einen TestClient + offenen patch-Context fuer verify_token.

    Caller muss patch.start() bzw. with-Block selbst handhaben.
    """
    p = patch("app.auth.middleware.verify_token", return_value=_fake_token_decode(uid, email))
    # set_user_tenant_claims darf nicht gegen ein echtes Firebase-Backend gehen.
    p2 = patch("app.api.v1.auth.set_user_tenant_claims", return_value=None)
    return TestClient(app), (p, p2)


def test_auth_me_creates_tenant_on_first_call(db_engine: AsyncEngine) -> None:
    """Erster Call legt Tenant + User an, bootstrapped=True."""
    uid = "newuser01"
    email = "new@example.com"
    client, (p1, p2) = _client_with_token(uid, email)
    p1.start(); p2.start()
    try:
        resp = client.post(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer fake-token"},
        )
    finally:
        p1.stop(); p2.stop()

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tenant_id"] == f"tenant_{uid.lower()}"
    assert body["user_uid"] == uid
    assert body["email"] == email
    assert body["role"] == "owner"
    assert body["bootstrapped"] is True


def _count_user_and_tenant(uid: str) -> tuple[int, int]:
    """Zaehlt Rows -- spawnt eine fresh Engine, weil TestClient-Loop und
    pytest-Event-Loop hier divergieren koennen (Windows ProactorEventLoop).
    """
    import asyncio

    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import settings as _s

    async def _do() -> tuple[int, int]:
        eng = create_async_engine(_s.database_url, pool_pre_ping=False)
        try:
            async with eng.connect() as conn:
                t = (await conn.execute(
                    text("SELECT count(*) FROM public.tenants WHERE owner_uid = :u"),
                    {"u": uid},
                )).scalar_one()
                u = (await conn.execute(
                    text("SELECT count(*) FROM public.users WHERE uid = :u"),
                    {"u": uid},
                )).scalar_one()
                return t, u
        finally:
            await eng.dispose()

    return asyncio.run(_do())


def test_auth_me_is_idempotent(db_engine: AsyncEngine) -> None:
    """Zweiter Call mit gleichem Token -> kein zweites Tenant/User-Row."""
    uid = "idemuser2"
    email = "idem@example.com"
    client, (p1, p2) = _client_with_token(uid, email)
    p1.start(); p2.start()
    try:
        r1 = client.post("/api/v1/auth/me", headers={"Authorization": "Bearer fake-token"})
        r2 = client.post("/api/v1/auth/me", headers={"Authorization": "Bearer fake-token"})
    finally:
        p1.stop(); p2.stop()

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["bootstrapped"] is True
    assert r2.json()["bootstrapped"] is False
    assert r1.json()["tenant_id"] == r2.json()["tenant_id"]

    tenants, users = _count_user_and_tenant(uid)
    assert tenants == 1
    assert users == 1


def test_auth_me_creates_postgres_schema(db_engine: AsyncEngine) -> None:
    """Schema tenant_{uid} taucht in pg_namespace auf."""
    uid = "schmuser3"
    email = "schm@example.com"
    client, (p1, p2) = _client_with_token(uid, email)
    p1.start(); p2.start()
    try:
        resp = client.post(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer fake-token"},
        )
    finally:
        p1.stop(); p2.stop()
    assert resp.status_code == 200
    expected_schema = resp.json()["tenant_id"]

    import asyncio

    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import settings as _s

    async def _schema_exists() -> bool:
        eng = create_async_engine(_s.database_url, pool_pre_ping=False)
        try:
            async with eng.connect() as conn:
                row = (await conn.execute(
                    text(
                        "SELECT 1 FROM information_schema.schemata "
                        "WHERE schema_name = :s"
                    ),
                    {"s": expected_schema},
                )).scalar_one_or_none()
            return row is not None
        finally:
            await eng.dispose()

    assert asyncio.run(_schema_exists()), f"Schema {expected_schema} fehlt in pg_namespace"


def test_unauthenticated_request_returns_401_problem_detail() -> None:
    """POST /api/v1/auth/me OHNE Authorization-Header -> 401 + ProblemDetail."""
    with TestClient(app) as client:
        resp = client.post("/api/v1/auth/me")
    assert resp.status_code == 401
    assert resp.headers["content-type"].startswith("application/problem+json")
    body = resp.json()
    assert body["title"] == "Unauthorized"
    assert body["status"] == 401
    assert "Missing" in body["detail"] or "Authorization" in body["detail"]


def test_malformed_token_returns_401(db_engine: AsyncEngine) -> None:
    """Ungueltiges Bearer-Token (raises InvalidIdTokenError) -> 401."""
    from firebase_admin import auth as fb_auth

    p = patch(
        "app.auth.middleware.verify_token",
        side_effect=fb_auth.InvalidIdTokenError("bad token"),
    )
    p.start()
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer garbage"},
            )
    finally:
        p.stop()
    assert resp.status_code == 401
    assert resp.headers["content-type"].startswith("application/problem+json")
    assert "Invalid" in resp.json()["detail"]
