---
phase: 01-vertical-slice
plan: 04
type: execute
wave: 2
depends_on:
  - 01-02-backend-foundation
files_modified:
  - app/services/storage.py
  - app/services/otx_json_tree.py
  - app/services/model_service.py
  - app/services/lock_service.py
  - app/api/v1/models.py
  - app/api/v1/locks.py
  - app/api/v1/router.py
  - app/api/schemas/model.py
  - app/api/schemas/lock.py
  - app/api/v1/health.py
autonomous: true
requirements:
  - SC-3
  - SC-6
  - SC-7
  - SC-8
priority: critical

must_haves:
  truths:
    - "POST /api/v1/models/upload-otx (multipart) liest .otx-Datei Latin-1, persistiert Original in Object Storage, parsed via osim_engine, liefert wire-Format mit objects-Dict und coverage-Info."
    - "GET /api/v1/models/{id} liefert den aktuellen wire-Stand des Modells als JSON (entweder vom Original-Upload oder von letzter Save-back-Version)."
    - "PUT /api/v1/models/{id} akzeptiert wire-JSON + lock_token, validiert Lock-Owner, serialisiert via osim_engine.io.otx_writer und persistiert als neue Version (v_<timestamp>.otx) im Storage. Original-OTX bleibt unverändert (D-14)."
    - "GET /api/v1/models liefert Liste aller Modelle des Tenants."
    - "DELETE /api/v1/models/{id} entfernt Modell-Row + Lock-Row + Storage-Objekte (Original + alle Versionen)."
    - "POST /api/v1/models/{id}/lock liefert 200 + lock-token wenn frei, 409 mit owner-Info wenn von anderem User gehalten."
    - "POST /api/v1/models/{id}/lock/heartbeat verlängert expires_at; ungültiges Token → 404."
    - "DELETE /api/v1/models/{id}/lock gibt Lock frei wenn vom Caller gehalten."
    - "Storage-Abstraktion `StorageService` unterstützt local-fs und minio-S3-backend; Schalter via settings.storage_backend."
  artifacts:
    - path: "app/services/storage.py"
      provides: "StorageService mit put_object/get_object/delete_object/list_objects/exists; zwei Implementierungen LocalStorage und MinioStorage"
      contains: "class StorageService"
    - path: "app/services/otx_json_tree.py"
      provides: "OtxFile ↔ wire-Format Adapter (load_to_wire, wire_to_otx)"
      contains: "def load_to_wire"
    - path: "app/services/model_service.py"
      provides: "ModelService mit upload_otx, get_wire, save_wire, list_models, delete_model"
      contains: "class ModelService"
    - path: "app/services/lock_service.py"
      provides: "LockService mit acquire/heartbeat/release; DB-Row-basiert mit TTL+Token (Pitfall #4)"
      contains: "class LockService"
    - path: "app/api/v1/models.py"
      provides: "5 Endpoints für /models — upload-otx, list, get, save, delete"
      contains: "@router.post(\"/upload-otx\""
    - path: "app/api/v1/locks.py"
      provides: "3 Endpoints für Lock-Management"
      contains: "/lock/heartbeat"
  key_links:
    - from: "app/api/v1/models.py PUT /models/{id}"
      to: "app/services/lock_service.LockService.validate_token"
      via: "Save-Endpoint MUSS Lock-Token vor Schreiben prüfen (T-04-04 Mitigation)"
      pattern: "lock_service\\.validate_token"
    - from: "app/services/model_service.upload_otx"
      to: "osim_engine.io.otx_loader.load_otx_file + StorageService.put_object"
      via: "Tempfile-Write (Latin-1) → load_otx_file(path) → coverage in response"
      pattern: "load_otx_file"
    - from: "app/services/model_service.save_wire"
      to: "osim_engine.io.otx_writer.dump_simulator_to_otx + StorageService.put_object"
      via: "wire_to_otx() + put_object für v_<timestamp>.otx"
      pattern: "dump_simulator_to_otx"
    - from: "app/api/v1/models.py PUT"
      to: "docs/engine-coverage.md (über Convention)"
      via: "Bei Modellen mit dokumentierter Coverage-Lücke (Bosch2_wechseln-Pattern) → 422 E_OTX_COVERAGE_INCOMPLETE statt Save"
      pattern: "E_OTX_COVERAGE_INCOMPLETE"
---

<objective>
Das Backend-Herzstück der Phase 1: alle Endpoints für OTX-Upload, Tree-Editing-Persistenz, Versionierung und Single-Editor-Lock. Plan 02 hat die Foundation gelegt; dieser Plan füllt sie mit den fachlichen Services. Die Storage-Abstraktion ist so geschnitten, dass Phase 5 sie 1:1 auf GCS umstellen kann (D-03 + User-Entscheidung Minio im docker-compose).

Purpose: SC-3 (Upload→Tree), SC-6 (Edit-Operationen), SC-7 (Lock+Save), SC-8 (versioniertes Save-back) hängen alle an diesem Plan. Ohne diesen Plan gibt es im Frontend nichts zu zeigen.

Output: 8 Endpoints unter /api/v1/models und /api/v1/models/{id}/lock, 4 Services (Storage, OtxJsonTree, Model, Lock), 2 Pydantic-Schema-Files (model, lock). End-to-End-Test via curl + Dummy.otx liefert wire-Format zurück; Save-back schreibt v_<timestamp>.otx ins Storage; Lock-Acquire+Heartbeat+Release funktioniert sequenziell (echter Race-Test in Plan 05).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-vertical-slice/01-CONTEXT.md
@.planning/phases/01-vertical-slice/01-RESEARCH.md
@.planning/phases/01-vertical-slice/01-PATTERNS.md
@.planning/research/osim-engine-api.md
@.planning/phases/01-vertical-slice/01-01-engine-roundtrip-verify-PLAN.md
@.planning/phases/01-vertical-slice/01-02-backend-foundation-PLAN.md
@CLAUDE.md
</context>

<interfaces>
<!-- Aus Plan 02 verfügbar -->

```python
# app/core/database.py
def get_db(request: Request) -> Iterator[Connection]  # sync, search_path gesetzt
engine: Engine
SessionLocal: sessionmaker

# app/core/config.py
settings.storage_backend: str  # "local" | "minio" | "gcs"
settings.minio_endpoint: str
settings.minio_access_key: str
settings.minio_secret_key: str
settings.minio_bucket: str
settings.lock_ttl_seconds: int = 60
settings.lock_max_inactivity_seconds: int = 900

# app/auth/dependencies.py
def get_current_user(request) -> CurrentUser  # {tenant_id, role, email, uid}
def get_tenant_id(request) -> str
def get_user_uid(request) -> str

# app/api/schemas/common.py
class ProblemDetail(BaseModel):
    type, title, status, detail, instance, code

# app/services/auth_service.py — hat bereits per Lazy-Bootstrap angelegt:
# Schema tenant_{uid} mit Tabellen `models` und `model_locks` (Spalten siehe Plan 02 Task 5)
```

```python
# Engine-API (aus Plan 01 verifiziert)
from osim_engine.io.otx_loader import load_otx_file
from osim_engine.io.otx_writer import dump_simulator_to_otx, OtxWriter
from osim_engine.io.otx_reader import parse_otx_file, OtxFile, OtxObject

@dataclass
class LoadResult:
    simulator: PSimulator
    loaded: dict[str, int]
    skipped: dict[str, int]
    unsupported: dict[str, int]
    coverage_ratio: float
    otx: OtxFile

@dataclass
class OtxObject:
    oid: int
    klass: str
    attrs: dict[str, Any]
    sub_refs: list[list[int]]
```

```typescript
// Wire-Format (RESEARCH §Pattern 3 Z.589-606) — Server liefert, Client konsumiert
interface ModelObject {
  oid: number;
  klass: string;
  attrs: Record<string, AttrValue>;
  sub_refs: number[][];
}
interface ModelTreeWire {
  version: 1;
  simulator_oid: number;  // immer 0 per Konvention
  objects: Record<number, ModelObject>;
  coverage: { loaded: number; skipped: number; unsupported: string[] };
  schemas_url: string;  // "/api/v1/schemas/v1" — wird in Plan 07 implementiert
}
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Storage-Abstraktion (StorageService mit LocalStorage + MinioStorage Implementierungen)</name>
  <files>app/services/storage.py, tests/backend/test_storage.py</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/services/storage.py` — konzeptueller Analog tbx_stzrim/datalake/storage.py)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Standard Stack Storage-Abschnitt + §Open Questions #5
    - app/core/config.py (aus Plan 02)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\datalake\storage.py (falls existiert — als GCS-Pattern-Vorlage, sonst übergehen)
  </read_first>
  <behavior>
    - `StorageService` ist ein Protocol/ABC mit Methoden: `put_object(key, data: bytes) -> None`, `get_object(key) -> bytes`, `delete_object(key) -> None`, `delete_prefix(prefix) -> int`, `list_objects(prefix) -> list[str]`, `exists(key) -> bool`.
    - `LocalStorage(root: Path)` legt Files unter `{root}/{key}` ab, normalisiert key (Windows + POSIX-Pfade), erlaubt nested Pfade über `parent.mkdir(parents=True, exist_ok=True)`.
    - `MinioStorage(endpoint, access_key, secret_key, bucket)` nutzt boto3 mit `endpoint_url=f"http://{endpoint}"`, prüft Bucket-Existenz beim Init und legt ihn an wenn fehlt.
    - Factory-Funktion `get_storage() -> StorageService` schaltet basierend auf `settings.storage_backend`: `"local"` → LocalStorage(`Path("./data/storage")`), `"minio"` → MinioStorage(...), `"gcs"` → raise NotImplementedError (Phase 5).
    - Tests gegen LocalStorage decken alle 6 Methoden ab (in-memory via tmp_path-Fixture).
  </behavior>
  <action>
    Erstelle `app/services/storage.py`:
    - Import: `from typing import Protocol, runtime_checkable`, `from pathlib import Path`, `from abc import ABC, abstractmethod`, `import boto3`, `from app.core.config import settings`, `import structlog`.
    - ABC `StorageService` mit 6 abstract methods aus dem `<behavior>`-Block.
    - `LocalStorage(StorageService)`:
      - `__init__(self, root: Path)`: speichert root, `root.mkdir(parents=True, exist_ok=True)`.
      - `put_object(key, data)`: target = self.root / key; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data).
      - `get_object(key)`: return (self.root / key).read_bytes(); FileNotFoundError → raise KeyError(key).
      - `delete_object(key)`: (self.root / key).unlink(missing_ok=True).
      - `delete_prefix(prefix)`: iteriere root / prefix recursive, lösche files, returne Anzahl. Cleanup leere dirs nicht (sicherer).
      - `list_objects(prefix)`: rglob auf self.root / prefix, return relative paths als str (POSIX-style mit "/").
      - `exists(key)`: return (self.root / key).is_file().
    - `MinioStorage(StorageService)`:
      - `__init__(self, endpoint, access_key, secret_key, bucket)`: self._s3 = boto3.client("s3", endpoint_url=f"http://{endpoint}", aws_access_key_id=access_key, aws_secret_access_key=secret_key, region_name="us-east-1") (region beliebig, minio braucht eine); self._bucket = bucket; `_ensure_bucket()` rufen.
      - `_ensure_bucket()`: try self._s3.head_bucket(Bucket=self._bucket); on ClientError → self._s3.create_bucket(Bucket=self._bucket).
      - `put_object(key, data)`: self._s3.put_object(Bucket=self._bucket, Key=key, Body=data).
      - `get_object(key)`: response = self._s3.get_object(...); return response["Body"].read(). NoSuchKey → KeyError.
      - `delete_object(key)`: self._s3.delete_object(...).
      - `delete_prefix(prefix)`: list mit Pagination, batch-delete (delete_objects mit Delete-Block).
      - `list_objects(prefix)`: paginate list_objects_v2, yield Keys.
      - `exists(key)`: try head_object → True / NoSuchKey → False.
    - Factory `get_storage() -> StorageService`:
      - if settings.storage_backend == "local" → return LocalStorage(Path("./data/storage").resolve())
      - elif "minio" → return MinioStorage(settings.minio_endpoint, settings.minio_access_key, settings.minio_secret_key, settings.minio_bucket)
      - elif "gcs" → raise NotImplementedError("GCS-Storage kommt in Phase 5")
      - else → raise ValueError(f"Unknown storage_backend: {settings.storage_backend}")

    Erstelle `tests/backend/test_storage.py`:
    - 6 Tests gegen LocalStorage (tmp_path-Fixture):
      - `test_put_get_roundtrip` — put_object("foo/bar.txt", b"hello") + get_object → b"hello"
      - `test_get_missing_raises_keyerror`
      - `test_delete_object` — put + delete + exists=False
      - `test_delete_prefix_returns_count` — put 3 unter "p/" + delete_prefix("p") → returns 3
      - `test_list_objects_prefix_filter` — put unter "a/" und "b/", list_objects("a") nur a-Files
      - `test_exists_true_false`
    - 1 Test für Factory: `test_factory_local_returns_localstorage` — monkeypatch settings.storage_backend = "local", assert isinstance(get_storage(), LocalStorage).
    - KEIN Minio-Test in dieser Welle (Plan 05 hat docker-compose + minio-laufend; dort kommt ein @requires_minio-Test).
  </action>
  <verify>
    <automated>uv run pytest tests/backend/test_storage.py -x 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    app/services/storage.py exportiert StorageService (ABC), LocalStorage, MinioStorage, get_storage(). 7 Tests grün gegen LocalStorage.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: OTX-JSON-Tree-Adapter (otx_json_tree.py) mit load_to_wire + wire_to_otx</name>
  <files>app/services/otx_json_tree.py, app/api/schemas/model.py, tests/backend/test_otx_json_tree.py</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/services/model_service.py` — Wire-Format-Notiz; Sektion `app/services/otx_json_tree.py` ist Pflicht-Wire-Vorlage)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 3 (Wire-Format) Z.589-685
    - .planning/research/osim-engine-api.md (LoadResult, OtxFile, OtxObject Strukturen)
    - tests/backend/fixtures/otx_models.py (aus Plan 01 — DUMMY_OTX)
    - tests/backend/test_otx_roundtrip.py (aus Plan 01 — Roundtrip-Pattern für Vergleich)
  </read_first>
  <behavior>
    - `load_to_wire(otx_path: Path) -> ModelTreeWire` lädt OTX via load_otx_file, baut Wire mit allen Objekten aus result.otx.by_oid.
    - `wire_to_otx(wire: ModelTreeWire, original_otx_path: Path | None = None) -> str` rekonstruiert OTX-String via Engine-Writer. Hat zwei Strategien (RESEARCH §Pattern 3 Z.685-686):
      - Strategie A (Default): Rekonstruiere OtxFile aus Wire → load via OtxLoader → dump via OtxWriter mit original_otx als Pass-Through.
      - Strategie B (Fallback wenn Loader Coverage-Lücken hat): Direkt Wire → OTX-Text schreiben über einen Wire-zu-OTX-Writer (in dieser Welle: Strategie A; Strategie B als TODO mit Hinweis auf docs/engine-coverage.md).
    - Pydantic-Schemas in app/api/schemas/model.py: `AttrValue` als `Union[int, str, float, bool, None, list[int]]`, `ModelObject`, `ModelCoverage`, `ModelTreeWire`, `ModelMeta` (id, name, created_at, original_storage_key, current_version_key).
    - Test `test_load_to_wire_dummy` lädt Dummy.otx, prüft dass wire.simulator_oid in wire.objects ist, dass `len(wire.objects) > 0`, dass coverage.loaded > 0.
    - Test `test_load_wire_roundtrip_dummy` macht Wire→OTX→Wire-Diff (Object-Count und OID-Set vergleichen).
  </behavior>
  <action>
    Erstelle `app/api/schemas/model.py`:
    - `from pydantic import BaseModel, ConfigDict`
    - `from typing import Annotated`
    - `from uuid import UUID`
    - `from datetime import datetime`
    - `AttrValue = int | str | float | bool | None | list[int]`
    - `class ModelObject(BaseModel)`: model_config = ConfigDict(populate_by_name=True). Fields: oid: int, klass: str, attrs: dict[str, AttrValue], sub_refs: list[list[int]]
    - `class ModelCoverage(BaseModel)`: loaded: int, skipped: int, unsupported: list[str]
    - `class ModelTreeWire(BaseModel)`: version: Literal[1] = 1, simulator_oid: int = 0, objects: dict[int, ModelObject], coverage: ModelCoverage, schemas_url: str = "/api/v1/schemas/v1"
    - `class ModelMeta(BaseModel)`: id: UUID, name: str, created_at: datetime, original_storage_key: str, current_version_key: str | None, created_by_uid: str
    - `class UploadOtxResponse(BaseModel)`: model: ModelMeta, wire: ModelTreeWire
    - `class GetModelResponse(BaseModel)`: model: ModelMeta, wire: ModelTreeWire
    - `class SaveModelRequest(BaseModel)`: wire: ModelTreeWire, lock_token: UUID
    - `class SaveModelResponse(BaseModel)`: model: ModelMeta, saved_version_key: str

    Erstelle `app/services/otx_json_tree.py`:
    - `from osim_engine.io.otx_loader import load_otx_file`
    - `from osim_engine.io.otx_writer import dump_simulator_to_otx`
    - `from osim_engine.io.otx_reader import parse_otx_file`
    - `def load_to_wire(otx_path: Path) -> ModelTreeWire`:
      - `result = load_otx_file(otx_path)`
      - `objects = {oid: ModelObject(oid=oid, klass=obj.klass, attrs=obj.attrs, sub_refs=obj.sub_refs) for oid, obj in result.otx.by_oid.items()}`
      - `coverage = ModelCoverage(loaded=sum(result.loaded.values()), skipped=sum(result.skipped.values()), unsupported=list(result.unsupported.keys()))`
      - `return ModelTreeWire(simulator_oid=0, objects=objects, coverage=coverage)`
    - `def wire_to_otx(wire: ModelTreeWire, original_otx_path: Path | None = None) -> str`:
      - Strategie A: Rekonstruiere ein OtxFile aus wire (manuell OtxObject-Instanzen bauen), schreibe in tempfile, lade via `load_otx_file(tmp)`, dump via `dump_simulator_to_otx(result.simulator, original_otx=original or result.otx, include_unsupported_passthrough=True)`.
      - Wenn original_otx_path gegeben: original = parse_otx_file(original_otx_path), sonst original=None und Writer nutzt result.otx als Pass-Through-Quelle.
      - Implementierungs-Hinweis: weil Wire→OtxFile-Rekonstruktion umfangreich ist, kann das Skelett als "raises NotImplementedError" beginnen UND als Erstes nur den happy-path für Dummy.otx (loaded-Klassen aus Plan 01-SUMMARY) abdecken. Bosch2_wechseln und Fertigungsstruktur1 werden nach docs/engine-coverage.md gesteuert.
    - `def is_save_safe(wire: ModelTreeWire) -> tuple[bool, str | None]`:
      - Prüft `wire.coverage.unsupported` gegen Whitelist aus docs/engine-coverage.md (Phase 1: harte Whitelist im Code).
      - Returnt (True, None) wenn save-safe; (False, "E_OTX_COVERAGE_INCOMPLETE") wenn nicht.

    Erstelle `tests/backend/test_otx_json_tree.py`:
    - `@pytest.mark.requires_engine`
    - `test_load_to_wire_dummy(dummy_otx_path)`: wire = load_to_wire(dummy_otx_path); assert wire.simulator_oid == 0; assert 0 in wire.objects (Simulator-Oid); assert wire.coverage.loaded > 0.
    - `test_load_to_wire_returns_pydantic_types`: prüfen dass wire.objects[0] ist ModelObject (Pydantic-Validierung).
    - `test_wire_to_otx_dummy_roundtrip(dummy_otx_path)`: load_to_wire → wire_to_otx → schreibe in tempfile (Latin-1!) → parse_otx_file → vergleiche set(by_oid.keys()) zwischen Original und Roundtrip. Darf NICHT mit unsupported-Lücken durchfallen.
    - `test_is_save_safe_dummy_returns_true`: assert is_save_safe(load_to_wire(dummy_otx_path)) == (True, None).
  </action>
  <verify>
    <automated>uv run pytest tests/backend/test_otx_json_tree.py -x -m requires_engine 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    app/api/schemas/model.py exportiert 7 Pydantic-Modelle. app/services/otx_json_tree.py exportiert load_to_wire, wire_to_otx, is_save_safe. 4 Tests grün. Wire-Format ist symmetrisch zu OtxObject.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: LockService (DB-Row + TTL + Heartbeat + Stale-Cleanup)</name>
  <files>app/services/lock_service.py, app/api/schemas/lock.py, tests/backend/test_lock_service.py</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Code Examples Example 3 (Z.1057-1116) + §Common Pitfalls #4 (Stale Lock)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/services/lock_service.py + app/api/v1/locks.py`)
    - .planning/phases/01-vertical-slice/01-CONTEXT.md D-13 (Single-Editor-Lock, 15 min Inaktivität)
    - app/core/database.py + app/services/auth_service.py (model_locks-DDL aus Plan 02 Task 5 — Spalten: model_id UUID PK, owner_user_uid TEXT, acquired_at TIMESTAMP, expires_at TIMESTAMP, token UUID)
  </read_first>
  <behavior>
    - `LockService(conn: Connection)` ist sync, nutzt eine bereits durch `get_db` etablierte Connection mit search_path TO tenant_X.
    - `acquire(model_id, user_uid) -> AcquireResult` legt INSERT mit expires_at = NOW() + lock_ttl_seconds an. Bei IntegrityError → lese aktuellen Lock-Owner, returne AcquireResult(success=False, owner_uid=..., expires_at=...).
    - Vor Insert: Stale-Cleanup `DELETE FROM model_locks WHERE model_id=:mid AND expires_at < NOW()` (Pitfall #4).
    - `heartbeat(model_id, token, user_uid) -> HeartbeatResult` aktualisiert expires_at = NOW() + lock_ttl_seconds wenn (model_id, token, user_uid) matched UND expires_at noch >= NOW(). Bei No-Match → returne HeartbeatResult(success=False, reason="expired_or_invalid_token").
    - `release(model_id, token, user_uid) -> bool` DELETE wenn (model_id, token, user_uid) matched.
    - `validate_token(model_id, token, user_uid) -> bool` prüft ob Lock noch hält + Token + Owner stimmt (für Save-Endpoint).
    - `cleanup_stale() -> int` DELETE alle abgelaufenen Locks (für periodischen Job oder vor acquire).
    - Pydantic-Schemas: `LockOut(token: UUID, expires_at: datetime)`, `LockConflict(code: str = "E_MODEL_LOCKED", owner_user_uid: str, owner_email: str | None, expires_at: datetime)`, `HeartbeatRequest(token: UUID)`, `HeartbeatResponse(expires_at: datetime)`.
    - Tests verwenden ein in-memory SQLite-Adapter oder Mock-Connection — KEIN echtes Postgres in dieser Task (kommt in Plan 05).
  </behavior>
  <action>
    Erstelle `app/api/schemas/lock.py`:
    - `from pydantic import BaseModel; from uuid import UUID; from datetime import datetime`
    - `class LockOut(BaseModel)`: token: UUID, expires_at: datetime
    - `class LockConflict(BaseModel)`: code: str = "E_MODEL_LOCKED", owner_user_uid: str, owner_email: str | None = None, expires_at: datetime
    - `class HeartbeatRequest(BaseModel)`: token: UUID
    - `class HeartbeatResponse(BaseModel)`: expires_at: datetime
    - `class AcquireResult(BaseModel)`: success: bool, token: UUID | None = None, expires_at: datetime | None = None, conflict: LockConflict | None = None

    Erstelle `app/services/lock_service.py`:
    - `from sqlalchemy import text`
    - `from sqlalchemy.engine import Connection`
    - `from sqlalchemy.exc import IntegrityError`
    - `from datetime import datetime, timedelta`
    - `from uuid import UUID`
    - `from app.core.config import settings`
    - `from app.api.schemas.lock import LockConflict, AcquireResult, HeartbeatResponse`
    - `class LockService`:
      - `def __init__(self, conn: Connection): self.conn = conn`
      - `def cleanup_stale(self) -> int`: `result = self.conn.execute(text("DELETE FROM model_locks WHERE expires_at < NOW()"))`; return result.rowcount or 0
      - `def acquire(self, model_id: UUID, user_uid: str) -> AcquireResult`:
        - self.cleanup_stale()
        - `expires_at = datetime.utcnow() + timedelta(seconds=settings.lock_ttl_seconds)` — Python-seitige TTL-Berechnung; PostgreSQL-`INTERVAL`-Strings sind NICHT parametrisierbar, daher Datetime als gebundener Parameter (KEIN String-Interpolation).
        - try: `result = self.conn.execute(text("INSERT INTO model_locks(model_id, owner_user_uid, expires_at) VALUES(:mid, :uid, :exp) RETURNING token, expires_at"), {"mid": model_id, "uid": user_uid, "exp": expires_at})`
        - row = result.one(); return AcquireResult(success=True, token=row.token, expires_at=row.expires_at)
        - except IntegrityError: rollback, query existing lock: `r = self.conn.execute(text("SELECT owner_user_uid, expires_at FROM model_locks WHERE model_id=:mid"), {"mid": model_id}).one_or_none()`; if r: return AcquireResult(success=False, conflict=LockConflict(owner_user_uid=r.owner_user_uid, expires_at=r.expires_at))
      - `def heartbeat(self, model_id, token, user_uid) -> HeartbeatResponse | None`:
        - new_expires = datetime.utcnow() + timedelta(seconds=settings.lock_ttl_seconds)
        - `UPDATE model_locks SET expires_at=:new WHERE model_id=:mid AND token=:tok AND owner_user_uid=:uid AND expires_at >= NOW() RETURNING expires_at`
        - row = result.one_or_none(); if not row: return None; else return HeartbeatResponse(expires_at=row.expires_at)
      - `def release(self, model_id, token, user_uid) -> bool`:
        - `DELETE FROM model_locks WHERE model_id=:mid AND token=:tok AND owner_user_uid=:uid RETURNING token`
        - return bool(result.scalar())
      - `def validate_token(self, model_id, token, user_uid) -> bool`:
        - `SELECT 1 FROM model_locks WHERE model_id=:mid AND token=:tok AND owner_user_uid=:uid AND expires_at >= NOW()`
        - return bool(result.scalar_one_or_none())

    Erstelle `tests/backend/test_lock_service.py`:
    - Mock-Connection via SQLAlchemy `create_engine("sqlite:///:memory:")` mit gleicher model_locks-Tabelle (SQLite-DDL angepasst: UUID → TEXT, NOW() → CURRENT_TIMESTAMP). SQLite-Version der DDL als Fixture.
    - Hinweis im Test-Header: "Diese Tests laufen gegen SQLite-Mock. Echte Postgres-Integration in Plan 05 test_lock_endpoints.py."
    - Tests:
      - `test_acquire_succeeds_on_free_model`: acquire → success=True, token gesetzt.
      - `test_acquire_conflicts_if_held_by_other`: acquire(model_X, user_A) success; acquire(model_X, user_B) → success=False, conflict.owner_user_uid == user_A.
      - `test_heartbeat_extends_expires_at`: acquire, sleep 0.1s, heartbeat → new expires_at > original.
      - `test_heartbeat_fails_with_wrong_token`: acquire, heartbeat mit anderem token → None.
      - `test_release_removes_lock`: acquire, release(model, token, user) → True; second acquire(model, other_user) → success=True.
      - `test_validate_token_true_for_owner`: acquire + validate_token(mid, token, user) → True.
      - `test_cleanup_stale_removes_expired`: acquire, manuell expires_at = NOW() - 1s; cleanup_stale → 1.
    - Verwendung des Decorators NICHT @pytest.mark.requires_postgres — SQLite reicht.
  </action>
  <verify>
    <automated>uv run pytest tests/backend/test_lock_service.py -x 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    app/services/lock_service.py + app/api/schemas/lock.py existieren. 7 Tests grün gegen SQLite-Mock. LockService bietet acquire/heartbeat/release/validate/cleanup.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: ModelService (upload_otx + get_wire + save_wire + list + delete)</name>
  <files>app/services/model_service.py, tests/backend/test_model_service.py</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/services/model_service.py` Skelett)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #3 (Latin-1) + #7 (Coverage-Lücken)
    - app/services/storage.py (aus Task 1)
    - app/services/otx_json_tree.py (aus Task 2)
    - app/api/schemas/model.py (aus Task 2)
    - .planning/phases/01-vertical-slice/01-CONTEXT.md D-03 (Storage-Layout), D-14 (Original unverändert)
    - tests/backend/fixtures/otx_models.py (aus Plan 01)
  </read_first>
  <behavior>
    - `ModelService(conn, storage, tenant_id, user_uid)` als sync Service.
    - `upload_otx(name, content: bytes) -> ModelMeta`:
      - Erzeuge model_id (UUID).
      - storage_key_original = f"tenants/{tenant_id}/models/{model_id}/original.otx"; persistiere content (RAW Bytes — KEINE Re-Codierung; Latin-1 ist im Content).
      - DB-Insert: `INSERT INTO models(id, name, storage_key, original_storage_key, created_by_uid) VALUES(...) RETURNING id, created_at`.
      - storage_key initial == original_storage_key (kein Save-back bislang).
      - return ModelMeta.
    - `get_wire(model_id) -> ModelTreeWire`:
      - SELECT storage_key FROM models WHERE id=:mid
      - storage.get_object(storage_key) → tempfile schreiben (Latin-1-pass-through, einfach bytes)
      - return load_to_wire(Path(tempfile))
    - `save_wire(model_id, wire) -> str` (returns new storage_key):
      - is_save_safe(wire) → falls False: raise HTTPException(422, detail={"code":"E_OTX_COVERAGE_INCOMPLETE", "message":...})
      - SELECT original_storage_key FROM models WHERE id=:mid → original_bytes für Pass-Through laden
      - Original in tempfile schreiben → original_path
      - otx_text = wire_to_otx(wire, original_otx_path=original_path)
      - timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
      - new_key = f"tenants/{tenant_id}/models/{model_id}/v_{timestamp}.otx"
      - storage.put_object(new_key, otx_text.encode("latin-1")) (D-14 Latin-1!)
      - UPDATE models SET storage_key=:new_key WHERE id=:mid
      - return new_key
    - `list_models() -> list[ModelMeta]`: SELECT * FROM models ORDER BY created_at DESC
    - `delete_model(model_id) -> None`:
      - storage.delete_prefix(f"tenants/{tenant_id}/models/{model_id}/")
      - DELETE FROM models WHERE id=:mid (Lock kaskadiert via FK ON DELETE CASCADE)
    - Tests gegen LocalStorage + SQLite-Mock-Connection für models-Tabelle.
  </behavior>
  <action>
    Erstelle `app/services/model_service.py` nach <behavior>-Block.
    - Imports: pathlib.Path, tempfile, datetime, uuid, sqlalchemy.text, fastapi.HTTPException, app-eigene
    - Konvention: storage_key-Format als Modul-Konstante: `_STORAGE_PREFIX_TEMPLATE = "tenants/{tenant_id}/models/{model_id}"`
    - Helper `_to_storage_key(tenant_id, model_id, filename)` → f"{_STORAGE_PREFIX_TEMPLATE.format(...)}/{filename}"
    - Latin-1-Encoding muss strikt durchgängig sein: bytes lesen, bytes schreiben, intern als str via .decode("latin-1") nur wenn unbedingt nötig (osim_engine.io.otx_loader.load_otx_file erwartet einen Path, also tempfile.NamedTemporaryFile mit suffix=".otx" und schreibe bytes; KEINE encoding-Konvertierung).
    - Bei Upload-Größe > 30 MB → HTTPException(413, detail={"code":"E_UPLOAD_TOO_LARGE","message":"..."}).
    - Bei MIME-Check: in upload_otx erwartet content_type "application/octet-stream" oder "application/x-otx" oder "text/plain"; sonst HTTPException(415, "E_INVALID_OTX_MIMETYPE"). MIME wird vom Caller (api/v1/models.py) übergeben.

    Erstelle `tests/backend/test_model_service.py`:
    - `@pytest.mark.requires_engine`
    - Fixtures: in-memory SQLite-Engine mit models-Tabelle (SQLite-Adapter, UUID als TEXT), tmp_path-LocalStorage, ModelService-Instanz.
    - Tests:
      - `test_upload_otx_stores_original_and_returns_meta(dummy_otx_path)`: read bytes, upload_otx("Dummy", bytes) → meta.name=="Dummy", meta.original_storage_key endet auf "/original.otx", meta.current_version_key == None (initial). storage.exists(meta.original_storage_key) == True.
      - `test_get_wire_returns_loaded_tree(dummy_otx_path)`: upload + get_wire(meta.id) → wire.coverage.loaded > 0.
      - `test_save_wire_creates_versioned_key(dummy_otx_path)`: upload + get_wire + modify wire (z.B. ein attr setzen) + save_wire(id, wire) → new_key endet auf "/v_*.otx". storage.exists(meta.original_storage_key) noch True (D-14!).
      - `test_save_wire_rejects_incomplete_coverage`: baue Wire mit unsupported=["FooBar"], save_wire → HTTPException(422) mit code=E_OTX_COVERAGE_INCOMPLETE.
      - `test_list_models_returns_sorted`: upload zwei Modelle, list_models gibt beide DESC sortiert.
      - `test_delete_model_removes_storage_and_db`: upload, delete, get_wire() → 404 / SELECT returns None. storage.list_objects(prefix) == [].
  </action>
  <verify>
    <automated>uv run pytest tests/backend/test_model_service.py -x -m requires_engine 2>&amp;1 | tail -10</automated>
  </verify>
  <done>
    app/services/model_service.py exportiert ModelService mit 5 Methoden. 6 Tests grün gegen LocalStorage + SQLite-Mock. Latin-1-Encoding wird strikt eingehalten. Original-OTX bleibt unverändert beim Save-back.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: API-Endpoints /models (5 endpoints) und /models/{id}/lock (3 endpoints)</name>
  <files>app/api/v1/models.py, app/api/v1/locks.py, app/api/v1/router.py, app/api/v1/health.py</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/api/v1/router.py`, `app/services/lock_service.py + app/api/v1/locks.py`)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Code Examples Example 3
    - app/services/model_service.py + lock_service.py (aus Task 3+4)
    - app/auth/dependencies.py (get_current_user — aus Plan 02)
    - app/core/database.py (get_db — aus Plan 02)
    - app/services/storage.py (get_storage — aus Task 1)
  </read_first>
  <behavior>
    - `POST /api/v1/models/upload-otx` (multipart): UploadFile + name als Form-Field; antwortet UploadOtxResponse.
    - `GET /api/v1/models`: Liste aller Modelle des Tenants.
    - `GET /api/v1/models/{id}`: GetModelResponse mit aktuellem Wire + Meta.
    - `PUT /api/v1/models/{id}`: SaveModelRequest{wire, lock_token}; prüft Lock-Token; bei OK → save_wire; antwortet SaveModelResponse. Bei ungültigem Lock-Token → 423 Locked mit code=E_LOCK_EXPIRED.
    - `DELETE /api/v1/models/{id}`: 204 nach Erfolg.
    - `POST /api/v1/models/{id}/lock`: LockOut bei Success; bei Konflikt → 409 mit body=LockConflict.
    - `POST /api/v1/models/{id}/lock/heartbeat`: HeartbeatResponse bei Erfolg; bei Mismatch → 404 mit code=E_LOCK_EXPIRED.
    - `DELETE /api/v1/models/{id}/lock?token=<>`: 204.
    - `/health` erweitert um optionalen Storage-Check (settings.storage_backend Wert wird im Response zurückgegeben; Storage-Ping als Best-Effort).
  </behavior>
  <action>
    Erstelle `app/api/v1/models.py`:
    - `from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException`
    - `from uuid import UUID`
    - `router = APIRouter(tags=["models"])`
    - Helper-Dep `def get_model_service(request: Request, conn = Depends(get_db)) -> ModelService`: erstelle Storage via get_storage(), instanziere ModelService(conn, storage, tenant_id, user_uid). Tenant-/User-Ids aus request.state.
    - Helper-Dep `def get_lock_service(conn = Depends(get_db)) -> LockService`: return LockService(conn).
    - Endpoints (alle mit `user: CurrentUser = Depends(get_current_user)` — Auth-Gate):
      - `POST "/upload-otx"`: nimmt file: UploadFile = File(...), name: str = Form(...); content = await file.read(); validate len(content) <= 30*1024*1024; validate file.content_type in {"application/octet-stream", "application/x-otx", "text/plain", None}; meta = service.upload_otx(name, content); wire = service.get_wire(meta.id); return UploadOtxResponse(model=meta, wire=wire).
      - `GET ""` (list): models = service.list_models(); return [...]
      - `GET "/{model_id}"`: meta = service.get_meta(model_id); wire = service.get_wire(model_id); return GetModelResponse(model=meta, wire=wire). 404 wenn nicht gefunden.
      - `PUT "/{model_id}"`: body: SaveModelRequest; if not lock_service.validate_token(model_id, body.lock_token, user.uid) → raise HTTPException(423, detail={"code":"E_LOCK_EXPIRED","message":"..."}); **lock_service.heartbeat(model_id, body.lock_token, user.uid)** (Save ist Aktivitätsbeweis und verlängert die Lock-TTL — verhindert Race, dass ein langer Save während sehr knapper TTL den Lock verliert und nachfolgende Edits mit 423 scheitern); new_key = service.save_wire(model_id, body.wire); meta = service.get_meta(model_id); return SaveModelResponse(model=meta, saved_version_key=new_key).
      - `DELETE "/{model_id}"`: service.delete_model(model_id); return Response(status_code=204).

    Erstelle `app/api/v1/locks.py`:
    - `router = APIRouter(tags=["locks"])`
    - Endpoints:
      - `POST "/models/{model_id}/lock"`: result = lock_service.acquire(model_id, user.uid); if not result.success → raise HTTPException(409, detail=result.conflict.model_dump() | {"code":"E_MODEL_LOCKED","message":"Modell ist gesperrt"}); return LockOut(token=result.token, expires_at=result.expires_at).
      - `POST "/models/{model_id}/lock/heartbeat"`: body: HeartbeatRequest; resp = lock_service.heartbeat(model_id, body.token, user.uid); if not resp → raise HTTPException(404, detail={"code":"E_LOCK_EXPIRED","message":"..."}); return resp.
      - `DELETE "/models/{model_id}/lock"`: token: UUID (query-param); released = lock_service.release(model_id, token, user.uid); return Response(status_code=204).

    Aktualisiere `app/api/v1/router.py`:
    - `from app.api.v1.models import router as models_router`
    - `from app.api.v1.locks import router as locks_router`
    - `api_router.include_router(models_router, prefix="/models")`
    - `api_router.include_router(locks_router)` (Lock-Endpoints haben prefix "/models" im Pfad selbst, kein Router-Prefix)

    Erweitere `app/api/v1/health.py`:
    - Optional: storage-ping via storage.exists("_health_probe"). Im Antwort-Body: `{"status", "db", "storage": settings.storage_backend, "version"}`. Storage-Check NICHT failure-relevant — nur informational.
  </action>
  <verify>
    <automated>uv run python -c "from app.main import app; from fastapi.testclient import TestClient; c = TestClient(app); r = c.get('/health'); print('health:', r.status_code, r.json()); r = c.post('/api/v1/models/upload-otx'); print('upload no auth:', r.status_code); print('routes:', sorted([(r.path, list(r.methods or [])) for r in app.routes if hasattr(r, 'path')])[:20])"</automated>
  </verify>
  <done>
    8 neue Endpoints registriert. /health zeigt storage-Feld. /upload-otx ohne Auth → 401 (Middleware). Echte E2E-Tests mit Postgres + Minio kommen in Plan 05.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → /upload-otx | UploadFile-Inhalt ist user-supplied; max 30MB, MIME-Whitelist, Filename wird IGNORIERT (Path-Traversal-Schutz) |
| Browser → PUT /models/{id} | wire-Body ist user-supplied; Pydantic-Validierung schützt Schema; lock_token verhindert konkurrentes Schreiben |
| Browser → /lock/heartbeat | Token muss zum Owner passen; verhindert Lock-Diebstahl |
| Backend → Storage (Minio/Local) | storage_key wird serverseitig generiert (Tenant-Pfad-prefixed), nicht aus User-Input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04-01 | Tampering | OTX-Upload als Path-Traversal-Vektor | mitigate | Filename aus UploadFile wird IGNORIERT; storage_key serverseitig konstruiert `tenants/{tid}/models/{uuid}/original.otx` |
| T-04-02 | DoS | Mega-OTX-Upload (z.B. 1GB) | mitigate | size-Check vor put_object: if len(content) > 30 * 1024 * 1024 → 413 E_UPLOAD_TOO_LARGE |
| T-04-03 | Information Disclosure | Cross-Tenant Storage-Zugriff | mitigate | StorageService bekommt tenant_id im storage_key prefix; ModelService konstruiert Keys mit Tenant-Pfad; KEIN direkter Storage-Zugriff aus dem Frontend (alles via API) |
| T-04-04 | Tampering | Lock-Bypass via direkter PUT-Request ohne Token | mitigate | PUT /models/{id} MUSS lock_token im Body validieren; ohne → 423 Locked; validate_token prüft model_id + token + owner_uid + expires_at |
| T-04-05 | Tampering | Lock-Diebstahl: anderer User raidet token | mitigate | lock_locks.token ist UUIDv4; nur Owner kennt token; heartbeat prüft owner_user_uid + token |
| T-04-06 | Information Disclosure | Lock-Conflict-Response leakt owner_user_uid | accept | Owner-Info ist gewünscht (D-13: "Modell wird gerade von [User] bearbeitet"); kein PII über uid hinaus |
| T-04-07 | Repudiation | Save-back ohne Audit-Trail | mitigate (partiell) | structlog mit tenant_id/user_uid bei jedem save_wire; vollständiges Audit-Log in Phase 5 |
| T-04-08 | Tampering | XSS via OTX-Strings im Wire-Format | mitigate | Wire wird vom Frontend in React gerendert (auto-escape); KEIN dangerouslySetInnerHTML; Pydantic-Validation lässt Strings durch (kein eval) |
| T-04-09 | DoS | Sehr lange Bosch2-Wechseln-Roundtrips blockieren API-Worker | accept | Phase 1: sync Loader im API-Process. Phase 2 verschiebt Sim-Lauf in Worker; Modell-Edit bleibt sync. Bei 18 MB-Files unter 5s pro load_otx — akzeptabel. |
| T-04-10 | Information Disclosure | Storage-Bucket-Enumeration via list_objects | mitigate | list_objects nur intern (ModelService); kein public-API-Endpoint; alle Reads über apiFetch mit Auth |
| T-04-11 | Tampering | Wire-Format akzeptiert beliebige Engine-Klassen → Loader-Crash | mitigate | save_wire ruft is_save_safe(wire) → bei unsupported-Klassen → 422 statt Loader-Crash |
</threat_model>

<verification>
- `uv run pytest tests/backend/test_storage.py tests/backend/test_otx_json_tree.py tests/backend/test_lock_service.py tests/backend/test_model_service.py -x` grün (~20 Tests)
- `uv run python -c "from app.main import app; ..."` listet alle 8 neuen Endpoints
- TestClient-Smoke: `/health` antwortet mit storage-Feld; `/api/v1/models/upload-otx` ohne Token → 401
- End-to-End-Test mit echtem Postgres + Minio kommt in Plan 05 (`test_models_endpoints.py`, `test_lock_endpoints.py`)
</verification>

<success_criteria>
SC-3 (Upload→Tree): /upload-otx implementiert; Live-Test in Plan 05 mit Dummy.otx + curl.
SC-6 (Edit-Operationen): GET + PUT /models/{id} implementiert; Frontend-Edit-Hooks in Plan 11.
SC-7 (Lock + Auto-Save): /lock + /heartbeat + /lock?token implementiert; Frontend-Heartbeat in Plan 11.
SC-8 (versioniertes Save-back): save_wire schreibt v_<timestamp>.otx; Original bleibt unverändert (Test in Plan 05 + Plan 04 Task 4).
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-04-SUMMARY.md` with:
- Liste aller 8 Endpoints mit Beispiel-curl-Aufruf
- Wire-Format-Schema (sollte Plan 06+ als Referenz lesen)
- Storage-Layout-Konvention `tenants/{tid}/models/{mid}/(original.otx|v_<timestamp>.otx)`
- Lock-State-Diagramm (acquire → heartbeat ×N → release / heartbeat-fail → re-acquire)
- Bekannte Limits: 30MB Upload, lock_ttl_seconds=60, lock_max_inactivity=900 (siehe settings)
- Was Plan 05 noch hinzufügen muss: docker-compose-Stack mit Postgres+Firebase+Minio, End-to-End-Tests gegen lebende Services
</output>
</content>
</invoke>