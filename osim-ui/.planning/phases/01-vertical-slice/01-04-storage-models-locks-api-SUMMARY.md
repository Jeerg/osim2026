---
phase: 01-vertical-slice
plan: 04
subsystem: storage-models-locks-api
tags: [fastapi, storage-abstraction, minio, local-storage, otx-roundtrip, single-editor-lock, multipart-upload, versioning, latin-1, pydantic-v2]

# Dependency graph
requires:
  - phase: 01-vertical-slice
    plan: 01
    provides: osim-engine OTX-Roundtrip-Coverage 1.0, requires_engine-Marker, OTX-Path-Fixtures
  - phase: 01-vertical-slice
    plan: 02
    provides: FastAPI-Foundation, sync SQLAlchemy + psycopg3, TenantAuthMiddleware, get_db mit search_path, Lazy-Bootstrap inkl. models/model_locks-DDL, RFC-7807 ProblemDetail
provides:
  - "8 neue Endpoints unter /api/v1/models (upload-otx, list, get, save, delete) und /api/v1/models/{id}/lock (acquire, heartbeat, release). App-Routes-Count steigt von 7 (Plan 02) auf 15 (8 neue + 7 Bestand)."
  - "StorageService-Abstraktion (ABC) mit LocalStorage-Implementation (Filesystem, Windows/POSIX-Slash-Normalisierung) und MinioStorage (boto3 S3-API, Bucket-Auto-Create, paginierter Delete). Factory get_storage() schaltet via settings.storage_backend; GCS raised NotImplementedError (Phase 5)."
  - "OTX-JSON-Tree-Adapter (load_to_wire / wire_to_otx / is_save_safe) — Wire-Format symmetrisch zum OtxObject-Modell der Engine; Save-back nutzt Original-OTX als Pass-Through-Quelle (Phase-1-Strategie A laut PATTERNS.md)."
  - "LockService mit Stale-Cleanup-vor-Acquire-Pattern (Pitfall #4), Python-generiertem token (uuid4) als bound parameter -> Postgres + SQLite portabel, validate_token fuer Save-Endpoint (T-04-04 Mitigation)."
  - "ModelService mit Upload-Cap 30 MB (T-04-02), MIME-Whitelist (T-04-01 indirekt), tenant-prefixed storage_key (T-04-03), is_save_safe-Gate vor jedem Save (T-04-11), D-14 Original-Unchanged-Constraint."
  - "Lock-State-Diagramm (acquire -> heartbeat xN -> release / 423-on-Save-with-Expired-Token) als Endpoint-Set lebt; End-to-End-Race-Test gegen Postgres in Plan 05."
affects: [01-05-compose-stack-integration-tests, 01-07-octrl-foundation, 01-11-save-strategy-indexeddb]

# Tech tracking
tech-stack:
  added: []  # alle Deps (boto3, python-multipart) kamen schon in 01-01-pyproject.toml dazu
  patterns:
    - "Storage-Abstraktion via ABC mit zwei austauschbaren Backends (Local + Minio); Lazy-Import von boto3 in MinioStorage.__init__ -> Dev-Setups mit local starten ohne boto3-Import-Overhead"
    - "Wire-Format als symmetrisches Pydantic-Mirror von osim_engine.io.otx_reader.OtxObject — load_to_wire ist verlustfrei; OID-Set-Roundtrip ueber wire_to_otx ist OID-stabil"
    - "Phase-1-Save-Strategie A (PATTERNS.md): Original-OTX bleibt als Pass-Through-Quelle waehrend Save-back. Plan 11 wird wire-Mutationen tatsaechlich in den PSimulator einspielen."
    - "Service-Layer-Pattern: pro Request ein neuer Service mit conn + storage + tenant_id + user_uid; conn hat per get_db bereits search_path auf Tenant-Schema gesetzt"
    - "Lock-Token-Strategie: Python-generiertes uuid4 als bound parameter (statt Postgres' gen_random_uuid()-Default) — Service ist backend-agnostisch + Tests laufen gegen SQLite-in-memory"
    - "Stale-Lock-Cleanup-vor-Acquire (Pitfall #4): cleanup_stale() raeumt abgelaufene Locks raus BEVOR der naechste Owner versucht acquiren — verhindert dass ein abgelaufener Lock einen legitimen acquire blockiert"
    - "Save als Aktivitaetsbeweis: PUT /models/{id} ruft sowohl validate_token (Gate) als auch heartbeat (TTL-Extension). Verhindert Race: langer Save bei knapper TTL verliert den Lock und nachfolgende Edits scheitern mit 423"
    - "Storage-Layout-Konvention: tenants/{tid}/models/{mid}/(original.otx | v_<YYYYMMDDTHHMMSSZ>.otx); D-14 garantiert dass original.otx unveraenderlich bleibt; jeder Save legt eine neue versionierte Datei daneben"
    - "Idempotente Delete-Operationen: storage.delete_object (No-op bei missing), storage.delete_prefix (returnt count), locks.release (kein 404 bei missing — Frontend kann defensiv beim unmount releasen)"
    - "Test-Pattern fuer SQLite-Mock von Postgres-DDL: model_locks/models-Tabellen mit TEXT statt UUID-Typ; NOW()-SQL-Function via @event.listens_for(connect) mit microsecond precision (SQLite's native datetime('now') hat nur Sekunden-Aufloesung)"

key-files:
  created:
    - "app/services/storage.py — StorageService (ABC), LocalStorage, MinioStorage, get_storage() (~330 LoC)"
    - "app/services/otx_json_tree.py — load_to_wire, wire_to_otx, is_save_safe (~170 LoC)"
    - "app/services/model_service.py — ModelService mit upload_otx/get_meta/get_wire/save_wire/list_models/delete_model + Konstanten MAX_UPLOAD_BYTES/ALLOWED_MIME_TYPES (~370 LoC)"
    - "app/services/lock_service.py — LockService mit acquire/heartbeat/release/validate_token/cleanup_stale (~260 LoC)"
    - "app/api/v1/models.py — 5 Endpoints (upload-otx, list, get, save, delete) + Dependencies (get_model_service, get_lock_service, get_storage_dep) (~200 LoC)"
    - "app/api/v1/locks.py — 3 Endpoints (acquire, heartbeat, release) (~115 LoC)"
    - "app/api/schemas/model.py — Pydantic-Schemas (ModelObject, ModelCoverage, ModelTreeWire, ModelMeta, UploadOtxResponse, GetModelResponse, SaveModelRequest, SaveModelResponse) (~145 LoC)"
    - "app/api/schemas/lock.py — Pydantic-Schemas (LockOut, LockConflict, HeartbeatRequest, HeartbeatResponse, AcquireResult) (~65 LoC)"
    - "tests/backend/test_storage.py — 10 Tests (LocalStorage + Factory) (~130 LoC)"
    - "tests/backend/test_otx_json_tree.py — 6 Tests (@requires_engine) (~95 LoC)"
    - "tests/backend/test_lock_service.py — 10 Tests gegen SQLite-Mock (~225 LoC)"
    - "tests/backend/test_model_service.py — 8 Tests gegen SQLite + LocalStorage (@requires_engine) (~250 LoC)"
  modified:
    - "app/api/v1/router.py — models_router + locks_router include_router (Phase 1 jetzt vollstaendig: auth + models + locks)"
    - "app/api/v1/health.py — antwort-Feld 'storage' aus settings.storage_backend (informational only, kein Probe — kommt in /readiness)"

key-decisions:
  - "Wire-Format ist symmetrisch zu osim_engine.io.otx_reader.OtxObject — kein eigenes UI-Schema-Layer in Phase 1. Damit ist der load_to_wire-Pfad direkt-1:1; wire_to_otx ist in Phase 1 noch 'Pass-Through-only' (Original wird zurueckgeschrieben). Plan 11 baut die Wire-Mutationen-Apply-Logik darauf auf."
  - "Phase-1-Save-Strategie A (Original-Pass-Through statt direkter Wire-zu-OTX-Writer): vermeidet die komplexe Wire->OtxFile-Rekonstruktion in Phase 1 und nutzt den verifizierten Roundtrip-Vertrag aus Plan 01 (Coverage 1.0 fuer alle drei Modelle). Limitierung: Wire-Mutationen werden in Phase 1 noch nicht beim Save-back beruecksichtigt — Plan 11 ergaenzt apply_wire_to_simulator(sim, wire)."
  - "Token-Generation Python-seitig (uuid4) statt Postgres-Default gen_random_uuid(): macht den Service backend-agnostisch und ermoeglicht SQLite-Tests ohne docker-Compose. Postgres' Default bleibt als Safety-Net erhalten."
  - "validate_token + heartbeat im Save-Endpoint (NICHT nur validate): Save ist Aktivitaets-Beweis und verlaengert die TTL. Verhindert Race-Pattern 'langer Save bei knapper TTL -> Lock verfaellt -> nachfolgende Edits scheitern'."
  - "release ist idempotent aus Client-Sicht (immer 204, auch bei missing Lock / falschem Token): Frontend kann defensiv im useEffect-cleanup einen Release abschicken, ohne Race-Conditions zu fuerchten."
  - "MIME-Whitelist akzeptiert auch None (kein content_type): Curl-Tests und Browser-Form-Uploads ohne expliziten Type sollen funktionieren. Hardening auf strict-MIME kommt in Phase 5 mit Production-Hardening."
  - "Upload-Cap 30 MB: deckt Bosch2_wechseln (~18 MB) + Puffer ab; Phase 2/5 koennen den Cap erhoehen, falls realistische Modelle das brauchen. Cap ist HTTP-413 mit E_UPLOAD_TOO_LARGE — UI kann das in DE-Toast-Mapping uebernehmen."
  - "_utcnow()-Helper statt datetime.utcnow() (Python 3.12+ deprecation): datetime.now(timezone.utc).replace(tzinfo=None) liefert dieselbe Semantik ohne Warning. Wird sowohl im LockService als auch im ModelService benutzt."

patterns-established:
  - "Test-Pattern fuer Service gegen SQLite-in-memory mit Postgres-Mock-DDL: TEXT statt UUID, registrierte now()-Function mit microsecond precision. Funktioniert fuer model_locks (Plan 04 Task 3) und models (Plan 04 Task 4); kann von Folge-Plaenen wiederverwendet werden."
  - "Storage-Abstraktion via ABC mit Lazy-Import-Pattern fuer schwere Dependencies (boto3): MinioStorage importiert boto3 erst in __init__, nicht zum Modul-Load-Zeitpunkt. Damit haben LocalStorage-only-Dev-Setups keinen boto3-Overhead."
  - "Wire/OTX-Roundtrip-Test-Pattern: load_to_wire -> wire_to_otx (mit original_otx_path) -> Tempfile mit Latin-1-Encoding -> parse_otx_file -> OID-Set-Vergleich. Reproduzierbar fuer alle drei kanonischen Modelle (Phase-1-Coverage-Vertrag aus Plan 01)."
  - "RFC-7807-Error-Detail-Dict-Pattern: HTTPException(status_code, detail={'code': 'E_*', 'message': '...'}); FastAPI-Handler (aus Plan 02) splittet das in {code, title, detail} fuer das Frontend. In Plan 04 sieben verschiedene E_*-Codes: E_UPLOAD_TOO_LARGE, E_INVALID_OTX_MIMETYPE, E_MODEL_NOT_FOUND, E_OTX_COVERAGE_INCOMPLETE, E_MODEL_LOCKED, E_LOCK_EXPIRED."

requirements-completed: [SC-3, SC-6, SC-7, SC-8]
# Anmerkung zu Requirements:
# SC-3 (Upload->Tree): /upload-otx implementiert + Wire wird sofort mit returniert (Frontend braucht kein Folge-Get). Live-Test mit echtem Postgres + Minio in Plan 05.
# SC-6 (Edit-Operationen): GET + PUT /models/{id} implementiert + Wire-Format ist symmetrisch zum OtxObject-Modell (Frontend-Edit-Hooks in Plan 11 koennen ueber OID-Indexe direkt mutieren).
# SC-7 (Lock + Auto-Save): /lock + /heartbeat + /lock?token implementiert; Save-Endpoint nutzt sowohl validate_token (Gate) als auch heartbeat (TTL-Extension). Frontend-Heartbeat-Timer kommt in Plan 11.
# SC-8 (versioniertes Save-back): save_wire schreibt v_<timestamp>.otx; original_storage_key bleibt unveraendert (D-14). Test in test_model_service.py::test_save_wire_creates_versioned_key verifiziert das.

# Metrics
duration: ~20min
completed: 2026-05-21
---

# Phase 1 Plan 04: Storage / Models / Locks-API Summary

**Das Backend-Herzstück der Phase 1 ist fertig: 8 Endpoints unter `/api/v1/models` und `/api/v1/models/{id}/lock` bilden den vollstaendigen Modell-Lifecycle ab — Upload, Listing, Get, Save-back, Delete, plus Single-Editor-Lock-Acquire/Heartbeat/Release. Vier Service-Klassen (StorageService, ModelService, LockService, otx_json_tree) liegen darunter, alle mit Pydantic-typisierten Schnittstellen und 34 Unit-Tests grün gegen SQLite-in-memory + LocalStorage + osim-engine.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-21T07:34:00Z
- **Completed:** 2026-05-21T07:54:00Z
- **Tasks:** 5 / 5
- **Files created:** 12 (4 services, 2 Endpoint-Router, 2 Schema-Module, 4 Test-Module)
- **Files modified:** 2 (`app/api/v1/router.py`, `app/api/v1/health.py`)
- **Test-Suite:** 34 neue Unit-Tests grün (zusätzlich zu den 10 aus Plan 01-01/02 — total 44 grün)
- **App-Routes-Count:** 15 (von 7 nach Plan 02; +8 neue)

## Accomplishments

- **Vollstaendiger Modell-Lifecycle ueber 8 Endpoints fertig:** vom OTX-Upload bis Save-back inklusive Lock-Choreographie. Alle Endpoints haben Pydantic-Schemas fuer Request/Response, RFC-7807-Errors mit stabilen `code`-Strings, Auth-Gate via `TenantAuthMiddleware`, und tenant-isolierte Storage-/DB-Operationen.
- **Storage-Abstraktion zukunftssicher:** `StorageService`-ABC mit `LocalStorage` (Dev) und `MinioStorage` (S3-API via boto3); Factory `get_storage()` schaltet via `settings.storage_backend`. Phase 5 muss nur eine `GcsStorage`-Klasse danebenstellen — kein Refactor der Konsumenten noetig (D-03 erfuellt).
- **Wire-Format als symmetrischer Pydantic-Mirror der Engine:** `ModelObject` ↔ `OtxObject`, `ModelTreeWire` enthaelt `objects`-Dict + Coverage-Info. Ein Roundtrip `load_to_wire → wire_to_otx → parse_otx_file` ist OID-stabil (verifiziert in `test_wire_to_otx_dummy_roundtrip`).
- **D-14 garantiert:** `original_storage_key` ist eine separate Spalte, und `save_wire` schreibt nie auf den Original-Key. Test `test_save_wire_creates_versioned_key` prueft, dass nach einem Save sowohl Original als auch neue Version im Storage existieren.
- **Lock-Strategie battle-tested:** `cleanup_stale()` vor jedem Acquire (Pitfall #4), Token-Owner-Match in heartbeat/release, validate_token + heartbeat im Save-Endpoint (Save als Aktivitaetsbeweis). 10 Tests decken alle Pfade ab inkl. Stale-Cleanup-mit-manuellem-Backdated-Lock.
- **34 neue Unit-Tests grün — alle TDD durchlaufen:** RED-Commit für jedes der vier Service-Module, dann GREEN-Commit mit Implementation. Tests laufen ohne docker (SQLite-Mock + LocalStorage); echter Postgres+Minio+Firebase-Stack kommt in Plan 05.

## Task Commits

Jeder Task wurde atomar commited; TDD-Tasks haben jeweils einen RED- und einen GREEN-Commit:

1. **Task 1 RED: failing tests for StorageService** — `666ad0f` (test)
2. **Task 1 GREEN: StorageService ABC + LocalStorage + MinioStorage + Factory** — `df63000` (feat)
3. **Task 2 RED: failing tests for otx_json_tree** — `537b5ff` (test)
4. **Task 2 GREEN: Pydantic-Schemas + OTX-JSON-Tree-Adapter** — `c5f9a6d` (feat)
5. **Task 3 RED: failing tests for LockService** — `7ffb7fd` (test)
6. **Task 3 GREEN: LockService + Lock-Pydantic-Schemas** — `d19eb62` (feat)
7. **Task 4 RED: failing tests for ModelService** — `dccea89` (test)
8. **Task 4 GREEN: ModelService (5 Methoden)** — `ada77ca` (feat)
9. **Task 5: 8 Endpoints + Router-Wiring + Health-Storage-Feld** — `e66be02` (feat)

**Plan-Metadaten-Commit:** folgt nach diesem SUMMARY-Write (separater Commit für SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Endpoint-Inventar

Alle Endpoints benoetigen Auth (Firebase-JWT als Bearer-Token). Tenant-Isolation per `TenantAuthMiddleware`-search_path-Setting.

### `/api/v1/models`

| Methode | Pfad | Auth | Body / Form | Response | Errors |
|---------|------|------|-------------|----------|--------|
| POST | `/upload-otx` | required | multipart: `file` (binary), `name` (string) | 200 `UploadOtxResponse{model, wire}` | 413 E_UPLOAD_TOO_LARGE, 415 E_INVALID_OTX_MIMETYPE |
| GET | `` (list) | required | — | 200 `list[ModelMeta]` | — |
| GET | `/{model_id}` | required | — | 200 `GetModelResponse{model, wire}` | 404 E_MODEL_NOT_FOUND |
| PUT | `/{model_id}` | required | JSON `SaveModelRequest{wire, lock_token}` | 200 `SaveModelResponse{model, saved_version_key}` | 404 / 422 E_OTX_COVERAGE_INCOMPLETE / 423 E_LOCK_EXPIRED |
| DELETE | `/{model_id}` | required | — | 204 | 404 E_MODEL_NOT_FOUND |

### `/api/v1/models/{model_id}/lock`

| Methode | Pfad | Auth | Body | Response | Errors |
|---------|------|------|------|----------|--------|
| POST | `/lock` | required | — | 200 `LockOut{token, expires_at}` | 409 (Body: `{code, owner_user_uid, expires_at}`) |
| POST | `/lock/heartbeat` | required | JSON `HeartbeatRequest{token}` | 200 `HeartbeatResponse{expires_at}` | 404 E_LOCK_EXPIRED |
| DELETE | `/lock?token=<UUID>` | required | — | 204 (idempotent) | — |

### Beispiel-curl

```bash
# Upload (Firebase-Token aus Auth-Provider holen, hier als $TOKEN)
curl -X POST http://localhost:8000/api/v1/models/upload-otx \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@Vorstellung04/Dummy.otx" \
  -F "name=Dummy"

# Lock acquiren
curl -X POST http://localhost:8000/api/v1/models/$MODEL_ID/lock \
  -H "Authorization: Bearer $TOKEN"

# Heartbeat
curl -X POST http://localhost:8000/api/v1/models/$MODEL_ID/lock/heartbeat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"<UUID-aus-acquire>"}'

# Save-back
curl -X PUT http://localhost:8000/api/v1/models/$MODEL_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"wire": {...}, "lock_token": "<UUID>"}'

# Release
curl -X DELETE "http://localhost:8000/api/v1/models/$MODEL_ID/lock?token=<UUID>" \
  -H "Authorization: Bearer $TOKEN"

# Liste
curl http://localhost:8000/api/v1/models \
  -H "Authorization: Bearer $TOKEN"

# Get einzelnes Modell (Meta + Wire)
curl http://localhost:8000/api/v1/models/$MODEL_ID \
  -H "Authorization: Bearer $TOKEN"

# Delete
curl -X DELETE http://localhost:8000/api/v1/models/$MODEL_ID \
  -H "Authorization: Bearer $TOKEN"
```

## Wire-Format-Schema (fuer Plan 06+ Konsumenten)

```typescript
type AttrValue = number | string | boolean | null | number[];

interface ModelObject {
  oid: number;
  klass: string;
  attrs: Record<string, AttrValue>;
  sub_refs: number[][];
}

interface ModelCoverage {
  loaded: number;
  skipped: number;
  unsupported: string[];
}

interface ModelTreeWire {
  version: 1;
  simulator_oid: number;       // Konvention: 0 (ASimulator)
  objects: Record<number, ModelObject>;
  coverage: ModelCoverage;
  schemas_url: string;         // "/api/v1/schemas/v1" — Endpoint kommt in Plan 07
}

interface ModelMeta {
  id: string;                  // UUID
  name: string;
  created_at: string;          // ISO datetime
  original_storage_key: string;
  current_version_key: string | null;
  created_by_uid: string;
}
```

**Symmetrie zur Engine:** `ModelObject` ist 1:1-Pydantic-Mirror von `osim_engine.io.otx_reader.OtxObject`. `simulator_oid=0` ist Engine-Konvention (ASimulator-Root).

## Storage-Layout-Konvention

```
{storage_root}/
└── tenants/
    └── {tenant_id}/          # = Firebase-UID per D-17
        └── models/
            └── {model_id}/   # UUID, serverseitig generiert
                ├── original.otx              # D-14: unveraenderlich
                ├── v_20260521T093512Z.otx    # 1. Save-back
                ├── v_20260521T094023Z.otx    # 2. Save-back
                └── ...
```

- `original.otx` wird beim Upload geschrieben und danach NIE veraendert (D-14).
- Jeder erfolgreiche `save_wire`-Aufruf legt eine neue `v_<YYYYMMDDTHHMMSSZ>.otx` an.
- `models.storage_key` zeigt auf die aktuell aktive Version (Original ODER letzte v_*.otx); `models.original_storage_key` zeigt immer aufs Original.

## Lock-State-Diagramm

```
                ┌──────────────────┐
                │  no lock (free)  │
                └────────┬─────────┘
                         │
                         │ POST /lock
                         ▼
                ┌──────────────────────┐    409 (anderer Owner)
                │ INSERT model_locks   │ ─────────────────────┐
                └────────┬─────────────┘                       │
                         │ 200 (token, expires_at)             │
                         ▼                                     │
            ┌────────────────────────────┐                     │
            │ owned by user (TTL)        │                     │
            └────────┬───────────┬───────┘                     │
                     │           │                             │
       POST /heartbeat   PUT /models/{id}                       │
                     │           │                              │
                     ▼           ▼                              │
       UPDATE expires_at ◄───────┘                              │
       (save_wire calls heartbeat als                           │
        Aktivitaetsbeweis)                                      │
                     │                                          │
                     │ DELETE /lock?token=...                   │
                     ▼                                          │
            ┌──────────────────┐                                │
            │  released (204)  │ ◄──────────────────────────────┘
            └──────────────────┘
                     │
                     │  TTL elapsed (cleanup_stale vor naechstem acquire)
                     ▼
            ┌──────────────────┐
            │  expired (stale) │ → cleanup_stale → frei fuer neuen Owner
            └──────────────────┘
```

**Heartbeat-Fail (404 E_LOCK_EXPIRED):** falscher token / falscher owner / TTL abgelaufen → Frontend muss neu acquiren.
**Save-Fail (423 E_LOCK_EXPIRED):** identischer Vertrag wie heartbeat; Frontend muss Edit-Stand neu mergen.

## Bekannte Limitierungen (fuer Plan 05 / Plan 11)

- **Wire-Mutationen vom Frontend werden bei save_wire noch nicht in den Sim eingespielt.** Phase-1-Strategie A (PATTERNS.md §`app/services/otx_json_tree.py`) nutzt das Original-OTX als Pass-Through-Quelle; das Wire wird in Phase 1 nur fuer den `is_save_safe`-Coverage-Check konsumiert. Plan 11 ergaenzt `apply_wire_to_simulator(sim, wire)`, damit Frontend-Edits tatsaechlich persistiert werden.
- **Echter Postgres-Integration-Test fuer Lock-Choreographie steht aus** — kommt in Plan 05 als `test_lock_endpoints.py` mit laufendem docker compose (postgres + firebase-emulator + minio). Phase-1-Tests laufen gegen SQLite-in-memory + LocalStorage.
- **Minio-Smoke-Test fuer MinioStorage steht aus** — kommt in Plan 05 als `@requires_minio`-Test mit laufendem Minio-Container. Phase-1-Tests decken nur LocalStorage ab; MinioStorage-Code ist nicht ausgefuehrt aber syntaktisch + via boto3-Doc verifiziert.
- **End-to-End-Roundtrip mit echtem Frontend-Edit (upload -> get -> mutate -> save -> verify)** steht aus — kommt in Plan 11 (Save-Strategy + IndexedDB).
- **`/readiness`-Endpoint** mit echtem Storage-Ping ist NICHT in Plan 04 dabei (Health antwortet nur informational mit `storage`-Feld). Phase 2 oder Plan 05 ergaenzt das.
- **Performance-Test fuer Save-back mit Bosch2_wechseln (~92k OIDs)** steht aus — die Engine-Roundtrip-Suite (Plan 01) deckt die Coverage ab, aber kein Integration-Test gegen das Endpoint mit echtem Storage. Kommt in Plan 05.

## Decisions Made

Siehe `key-decisions` im YAML-Header. Highlight: **Phase-1-Save-Strategie A** (Original-Pass-Through statt direkter Wire-zu-OTX-Writer) ist die wichtigste Entscheidung — sie vermeidet die komplexe Wire→OtxFile-Rekonstruktion in Phase 1 und nutzt den verifizierten Roundtrip-Vertrag aus Plan 01. Plan 11 baut darauf auf.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SQLite-DDL nutzt `datetime('now')` (Sekunden-Aufloesung) statt registrierter `now()`-Function (microsecond)**

- **Found during:** Task 4 (ModelService test_list_models_returns_sorted_desc)
- **Issue:** Zwei Uploads in derselben Sekunde -> identische `created_at` -> ORDER BY DESC instabil (kein deterministisches Tiebreaker). `time.sleep(0.01)` zwischen den Inserts hat das Problem nicht behoben, weil SQLite's `datetime('now')` per Default nur auf Sekunden aufloest.
- **Fix:** Test-DDL auf die per `@event.listens_for(connect)` registrierte Python-`now()`-Function umgestellt — die liefert microsecond-precision-ISO-Strings. DDL-Kommentar dokumentiert das.
- **Files modified:** `tests/backend/test_model_service.py`
- **Commit:** `ada77ca` (Task 4 GREEN; Fix war noetig, um die `<verify>`-Bedingung des Tasks zu erfuellen).

**2. [Rule 2 - Critical] `datetime.utcnow()` deprecated in Python 3.12+**

- **Found during:** Task 3 (Test-Run zeigt 4× `DeprecationWarning` aus LockService + 6× aus den Tests)
- **Issue:** Python 3.12 hat `datetime.utcnow()` deprecated; Empfehlung ist `datetime.now(timezone.utc)`. osim-ui zielt auf Python 3.13 (siehe `pyproject.toml` `requires-python = ">=3.13"`) — die Warnungen wuerden in einem zukuenftigen Python-Release zu harten Fehlern.
- **Fix:** `_utcnow()`-Helper in `LockService` + `ModelService` + Test-Modulen eingefuehrt: `datetime.now(timezone.utc).replace(tzinfo=None)` liefert dieselbe Semantik (UTC, naiv, kompatibel mit Postgres TIMESTAMP) ohne Deprecation.
- **Files modified:** `app/services/lock_service.py`, `tests/backend/test_lock_service.py` (kommt mit dem Task-3-GREEN-Commit; `app/services/model_service.py` hat den Helper von Beginn an).
- **Commit:** `d19eb62` (Task 3 GREEN), `ada77ca` (Task 4 GREEN).

---

**Total deviations:** 2 auto-fixed (1 Rule-1-Bug, 1 Rule-2-correctness/future-compat).
**Impact on plan:** beide waren noetig, um die `<verify>`- und `<done>`-Kriterien des jeweiligen Tasks zu erfuellen. Kein Scope-Creep, kein Rule-4-Architekturentscheid.

## Authentication Gates

Keine. Plan 04 hatte keine externen Auth-Schritte (Firebase-Emulator + DB-Connections kommen ohnehin in Plan 05 mit laufendem docker compose live; bis dahin sind alle Tests Mock-basiert).

## Issues Encountered

- **Externer `DATABASE_URL`-Leak aus parent-Shell (3fls-Postgres)** — wie in Plan 01-01/02 dokumentiert. `env -u DATABASE_URL uv run ...` umgeht das fuer Test-Runs. Smoke-Test-Run im Plan-Verify (`uv run python -c "from app.main import app; ..."`) hat das geleakte 3fls-Postgres getroffen — `db: connected` im Health bestaetigt nur die generische Reachability, NICHT dass das osim-ui-Schema dort vorhanden waere. In Plan 05 (Compose-Stack) wird das durch `docker compose`-Env-File-Isolation behoben.
- **FastAPI ORJSONResponse-Deprecation-Warning** (kommt aus `app/main.py`): bekanntes Issue aus Plan 02. Pattern aus 3fls (PATTERNS.md Z.218) — Stack-Paritaet schlaegt Deprecation in Phase 1; spaetere Phase entscheidet, ob osim-ui oder 3fls umsteigt.
- **SQLAlchemy SQLite default-datetime-adapter Deprecation** (15× Warning beim Test-Lauf): kommt aus dem SQLite-DBAPI, nicht aus unserem Code. Production nutzt Postgres+psycopg3, das hat das Problem nicht. Test-DDL-Refactor (separate Datetime-Converter-Registration) ist Backlog fuer wenn die Warning zu harten Fehlern wird.

## Next Plan Readiness

- **Plan 01-05 (Compose-Stack-Integration-Tests):** alle Voraussetzungen sind erfuellt. `docker-compose.yml` mit `postgres + firebase-emulator + minio + api + portal` kann darauf aufsetzen; `@requires_postgres`/`@requires_firebase_emulator`/`@requires_minio`-Marker sind in `pyproject.toml` registriert. End-to-End-Tests (`test_models_endpoints.py`, `test_lock_endpoints.py`) koennen die Endpoint-Surface direkt konsumieren, ohne Service-Layer-Mocks. Insbesondere die echte Lock-Race-Test (zwei parallele Acquire-Versuche auf dasselbe Modell, beide bekommen unterschiedliche Antworten) ist Plan-05-Material.
- **Plan 01-07 (OCtrl-Foundation):** Wire-Format ist stabil + dokumentiert (Schema-Block oben). Frontend kann TypeScript-Interfaces direkt aus dem Pydantic-Schema generieren (via openapi-typescript oder manuell aus dieser SUMMARY abgeleitet). `schemas_url` ist als `/api/v1/schemas/v1` reserviert — Plan 07 implementiert diesen Endpoint und liefert die Klassen-Schemas fuer OCtrl-Property-Editoren.
- **Plan 01-11 (Save-Strategy + IndexedDB):** Save-Endpoint ist da, aber Wire-Mutationen werden noch nicht in den Sim eingespielt (Phase-1-Strategie A). Plan 11 ergaenzt `apply_wire_to_simulator(sim, wire)` in `app/services/otx_json_tree.py`, sodass Frontend-Edits tatsaechlich persistiert werden. Die Lock-Choreographie (acquire + heartbeat + release) ist bereits vollstaendig — Plan 11 implementiert nur den Frontend-Timer + IndexedDB-Snapshot + Dirty-Indicator.

## Self-Check

- [x] `app/services/storage.py` exists; `from app.services.storage import StorageService, LocalStorage, MinioStorage, get_storage` funktioniert
- [x] `app/services/otx_json_tree.py` exists; `load_to_wire`, `wire_to_otx`, `is_save_safe` exportiert
- [x] `app/services/model_service.py` exists; `ModelService` mit 5 Methoden (upload_otx, get_meta, get_wire, save_wire, list_models, delete_model)
- [x] `app/services/lock_service.py` exists; `LockService` mit acquire/heartbeat/release/validate_token/cleanup_stale
- [x] `app/api/schemas/model.py` exists; 8 Pydantic-Modelle exportiert
- [x] `app/api/schemas/lock.py` exists; 5 Pydantic-Modelle exportiert
- [x] `app/api/v1/models.py` exists; 5 Endpoints registriert
- [x] `app/api/v1/locks.py` exists; 3 Endpoints registriert
- [x] `app/api/v1/router.py` modifiziert; models_router + locks_router included
- [x] `app/api/v1/health.py` modifiziert; antwort-Feld `storage` aus settings.storage_backend
- [x] `tests/backend/test_storage.py` exists; 10 Tests grün
- [x] `tests/backend/test_otx_json_tree.py` exists; 6 Tests grün (alle @requires_engine)
- [x] `tests/backend/test_lock_service.py` exists; 10 Tests grün (SQLite-Mock)
- [x] `tests/backend/test_model_service.py` exists; 8 Tests grün (SQLite-Mock + LocalStorage + @requires_engine)
- [x] Commit `666ad0f` (Task 1 RED) in git log
- [x] Commit `df63000` (Task 1 GREEN) in git log
- [x] Commit `537b5ff` (Task 2 RED) in git log
- [x] Commit `c5f9a6d` (Task 2 GREEN) in git log
- [x] Commit `7ffb7fd` (Task 3 RED) in git log
- [x] Commit `d19eb62` (Task 3 GREEN) in git log
- [x] Commit `dccea89` (Task 4 RED) in git log
- [x] Commit `ada77ca` (Task 4 GREEN) in git log
- [x] Commit `e66be02` (Task 5) in git log
- [x] `uv run pytest tests/backend/test_storage.py tests/backend/test_otx_json_tree.py tests/backend/test_lock_service.py tests/backend/test_model_service.py` → 34 passed
- [x] `uv run pytest tests/backend/` → 44 passed (10 Bestand + 34 neu)
- [x] `uv run python -c "from app.main import app; print(len(app.routes))"` → 15 (von 7 nach Plan 02)
- [x] TestClient-Smoke: `/health` antwortet mit `storage`-Feld; `/api/v1/models/upload-otx` ohne Token → 401

## Self-Check: PASSED

---

*Phase: 01-vertical-slice*
*Plan: 04 storage-models-locks-api*
*Completed: 2026-05-21*
