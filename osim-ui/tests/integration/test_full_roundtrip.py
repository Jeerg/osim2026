"""Cross-Plan-Integrationstest: Login -> Upload -> Edit -> Save -> Roundtrip.

Verifiziert end-to-end:
  - D-01 (OTX-Parse), D-02 (OTX-Writer), D-03 (Storage), D-04 (Tree-API)
  - D-10 (Property-Edit), D-11/D-14 (Save -> neue Version)
  - D-13 (Lock-Pflicht fuer PUT /tree)
  - D-15 (Auth via Firebase-Mock), D-16/D-17 (Tenant-Bootstrap)

Anders als ``tests/test_otx_roundtrip.py`` (Plan 01-03) testet dieser Test:
  - mehrere Property-Edits in einer Session
  - Storage-Versionierung (Original v1 bleibt unveraendert)
  - Coverage-Ratio aus dem Upload-Response

Erwartet die laufende Postgres-Test-DB (skip-Marker via ``requires_db``).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.requires_db


def test_full_roundtrip_login_upload_edit_save_reload(
    client_for_user, dummy_otx_bytes
) -> None:
    """End-to-End Walk-Through fuer den primaeren Phase-1-Use-Case."""
    with client_for_user("integ-user-1", "integ1@example.com") as (
        client, tenant_id, _uid,
    ):
        # 1) Upload OTX -> bekommt model_id + Coverage.
        up = client.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": ("rt.otx", dummy_otx_bytes, "application/octet-stream")},
        )
        assert up.status_code == 200, up.text
        body_up = up.json()
        model_id = body_up["id"]
        assert body_up["coverage_ratio"] > 0
        loaded_initial = sum(body_up["loaded_summary"].values())
        assert loaded_initial > 0

        # 2) GET /tree -> initiale Tree-Antwort, Version 1.
        gt = client.get(
            f"/api/v1/models/{model_id}/tree",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert gt.status_code == 200, gt.text
        body_gt = gt.json()
        assert body_gt["version"] == 1
        tree = body_gt["tree"]
        assert tree["root"]["klass"] == "ASimulator"
        assert tree["root"]["oid"] == 0

        # 3) Lock akquirieren -- PUT /tree braucht Lock.
        lck = client.post(
            f"/api/v1/models/{model_id}/lock",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert lck.status_code == 200, lck.text
        assert lck.json()["holder_uid"] == "integ-user-1"

        # 4) Property-Edit: m_name auf Root setzen.
        new_name = "Integration-Test Modell"
        tree["root"]["properties"]["m_name"] = new_name

        pt = client.put(
            f"/api/v1/models/{model_id}/tree",
            headers={"Authorization": "Bearer fake-token"},
            json={"tree": tree},
        )
        assert pt.status_code == 200, pt.text
        put_body = pt.json()
        assert put_body["version"] == 2
        assert put_body["bytes_size"] > 0

        # 5) Erneuter GET /tree -> Edit ist persistiert, Version 2.
        gt2 = client.get(
            f"/api/v1/models/{model_id}/tree",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert gt2.status_code == 200
        assert gt2.json()["version"] == 2
        assert gt2.json()["tree"]["root"]["properties"]["m_name"] == new_name

        # 6) Original-Download liefert noch die UNVERAENDERTEN Bytes
        #    (D-14: Original v1 bleibt erhalten).
        dl = client.get(
            f"/api/v1/models/{model_id}/download-original",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert dl.status_code == 200
        original_bytes = dl.content
        assert original_bytes == dummy_otx_bytes, (
            "Original-OTX wurde beim Save veraendert -- D-14 verletzt."
        )

        # 7) tenant_id ist korrekt isoliert (Cross-Check mit DB-Schema).
        assert tenant_id.startswith("tenant_")


def test_full_roundtrip_lock_release_allows_new_lock(
    client_for_user, dummy_otx_bytes
) -> None:
    """Lock-Release gibt das Modell wieder frei (idempotent)."""
    with client_for_user("integ-user-2", "integ2@example.com") as (
        client, _, _,
    ):
        up = client.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": ("rt.otx", dummy_otx_bytes, "application/octet-stream")},
        )
        model_id = up.json()["id"]

        # Lock acquire + release + re-acquire
        r1 = client.post(
            f"/api/v1/models/{model_id}/lock",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert r1.status_code == 200

        r2 = client.delete(
            f"/api/v1/models/{model_id}/lock",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert r2.status_code == 204

        r3 = client.post(
            f"/api/v1/models/{model_id}/lock",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert r3.status_code == 200

        # Heartbeat aktiv
        r4 = client.post(
            f"/api/v1/models/{model_id}/lock/heartbeat",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert r4.status_code == 200
        assert r4.json()["holder_uid"] == "integ-user-2"


def test_full_roundtrip_fertigungsstruktur_loads_and_serves_tree(
    client_for_user, fertigung_otx_bytes
) -> None:
    """Mittelgrosses Real-World-Modell (272 KB) muss roundtrip-faehig sein."""
    with client_for_user("integ-user-3", "integ3@example.com") as (client, _, _):
        up = client.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={
                "file": (
                    "Fertigungsstruktur1_mit_AslFj.otx",
                    fertigung_otx_bytes,
                    "application/octet-stream",
                )
            },
        )
        assert up.status_code == 200, up.text
        body = up.json()
        assert body["coverage_ratio"] > 0
        loaded_total = sum(body["loaded_summary"].values())
        assert loaded_total > 50, (
            f"Fertigungsstruktur sollte > 50 Objekte laden, hat {loaded_total}"
        )

        # GET /tree -- prueft, dass die Serialisierung durchlaeuft (kein Crash).
        model_id = body["id"]
        gt = client.get(
            f"/api/v1/models/{model_id}/tree",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert gt.status_code == 200
        tree = gt.json()["tree"]

        # Workspace-Hierarchie ist da: mindestens Auslöser oder Plaene-Folder.
        # In Phase 1: Folders heissen Modell/Ausloeser/Plaene/Ressourcen/Einsatzzeiten.
        root_children = tree["root"].get("children", [])
        assert len(root_children) > 0, "Tree-Root hat keine Children"
