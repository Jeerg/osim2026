"""Integration-Test fuer Lazy-Bootstrap unter concurrent Calls.

RESEARCH.md §Common Pitfalls #2 — wenn zwei parallele Requests fuer denselben
neuen Firebase-User gleichzeitig ``/api/v1/auth/me`` aufrufen, MUSS der
Bootstrap idempotent sein:

    * Beide Requests duerfen 200 zurueckgeben (kein 500 wegen
      UNIQUE-Violation).
    * Beide muessen den GLEICHEN tenant_id liefern.
    * Genau ein tenant_<uid>-Schema existiert nach beiden Calls.
    * Genau eine public.users-Row existiert.

Der Lazy-Bootstrap in ``app/services/auth_service.py`` ist idempotent via
``CREATE SCHEMA IF NOT EXISTS`` + ``ON CONFLICT DO NOTHING`` — dieser Test
beweist das gegen lebenden Postgres.
"""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import text


pytestmark = [
    pytest.mark.integration,
    pytest.mark.requires_postgres,
    pytest.mark.requires_firebase_emulator,
]


@pytest.mark.asyncio
async def test_lazy_bootstrap_idempotent_under_concurrent_calls(
    test_client,
    clean_db,
    user_token: str,
) -> None:
    """Drei parallele /auth/me-Calls fuer denselben fresh user -> alle 200,
    gleicher tenant_id, ein Schema, ein User-Eintrag.
    """
    _ = clean_db  # garantiert: User existiert im Emulator, aber KEIN Tenant in DB
    hdrs = {"Authorization": f"Bearer {user_token}"}

    # asyncio.gather: ASGITransport serialisiert Requests teilweise (FastAPI-
    # Endpoints sind nicht parallel im klassischen Sinne), aber zwei parallel
    # gestartete asyncio.to_thread-Calls (in der Middleware) treffen den DB-
    # Bootstrap in echtem Concurrency-Setting. CREATE SCHEMA IF NOT EXISTS +
    # ON CONFLICT muessen das aushalten.
    responses = await asyncio.gather(
        test_client.get("/api/v1/auth/me", headers=hdrs),
        test_client.get("/api/v1/auth/me", headers=hdrs),
        test_client.get("/api/v1/auth/me", headers=hdrs),
    )

    # Alle drei muessen 200 sein.
    for i, r in enumerate(responses):
        assert r.status_code == 200, (
            f"Response {i}: {r.status_code} {r.text}"
        )

    # Alle drei muessen den GLEICHEN tenant_id liefern.
    tenant_ids = {r.json()["tenant_id"] for r in responses}
    assert len(tenant_ids) == 1, (
        f"Erwarte 1 eindeutige tenant_id, bekam: {tenant_ids}"
    )
    tenant_id = tenant_ids.pop()
    assert tenant_id, "tenant_id darf nicht leer sein"

    # DB-Check: genau ein tenant_<id>-Schema, genau eine User-Row.
    from app.core.database import engine

    with engine.connect() as conn:
        schema_count = conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.schemata "
                "WHERE schema_name = :s"
            ),
            {"s": f"tenant_{tenant_id}"},
        ).scalar_one()
        assert schema_count == 1, (
            f"Erwarte genau 1 Schema, fand {schema_count}"
        )

        tenant_count = conn.execute(
            text("SELECT COUNT(*) FROM public.tenants WHERE slug = :s"),
            {"s": tenant_id},
        ).scalar_one()
        assert tenant_count == 1, (
            f"Erwarte genau 1 Tenant-Row, fand {tenant_count}"
        )

        user_count = conn.execute(
            text(
                "SELECT COUNT(*) FROM public.users WHERE email = :e"
            ),
            {"e": "user@osim-dev"},
        ).scalar_one()
        assert user_count == 1, (
            f"Erwarte genau 1 User-Row, fand {user_count}"
        )
