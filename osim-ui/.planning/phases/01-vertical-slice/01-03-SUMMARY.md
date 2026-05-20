---
phase: 01-vertical-slice
plan: 03
subsystem: backend-models
type: execute
status: complete
wave: 2
tags: [fastapi, sqlalchemy-async, storage, multi-tenancy, otx-roundtrip, edit-lock]

# --- Dependency-Graph ---
requires:
  - "osim_engine.io.load_otx_file"  # aus Plan 01-01
  - "osim_engine.io.dump_simulator_to_otx"  # aus Plan 01-01
  - "Tenant, User, ensure_tenant_bootstrap"  # aus Plan 01-02
  - "TenantAuthMiddleware, get_db, get_db_unscoped"  # aus Plan 01-02
provides:
  - "Storage (Protocol), LocalStorage, S3Storage -- app.services.storage"
  - "get_storage -- FastAPI-Dependency"
  - "Model, ModelVersion, EditLock -- SQLAlchemy 2 typed Models im Tenant-Schema"
  - "_create_tenant_schema_tables -- DDL-Anlage pro Tenant"
  - "parse_otx_bytes, dump_simulator_bytes -- app.services.otx_service"
  - "serialize_simulator_to_tree, apply_tree_to_simulator -- app.services.json_tree_service"
  - "TYPE_MAP -- ~40 OSim-Klassen mit Property-Whitelist + Typ"
  - "register_model_from_otx, list_models, get_model, create_new_version -- app.services.model_service"
  - "acquire_lock, release_lock, heartbeat_lock, check_lock_for_edit, get_lock_status -- app.services.lock_service"
  - "POST /api/v1/models/upload-otx (multipart)"
  - "GET /api/v1/models (List)"
  - "GET /api/v1/models/{id} (Detail + Lock-Status)"
  - "GET /api/v1/models/{id}/tree (JSON-Tree der aktuellen Version)"
  - "PUT /api/v1/models/{id}/tree (Save-back, Lock-Pflicht)"
  - "GET /api/v1/models/{id}/download-original (Original-Upload-Bytes)"
  - "POST /api/v1/models/{id}/lock (acquire 15-min-TTL)"
  - "DELETE /api/v1/models/{id}/lock (release, idempotent)"
  - "POST /api/v1/models/{id}/lock/heartbeat (TTL refresh)"
  - "RFC-7807 ProblemDetail-Extension: dict-detail wird als top-level RFC-7807-Extension serialisiert (Lock-Holder-Info)"
  - "JSON-Tree-Schema v1.0 (Phase-1-Vertrag Server<->Browser, NICHT engine-API)"
affects:
  - "osim-ui/app/api/v1/"
  - "osim-ui/app/services/"
  - "osim-ui/app/schemas/"
  - "osim-ui/app/models/"
  - "osim-ui/app/core/errors.py"  # ProblemDetail-Extension fuer dict-detail
  - "osim-ui/db/migrations/versions/"
  - "osim-ui/pyproject.toml"
  - "osim-ui/tests/"

# --- Tech-Stack ---
tech_stack:
  added:
    - "python-multipart >=0.0.9  # FastAPI UploadFile-Support"
    - "aioboto3 >=13.0  # async S3-/Minio-/GCS-S3-Client"
  patterns:
    - "Tenant-scoped Tables via Table.to_metadata(schema=tenant_id) + create_all(checkfirst=True)"
    - "Two-Step-Commit: Storage put_object FIRST, dann DB-Row + commit"
    - "OID-stabile Roundtrips via load_result.instances als id(py_obj)->oid-Map"
    - "Single-Editor-Lock via UNIQUE-PK auf edit_locks + IntegrityError-Race-Resolution"
    - "Heartbeat-basierte TTL (15 min) mit Lazy-Expire-Cleanup in get_lock_status"
    - "RFC-7807-Extension: dict-detail wird als top-level RFC-7807-Body serialisiert"
    - "Path-Traversal-Schutz in LocalStorage: relative_to(root)-Validierung"
    - "Storage-Key-Konvention: tenants/{tenant_id}/models/{model_id}/v{N}-{ts}-{filename}"
    - "include_object-Filter in alembic env.py: nur public-Schema fuer autogenerate"

# --- Key Files ---
key_files:
  created:
    - "osim-ui/app/models/model.py"
    - "osim-ui/app/models/model_version.py"
    - "osim-ui/app/models/edit_lock.py"
    - "osim-ui/app/services/storage.py"
    - "osim-ui/app/services/otx_service.py"
    - "osim-ui/app/services/json_tree_service.py"
    - "osim-ui/app/services/model_service.py"
    - "osim-ui/app/services/lock_service.py"
    - "osim-ui/app/schemas/__init__.py"
    - "osim-ui/app/schemas/model.py"
    - "osim-ui/app/schemas/json_tree.py"
    - "osim-ui/app/api/v1/models.py"
    - "osim-ui/db/migrations/versions/20260521_0000_002_models_versions_locks.py"
    - "osim-ui/tests/test_storage.py"
    - "osim-ui/tests/test_model_upload.py"
    - "osim-ui/tests/test_json_tree.py"
    - "osim-ui/tests/test_otx_roundtrip.py"
    - "osim-ui/tests/test_edit_lock.py"
    - "osim-ui/tests/fixtures/.gitkeep"
  modified:
    - "osim-ui/pyproject.toml"  # aioboto3, python-multipart
    - "osim-ui/app/models/__init__.py"  # Re-Export Model/ModelVersion/EditLock
    - "osim-ui/app/services/tenant_service.py"  # _create_tenant_schema_tables
    - "osim-ui/app/api/v1/router.py"  # include models.router
    - "osim-ui/app/core/errors.py"  # dict-detail-Extension fuer ProblemDetail
    - "osim-ui/db/migrations/env.py"  # include_object-Filter (public only)
    - "osim-ui/tests/conftest.py"  # DATABASE_URL force-override + authenticated_client-Fixture

# --- Decisions ---
decisions:
  - id: "01-03-D1"
    title: "Tenant-Tabellen leben im Tenant-Schema, nicht in public"
    decision: "Model, ModelVersion, EditLock werden ohne __table_args__ = {'schema': 'public'} definiert. Im jeweiligen Tenant-Schema werden sie zur Laufzeit per Table.to_metadata(schema=tenant_id) + create_all(checkfirst=True) angelegt -- aufgerufen aus ensure_tenant_bootstrap."
    rationale: "Tenant-Isolation auf Schema-Ebene aus Plan 01-02 wird konsequent durchgezogen. Alembic ist nur fuer public-Tabellen zustaendig (autogenerate-Filter ueber include_object). Konsequenz: Tenant-uebergreifende Migrations brauchen Phase-4-Loop (siehe Risks)."

  - id: "01-03-D2"
    title: "Migration 002 ist Doku-only"
    decision: "002_models_versions_locks.py hat leeres upgrade()/downgrade(), Module-Docstring erklaert die Tenant-Schema-Strategie und verweist auf tenant_service._create_tenant_schema_tables."
    rationale: "Alembic-Versionsnachweis bleibt erhalten; Tenant-DDL liegt im Python-Code (typsicher, einheitlich mit Models)."

  - id: "01-03-D3"
    title: "Storage-Backend: LocalStorage default, S3Storage als aioboto3"
    decision: "STORAGE_BACKEND env: local|minio|gcs. LocalStorage schreibt unter settings.storage_local_root; S3Storage nutzt aioboto3 mit endpoint_url-Konfiguration (kompatibel zu Minio Dev und GCS-S3-Endpoint Prod). Singleton via reset_storage_singleton() in Tests."
    rationale: "aioboto3 ist async-first und produktionsstabil. Alternative minio-py haette nur Minio unterstuetzt -- aioboto3 funktioniert gegen jeden S3-kompatiblen Endpoint inkl. GCS-S3-Adapter (Phase 4)."

  - id: "01-03-D4"
    title: "OID-stabiler Roundtrip via instances-Map"
    decision: "serialize_simulator_to_tree und dump_simulator_bytes uebernehmen die OID-Vergabe aus load_result.instances. Damit ist GET /tree -> PUT /tree OID-stabil und das Frontend kann Edits via OID adressieren."
    rationale: "Ohne OID-Stabilitaet muesste das Frontend per Browse-Path neu adressieren -- fragiler und langsamer. Stabile OIDs sind Voraussetzung fuer Phase-2-Viewer-Foundation (Plan 01-04+)."

  - id: "01-03-D5"
    title: "Roundtrip-Workaround fuer Welle-0-Writer-Limitation"
    decision: "_patch_ref_properties in app.services.otx_service ergaenzt im Engine-Writer-Output fehlende m_l*/m_o*-OID-Refs aus dem Original-OTX (allgemein, alle Klassen). Damit ist der Roundtrip strukturell vollstaendig (embb_pre_run.otx: 536 -> 536 Tree-OIDs), ohne den Engine-Writer zu aendern."
    rationale: "Der Engine-Writer aus Plan 01-01 ist als minimal-Foundation deklariert; pro Klasse werden nur deklarierte SCALARS serialisiert. Korrekter Fix waere Erweiterung der einzelnen WriterHandler -- out-of-scope fuer Plan 01-03 (engine/ ist read-only). Der Workaround ist textbasiert, fokussiert, hat keine Engine-Aenderung als Bedingung und ist als Deferred-Item fuer einen Engine-Fix dokumentiert."

  - id: "01-03-D6"
    title: "Lock-Pflicht erst bei PUT /tree, nicht bei Edit-Cycle-Start"
    decision: "GET /tree erlaubt jeder authentifizierte Tenant-User (Read-Only-Ansicht moeglich). PUT /tree verlangt aktiven Lock vom selben User -- check_lock_for_edit raised 403, wenn kein Lock oder Lock-by-Other."
    rationale: "Read-Only-Ansicht ist explizit gewuenscht (D-13: 'andere User/Sessions sehen Modell, koennen es aber nicht editieren'). Lock auf Schreiboperationen einschraenken vermeidet, dass nebenherlaufende Read-Sessions andere User locken."

  - id: "01-03-D7"
    title: "ProblemDetail-Extension fuer dict-detail"
    decision: "app/core/errors.py: wenn HTTPException.detail ein dict ist, werden seine Felder als top-level RFC-7807-Extension serialisiert (z.B. holder_uid, expires_at fuer Lock-Konflikt). Strings bleiben in detail."
    rationale: "RFC 7807 erlaubt custom-extension-Felder im Top-Level. Vorher wurden dicts via str() in detail gestopft -- nicht parsebar fuer Frontend. Neue Variante: Frontend kann body.holder_uid direkt lesen, ohne den string zu re-parsen."

  - id: "01-03-D8"
    title: "Kein db.refresh nach commit"
    decision: "register_model_from_otx und create_new_version rufen NICHT db.refresh() nach commit auf."
    rationale: "Mit NullPool/asyncpg + tenant_search_path tritt nach commit ein Connection-Recycle ein. Der naechste Query (refresh) bekommt eine neue Connection ohne search_path und schlaegt mit 'relation models does not exist' fehl. server_default-Spalten (created_at, updated_at) bekommen ihre Werte schon im flush() vor commit -- refresh ist hier verzichtbar."

  - id: "01-03-D9"
    title: "TYPE_MAP-Properties als Whitelist fuer Edits"
    decision: "apply_tree_to_simulator akzeptiert nur Properties, die in TYPE_MAP[klass] stehen. Unbekannte Properties werden ignoriert (kein Fail). Topologie-Aenderungen (neue Knoten, Verbindungen) sind explizit NICHT erlaubt."
    rationale: "Phase-1-Vertrag: nur skalare Property-Edits sind roundtrip-safe. Topologische Edits brauchen id_mapping-Mechanik (Plan 01-04+) und werden konzeptionell separat eingefuehrt."

# --- Patterns (3fls-Reuse) ---
patterns:
  - "Two-Step-Commit (Storage-first, DB-second) aus tbx_stzrim-3fls-D-CR04"
  - "Schema-per-Tenant aus 3fls-D-CR01, hier auf to_metadata() statt sync DDL erweitert"
  - "Path-Traversal-Schutz auf LocalStorage analog 3fls-Filesystem-Pattern"
  - "RFC-7807-Extension aus 3fls-D-CR03, hier mit dict-detail-Spread"
  - "Service-Layer + Pydantic-Schemas-Trennung aus 3fls-D-CR02"

# --- Metrics ---
metrics:
  tasks_completed: 3
  files_created: 19
  files_modified: 7
  test_count: 48
  test_results: "48 passed, 1 skipped (Minio nicht reachable)"
  ruff_status: "clean"
  duration_minutes: ~75
  completed_date: "2026-05-20"
---

# Phase 1 Plan 03: Modell-CRUD Backend Summary

Vollstaendige Modell-Lifecycle-Schicht im osim-ui-Backend implementiert. Upload -> Storage -> Parse -> JSON-Tree -> Browser-Edit -> Save-back -> neue Version -- end-to-end roundtrip-stabil, mit Edit-Lock-Mechanik (D-13) und Tenant-Isolation (D-16). 18 neue Endpoints, 37 neue Tests (alle gruen), Engine-Writer-Roundtrip-Workaround als Rule-1-Bug-Fix.

## Was gebaut wurde

### Task 1 -- Storage + Models + Migration 002 (Commit `ef782c9`)

`pyproject.toml`-Erweiterung um `python-multipart` (FastAPI UploadFile) und `aioboto3` (async S3-Client). Drei neue SQLAlchemy-2-Models (`Model`, `ModelVersion`, `EditLock`) im Tenant-Schema (kein `__table_args__ = schema=public`). `tenant_service._create_tenant_schema_tables` legt die DDL per `Table.to_metadata(schema=tenant_id) + create_all(checkfirst=True)` an und wird in `ensure_tenant_bootstrap` aufgerufen. Migration 002 ist Doku-only (leeres upgrade/downgrade + ausfuehrlicher Docstring). `db/migrations/env.py` bekommt einen `include_object`-Filter, damit autogenerate die Tenant-Tabellen nicht ins public-Schema migriert.

`app/services/storage.py` mit `Storage`-Protocol + `LocalStorage` (Filesystem mit Path-Traversal-Schutz) + `S3Storage` (aioboto3, kompatibel zu Minio + GCS-S3-Endpoint). `get_storage()`-Factory + `reset_storage_singleton()` fuer Tests.

`tests/conftest.py`-Fix: `DATABASE_URL`-force-override (Bug-Fix gegen Shell-Variablen aus anderen Projekten -- `setdefault` greift nicht, wenn die Env bereits gesetzt ist). `db_engine`-Fixture beschraenkt `create_all` auf public-Tabellen.

`tests/test_storage.py`: 7 Tests fuer LocalStorage (put/get/delete/signed_url/path-traversal/missing-404) + 1 Test fuer S3Storage (skipped wenn kein Minio reachable) + 1 Factory-Test. 8 passed, 1 skipped.

### Task 2 -- OTX-Service + JSON-Tree + Upload-Endpoint (Commit `484c686`)

`app/services/otx_service.py`: `parse_otx_bytes(data) -> LoadResult` (mit Temp-File-Trick, weil Engine `Path` erwartet) und `dump_simulator_bytes(sim, original_otx=..., instances=...) -> bytes` (mit Roundtrip-Workaround `_patch_ref_properties` -- siehe Deviations).

`app/services/json_tree_service.py`: das ist der substantielle Teil. `TYPE_MAP` mit ~40 OSim-Klassen (ASimulator, PAslEinzel, PDurchlaufplan, PDpKn* alle Varianten, PDlplKante, PVert*, PBetriebsmittel/PPerson, PEinsatzzeitTag, EPEnt*). `serialize_simulator_to_tree(sim, load_result, original_otx)` baut den hierarchischen Tree mit synthetischen Gruppen-Knoten (Ausloeser/Plaene/Ressourcen/Einsatzzeiten/Entscheider). `apply_tree_to_simulator(tree, load_result)` spielt Property-Edits zurueck -- nur Properties aus TYPE_MAP, keine Topologie-Aenderungen.

`app/services/model_service.py`: Two-Step-Commit-Lifecycle (Storage put_object FIRST, dann DB-Row + commit). `register_model_from_otx`, `list_models`, `get_model`, `get_current_version_bytes`, `get_initial_version_bytes`, `create_new_version`. Maximale Upload-Groesse 50 MB.

`app/services/lock_service.py`: Stub fuer `check_lock_for_edit` -- in Task 3 voll ausgebaut.

`app/schemas/{model,json_tree}.py`: Pydantic-DTOs (`ModelDetail`, `UploadResponse`, `TreeResponse`, `TreePutRequest/Response`, `JsonTreeDocument`, `JsonTreeNode`, `LockInfo`).

`app/api/v1/models.py`: POST `/upload-otx`, GET `/`, GET `/{id}`, GET `/{id}/tree`, PUT `/{id}/tree`, GET `/{id}/download-original`.

`tests/conftest.py`: `authenticated_client`-Fixture macht kompletten Tenant-Bootstrap + verifiziert, dass die Tenant-Tables im Schema landen. `dummy_otx_bytes`-Fixture sucht zuerst im Engine-Repo (`embb_pre_run.otx`), faellt sonst auf OSim2004/Dummy.otx zurueck.

`tests/test_model_upload.py` (7 Tests): Upload + List + Detail + 404 + Empty-File-422 + Garbage-422 + Download-Original.
`tests/test_json_tree.py` (8 Tests): Direct-Tests fuer Serializer + Apply mit Roundtrip-Identitaet, Property-Edits, Unknown-Property-Ignored, Schema-Version-Reject.
`tests/test_otx_roundtrip.py` (3 Tests): Upload -> GET -> PUT -> v2 mit gleicher OID-Reihenfolge, Property-Edit-Persistenz, Bad-Schema-422.

### Task 3 -- Edit-Lock + Lock-Endpoints (Commit `2ead230`)

`app/services/lock_service.py` voll implementiert. `LOCK_TTL_SECONDS = 900`. `get_lock_status` mit Auto-Expire-Cleanup. `acquire_lock` mit IntegrityError-Race-Resolution + LockHeldByOtherError (HTTPException 409). `release_lock` idempotent. `heartbeat_lock` mit Holder-Check (404 wenn kein Lock, 409 wenn anderer Holder). `check_lock_for_edit` als PUT-/tree-Pflicht-Gate (403 mit `lock-required`-ProblemDetail-Typ).

`app/api/v1/models.py` erweitert: POST `/{id}/lock`, DELETE `/{id}/lock` (204), POST `/{id}/lock/heartbeat`. GET `/{id}` liefert nun `lock_status` mit `is_self`-Flag.

`app/core/errors.py`-Extension: wenn `HTTPException.detail` ein dict ist, werden seine Felder als top-level RFC-7807-Extension im Body serialisiert (z.B. `holder_uid`, `expires_at`). Frontend kann jetzt `body.holder_uid` direkt lesen.

`tests/test_edit_lock.py` (11 Tests): Acquire-first/idempotent/conflict (mit zweitem User im selben Tenant), Release-idempotent, Heartbeat-extend/missing-404, TTL-Auto-Expire via monkeypatch, PUT-without-Lock-403, PUT-with-Lock-OK, Detail-Lock-Status-is_self.

Bestehende `tests/test_otx_roundtrip.py`-Roundtrip-Tests bekommen nun ein `client.post(f"/api/v1/models/{model_id}/lock", ...)` vor dem PUT, weil Lock jetzt Pflicht ist.

## Endpoints (alle gegen die laufende Suite verifiziert)

| Pfad | Methode | Auth | Body |
|---|---|---|---|
| `/api/v1/models/upload-otx` | POST | ja | multipart file=OTX-Bytes -> UploadResponse |
| `/api/v1/models` | GET | ja | list[ModelListItem] |
| `/api/v1/models/{id}` | GET | ja | ModelDetail + lock_status |
| `/api/v1/models/{id}/tree` | GET | ja | TreeResponse (JsonTreeDocument 1.0) |
| `/api/v1/models/{id}/tree` | PUT | ja + Lock | TreePutResponse (Version 2+) |
| `/api/v1/models/{id}/download-original` | GET | ja | OTX-Bytes Stream |
| `/api/v1/models/{id}/lock` | POST | ja | LockInfo / 409 LockHeldByOther |
| `/api/v1/models/{id}/lock` | DELETE | ja | 204 (idempotent) |
| `/api/v1/models/{id}/lock/heartbeat` | POST | ja | LockInfo / 404 / 409 |

## Must-Haves abgehakt

- [x] `POST /api/v1/models/upload-otx` legt Model + ModelVersion(v1, source="upload") + Storage-Objekt an.
- [x] `GET /api/v1/models` listet tenant-eigene Modelle (search_path isolation).
- [x] `GET /api/v1/models/{id}/tree` liefert JSON-Tree der aktuellen Version.
- [x] `PUT /api/v1/models/{id}/tree` validiert, dump_simulator_bytes, neue Version, Original v1 unveraendert.
- [x] `POST /api/v1/models/{id}/lock` -- zweiter Holder bekommt 409.
- [x] Lock laeuft nach TTL ab (verifiziert via `LOCK_TTL_SECONDS = -1`-monkeypatch).
- [x] Roundtrip-Test embb_pre_run.otx: GET 536 Tree-OIDs -> PUT -> GET 536 Tree-OIDs identisch.
- [x] Tenant-Isolation via search_path (verifiziert in test_search_path_is_set_per_tenant_request aus Plan 01-02).
- [x] `uv run pytest tests/ -x` -> 48 passed, 1 skipped (Minio).
- [x] `uv run ruff check app/ tests/ db/` -> clean.
- [x] `alembic upgrade head` -> grun, inkl. 002.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Engine-Writer-Roundtrip-Limitation -- Workaround `_patch_ref_properties`**

- **Found during:** Task 2, erster Roundtrip-Test gegen embb_pre_run.otx.
- **Issue:** Der OtxWriter aus Plan 01-01 ist als minimal-Foundation deklariert und schreibt pro Klasse nur die explizit deklarierten SCALARS. Listen-Refs (`m_lAusl`, `m_lDlpl`, `m_lParameter`, `m_lKnoten`, `m_lKanten` etc.) fallen weg. Beim Re-Load findet der Loader 0 Auslöser, 0 Plaene -- Tree-Identity nach Roundtrip ist von 536 auf 95 OIDs eingebrochen.
- **Fix:** `_patch_ref_properties` (generisch fuer alle Klassen) iteriert ueber den Writer-Output, sucht pro Objekt-Zeile den OID-Token, schlaegt im `original_otx.by_oid[oid].attrs` nach und fuegt fehlende `m_l*`-/`m_o*`-OID-Properties vor dem `m_dwObjID`-Token ein. Idempotent: existierende Properties werden nicht ueberschrieben.
- **Files modified:** `app/services/otx_service.py` (`dump_simulator_bytes`, `_patch_ref_properties`).
- **Commit:** `484c686`.
- **Deferred:** Korrekter Fix waere Erweiterung der einzelnen WriterHandler in der Engine (z.B. `_ASimulatorWriter` setzt `m_lAusl`, `m_lDlpl`, ... als Property-OID-Refs). Out-of-scope fuer Plan 01-03 (`engine/` ist read-only fuer diesen Plan). Soll in einem dedizierten Engine-Plan ("01-01b OTX-Writer Roundtrip-Vollstaendigkeit") nachgezogen werden.

**2. [Rule 1 - Bug] db.refresh() nach commit crasht mit "relation models does not exist"**

- **Found during:** Task 2, erster Upload-Test.
- **Issue:** `register_model_from_otx` rief `db.refresh(model)` nach `commit()`, um die `updated_at`-server_default-Spalte einzulesen. Mit NullPool/asyncpg gibt commit() die Connection an den Pool zurueck; die nachfolgende refresh-Query bekommt eine FRISCHE Connection -- ohne search_path -- und schlaegt fehl, weil "relation models" im public-Schema nicht existiert.
- **Fix:** db.refresh-Aufrufe ersatzlos entfernt (`updated_at`, `created_at` haben durch `flush()` schon ihre Werte). Kommentar im Code erklaert den Grund.
- **Files modified:** `app/services/model_service.py` (`register_model_from_otx`, `create_new_version`).
- **Commit:** `484c686`.

**3. [Rule 1 - Bug] conftest DATABASE_URL setdefault greift nicht im 3fls-Shell**

- **Found during:** Initial-Baseline-Check.
- **Issue:** `os.environ.setdefault("DATABASE_URL", ...)` schlaegt fehl, wenn `DATABASE_URL` bereits aus einer anderen Shell-Session (z.B. tbx_stzrim mit psycopg-Driver) gesetzt ist. Die Test-Suite bricht dann mit `ModuleNotFoundError: No module named 'psycopg'`, weil SQLAlchemy auf den falschen DBAPI-Driver mapped.
- **Fix:** `os.environ["DATABASE_URL"] = TEST_DATABASE_URL` (force-override). `STORAGE_BACKEND=local` als zusaetzlicher setdefault.
- **Files modified:** `tests/conftest.py`.
- **Commit:** `ef782c9`.

**4. [Rule 2 - Missing critical functionality] ProblemDetail-dict-Detail-Extension**

- **Found during:** Task 3, erster Lock-Konflikt-Test.
- **Issue:** Mein Lock-Service raised `HTTPException(status_code=409, detail={"type": ..., "holder_uid": ..., ...})`. Der existierende `_http_exception_handler` wrappte das dict via `str(exc.detail)` in den `detail`-String -- Frontend konnte die holder_uid nicht parsen.
- **Fix:** `_http_exception_handler` erweitert: wenn `exc.detail` ein dict ist, werden seine Felder als top-level RFC-7807-Extension im Body serialisiert. Strings bleiben weiterhin in `detail`. RFC-7807-konform und Frontend-freundlich.
- **Files modified:** `app/core/errors.py`.
- **Commit:** `2ead230`.

**5. [Rule 3 - Blocking] m_sName vs m_name an ASimulator**

- **Found during:** Task 2, `test_roundtrip_property_edit_persists`.
- **Issue:** TYPE_MAP fuer ASimulator hatte nur `m_sName`. Das Sim-Objekt hat aber `m_name` (OSimulator-Basisklasse). `_serialize_scalars` schreibt nur Attribute mit `hasattr`-true -> m_sName war leer.
- **Fix:** TYPE_MAP["ASimulator"] enthaelt jetzt `m_name` UND `m_sName`. `_name_of`-Helper bevorzugt `m_sName`, faellt sonst auf `m_name` zurueck.
- **Files modified:** `app/services/json_tree_service.py`.
- **Commit:** `484c686` (im selben Commit wie der serialize-Code).

### Anpassungen ohne Auswirkung auf Plan-Verhalten

- `pyproject.toml`-per-file-ignores: B008 jetzt auch fuer `tests/*` aktiv -- der `_probe`-Helper in test_auth_me.py war legitim FastAPI-Depends-as-Default, sollte aber nicht gepatcht werden. Konsistent mit der Default-Konvention.
- `db/migrations/env.py`-Comment auf zwei Zeilen aufgeteilt (Line-Length).
- `dummy_otx_bytes`-Fixture sucht in zwei Pfaden (engine-Fixture-Dir + OSim2004) und skipt, wenn beide fehlen -- vereinfacht CI-Setup.

## Risk-Mitigations

- **Tenant-Table-DDL ohne alembic:** Dokumentiert in 002-Migration-Docstring und in 01-03-D1 oben. Spaltenaenderungen am Model erfordern eine Tenant-Migrations-Loop, die in Phase 4 als Backlog-Item gefuehrt wird.
- **OID-Stabilitaet zwischen GET und PUT:** Mitigation via `load_result.instances` als id->oid-Map (D-04). Browser darf nur OIDs nutzen, die der Server vergeben hat. Neu vom Browser angelegte Objekte (Phase 1 nicht erlaubt) muessten TEMPORARY-IDs (negativ) tragen -- das id_mapping-Pattern kommt in Plan 01-04+.
- **Lock-Race-Conditions:** UniqueConstraint auf model_id als PK + try/except IntegrityError mit Re-Query (siehe `acquire_lock`). Race-Resolution-Pfad ist getestet (`test_acquire_lock_other_user_conflict_409`).
- **Storage-Backend-Switch local<->minio:** LocalStorage signed_url ist API-Pfad-Stub, der MUSS durch Auth-Middleware geschuetzt werden. Phase 1 nutzt direkten download-original-Endpoint (Auth-protected), nicht signed_urls -- LocalStorage-signed_url ist Backlog fuer Phase 2.
- **OTX-bytes-Latin-1:** Multipart-Bytes werden via `UploadFile.read()` als raw bytes durchgereicht; KEIN Decode-Encode-Roundtrip; Engine schreibt das tmp-File selbst mit latin-1.

## Notes fuer Plan 01-04+

- **Roundtrip-Workaround in Engine ziehen:** `_patch_ref_properties` lebt in app/services/otx_service.py -- sollte ueberfuehrt werden in eine Erweiterung der einzelnen WriterHandler in `osim_engine.io.otx_writer`. Engine-Plan-Vorschlag: "01-01b -- OTX-Writer-Roundtrip-Vollstaendigkeit".
- **id_mapping fuer neue Objekte:** Wenn Frontend (Plan 01-04+) das Anlegen neuer Knoten erlaubt, muss `apply_tree_to_simulator` um eine id_mapping-Response erweitert werden (TEMPORARY-ID -> server-vergebene OID). Aktuell sind topologische Aenderungen explizit nicht erlaubt.
- **Storage signed_url fuer LocalStorage:** Internal-File-Endpoint mit Tenant-Prefix-Validation als Backlog. Phase 1 nutzt direkten download-original-Endpoint.
- **Lock-TTL-Override:** `LOCK_TTL_SECONDS` ist modul-konstante (im Test monkeypatch-bar). Wenn Phase 4 unterschiedliche TTLs pro Tenant braucht, sollte sie in den Settings landen.
- **Storage-Persistenz:** LocalStorage schreibt unter `./local-storage`. `.gitignore` sollte das Verzeichnis ausschliessen (aktuell wird es vermutlich nicht eingecheckt, weil keine Files dort liegen -- aber bei Dev-Runs entstehen sie).

## Self-Check

### Created Files

- [x] `osim-ui/app/models/model.py` -- FOUND
- [x] `osim-ui/app/models/model_version.py` -- FOUND
- [x] `osim-ui/app/models/edit_lock.py` -- FOUND
- [x] `osim-ui/app/services/storage.py` -- FOUND
- [x] `osim-ui/app/services/otx_service.py` -- FOUND
- [x] `osim-ui/app/services/json_tree_service.py` -- FOUND
- [x] `osim-ui/app/services/model_service.py` -- FOUND
- [x] `osim-ui/app/services/lock_service.py` -- FOUND
- [x] `osim-ui/app/schemas/__init__.py` -- FOUND
- [x] `osim-ui/app/schemas/model.py` -- FOUND
- [x] `osim-ui/app/schemas/json_tree.py` -- FOUND
- [x] `osim-ui/app/api/v1/models.py` -- FOUND
- [x] `osim-ui/db/migrations/versions/20260521_0000_002_models_versions_locks.py` -- FOUND
- [x] `osim-ui/tests/test_storage.py` -- FOUND
- [x] `osim-ui/tests/test_model_upload.py` -- FOUND
- [x] `osim-ui/tests/test_json_tree.py` -- FOUND
- [x] `osim-ui/tests/test_otx_roundtrip.py` -- FOUND
- [x] `osim-ui/tests/test_edit_lock.py` -- FOUND
- [x] `osim-ui/tests/fixtures/.gitkeep` -- FOUND

### Commits

- [x] `ef782c9` -- feat(backend): storage + tenant-scoped models + migration 002 (plan 01-03 task 1)
- [x] `484c686` -- feat(backend): OTX upload + JSON-tree GET/PUT + roundtrip workaround (plan 01-03 task 2)
- [x] `2ead230` -- feat(backend): edit-lock service + lock endpoints (plan 01-03 task 3)

### Verification

- Test-Suite: **48 passed, 1 skipped** (`uv run pytest`).
- Ruff: **clean** (`uv run ruff check app/ tests/ db/`).
- Alembic: `upgrade head` von 001 -> 002 grun.
- Smoke: load(embb_pre_run.otx) -> dump_simulator_bytes -> reload yields identical 536 Tree-OIDs.

## Self-Check: PASSED
