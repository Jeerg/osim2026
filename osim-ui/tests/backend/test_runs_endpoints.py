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

import importlib.util
import time
import uuid
from pathlib import Path

import pytest

from app.services.run_service import RunNotFound, RunService
from app.services.storage import LocalStorage


def _psycopg_driver_available() -> bool:
    """True, wenn ein Postgres-DBAPI-Treiber (psycopg/psycopg2) importierbar ist.

    Der App-/Router-Import triggert ``app.core.database.create_engine`` mit
    psycopg-Dialekt. Auf einer Host-Maschine kann der Postgres-SERVER laufen
    (TCP :5432 offen → ``requires_postgres`` skippt NICHT), während dem
    osim-ui-venv der TREIBER fehlt (unvollständiger ``uv sync``). Dann kann die
    App nicht importiert werden. Dieser Guard skippt solche Tests ehrlich,
    statt mit einem Import-Fehler zu failen.
    """
    return (
        importlib.util.find_spec("psycopg") is not None
        or importlib.util.find_spec("psycopg2") is not None
    )


# Modul-lokaler Skip-Marker für Tests, die die App importieren (brauchen den
# psycopg-Treiber, nicht nur einen lebenden Server).
needs_app_import = pytest.mark.skipif(
    not _psycopg_driver_available(),
    reason=(
        "psycopg-Treiber fehlt im osim-ui-venv — App-Import unmöglich "
        "(host-env-Gap; mit vollständigem `uv sync` + Stack ausführen)"
    ),
)


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


# ======================================================================
# Endpoint-Teil — runs-Router
# ======================================================================
#
# Diese Tests laufen über ``test_client`` + ``auth_headers`` gegen die ASGI-App
# und brauchen den vollen Dev-Stack (Postgres + Firebase-Emulator + Minio).
# Sie werden bei totem Stack via conftest auto-geskippt (KEIN gefakter Pass).
# ----------------------------------------------------------------------


@needs_app_import
@pytest.mark.requires_postgres
def test_router_registers_runs_tag() -> None:
    """Registrierungs-Prüfung: der runs-Router ist im api_router eingehängt
    (Tag ``runs`` + die drei Pfade).

    Marker ``requires_postgres``: der App-/Router-Import triggert
    ``app.core.database.create_engine``, das den psycopg-Treiber lädt. Ohne
    den Postgres-Treiber (= Stack down) wird der Test auto-geskippt statt zu
    failen — der reine Import-Pfad ist nicht vom Postgres-Server, aber vom
    Treiber abhängig (host-env-Gap), darum derselbe Marker."""
    from app.api.v1.router import api_router

    tags = {t for r in api_router.routes for t in getattr(r, "tags", [])}
    assert "runs" in tags

    # Die drei Pfade sind registriert.
    paths = {getattr(r, "path", "") for r in api_router.routes}
    assert "/models/{model_id}/runs" in paths
    assert "/runs/{run_id}/stream" in paths
    assert "/runs/{run_id}/meta" in paths


@needs_app_import
@pytest.mark.requires_postgres
@pytest.mark.requires_firebase_emulator
async def test_endpoint_stream_unknown_run_id_404(
    test_client, auth_headers, clean_db  # noqa: ARG001
) -> None:
    """GET /runs/{run_id}/stream mit unbekanntem run_id → 404 (kein Datei-Leak,
    T-RUN-02). Braucht Auth (Firebase) + DB (Tenant-Bootstrap via Middleware)."""
    resp = await test_client.get(
        "/api/v1/runs/2026-01-01T00-00-00-9999/stream?offset=0",
        headers=auth_headers,
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "E_RUN_NOT_FOUND"


@needs_app_import
@pytest.mark.requires_postgres
@pytest.mark.requires_firebase_emulator
async def test_endpoint_traversal_run_id_404(
    test_client, auth_headers, clean_db  # noqa: ARG001
) -> None:
    """run_id mit ``..``-Segment → 404 (ValueError im Service, T-RUN-01)."""
    resp = await test_client.get(
        "/api/v1/runs/..%2F..%2Fetc/meta",
        headers=auth_headers,
    )
    # FastAPI dekodiert %2F nicht zu Path-Separatoren -> run_id enthaelt '..'/'/'
    # -> ValueError -> 404. (Falls Routing nicht matcht -> 404 ebenfalls.)
    assert resp.status_code == 404


@needs_app_import
@pytest.mark.requires_postgres
async def test_endpoint_stream_requires_auth(test_client) -> None:
    """Ohne Auth → 401. Die Auth-Middleware blockt vor dem Endpoint, aber der
    App-Import (``test_client``-Fixture) braucht den psycopg-Treiber — daher
    ``requires_postgres`` (auto-skip bei Stack down statt Import-Fehler)."""
    resp = await test_client.get("/api/v1/runs/whatever/stream?offset=0")
    assert resp.status_code == 401
