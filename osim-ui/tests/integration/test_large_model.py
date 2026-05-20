"""Performance-Smoke mit grossem Modell (Bosch2_wechseln.otx, 18 MB).

Soft-Targets (no hard-fail):
  - Upload-Dauer  < 30s
  - Tree-GET-Dauer < 10s
  - JSON-Tree-Size < 50 MB

Bei Ueberschreitung wird ein Warning geprinted. Die Tests selbst gehen
NUR auf Funktion (kein crash, beide Endpoints liefern 200).

Skip-Bedingungen:
  - Bosch2_wechseln.otx ist nicht erreichbar
  - OSIM_SKIP_LARGE_TESTS=1 ist gesetzt (CI-Default)

Wer den Test scharf laufen lassen will, setzt:
    OSIM_FAIL_ON_PERF_REGRESSION=1
"""

from __future__ import annotations

import os
import time

import pytest

pytestmark = pytest.mark.requires_db

PERF_UPLOAD_SOFT_TARGET_S = 30.0
PERF_TREE_GET_SOFT_TARGET_S = 10.0
PERF_JSON_SIZE_SOFT_TARGET_MB = 50.0


def _maybe_fail(msg: str) -> None:
    """Bei OSIM_FAIL_ON_PERF_REGRESSION=1 wird ein soft-target zur hard-fail."""
    if os.environ.get("OSIM_FAIL_ON_PERF_REGRESSION") == "1":
        pytest.fail(msg)
    else:
        print(f"\nWARNING: {msg}")


def test_large_model_upload_and_tree_perf(
    client_for_user, large_otx_bytes
) -> None:
    """Misst Upload + Tree-GET-Latenz fuer Bosch2_wechseln (18 MB)."""
    size_mb = len(large_otx_bytes) / (1024 * 1024)
    print(f"\nlarge_otx_bytes size: {size_mb:.2f} MB")

    with client_for_user("perf-user", "perf@example.com") as (client, _, _):
        # Upload
        t0 = time.perf_counter()
        up = client.post(
            "/api/v1/models/upload-otx",
            headers={"Authorization": "Bearer fake-token"},
            files={"file": (
                "Bosch2_wechseln.otx",
                large_otx_bytes,
                "application/octet-stream",
            )},
        )
        upload_s = time.perf_counter() - t0
        assert up.status_code == 200, up.text
        print(f"upload took {upload_s:.2f}s")

        if upload_s > PERF_UPLOAD_SOFT_TARGET_S:
            _maybe_fail(
                f"Upload {upload_s:.2f}s > soft target "
                f"{PERF_UPLOAD_SOFT_TARGET_S}s for {size_mb:.1f}MB OTX"
            )

        body = up.json()
        model_id = body["id"]
        loaded = sum(body["loaded_summary"].values())
        coverage = body["coverage_ratio"]
        print(
            f"Bosch2_wechseln loaded {loaded} OSim-objects, "
            f"coverage {coverage:.3f}"
        )

        # Tree-GET
        t1 = time.perf_counter()
        gt = client.get(
            f"/api/v1/models/{model_id}/tree",
            headers={"Authorization": "Bearer fake-token"},
        )
        tree_get_s = time.perf_counter() - t1
        assert gt.status_code == 200
        tree_json_bytes = len(gt.content)
        tree_mb = tree_json_bytes / (1024 * 1024)
        print(f"tree GET took {tree_get_s:.2f}s, JSON {tree_mb:.2f} MB")

        if tree_get_s > PERF_TREE_GET_SOFT_TARGET_S:
            _maybe_fail(
                f"Tree GET {tree_get_s:.2f}s > soft target "
                f"{PERF_TREE_GET_SOFT_TARGET_S}s"
            )
        if tree_mb > PERF_JSON_SIZE_SOFT_TARGET_MB:
            _maybe_fail(
                f"JSON size {tree_mb:.2f} MB > soft target "
                f"{PERF_JSON_SIZE_SOFT_TARGET_MB} MB"
            )

        # Sanity: Root vorhanden, mind. ein Folder/Knoten.
        tree = gt.json()["tree"]
        assert tree["root"]["klass"] == "ASimulator"
        assert len(tree["root"].get("children", [])) > 0
