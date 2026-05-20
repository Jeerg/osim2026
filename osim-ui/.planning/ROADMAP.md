# Roadmap: osim-ui

## Overview

Vom leeren Repo zur ersten lauffähigen Sim-Web-App mit Live-Visualisierung, parallelen Cloud-Workern, Reports und 3fls-Integration. Sechs Phasen, ~12–17 Wochen für v0.1.0.

## Querschnitts-Foundations

Drei Bausteine ziehen sich durch ALLE Phasen — nicht phasen-spezifisch:

1. **GraphObject-Schicht (`portal/src/graph/core/`)** — TypeScript-Port von `OSim2004/inc/GraphObj.h` (GObject/GObjLink/GLink/GraphView/GraphGrid/Region-Check/Phantom/4-Layer-Drawing). Wird in Phase 3 erstgebaut; ALLE graphischen Viewer (Phase 3 Durchlaufplan, Phase 5 Charts, Phase 7+ Matrix/Gantt) bauen darauf auf.

2. **Engine-Reflection-Schema** — JSON-Schema aller Modell-Klassen per Engine-Reflection generiert, nicht hand-geschrieben. Phase 2 etabliert es, alle späteren Modell-Erweiterungen profitieren.

3. **3fls-Pattern-Konformität** — wo immer 3fls eine etablierte Konvention hat, übernimmt osim-ui sie 1:1.

## Phases

- [ ] **Phase 1: Vertical Slice** — Login → OTX-Upload → Sim → Status → Trace-Download
- [ ] **Phase 2: JSON Editor** — Engine-Reflection-Schema + Form-Editor
- [ ] **Phase 3: Live Viz** — GraphObject-Foundation + Durchlaufplan-Live-View + KPI-Charts
- [ ] **Phase 4: Cloud Parallel** — Eigenes GCP-Projekt + Cloud Run Jobs + Pub/Sub + Multi-Run
- [ ] **Phase 5: Reports** — PDF/Excel/CSV/JSON-Bundle, HKA + Steinbeis Templates
- [ ] **Phase 6: 3fls Iframe** — Iframe-Embedding in tbx_stzrim mit On-Behalf-Token-Exchange

## Phase Details

### Phase 1: Vertical Slice
**Goal**: Ein angemeldeter User kann ein `.otx`-Modell hochladen, einen Sim-Lauf starten, den Status sehen und die JSONL-Trace herunterladen — alles lokal mit `docker compose up`.
**Depends on**: Nothing (first phase)
**Success Criteria** (what must be TRUE):
  1. `docker compose up` startet alle Dev-Services (Postgres, Firebase-Emulator, Minio)
  2. User kann sich via Firebase-Emulator registrieren und einloggen
  3. User kann `Vorstellung04/Dummy.otx` hochladen → Coverage-Report wird angezeigt
  4. User startet Sim-Lauf, sieht Status-Update (Polling), lädt Trace-Datei am Ende herunter
  5. Multi-Tenant-Schemas sind angelegt; alle Queries laufen im richtigen Schema
**Canonical refs**:
  - .planning/PROJECT.md
  - .planning/research/osim-engine-api.md
  - .planning/research/3fls-patterns.md
  - .planning/research/copy-paste-guide.md
  - docs/ARCHITECTURE.md
  - .planning/phases/01-vertical-slice/01-PRELIMINARY-PLAN.md
**Plans**: TBD (Vorplan in `01-PRELIMINARY-PLAN.md` mit 7 Wellen)

### Phase 2: JSON Editor
**Goal**: User legt OSim-Modell direkt im UI als JSON an (ohne `.otx`-Upload). JSON-Schema wird per Engine-Reflection generiert — Engine bleibt Single Source of Truth.
**Depends on**: Phase 1 + Engine-Voraussetzungen E2.1–E2.6 in `osim-engine`-Repo
**Success Criteria** (what must be TRUE):
  1. `python -m osim_engine.schema dump` liefert vollständiges JSON-Schema
  2. Frontend rendert Form-Editor automatisch aus Schema
  3. Minimal-Modell (1 Auslöser + 2 Knoten + 1 Kante) im Browser anlegbar
  4. Round-Trip-Test OTX→JSON→Sim ergibt bit-identischen Trace zu OTX→Sim
  5. Schema-Validation lehnt invalide Modelle mit klarer Fehlermeldung ab
**Canonical refs**:
  - .planning/phases/02-json-editor/02-PRELIMINARY-PLAN.md
  - .planning/research/osim-engine-api.md
**Plans**: TBD (Vorplan in `02-PRELIMINARY-PLAN.md` mit 5 Wellen)

### Phase 3: Live Viz
**Goal**: GraphObject-Foundation aufbauen (TypeScript-Port von `GraphObj.h` — Basis für ALLE graphischen Viewer) und damit den ersten Konsumenten realisieren: Live-Visualisierung des Durchlaufplans mit Status-Animation und KPI-Dashboard.
**Depends on**: Phase 2 (für JSON-Modell-Format)
**Success Criteria** (what must be TRUE):
  1. Durchlaufplan wird graphisch mit ein-/ausgehenden Kanten korrekt dargestellt
  2. Knoten färben sich live während Sim-Lauf (<500 ms Latenz)
  3. Hierarchische Sub-Pläne (`GObjSub`) via Doppelklick öffenbar
  4. Region-Check funktioniert (Klick-Mitte = Edit, Rand = Link-ziehen)
  5. Live-KPI-Charts: Sim-Zeit, abgeschlossene Pläne, Maschinen-Auslastung (<1 s Update)
  6. Performance: 30 FPS @ 50 Knoten
  7. Foundation-Bereitschaft: API stabil für Phase-5- und Phase-7+-Konsumenten
**Canonical refs**:
  - .planning/phases/03-live-viz/03-PRELIMINARY-PLAN.md
  - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\GraphObj.h
  - .planning/research/osim2004-ui-analysis.md
**Plans**: TBD (Vorplan in `03-PRELIMINARY-PLAN.md` mit 7 Wellen)

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
| 2. JSON Editor | 0/TBD | Not started | - |
| 3. Live Viz | 0/TBD | Not started | - |
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
