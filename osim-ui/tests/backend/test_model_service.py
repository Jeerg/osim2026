"""Unit-Tests für ``app/services/model_service.py``.

Setup:
    * SQLite-in-memory mit ``models``-Tabelle (Postgres-DDL angepasst:
      UUID -> TEXT, NOW() via Python-Function).
    * LocalStorage auf ``tmp_path``.
    * ModelService mit fixiertem ``tenant_id`` + ``user_uid``.

@pytest.mark.requires_engine: weil ``get_wire`` / ``save_wire`` osim_engine
benötigen (``load_otx_file``, ``dump_simulator_to_otx``).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Connection, Engine

from app.api.schemas.model import ModelCoverage, ModelObject, ModelTreeWire
from app.services.model_service import ModelService
from app.services.storage import LocalStorage


pytestmark = pytest.mark.requires_engine


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


SQLITE_DDL = """
CREATE TABLE models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    original_storage_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (now()),
    created_by_uid TEXT NOT NULL
);
"""
# DDL-Hinweis: ``now()`` ist die per @event.listens_for(connect) registrierte
# Python-Function mit microsecond precision. SQLite's native ``datetime('now')``
# wuerde nur Sekunden-Aufloesung liefern, was bei schnellen Insert-Sequenzen
# (zwei Uploads in derselben Sekunde) den ORDER BY desc instabil macht.


def _install_now_function(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def _register(dbapi_connection, _):
        def _now():
            return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(
                sep=" ", timespec="microseconds"
            )

        dbapi_connection.create_function("now", 0, _now)


@pytest.fixture
def sqlite_conn() -> Iterator[Connection]:
    engine = create_engine("sqlite:///:memory:")
    _install_now_function(engine)

    with engine.connect() as conn:
        conn.execute(text(SQLITE_DDL))
        conn.commit()
        yield conn


@pytest.fixture
def storage(tmp_path: Path) -> LocalStorage:
    return LocalStorage(root=tmp_path / "storage")


@pytest.fixture
def service(
    sqlite_conn: Connection, storage: LocalStorage
) -> ModelService:
    return ModelService(
        conn=sqlite_conn,
        storage=storage,
        tenant_id="alice",
        user_uid="alice",
    )


# ---------------------------------------------------------------------------
# upload_otx
# ---------------------------------------------------------------------------


def test_upload_otx_stores_original_and_returns_meta(
    service: ModelService,
    storage: LocalStorage,
    dummy_otx_path: Path,
) -> None:
    """upload_otx: Original wird gespeichert, Meta enthält Storage-Keys."""
    content = dummy_otx_path.read_bytes()
    meta = service.upload_otx(name="Dummy", content=content)

    assert meta.name == "Dummy"
    assert meta.original_storage_key.endswith("/original.otx")
    assert meta.original_storage_key.startswith("tenants/alice/models/")
    # Initial: current_version_key == None (kein Save-back gemacht).
    assert meta.current_version_key is None
    assert storage.exists(meta.original_storage_key)
    # Storage-Inhalt = Original-Bytes (Latin-1-Pass-Through).
    assert storage.get_object(meta.original_storage_key) == content


def test_upload_otx_rejects_oversized(service: ModelService) -> None:
    """Upload > 30 MB → HTTPException 413 E_UPLOAD_TOO_LARGE."""
    big = b"x" * (31 * 1024 * 1024)
    with pytest.raises(HTTPException) as ei:
        service.upload_otx(name="huge", content=big)
    assert ei.value.status_code == 413
    detail = ei.value.detail
    assert isinstance(detail, dict)
    assert detail.get("code") == "E_UPLOAD_TOO_LARGE"


# ---------------------------------------------------------------------------
# get_wire
# ---------------------------------------------------------------------------


def test_get_wire_returns_loaded_tree(
    service: ModelService, dummy_otx_path: Path
) -> None:
    """upload + get_wire liefert Wire mit loaded > 0."""
    content = dummy_otx_path.read_bytes()
    meta = service.upload_otx(name="Dummy", content=content)
    wire = service.get_wire(meta.id)
    assert wire.coverage.loaded > 0
    assert 0 in wire.objects


def test_get_wire_missing_model_raises_404(service: ModelService) -> None:
    """Get auf nicht-existente UUID → 404."""
    with pytest.raises(HTTPException) as ei:
        service.get_wire(uuid.uuid4())
    assert ei.value.status_code == 404


# ---------------------------------------------------------------------------
# save_wire
# ---------------------------------------------------------------------------


def test_save_wire_creates_versioned_key(
    service: ModelService,
    storage: LocalStorage,
    dummy_otx_path: Path,
) -> None:
    """save_wire schreibt neue Version + Original bleibt erhalten (D-14)."""
    content = dummy_otx_path.read_bytes()
    meta = service.upload_otx(name="Dummy", content=content)
    wire = service.get_wire(meta.id)

    new_key = service.save_wire(meta.id, wire)
    assert new_key.startswith(f"tenants/alice/models/{meta.id}/v_")
    assert new_key.endswith(".otx")

    # D-14: Original bleibt erhalten.
    assert storage.exists(meta.original_storage_key)
    # Neue Version existiert.
    assert storage.exists(new_key)

    # Get-Meta nach Save: current_version_key zeigt auf die neue Datei.
    updated_meta = service.get_meta(meta.id)
    assert updated_meta.current_version_key == new_key


def test_save_wire_rejects_incomplete_coverage(
    service: ModelService,
    dummy_otx_path: Path,
) -> None:
    """Wire mit unsupported-Klassen → 422 E_OTX_COVERAGE_INCOMPLETE."""
    content = dummy_otx_path.read_bytes()
    meta = service.upload_otx(name="Dummy", content=content)

    bad_wire = ModelTreeWire(
        simulator_oid=0,
        objects={
            0: ModelObject(oid=0, klass="ASimulator", attrs={}, sub_refs=[])
        },
        coverage=ModelCoverage(loaded=1, skipped=0, unsupported=["FooBar"]),
    )

    with pytest.raises(HTTPException) as ei:
        service.save_wire(meta.id, bad_wire)
    assert ei.value.status_code == 422
    detail = ei.value.detail
    assert isinstance(detail, dict)
    assert detail.get("code") == "E_OTX_COVERAGE_INCOMPLETE"


# ---------------------------------------------------------------------------
# list_models
# ---------------------------------------------------------------------------


def test_list_models_returns_sorted_desc(
    service: ModelService, dummy_otx_path: Path
) -> None:
    """Upload zwei Modelle → list_models liefert beide, DESC-sortiert."""
    content = dummy_otx_path.read_bytes()
    service.upload_otx(name="First", content=content)
    # Tiny sleep, damit created_at sich unterscheiden kann (Microsecond-Auflösung
    # reicht meistens, aber wir sind vorsichtig auf schnellen Maschinen).
    import time

    time.sleep(0.01)
    service.upload_otx(name="Second", content=content)

    models = service.list_models()
    assert len(models) == 2
    # DESC: zuletzt angelegt zuerst.
    assert models[0].name == "Second"
    assert models[1].name == "First"


# ---------------------------------------------------------------------------
# delete_model
# ---------------------------------------------------------------------------


def test_delete_model_removes_storage_and_db(
    service: ModelService,
    storage: LocalStorage,
    dummy_otx_path: Path,
) -> None:
    """delete_model entfernt DB-Row + Storage-Prefix."""
    content = dummy_otx_path.read_bytes()
    meta = service.upload_otx(name="ToDelete", content=content)
    assert storage.exists(meta.original_storage_key)

    service.delete_model(meta.id)

    # DB: kein Row mehr.
    with pytest.raises(HTTPException) as ei:
        service.get_meta(meta.id)
    assert ei.value.status_code == 404

    # Storage: keine Files unter dem Modell-Prefix mehr.
    prefix = f"tenants/alice/models/{meta.id}/"
    assert storage.list_objects(prefix) == []
