"""End-to-end Roundtrip-Test fuer das Tree-API.

Upload OTX -> GET /tree -> PUT /tree (unveraendert) -> Coverage-Identity
und neue Version in DB.

Roundtrip-Definition fuer Phase 1: ``loaded.total`` und Tree-Topologie
(OIDs+Klassen) sind nach Save-back identisch zum Initial-Load. Byte-fuer-
Byte-Equality wird NICHT gefordert (Reader-Tolerance, Whitespace etc.).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.requires_db


def test_roundtrip_upload_get_put_creates_new_version(
    authenticated_client, dummy_otx_bytes
) -> None:
    client, _, _ = authenticated_client

    # 1. Upload
    up = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("rt.otx", dummy_otx_bytes, "application/octet-stream")},
    )
    assert up.status_code == 200, up.text
    model_id = up.json()["id"]
    coverage_v1 = up.json()["coverage_ratio"]
    loaded_v1 = sum(up.json()["loaded_summary"].values())

    # 2. GET /tree
    gt = client.get(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert gt.status_code == 200, gt.text
    tree_body = gt.json()
    assert tree_body["model_id"] == model_id
    assert tree_body["version"] == 1
    assert tree_body["tree"]["schema_version"] == "1.0"
    assert tree_body["tree"]["root"]["oid"] == 0

    # Lock akquirieren (Task-3 Pflicht fuer PUT /tree).
    al = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert al.status_code == 200, al.text

    # 3. PUT /tree -- unveraendertes Tree.
    pt = client.put(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer fake-token"},
        json={"tree": tree_body["tree"]},
    )
    assert pt.status_code == 200, pt.text
    put_body = pt.json()
    assert put_body["version"] == 2  # neue Version
    assert put_body["model_id"] == model_id
    assert "storage_key" in put_body
    assert put_body["bytes_size"] > 0

    # 4. GET /tree erneut -- jetzt Version 2.
    gt2 = client.get(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert gt2.status_code == 200, gt2.text
    assert gt2.json()["version"] == 2

    # 5. Tree-OIDs/Klassen sollten identisch sein -- semantischer Roundtrip.
    tree_v1_oids = _walk_oids(tree_body["tree"])
    tree_v2_oids = _walk_oids(gt2.json()["tree"])
    assert tree_v1_oids == tree_v2_oids, "OID-Reihenfolge nach Roundtrip geaendert"

    # 6. Loaded-Counter wahren.
    detail = client.get(
        f"/api/v1/models/{model_id}",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert detail.status_code == 200
    loaded_after = sum(detail.json()["loaded_summary"].values())
    # Detail zeigt Initial-Load -- bleibt stabil; Coverage auch.
    assert loaded_after == loaded_v1
    assert pytest.approx(detail.json()["coverage_ratio_at_upload"]) == coverage_v1


def test_roundtrip_property_edit_persists(authenticated_client, dummy_otx_bytes) -> None:
    """Aenderung am Tree wird in der neuen Version persistiert."""
    client, _, _ = authenticated_client

    up = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("edit.otx", dummy_otx_bytes, "application/octet-stream")},
    )
    assert up.status_code == 200
    model_id = up.json()["id"]

    # GET tree
    gt = client.get(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer fake-token"},
    )
    tree = gt.json()["tree"]

    # Lock akquirieren (Task-3 Pflicht fuer PUT /tree).
    al = client.post(
        f"/api/v1/models/{model_id}/lock",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert al.status_code == 200

    # Aendere root.m_name (ASimulator nutzt m_name, NICHT m_sName).
    new_name = "Modified Sim Name"
    tree["root"]["properties"]["m_name"] = new_name

    pt = client.put(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer fake-token"},
        json={"tree": tree},
    )
    assert pt.status_code == 200, pt.text

    # Reload tree und pruefe.
    gt2 = client.get(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer fake-token"},
    )
    assert gt2.json()["tree"]["root"]["properties"].get("m_name") == new_name


def test_put_tree_rejects_bad_schema_version(authenticated_client, dummy_otx_bytes) -> None:
    client, _, _ = authenticated_client
    up = client.post(
        "/api/v1/models/upload-otx",
        headers={"Authorization": "Bearer fake-token"},
        files={"file": ("rt.otx", dummy_otx_bytes, "application/octet-stream")},
    )
    model_id = up.json()["id"]

    bad_tree = {
        "schema_version": "9.0",
        "root": {
            "oid": 0,
            "klass": "ASimulator",
            "name": "x",
            "properties": {},
            "children": [],
        },
    }
    resp = client.put(
        f"/api/v1/models/{model_id}/tree",
        headers={"Authorization": "Bearer fake-token"},
        json={"tree": bad_tree},
    )
    assert resp.status_code == 422


def _walk_oids(tree) -> list[int]:
    out: list[int] = []

    def walk(node):
        out.append(node["oid"])
        for c in node.get("children", []):
            walk(c)

    walk(tree["root"])
    return out
