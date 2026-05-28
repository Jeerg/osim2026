---
status: testing
phase: 01-vertical-slice
source:
  - .planning/phases/01-vertical-slice/01-01-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-02-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-03-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-04-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-05-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-06-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-07-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-08-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-09-SUMMARY.md
  - .planning/phases/01-vertical-slice/01-10-SUMMARY.md
started: 2026-05-21T00:00:00Z
updated: 2026-05-21T00:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  `docker compose down -v && docker compose up -d` startet alle Services (postgres + firebase-emulator + optional minio) ohne Fehler. `uv run alembic upgrade head` läuft idempotent durch. `uv run uvicorn app.main:app` startet ohne Fehler. `cd portal && npm run dev` startet Vite auf Port 3000. Browser auf <http://localhost:3000> zeigt Login-Page ohne Console-Errors.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: docker compose up + alembic upgrade + uvicorn + npm run dev → alles startet sauber, Login-Page erreichbar, keine Console-Errors
result: issue
reported: "ich sehe nichts!!"
severity: blocker

### 2. SC-1 Dev-Services starten
expected: `docker compose up` startet postgres + firebase-emulator. `docker ps` zeigt beide Container als healthy.
result: pending

### 3. SC-2 Firebase-Login + Lazy Tenant-Bootstrap
expected: Login via Firebase-Emulator (E-Mail+Password) funktioniert. Nach Erst-Login wird automatisch ein Tenant + User-Row angelegt. `psql -d osim_ui -c "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%';"` zeigt das neue Schema `tenant_<uid>`.
result: pending

### 4. SC-3 OTX-Upload mit Coverage-Report
expected: Hochladen von `Vorstellung04/Dummy.otx` → UI zeigt Coverage-Report (geladene/skipped/unsupported Klassen). Modell erscheint in der Liste. Im Backend-Storage liegt die OTX-Datei unter `tenants/{tenant_id}/models/{id}/v1-*.otx`.
result: pending

### 5. SC-4 Sidebar-Tree zeigt Workspace-Hierarchie
expected: Klick auf das hochgeladene Modell → Sidebar links zeigt Tree: Modell-Root → Pläne → Knoten → Ressourcen-Sektion → Schichten. Mindestens 5 verschiedene Folder/Items navigierbar. Klick auf einen Tree-Node mountet rechts den passenden Viewer.
result: pending

### 6. SC-5 Alle 12 Viewer funktional
expected: Nacheinander erreichbar (per Sidebar-Click): (1) PSimulatorViewer Root, (2) PDurchlaufplanViewer-Std, (3) PDurchlaufplanViewer-Design (Tab "Design", React-Flow-Canvas mit Knoten/Kanten), (4) PGObjBaseViewer als Fallback, (5-7) PRessBeleg/Menge/Verknuepfungs-Matrix-Viewer, (8-9) PDlplBetriebsmittel/Personal (read-only Banner), (10) AEinsatzWunschViewer (7×24-Raster), (11) AKapBedViewer (Periode×Bedarf-Tabelle), (12) AGruppeViewer. Mindestens 1 Property-Edit funktioniert.
result: pending

### 7. SC-6 Auto-Save 30s + IndexedDB-Snapshot + Single-Editor-Lock
expected: (a) Edit einer Property → DirtyIndicator zeigt "ungespeichert". (b) Nach 30s sieht man im Network-Tab einen PUT /tree-Request, DirtyIndicator clear. (c) Tab schließen ohne Save → neuer Tab → RecoveryPrompt erscheint. (d) Inkognito-Browser → gleiches Modell öffnen → LockBanner "Modell wird bearbeitet", Inputs disabled.
result: pending

### 8. SC-7 Save-back als OTX via dump_simulator_to_otx
expected: Nach einem Save (manuell oder Auto) erscheint im Storage eine neue Version `v2-*.otx`. Diese Datei lässt sich mit `python -c "from osim_engine.io import load_otx_file; r = load_otx_file('path/to/v2-*.otx'); print(r.summary())"` wieder laden ohne Crash, mit ähnlicher Coverage zum Original.
result: pending

### 9. SC-8 Vollständige FastAPI-Foundation
expected: (a) `curl http://localhost:8000/health` → 200 (kein Auth). (b) `curl http://localhost:8000/readiness` → 200 mit DB-Check. (c) `curl http://localhost:8000/api/v1/models` ohne Auth-Header → 401 mit RFC-7807 ProblemDetail (Content-Type `application/problem+json`). (d) Browser auf <http://localhost:8000/docs> → OpenAPI-UI mit allen Endpoints sichtbar. (e) `uv run alembic downgrade base && uv run alembic upgrade head` idempotent.
result: pending

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0

## Gaps

- truth: "Cold-Start (docker compose up + alembic + uvicorn + npm run dev) bringt Login-Page auf localhost:3000 zum Anzeigen"
  status: failed
  reason: "User reported: ich sehe nichts!!"
  severity: blocker
  test: 1
  artifacts: []
  missing: []
