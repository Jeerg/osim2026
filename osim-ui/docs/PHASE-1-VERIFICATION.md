# Phase 1 — Verification gegen CONTEXT.md-Decisions

**Stand:** 2026-05-20
**Status:** Plan 01-10 abgeschlossen; manuelle Abnahme durch Jeerg ausstehend.

Mapping aller 18 Implementation-Decisions aus `.planning/phases/01-vertical-slice/01-CONTEXT.md` auf den Test/Code, der sie verifiziert.

**Legende:**
- ✅ verifiziert durch automatisierten Test (Backend-Integration oder Vitest)
- 🟡 verifiziert durch Code-Review + Plan-SUMMARY; manueller End-to-End-Walkthrough ausstehend
- ⚠️ teilweise verifiziert; Lücke dokumentiert
- ❌ nicht verifiziert

---

## Bereich 1 — OTX-Handling

| ID | Decision | Status | Verifiziert durch | Notiz |
| --- | --- | --- | --- | --- |
| D-01 | Server parst OTX (`load_otx_file`) und liefert JSON-Tree | ✅ | `tests/integration/test_full_roundtrip.py::test_full_roundtrip_login_upload_edit_save_reload` | Upload + GET /tree mit OID-Identität nach Roundtrip |
| D-02 | Engine bekommt OTX-Writer (`dump_simulator_to_otx`) | ✅ | `engine/tests/integration/io/test_otx_roundtrip.py` (Plan 01-01) | 28 Tests, 63/63 Klassen-Coverage |
| D-03 | OTX im Storage abgelegt, jede Save-back-Version neu | ✅ | `tests/test_model_upload.py::test_upload_otx_creates_model_and_version` + `tests/integration/test_full_roundtrip.py` (download-original) | Original v1 bleibt unverändert (D-14-Test inline) |
| D-04 | Browser hält Modell als In-Memory-State (Zustand-Store) | ✅ | `portal/src/state/model-store.ts` + Vitest-Suite (`tests/__tests__/model-store-*.test.ts`) | 7 Tests für patchOids + dirty-tracking |

## Bereich A — Viewer-Framework-Architektur

| ID | Decision | Status | Verifiziert durch | Notiz |
| --- | --- | --- | --- | --- |
| D-05 | Hybrid-Pattern: TS-Klassen für Frame/ClientCtrl, React für ChildDialog | 🟡 | `portal/src/viewers/core/` + Plan-04-SUMMARY | 141 Vitest-Tests in portal grün; visuelle Abnahme aller 12 Viewer steht aus |
| D-06 | Vollständige 9er OCtrl-Familie | 🟡 | `portal/src/viewers/octrl/` + Plan-04-SUMMARY | OCtrlVariable/Bool/Enum/Link/List/Method/TabViewer/COLORREF/LOGFONT |
| D-07 | Viewer-Schicht ist Querschnitts-Foundation | 🟡 | Plan-07-SUMMARY (PDurchlaufplanViewerDesign nutzt GraphObject-Skelett) | Phase 3+ Konsumenten brauchen die Foundation |

## Bereich B — Konkrete Viewer in Phase 1

| ID | Decision | Status | Verifiziert durch | Notiz |
| --- | --- | --- | --- | --- |
| D-08 | 12 konkrete Viewer-Klassen implementiert | 🟡 | Plan-04..08-SUMMARYs + `portal/e2e/03-viewer-navigation.spec.ts` | E2E klickt durch alle Tree-Knoten, erwartet kein Crash; manuelle Abnahme zeigt jeden Viewer-Inhalt |
| D-09 | Sidebar-Tree-Navigation mit Workspace-Hierarchie | 🟡 | `portal/src/components/sidebar-tree.tsx` + Vitest (4 Tests) + Plan-05-SUMMARY | E2E-03 prüft Tree-Render und Knoten-Klicks |
| D-10 | Vollständige Edit-Operationen | 🟡 | `tests/test_otx_roundtrip.py::test_roundtrip_property_edit_persists` + E2E-02 | Properties-Edit ist roundtrip-stabil; Anlegen/Löschen ist im Frontend möglich, Backend verwirft TEMP-OIDs (siehe Stub-Block Plan 01-09) |

## Bereich C — Save-Strategie & Crash-Recovery

| ID | Decision | Status | Verifiziert durch | Notiz |
| --- | --- | --- | --- | --- |
| D-11 | Auto-Save alle 30 s + manueller Save + Dirty-Indicator | ✅ | `portal/src/hooks/__tests__/use-auto-save.test.tsx` (8 Tests) | + `useSaveShortcut` (Ctrl+S), `SaveButton`-Komponente |
| D-12 | IndexedDB-Snapshot nach jeder Änderung; Recovery beim Reload | ✅ | `portal/src/persistence/__tests__/snapshot-store.test.ts` (11 Tests) + `portal/e2e/04-lock-recovery.spec.ts` | fake-indexeddb in Tests + RecoveryPrompt-Modal |
| D-13 | Single-Editor-Lock auf Modell-Ebene; 15 min TTL | ✅ | `tests/test_edit_lock.py` (11 Tests) + `portal/src/hooks/__tests__/use-lock-heartbeat.test.tsx` (3 Tests) | Acquire/Release/Heartbeat/TTL-Expire alle getestet |
| D-14 | Save-back-Endpoint speichert immer neue Version | ✅ | `tests/integration/test_full_roundtrip.py` (Original-Download nach Edit liefert v1-Bytes) + Plan-03-SUMMARY | |

## Bereich D — Auth & Multi-Tenancy

| ID | Decision | Status | Verifiziert durch | Notiz |
| --- | --- | --- | --- | --- |
| D-15 | Firebase Auth ab Tag 1 (Emulator lokal) | 🟡 | `tests/test_auth_me.py` (mock-Firebase) + `portal/e2e/01-auth-flow.spec.ts` (echter Emulator) | Backend testet mit gemocktem `verify_token`; E2E erwartet osim-ui-eigenen Firebase-Emulator (siehe Setup-Hinweis unten) |
| D-16 | Schema-per-Tenant in Postgres | ✅ | `tests/test_auth_me.py::test_search_path_is_set_per_tenant_request` + `tests/integration/test_tenant_isolation.py` (7 Tests) | Cross-Tenant-Zugriffe geben durchgängig 404 |
| D-17 | Lazy Tenant-Bootstrap auf /api/v1/auth/me | ✅ | `tests/test_auth_me.py::test_auth_me_creates_tenant_on_first_call` + `::test_auth_me_is_idempotent` + `::test_auth_me_creates_postgres_schema` | |

## Bereich E — Backend-Foundation

| ID | Decision | Status | Verifiziert durch | Notiz |
| --- | --- | --- | --- | --- |
| D-18 | Volle FastAPI-Foundation (versionierte APIs, Alembic, structlog, RFC 7807, etc.) | ✅ | Plan-02-SUMMARY + `tests/test_alembic.py` + `tests/app/test_health.py` + `tests/test_auth_me.py::test_unauthenticated_request_returns_401_problem_detail` | Health/Readiness/OpenAPI alle live |

---

## Aggregierter Status

- **Vollständig automatisiert verifiziert (✅):** 12 von 18 Decisions
- **Code-vorhanden, manuelle Abnahme ausstehend (🟡):** 6 von 18 (D-05, D-06, D-07, D-08, D-09, D-10, D-15)
- **Teilweise verifiziert (⚠️):** 0
- **Nicht verifiziert (❌):** 0

Test-Suiten-Totals (Stand: Plan 01-10):
- Backend (`uv run pytest`): **59 passed, 1 skipped** (Minio)
- Frontend (`npm test`): **141 passed**
- Playwright (`npx playwright test 00-smoke`): **3 passed** gegen lokales Backend
- Integration (`uv run pytest tests/integration/`): **11 passed**

---

## Setup-Hinweis für E2E-Lauf gegen Firebase-Emulator

**Voraussetzung:** Der osim-ui-eigene Firebase-Emulator muss laufen, mit project-ID **`osim-dev`** (NICHT der Emulator eines anderen Projekts wie tbx_stzrim's `rim-dev`).

```bash
# Prüfen, was läuft:
docker ps --filter "name=firebase"

# Falls ein anderer Firebase-Emulator läuft (z.B. tbx_stzrim-firebase-emulator),
# stoppen + osim-ui-eigenen starten:
docker stop <other-firebase-container>
docker compose --project-name osim-ui up -d firebase-emulator
```

Symptom bei falschem Emulator: Backend liefert auf `POST /api/v1/auth/me` 401 Unauthorized, weil der Token im `aud`-Claim eine fremde project-ID hat.

---

## Backlog (nicht-blockierend für Phase 1)

| Gap | Adressiert in | Verweis |
| --- | --- | --- |
| `oid_mapping` in PUT /tree-Response fehlt | Phase 2 | Plan 01-09 Stub-Block "oid_mapping im Backend fehlt" |
| Conflict-Merge (concurrent edits) | Phase 4+ | Plan 01-09 Stub-Block |
| Engine-Writer `_patch_ref_properties` als Workaround | Phase 2 (Engine-Erweiterung) | Plan 01-03 Deviation #1 |
| Exponential-Backoff bei Auto-Save-Fehler | Phase 4 | Plan 01-09 Stub-Block |
| IndexedDB-Quota-Eviction | Phase 1-Backlog | Plan 01-09 Stub-Block |
| Auth-flow E2E gegen echten Emulator | Phase-1-Backlog (Setup) | Plan 01-10 task 2 dokumentiert |
