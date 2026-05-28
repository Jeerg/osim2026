"""Integration-Tests fuer die Auth-Endpoints (``/health``, ``/api/v1/auth/me``).

Marker-Strategie:
    * ``@pytest.mark.integration`` — gruppiert alle Integration-Tests.
    * ``@pytest.mark.requires_postgres`` — Auto-Skip wenn :5432 tot.
    * ``@pytest.mark.requires_firebase_emulator`` — Auto-Skip wenn :9099 tot.

Tests:
    1. ``test_health_no_auth`` — Health-Endpoint funktioniert ohne Token.
    2. ``test_missing_token_returns_401`` — /auth/me ohne Header.
    3. ``test_invalid_token_returns_401`` — /auth/me mit Garbage-Token.
    4. ``test_valid_token_bootstraps_tenant`` — erstmaliger /auth/me legt
        Tenant-Schema an.
    5. ``test_second_auth_me_is_idempotent`` — zweiter Call gibt gleichen
        tenant_id ohne neue Anlage.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text


pytestmark = [
    pytest.mark.integration,
    pytest.mark.requires_postgres,
    pytest.mark.requires_firebase_emulator,
]


@pytest.mark.asyncio
async def test_health_no_auth(test_client) -> None:
    """Health-Endpoint antwortet auch ohne Auth-Header mit 200."""
    response = await test_client.get("/health")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert "db" in body
    assert "storage" in body


@pytest.mark.asyncio
async def test_missing_token_returns_401(test_client) -> None:
    """``GET /api/v1/auth/me`` ohne Authorization-Header -> 401."""
    response = await test_client.get("/api/v1/auth/me")
    assert response.status_code == 401, response.text
    body = response.json()
    # Middleware sendet plain JSON; Detail enthaelt "Missing token".
    assert "Missing token" in body.get("detail", "")


@pytest.mark.asyncio
async def test_invalid_token_returns_401(test_client) -> None:
    """``GET /api/v1/auth/me`` mit Garbage-Bearer -> 401 mit Invalid token."""
    response = await test_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer garbage.token.here"},
    )
    assert response.status_code == 401, response.text
    body = response.json()
    detail = body.get("detail", "")
    assert "Invalid token" in detail or "Token expired" in detail


@pytest.mark.asyncio
async def test_valid_token_bootstraps_tenant(
    test_client,
    clean_db,
    user_token: str,
) -> None:
    """Erstmaliger /auth/me mit user-Token legt Tenant-Schema an.

    Assertions:
        - response 200, tenant_id ist nicht leer.
        - public.tenants enthaelt einen Eintrag mit slug=tenant_id.
        - tenant_<tenant_id>-Schema existiert in Postgres.
        - models + model_locks-Tabellen existieren im Tenant-Schema.
    """
    _ = clean_db  # Fixture-Setup wurde bereits angewendet
    response = await test_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    tenant_id = body["tenant_id"]
    assert tenant_id, "tenant_id darf nicht leer sein"
    assert body["email"] == "user@osim-dev"
    assert body["tenant_status"] == "active"

    # DB-Verifikation: tenant + schema + tables.
    from app.core.database import engine

    with engine.connect() as conn:
        # public.tenants-Eintrag muss da sein.
        slug_row = conn.execute(
            text("SELECT slug FROM public.tenants WHERE slug = :s"),
            {"s": tenant_id},
        ).fetchone()
        assert slug_row is not None, (
            f"Erwarte tenant-Row in public.tenants fuer slug={tenant_id}"
        )

        # tenant_<id>-Schema muss existieren.
        schema_row = conn.execute(
            text(
                "SELECT schema_name FROM information_schema.schemata "
                "WHERE schema_name = :s"
            ),
            {"s": f"tenant_{tenant_id}"},
        ).fetchone()
        assert schema_row is not None, (
            f"Erwarte Schema tenant_{tenant_id}"
        )

        # models + model_locks-Tabellen muessen im Tenant-Schema sein.
        table_rows = conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = :s ORDER BY table_name"
            ),
            {"s": f"tenant_{tenant_id}"},
        ).fetchall()
        table_names = {row[0] for row in table_rows}
        assert "models" in table_names
        assert "model_locks" in table_names


@pytest.mark.asyncio
async def test_second_auth_me_is_idempotent(
    test_client,
    clean_db,
    user_token: str,
) -> None:
    """Zwei /auth/me-Calls fuer denselben Token -> gleiche tenant_id, kein
    doppeltes Schema, kein doppelter User."""
    _ = clean_db
    hdrs = {"Authorization": f"Bearer {user_token}"}
    r1 = await test_client.get("/api/v1/auth/me", headers=hdrs)
    r2 = await test_client.get("/api/v1/auth/me", headers=hdrs)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["tenant_id"] == r2.json()["tenant_id"]

    # DB: genau ein Tenant-Eintrag, genau ein User-Eintrag.
    from app.core.database import engine

    with engine.connect() as conn:
        tenant_count = conn.execute(
            text("SELECT COUNT(*) FROM public.tenants WHERE slug = :s"),
            {"s": r1.json()["tenant_id"]},
        ).scalar_one()
        assert tenant_count == 1
        user_count = conn.execute(
            text(
                "SELECT COUNT(*) FROM public.users WHERE email = :e"
            ),
            {"e": "user@osim-dev"},
        ).scalar_one()
        assert user_count == 1
