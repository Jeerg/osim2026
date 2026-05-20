"""Multi-Tenant-Isolation: User A's Modelle sind fuer User B unsichtbar.

Verifiziert D-16 (Schema-per-Tenant) + D-17 (Lazy Bootstrap):
  - Zwei unabhaengige Tenant-Bootstraps erzeugen verschiedene Schemata.
  - Modelle eines Tenants sind im anderen Tenant nicht abrufbar.
  - Lock-Endpoints lehnen Cross-Tenant-Zugriffe ab.
  - Tree-Endpoints lehnen Cross-Tenant-Zugriffe ab.

Phase-1-Erwartung (siehe Plan-Action): Cross-Tenant-Zugriffe geben
**404** zurueck (nicht 403), weil der search_path-basierte Isolations-
Mechanismus die Models-Tabelle des anderen Tenants gar nicht sieht --
das Modell "existiert" aus Sicht von User B nicht.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.requires_db


def test_two_users_get_distinct_tenants(client_for_user) -> None:
    """Zwei Fake-Users bekommen jeweils ein eigenes tenant_*-Schema."""
    with client_for_user("alice", "alice@example.com") as (_, tenant_a, _):
        with client_for_user("bob", "bob@example.com") as (_, tenant_b, _):
            assert tenant_a != tenant_b
            assert tenant_a.startswith("tenant_")
            assert tenant_b.startswith("tenant_")


def test_user_b_cannot_list_user_a_models(
    client_for_user, dummy_otx_bytes
) -> None:
    """User B's /models-Liste ist leer, obwohl User A hochgeladen hat."""
    # User A uploads
    with client_for_user("alice2", "alice2@example.com") as (
        client_a, _, _,
    ):
        up = client_a.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": (
                "a.otx", dummy_otx_bytes, "application/octet-stream",
            )},
        )
        assert up.status_code == 200
        model_id_a = up.json()["id"]

        list_a = client_a.get(
            "/api/v1/models",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert list_a.status_code == 200
        assert len(list_a.json()) >= 1
        a_ids = {m["id"] for m in list_a.json()}
        assert model_id_a in a_ids

    # User B sieht nichts.
    with client_for_user("bob2", "bob2@example.com") as (client_b, _, _):
        list_b = client_b.get(
            "/api/v1/models",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert list_b.status_code == 200
        b_ids = {m["id"] for m in list_b.json()}
        assert model_id_a not in b_ids, (
            "User B sieht User A's Modell -- Tenant-Isolation verletzt."
        )


def test_user_b_cannot_get_user_a_model_detail(
    client_for_user, dummy_otx_bytes
) -> None:
    """GET /models/{a_id} aus User B liefert 404 (oder 422 bei integer-id)."""
    with client_for_user("alice3", "alice3@example.com") as (client_a, _, _):
        up = client_a.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": (
                "a.otx", dummy_otx_bytes, "application/octet-stream",
            )},
        )
        model_id_a = up.json()["id"]

    with client_for_user("bob3", "bob3@example.com") as (client_b, _, _):
        # Detail-Endpoint: existiert aus B's Sicht nicht.
        detail = client_b.get(
            f"/api/v1/models/{model_id_a}",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert detail.status_code == 404, (
            f"Cross-Tenant Detail-Get sollte 404 sein, war {detail.status_code}"
        )


def test_user_b_cannot_get_user_a_tree(
    client_for_user, dummy_otx_bytes
) -> None:
    """GET /models/{a_id}/tree aus User B liefert 404."""
    with client_for_user("alice4", "alice4@example.com") as (client_a, _, _):
        up = client_a.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": (
                "a.otx", dummy_otx_bytes, "application/octet-stream",
            )},
        )
        model_id_a = up.json()["id"]

    with client_for_user("bob4", "bob4@example.com") as (client_b, _, _):
        tree = client_b.get(
            f"/api/v1/models/{model_id_a}/tree",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert tree.status_code == 404


def test_user_b_cannot_acquire_lock_on_user_a_model(
    client_for_user, dummy_otx_bytes
) -> None:
    """POST /models/{a_id}/lock aus User B liefert 404."""
    with client_for_user("alice5", "alice5@example.com") as (client_a, _, _):
        up = client_a.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": (
                "a.otx", dummy_otx_bytes, "application/octet-stream",
            )},
        )
        model_id_a = up.json()["id"]

    with client_for_user("bob5", "bob5@example.com") as (client_b, _, _):
        lock = client_b.post(
            f"/api/v1/models/{model_id_a}/lock",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert lock.status_code == 404


def test_user_b_cannot_put_tree_on_user_a_model(
    client_for_user, dummy_otx_bytes
) -> None:
    """PUT /models/{a_id}/tree aus User B liefert 404."""
    with client_for_user("alice6", "alice6@example.com") as (client_a, _, _):
        up = client_a.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": (
                "a.otx", dummy_otx_bytes, "application/octet-stream",
            )},
        )
        model_id_a = up.json()["id"]
        gt = client_a.get(
            f"/api/v1/models/{model_id_a}/tree",
            headers={"Authorization": "Bearer fake-token"},
        )
        a_tree = gt.json()["tree"]

    with client_for_user("bob6", "bob6@example.com") as (client_b, _, _):
        put = client_b.put(
            f"/api/v1/models/{model_id_a}/tree",
            headers={"Authorization": "Bearer fake-token"},
            json={"tree": a_tree},
        )
        assert put.status_code == 404


def test_user_b_can_create_own_model_in_own_tenant(
    client_for_user, dummy_otx_bytes
) -> None:
    """User B kann unabhaengig vom User-A-Schema sein eigenes Modell anlegen."""
    with client_for_user("alice7", "alice7@example.com") as (client_a, _, _):
        client_a.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": (
                "a.otx", dummy_otx_bytes, "application/octet-stream",
            )},
        )

    with client_for_user("bob7", "bob7@example.com") as (client_b, _, _):
        up_b = client_b.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": (
                "b.otx", dummy_otx_bytes, "application/octet-stream",
            )},
        )
        assert up_b.status_code == 200
        list_b = client_b.get(
            "/api/v1/models",
            headers={"Authorization": "Bearer fake-token"},
        )
        # User B sieht GENAU sein eigenes Modell -- nicht das von A.
        ids = [m["id"] for m in list_b.json()]
        assert up_b.json()["id"] in ids
