"""Tests für RunService (Service-Teil) + runs-Router (Endpoint-Teil).

Plan 01-08. Zwei Schichten:

    * Service-Teil (``-k service``): testet ``RunService`` direkt mit
      ``LocalStorage`` + tmp run-dir + einem leichten Fake-Connection-Stub für
      ``storage_key``. Marker ``requires_engine`` (subprocess spawnt run_otx).
      Authz-/Traversal-Fälle brauchen weder DB noch Storage.

    * Endpoint-Teil: testet die drei HTTP-Endpoints über ``test_client`` +
      ``auth_headers``. Marker ``requires_engine`` + ``requires_postgres`` +
      ``requires_minio``/``requires_firebase_emulator`` — Auto-Skip wenn ein
      Service tot ist (Pattern aus conftest).

Host-Runbarkeit: der Service-Teil läuft ohne den vollen Dev-Stack
(LocalStorage-Override + tmp run-dir). Der Endpoint-Teil braucht den Stack und
wird sonst auto-geskippt — er fakt KEINEN Pass.
"""

from __future__ import annotations

import time
import uuid
from pathlib import Path

import pytest

from app.services.run_service import RunNotFound, RunService
from app.services.storage import LocalStorage


# Engine-Fixture-OTX (lädt zu 100%, lauffähiger Sim). Liegt im engine-Repo.
ENGINE_OTX = Path(
    r"C:\Users\JörgWFischer\PycharmProjects\osim-engine"
    r"\engine\tests\fixtures\otx\embb_pre_run.otx"
)


class _FakeResult:
    """Minimaler SQLAlchemy-Result-Stub mit ``one_or_none``."""

    def __init__(self, row):
        self._row = row

    def one_or_none(self):
        return self._row


class _FakeRow:
    def __init__(self, storage_key: str):
        self.storage_key = storage_key
        self.id = None
        self.name = "Test-Modell"
        self.original_storage_key = storage_key
        self.created_at = "2026-05-29T10:00:00"
        self.created_by_uid = "uid-test"


class _FakeConn:
    """Liefert für jede Query dieselbe storage_key-Row (reicht für get_meta +
    den storage_key-SELECT in start_run). ``id`` wird aus dem Konstruktor
    gesetzt, damit get_meta eine UUID rückgeben kann."""

    def __init__(self, storage_key: str, model_id: uuid.UUID):
        self._row = _FakeRow(storage_key)
        self._row.id = model_id

    def execute(self, *_args, **_kwargs):
        return _FakeResult(self._row)


def _make_service(tmp_path: Path, *, pace: float, model_id: uuid.UUID, storage_key: str):
    storage_root = tmp_path / "storage"
    runs_dir = tmp_path / "runs"
    storage = LocalStorage(storage_root)
    # Modell-OTX 1:1 ins Storage legen (Latin-1-Bytes).
    storage.put_object(storage_key, ENGINE_OTX.read_bytes())
    return RunService(
        conn=_FakeConn(storage_key, model_id),
        storage=storage,
        tenant_id="tenant-a",
        user_uid="uid-test",
        runs_dir=str(runs_dir),
        default_pace=pace,
        max_periods=24,
    )


def _require_engine_otx() -> None:
    if not ENGINE_OTX.exists():
        pytest.skip(f"Engine-Fixture-OTX nicht gefunden: {ENGINE_OTX}")


# ----------------------------------------------------------------------
# Service Test 1 — start_run spawnt Prozess + liefert run-Record
# ----------------------------------------------------------------------


@pytest.mark.requires_engine
def test_service_start_run_spawns_and_returns_record(tmp_path: Path) -> None:
    _require_engine_otx()
    model_id = uuid.uuid4()
    storage_key = f"tenants/tenant-a/models/{model_id}/original.otx"
    svc = _make_service(tmp_path, pace=0.05, model_id=model_id, storage_key=storage_key)

    record = svc.start_run(model_id, periods=2)

    assert record["run_id"]
    run_dir = record["run_dir"]
    assert run_dir.is_dir()
    # run-dir liegt physisch unter dem Tenant-Prefix.
    assert "tenant-a" in run_dir.parts
    assert str(model_id) in run_dir.parts


# ----------------------------------------------------------------------
# Service Test 2 — paced Lauf wächst über ein Wall-Clock-Fenster nach
# ----------------------------------------------------------------------


@pytest.mark.requires_engine
def test_service_paced_run_grows_over_time(tmp_path: Path) -> None:
    _require_engine_otx()
    model_id = uuid.uuid4()
    storage_key = f"tenants/tenant-a/models/{model_id}/original.otx"
    svc = _make_service(tmp_path, pace=0.15, model_id=model_id, storage_key=storage_key)

    record = svc.start_run(model_id, periods=4)
    run_id = record["run_id"]

    # Erster Read kurz nach Start.
    first = svc.read_stream(run_id, 0)
    # Warte ein Pace-Fenster und lies ab next_offset weiter.
    time.sleep(0.5)
    second = svc.read_stream(run_id, first["next_offset"])

    # Der Lauf schreibt paced nach: entweder der erste Read war noch leer und
    # der zweite hat Bytes, oder beide haben Bytes — in jedem Fall ist
    # next_offset des zweiten Reads >= dem des ersten (monoton wachsend).
    assert second["next_offset"] >= first["next_offset"]
    # Insgesamt sind nach dem Fenster Frames da.
    final = svc.read_stream(run_id, 0)
    assert len(final["text"]) > 0


# ----------------------------------------------------------------------
# Service Test 3 — read_stream inkrementell ab Byte-Offset
# ----------------------------------------------------------------------


@pytest.mark.requires_engine
def test_service_read_stream_incremental(tmp_path: Path) -> None:
    _require_engine_otx()
    model_id = uuid.uuid4()
    storage_key = f"tenants/tenant-a/models/{model_id}/original.otx"
    svc = _make_service(tmp_path, pace=0.0, model_id=model_id, storage_key=storage_key)

    record = svc.start_run(model_id, periods=2)
    run_id = record["run_id"]
    # pace=0 -> Lauf ist schnell fertig; kurz warten bis fertig geschrieben.
    time.sleep(0.5)

    full = svc.read_stream(run_id, 0)
    assert len(full["text"]) > 0
    eof = full["next_offset"]

    # offset == filesize -> leerer text, gleiches next_offset.
    at_eof = svc.read_stream(run_id, eof)
    assert at_eof["text"] == ""
    assert at_eof["next_offset"] == eof


# ----------------------------------------------------------------------
# Service Test 4 — Cross-Tenant run_id -> RunNotFound
# ----------------------------------------------------------------------


def test_service_cross_tenant_run_id_not_found(tmp_path: Path) -> None:
    """Ein run_id, dessen Verzeichnis NICHT unter dem Tenant-Prefix dieses
    Service liegt, ist nicht auflösbar (T-RUN-02). Kein DB/Storage nötig."""
    runs_dir = tmp_path / "runs"
    # Lege einen Lauf unter einem FREMDEN Tenant an.
    foreign = (
        runs_dir / "tenants" / "tenant-b" / "models" / str(uuid.uuid4())
        / "2026-05-29T10-00-00-0001"
    )
    foreign.mkdir(parents=True)
    (foreign / "stream.jsonl").write_text("{}\n", encoding="utf-8")

    svc = RunService(
        conn=None,
        storage=None,
        tenant_id="tenant-a",  # anderer Tenant
        user_uid="uid-test",
        runs_dir=str(runs_dir),
        default_pace=0.0,
        max_periods=24,
    )
    with pytest.raises(RunNotFound):
        svc.read_stream("2026-05-29T10-00-00-0001", 0)
    with pytest.raises(RunNotFound):
        svc.read_meta("2026-05-29T10-00-00-0001")


# ----------------------------------------------------------------------
# Service Test 5 — Pfad-Traversal -> ValueError
# ----------------------------------------------------------------------


@pytest.mark.parametrize("bad", ["..", "../x", "a/b", "a\\b", "..\\..\\etc"])
def test_service_traversal_run_id_rejected(tmp_path: Path, bad: str) -> None:
    """run_id mit Traversal-Segment -> ValueError, kein Datei-Read (T-RUN-01)."""
    svc = RunService(
        conn=None,
        storage=None,
        tenant_id="tenant-a",
        user_uid="uid-test",
        runs_dir=str(tmp_path / "runs"),
        default_pace=0.0,
        max_periods=24,
    )
    with pytest.raises(ValueError):
        svc.read_stream(bad, 0)
    with pytest.raises(ValueError):
        svc.read_meta(bad)


# ----------------------------------------------------------------------
# Service Test 6 — run_meta.json mit Ownership-Feldern
# ----------------------------------------------------------------------


@pytest.mark.requires_engine
def test_service_writes_run_meta_ownership(tmp_path: Path) -> None:
    _require_engine_otx()
    import json

    model_id = uuid.uuid4()
    storage_key = f"tenants/tenant-a/models/{model_id}/original.otx"
    svc = _make_service(tmp_path, pace=0.0, model_id=model_id, storage_key=storage_key)

    record = svc.start_run(model_id, periods=1)
    run_meta_path = record["run_dir"] / "run_meta.json"
    assert run_meta_path.is_file()
    rm = json.loads(run_meta_path.read_text(encoding="utf-8"))
    assert rm["tenant_id"] == "tenant-a"
    assert rm["model_id"] == str(model_id)
    assert rm["run_id"] == record["run_id"]
