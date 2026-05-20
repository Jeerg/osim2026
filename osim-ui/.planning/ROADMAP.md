# Roadmap: osim-ui

## Overview

Vom leeren Repo zur ersten lauffähigen Sim-Web-App mit Live-Visualisierung, parallelen Cloud-Workern, Reports und 3fls-Integration. Sechs Phasen, ~12–17 Wochen für v0.1.0.

## Querschnitts-Foundations

Drei Bausteine ziehen sich durch ALLE Phasen — nicht phasen-spezifisch:

1. **GraphObject-Schicht (`portal/src/graph/core/`)** — TypeScript-Port von `OSim2004/inc/GraphObj.h` (GObject/GObjLink/GLink/GraphView/GraphGrid/Region-Check/Phantom/4-Layer-Drawing). Wird in Phase 3 erstgebaut; ALLE graphischen Viewer (Phase 3 Durchlaufplan, Phase 5 Charts, Phase 7+ Matrix/Gantt) bauen darauf auf.

2. **Engine-Reflection-Schema** — JSON-Schema aller Modell-Klassen per Engine-Reflection generiert, nicht hand-geschrieben. Phase 2 etabliert es, alle späteren Modell-Erweiterungen profitieren.

3. **3fls-Pattern-Konformität** — wo immer 3fls eine etablierte Konvention hat, übernimmt osim-ui sie 1:1.

## Phases

- [ ] **Phase 1: Vertical Slice** — Viewer-Framework + OTX-Modellierung im Browser (Multi-Tenant-Backend + 12 Viewer)
- [ ] **Phase 2: JSON Editor** — Sim-Lauf + Engine-Reflection-Schema + Form-Editor
- [ ] **Phase 3: Live Viz** — GraphObject-Foundation + Durchlaufplan-Live-View + KPI-Charts
- [ ] **Phase 4: Cloud Parallel** — Eigenes GCP-Projekt + Cloud Run Jobs + Pub/Sub + Multi-Run
- [ ] **Phase 5: Reports** — PDF/Excel/CSV/JSON-Bundle, HKA + Steinbeis Templates
- [ ] **Phase 6: 3fls Iframe** — Iframe-Embedding in tbx_stzrim mit On-Behalf-Token-Exchange

## Phase Details

### Phase 1: Vertical Slice
**Goal**: Vollwertiges, beratungs-taugliches Web-Modellierungs-Werkzeug für OSim-Modelle im Browser, basierend auf `.otx`-Format. User können sich anmelden (Firebase + Schema-per-Tenant), ein OTX-Modell hochladen, im Browser über das Viewer-Framework (TypeScript-Port von OViewer) bearbeiten und periodisch zurück in OTX speichern. **Kein Sim-Lauf, kein Live-Monitoring in Phase 1.**
**Depends on**: Nothing (first phase)
**Success Criteria** (what must be TRUE):
  1. `docker compose up` startet alle Dev-Services (Postgres, Firebase-Emulator, Minio)
  2. User registriert/loggt sich via Firebase-Emulator ein; Lazy Tenant-Bootstrap legt automatisch `tenant_{uid}` an
  3. User kann `Vorstellung04/Dummy.otx` hochladen; Server parst via Engine; JSON-Tree wird an Browser geliefert
  4. Sidebar-Tree zeigt Workspace-Hierarchie (Modell → Durchlaufpläne → Knoten → Ressourcen → Schichten)
  5. 12 Viewer (Property + Matrix + Design + Verknüpfung + AZeit) funktionieren — vollständige Bearbeitung (Edit + Anlegen + Löschen + Verknüpfen)
  6. Auto-Save 30s + manueller Save + IndexedDB-Snapshot pro Änderung; Single-Editor-Lock funktioniert
  7. Save-back: Server schreibt modifizierte JSON-Struktur zurück als OTX via `dump_simulator_to_otx` (neuer Engine-Writer)
  8. Vollständige FastAPI-Foundation (versionierte APIs, Service-Layer, Alembic, structlog, RFC 7807, OpenAPI, Tests)
**Canonical refs**:
  - .planning/PROJECT.md
  - .planning/phases/01-vertical-slice/01-CONTEXT.md (MASSGEBLICH — 18 Implementation-Decisions)
  - .planning/research/osim-engine-api.md
  - .planning/research/3fls-patterns.md
  - .planning/research/copy-paste-guide.md
  - docs/ARCHITECTURE.md (TEILWEISE VERALTET vor Phase-1-Reframe)
  - OSim2004/OSimV01(Fj)/inc/OViewer.h (Vorlage für TypeScript-Port)
**Plans**: 10 plans (10 Wellen, davon Welle 0 = Engine-OTX-Writer im `engine/`-Subfolder)

Plans:
- [x] 01-01: Engine-OTX-Writer (`dump_simulator_to_otx`) im osim-engine-Repo — kritischer Vorlauf
- [x] 01-02: Backend-Foundation (FastAPI, Firebase Auth, Schema-per-Tenant, lazy Bootstrap)
- [ ] 01-03: Modell-CRUD (Storage, OTX-Roundtrip, JSON-Tree-Service, Edit-Lock)
- [ ] 01-04: Viewer-Foundation TypeScript (ViewerFrame/ClientCtrl + 9er OCtrl-Familie)
- [ ] 01-05: Sidebar-Tree + 4 Property-Viewer (PSimulator, PDurchlaufplan-Std, PGObjBase, AGruppe)
- [ ] 01-06: 3 Matrix-Viewer (RessBeleg, RessMenge, RessVerknuepfung)
- [ ] 01-07: PDurchlaufplan-Design + GraphObject-Foundation-Skelett
- [ ] 01-08: 4 Verknüpfungs-/Arbeitszeit-Viewer (PDlplBetriebsmittel, PDlplPersonal, AEinsatzWunsch, AKapBed)
- [ ] 01-09: Save-Mechanik (IndexedDB, Auto-Save 30s, Lock-Heartbeat, Recovery)
- [ ] 01-10: Integration-Tests, Playwright-E2E, manuelle Abnahme, Doku

### Phase 2: JSON Editor (kombiniert: Sim-Lauf + Schema + Form-Editor)
**Goal**: Backend kann Sim-Laeufe via REST orchestrieren (Subprozess-Isolation des LCG-Singletons), Engine liefert via Reflection ein JSON-Schema, Frontend rendert daraus einen Form-Editor und integriert Submit-/Status-/Download-Flow.
**Depends on**: Phase 1 + Engine-Voraussetzungen E2.1–E2.6 in `osim-engine`-Repo (in Plan 02-01 enthalten)
**Success Criteria** (what must be TRUE):
  1. `python -m osim_engine.schema dump` liefert vollständiges JSON-Schema (Draft 2020-12)
  2. Round-Trip-Test OTX→JSON→Sim ergibt bit-identischen Trace zu OTX→Sim (Engine + Backend-Integration)
  3. Frontend rendert Form-Editor automatisch aus Schema; Minimal-Modell (1 Auslöser + 2 Knoten + 1 Kante) im Browser anlegbar
  4. Schema-Validation lehnt invalide Modelle mit field-level Fehlermeldungen ab
  5. Sim-Submit via REST funktioniert: `POST /api/v1/runs` -> Polling -> JSONL-Trace-Download (E2E-Latenz < 30s für Dummy.otx)
  6. OTX-Modelle aus Phase 1 lassen sich via `convert-to-json` ueberfuehren; Coverage-Report wird im UI angezeigt
  7. Playwright-E2E gruen
**Canonical refs**:
  - .planning/phases/02-json-editor/02-PRELIMINARY-PLAN.md
  - .planning/research/osim-engine-api.md
**Plans**: 6 plans
Plans:
- [ ] 02-01-PLAN.md — Engine-Sprint E2.1-E2.6 (Class-Registry, Schema-Generator, JSON-Loader/Dumper, Round-Trip-Test im osim-engine-Sub-Repo)
- [ ] 02-02-PLAN.md — Sim-Orchestrator + Worker-CLI + REST /runs (Subprozess-Isolation des LCG-Singletons)
- [ ] 02-03-PLAN.md — Schema-Endpoint + JSON-Modell-CRUD + Form-Editor (@rjsf + shadcn + Custom-Widgets)
- [ ] 02-04-PLAN.md — OTX-zu-JSON-Konvertierung + gemeinsamer Modell-Browser
- [ ] 02-05-PLAN.md — Run-Submit-Form + Status-Polling-Page + Trace-Download (Frontend)
- [ ] 02-06-PLAN.md — Integration-Tests + Playwright-E2E + Docs (PHASE-2-JSON-EDITOR.md, ENGINE-SYNC.md)

### Phase 3: Live Viz
**Goal**: GraphObject-Foundation aufbauen (TypeScript-Port von `GraphObj.h` — Basis für ALLE graphischen Viewer) und damit den ersten Konsumenten realisieren: Live-Visualisierung des Durchlaufplans mit Status-Animation und KPI-Dashboard.
**Depends on**: Phase 2 (für JSON-Modell-Format und Sim-Orchestrator-Backend)
**Success Criteria** (what must be TRUE):
  1. (LV-01) Durchlaufplan wird graphisch mit ein-/ausgehenden Kanten korrekt dargestellt
  2. (LV-02) Knoten färben sich live während Sim-Lauf (<500 ms Latenz)
  3. (LV-03) Hierarchische Sub-Pläne (`GObjSub`) via Doppelklick öffenbar
  4. (LV-04) Region-Check funktioniert (Klick-Mitte = Edit, Rand = Link-ziehen)
  5. (LV-05) Live-KPI-Charts: Sim-Zeit, abgeschlossene Pläne, Maschinen-Auslastung (<1 s Update)
  6. (LV-06) Performance: 30 FPS @ 50 Knoten
  7. (LV-07) Foundation-Bereitschaft: API stabil für Phase-5- und Phase-7+-Konsumenten
**Canonical refs**:
  - .planning/phases/03-live-viz/03-PRELIMINARY-PLAN.md
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h
  - .planning/research/osim2004-ui-analysis.md
**Requirements:** [LV-01, LV-02, LV-03, LV-04, LV-05, LV-06, LV-07]
**Plans:** 6 plans
Plans:
- [ ] 03-01-PLAN.md — GraphObject-Schicht voll: alle 18 GObjType-Klassen, GLinkPoint mit CheckNeighbourhood, GraphGrid, GObjSub, Persistenz (Clipboard/Serializer)
- [ ] 03-02-PLAN.md — Backend WebSocket-Endpoint + Worker-Event-Bridge (in-Process LiveBus)
- [ ] 03-03-PLAN.md — Frontend WebSocket-Client + EventRouter + KpiAggregator + useLiveRun-Hook
- [ ] 03-04-PLAN.md — RunsLivePage mit Recharts-KPI-Dashboard + Status-Banner + Cancel-Steuerung
- [ ] 03-05-PLAN.md — Animations-Hooks in Phase-1-Viewer (PDurchlaufplanViewerDesign, PRessBelegMatrixViewer, AEinsatzWunschViewer)
- [ ] 03-06-PLAN.md — E2E + Latency- + Performance-Tests + Architektur-Doku

### Phase 4: Cloud Parallel
**Goal**: Aus Single-Host-MVP wird horizontal skalierbare Cloud-App. Eigenes GCP-Projekt, Worker als Cloud Run Jobs, Cloud Tasks Queue, Pub/Sub-Live-Events, Multi-Run-Aggregation.
**Depends on**: Phase 3 (für Live-Viz-Multiplexing über Pub/Sub)
**Success Criteria** (what must be TRUE):
  1. GCP-Projekte `osim-ui-staging` und `osim-ui-prod` mit IAM, Workload-Identity, Secret-Manager
  2. Cloud Build deployt API + Worker + Portal automatisch
  3. Multi-Run mit `repeats=10` läuft, Aggregation funktioniert
  4. Pub/Sub-basiertes Live-Streaming funktioniert über API-Replicas hinweg
  5. Per-Tenant-Quota + Per-Run-Timeout durchgesetzt
  6. Stress-Test 10 User × 5 Runs in <60 min ohne Stau
**Canonical refs**:
  - .planning/phases/04-cloud-parallel/04-PRELIMINARY-PLAN.md
  - .planning/research/3fls-patterns.md
**Plans**: TBD (Vorplan in `04-PRELIMINARY-PLAN.md` mit 7 Wellen)

### Phase 5: Reports
**Goal**: User exportiert Sim-Ergebnisse als PDF (druckbar), Excel/CSV (Weiterverarbeitung), JSON-Bundle (Sharing). HKA-Klausur-Template und Steinbeis-Beratungs-Brief eingebaut.
**Depends on**: Phase 4 (für skaliertes Report-Worker-Pattern)
**Success Criteria** (what must be TRUE):
  1. PDF-Generation in <10 s mit allen Original-KPIs
  2. Klausur-Datenblatt-Template (HKA) und Beratungs-Brief-Template (Steinbeis) verfügbar
  3. Multi-Run-Report mit Mean/Median/CI über alle Sub-Runs
  4. CSV/Excel-Export mit korrekter Formatierung
  5. JSON-Bundle (Modell + Config + Trace + KPIs) als ZIP downloadbar
**Canonical refs**:
  - .planning/phases/05-reports/05-PRELIMINARY-PLAN.md
  - .planning/research/osim2004-ui-analysis.md
**Plans**: TBD (Vorplan in `05-PRELIMINARY-PLAN.md` mit 6 Wellen)

### Phase 6: 3fls Iframe
**Goal**: osim-ui ist als Iframe im 3fls-Portal eingebunden. 3fls-User klickt "Simulation" und ist direkt im osim-ui ohne erneuten Login.
**Depends on**: Phase 4 (separate GCP-Projekte stehen) + Phase 5 (Feature-vollständig)
**Success Criteria** (what must be TRUE):
  1. 3fls-Portal hat Navigations-Item "Simulation" → öffnet `/simulation` Route mit iframe
  2. On-Behalf-Token-Exchange funktioniert (3fls-Token → osim-ui-Custom-Token)
  3. Iframe ist responsive (Auto-Resize via PostMessage)
  4. Standalone-Modus von osim-ui bleibt voll funktional
  5. CSP-Header erlauben Embedding NUR durch tbx_stzrim
**Canonical refs**:
  - .planning/phases/06-3fls-iframe/06-PRELIMINARY-PLAN.md
  - .planning/research/3fls-patterns.md
**Plans**: TBD (Vorplan in `06-PRELIMINARY-PLAN.md` mit 5 Wellen)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Vertical Slice | 0/TBD | Not started | - |
| 2. JSON Editor | 0/6 | Plans created | - |
| 3. Live Viz | 0/6 | Plans created | - |
| 4. Cloud Parallel | 0/TBD | Not started | - |
| 5. Reports | 0/TBD | Not started | - |
| 6. 3fls Iframe | 0/TBD | Not started | - |

## Backlog (post-v0.1.0)

| Idee | Mögliche Phase | Notiz |
|---|---|---|
| Visueller Drag-and-Drop Modell-Editor | 7 | React-Flow als Editor; Knoten-Palette aus GObjType-Enum |
| Ressourcen-/Matrix-/Gantt-Viewer | 7 | weitere GraphObject-Subklassen |
| DAG-Pläne | 8 | sobald Engine v2 verfügbar |
| Tutorial-Tour | — | HKA-Lehre |
| `AZeitSim.exe`-Interop | — | Win32-Bestandsmodelle |
| Modell-Vergleich Side-by-Side | — | Klausur-Auswertung |
| Versioning / Modell-Branches | — | iteratives Beratungsmodell |
| Audit-Log | — | Beratungs-Compliance |
| Datenimport aus SAP-Stammdaten (via 3fls) | — | Beratungsprojekte |
| Visueller Report-Template-Editor | — | über Phase 5 hinaus |
| Module Federation statt Iframe | — | Phase-6-Upgrade |
