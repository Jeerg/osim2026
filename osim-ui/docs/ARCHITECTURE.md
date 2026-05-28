# osim-ui — Systemarchitektur

**Stand:** 2026-05-21 (resynchronisiert nach Phase-1-Reframe)
**Status:** Entwurf, vor Phase-1-Plan

> Dieses Dokument beschreibt die Ziel-Architektur über alle sieben Phasen hinweg. Phase 1 setzt das OViewer-Framework + die OTX-Modellierung im Browser um (kein Sim-Lauf — der folgt in Phase 2). Vollausbau über die Roadmap (`.planning/ROADMAP.md`).

---

## 1. Architektur-Überblick

```
                                   Browser
                          ┌────────────────────────────┐
                          │  React 19 SPA              │
                          │  (Vite + TS + Tailwind)    │
                          │  TanStack Router/Query     │
                          │  Firebase Auth Client      │
                          │  Recharts + WS-Client      │
                          │  ───────────────────────── │
                          │  OViewer-Foundation        │  ← Phase 1+,
                          │  (portal/src/viewers/core) │    Querschnitt für
                          │  + 9-er OCtrl-Familie      │    ALLE Editing-/
                          │  + 12 konkrete Viewer      │    Form-Viewer
                          │  ───────────────────────── │
                          │  GraphObject-Foundation    │  ← Phase 1 (Basis)
                          │  (portal/src/graph/core)   │    Phase 4 (voll),
                          │  + React-Flow-Adapter      │    Querschnitt für
                          │  + OSim-Subklassen         │    graphische Viewer
                          │  ───────────────────────── │
                          │  Embedded-Mode-Bridge      │  ← Phase 7,
                          │  (PostMessage, ?embedded=1)│    für 3fls-Iframe
                          └────────────┬───────────────┘
                                       │ HTTPS + WSS
                          ┌────────────┴────────────┐
                          │   API-Edge / FastAPI    │
                          │   - REST /api/v1/*      │
                          │   - WebSocket /ws/runs  │
                          │   - Firebase Token-Auth │
                          │   - Schema-per-Tenant   │
                          └─┬─────────┬─────────────┘
                            │         │ Pub/Sub  + JobControl
                            │         ▼
                            │   ┌──────────────┐
                            │   │ Run-Orchestr.│  (in-API Service)
                            │   │ - submit     │
                            │   │ - cancel     │
                            │   │ - status     │
                            │   └─┬───────┬────┘
                            │     │       │  enqueue
                            │     │       ▼
                            │     │  ┌─────────────────────────┐
                            │     │  │  Worker-Pool            │
                            │     │  │  N × Container          │
                            │     │  │  python -m osim_ui.worker│
                            │     │  │  └─ PSimulator-Subprocs│
                            │     │  └─┬─────────┬─────────────┘
                            │     │    │ JSONL   │ Pub/Sub
                            │     │    │ Trace   │ Live-Events
                            │     │    ▼         ▼
                            │     │  ┌───────────────┐
                            │     │  │ GCS Bucket    │  (Trace + Reports)
                            │     │  └───────────────┘
                            ▼     ▼
                          ┌────────────────────────┐
                          │  PostgreSQL 17         │
                          │  - Public: tenants,    │
                          │    users, sessions     │
                          │  - tenant_X: models,   │
                          │    runs, runs_summary  │
                          │    artifacts (refs)    │
                          └────────────────────────┘
```

---

## 2. Komponenten

### 2.1 Frontend (`portal/`)
- **Stack:** React 19 + TypeScript + Vite + TanStack Router (file-based, beforeLoad-Auth-Guard) + TanStack Query + Zustand + Tailwind 4 + shadcn + Recharts
- **Auth-Client:** Firebase Auth (E-Mail/Google), Token-Refresh über AuthProvider
- **API-Client:** `apiFetch<T>` mit JWT-Injection (Pattern aus 3fls 1:1)
- **Live-Channel:** WebSocket-Client an `/ws/runs/{run_id}` für Sim-Events
- **Routen-Skelett (Phase 1 — OViewer + OTX-Modellierung):**
  - `/login` — Login/Sign-up
  - `/` — Dashboard (eigene Modelle, Last-Edited)
  - `/models` — Modell-Bibliothek (Upload `.otx`, Liste)
  - `/models/:id` — Modell-Workspace: Sidebar-Tree links (Modell → Pläne → Knoten → Ressourcen → Schichten), Viewer-Bereich rechts; öffnet je nach Tree-Klick einen der 12 konkreten Viewer
- **Routen-Erweiterung (Phase 2 — Sim-Lauf):**
  - `/models/:id` erhält Sim-Start-Button (öffnet Konfig-Dialog im PSimulatorViewer)
  - `/runs/:id` — Lauf-Status-Ansicht (Polling) + Trace-Download
  - `/runs` — Lauf-Historie
- **Routen-Erweiterung (Phase 3 — JSON-Editor):**
  - `/models/new` — Form-Editor für neues Modell aus Engine-Reflection-Schema
  - `/models/:id/json` — JSON-Form-Editor parallel zum OViewer-Workspace

### 2.2 API-Backend (`app/`)
- **Stack:** FastAPI 0.115+, Uvicorn, Python 3.13, SQLAlchemy 2.0 **sync + psycopg3** (3fls-Parität), Alembic, uv
- **Routen (Phase 1 — OViewer + OTX-Modellierung):**
  - `POST /api/v1/auth/me` — Tenant-Status-Bootstrap nach Login (3fls-Pattern), lazy Tenant-Create
  - `POST /api/v1/models/upload-otx` — `.otx`-Upload → Engine parst → JSON-Tree + Original-OTX in Storage
  - `GET /api/v1/models` — Liste pro Tenant
  - `GET /api/v1/models/{id}` — Detail (JSON-Tree des aktuellen Stands)
  - `PUT /api/v1/models/{id}` — Save-back: JSON-Tree wird zu OTX serialisiert (Engine-OTX-Writer) und als neue Version in Storage abgelegt
  - `POST /api/v1/models/{id}/lock` / `DELETE /api/v1/models/{id}/lock` — Single-Editor-Lock
- **Routen (Phase 2 — Sim-Lauf):**
  - `POST /api/v1/runs` — Lauf submitten (model_id, seed, start, end, period_len)
  - `GET /api/v1/runs/{id}` — Lauf-Status + Summary
  - `POST /api/v1/runs/{id}/cancel`
  - `GET /api/v1/runs/{id}/trace` — Signed-URL für JSONL-Trace
- **Routen (Phase 4 — Live Viz):**
  - `WS /ws/runs/{id}` — Live-Event-Stream (ersetzt Polling aus Phase 2)
- **Auth-Middleware:** `TenantAuthMiddleware` (1:1 aus 3fls) — extrahiert `tenant_id`, `role`, `email` aus Firebase-Token
- **Multi-Tenancy:** Schema-per-Tenant via `SET search_path` per Request (1:1 aus 3fls), voll multi-tenant ab Tag 1; Tenant-Bootstrap lazy beim ersten `/auth/me`

### 2.3 Run-Orchestrator (in-API Service)
- **Aufgabe:** Submit-/Cancel-/Status-API für Sim-Läufe.
- **Implementierung Phase 2:** lokaler `multiprocessing.Pool` (in API-Process, Lifespan-Hook) — Single-Host-Dev.
- **Implementierung Phase ≥5:** Job-Queue (Cloud Tasks → Cloud Run Jobs). Entscheidung in Phase 5 mit Last-Daten.
- **Repeats (mehrere Seeds parallel):** N unabhängige Worker-Jobs aus 1 UI-Submit (ab Phase 5).

### 2.4 Worker (`worker/`)
- **Container:** gleicher Base-Image wie API, andere CMD: `python -m osim_ui.worker run`
- **Argumente:** `--model-uri gs://.../model.json` `--seed N` `--periods K` `--out-uri gs://.../trace.jsonl` `--bus-topic projects/.../topics/run-{id}`
- **Engine-Aufruf:** lädt Modell (OTX oder JSON) → `PSimulator` aufbauen → `bus.subscribe("*", sink)` → `start()` × K Perioden
- **Output:**
  - JSONL-Trace → GCS (`out-uri`)
  - Live-Events → Pub/Sub-Topic (oder direkt FastAPI WS-Multiplexer)
  - Summary (Counters, dauer, error?) → Pub/Sub "run.complete"
- **Kritisch:** EIN Worker = EIN OS-Prozess = EIN `s_verteil`-Singleton. Niemals zwei Sims im selben Worker-Prozess.

### 2.5 Live-Streaming
- **Quelle:** `EventBus.subscribe("*", sink)` → eigener Sink, der Events an Pub/Sub publisht
- **Verteilung an Clients:** FastAPI-WS-Endpoint subscribed Pub/Sub-Topic, multiplexed an angemeldete WS-Clients
- **Phase 2:** kein Live-Streaming — Status-Polling reicht für MVP-Sim-Lauf
- **Phase 4:** WebSocket-Channel `/ws/runs/{id}` direkt (Worker → API via Queue/Pipe), Single-Host
- **Phase 5:** Pub/Sub-Multiplex für Cloud-Skala über API-Replicas hinweg

### 2.6 Persistenz

**PostgreSQL (Public-Schema):**
```sql
tenants(id, name, plan, created_at)
users(id, firebase_uid UNIQUE, email, tenant_id, role, created_at)
```

**PostgreSQL (Tenant-Schema, z. B. `tenant_<id>`):**
```sql
models(
  id UUID PK,
  name TEXT,
  source TEXT CHECK IN ('otx','json'),
  artifact_uri TEXT,                -- gs://.../model.json
  preview JSONB,                    -- short summary für Listings
  created_at, updated_at, owner_user_id
)

runs(
  id UUID PK,
  model_id UUID FK,
  config JSONB,                     -- {seed, periods, repeats, extra}
  status TEXT CHECK IN ('queued','running','succeeded','failed','cancelled'),
  started_at, ended_at,
  owner_user_id,
  summary JSONB                     -- counters, duration
)

run_artifacts(
  run_id UUID FK,
  kind TEXT,                        -- 'trace','report','log'
  uri TEXT,                         -- gs://...
  bytes BIGINT,
  created_at
)
```

**GCS-Layout:**
```
gs://osim-ui-{env}/
├── tenants/{tenant_id}/
│   ├── models/{model_id}.json
│   ├── models/{model_id}.otx        (original-upload, falls otx)
│   └── runs/{run_id}/
│       ├── trace.jsonl              (vollständige Sim-Trace)
│       ├── summary.json
│       └── reports/...              (Phase 6+)
```

### 2.7 OViewer-Foundation (Querschnitt, Phase 1+)

`portal/src/viewers/core/` ist ein **TypeScript-Port des C++-`OViewer`-Patterns** aus `OSim2004/inc/OViewer.h` (J.W. Fischer, 1997 ff.). Sie liefert die Basis-Architektur für ALLE Editing-/Form-Viewer im UI — als **Hybrid-Pattern**:

- **TypeScript-Klassen** für State, Routing und Command-Dispatch:
  - `ViewerFrame` — Top-Level-Container je Objekt-Typ
  - `ClientCtrl` — wählt passenden ChildDialog je Selektion und dispatcht Commands
- **React-Components** für Rendering und Datenbindung:
  - `ChildDialog` — domänen-spezifisches Layout-Container
  - `ChildCtrl` — instanziierbar mit Props (`value`, `onChange`, Schema-Metadaten)

**9-er `OCtrl`-Familie** (vollständig in Phase 1):
`OCtrlVariable` (Text/Zahl), `OCtrlBool` (Checkbox), `OCtrlEnum` (Dropdown), `OCtrlLink` (Objekt-Referenz), `OCtrlList` (Sub-Objekt-Tabelle), `OCtrlMethod` (Method-Button), `OCtrlTabViewer` (Tab-Container), `OCtrlCOLORREF` (Color-Picker), `OCtrlLOGFONT` (Font-Picker).

**Konsumenten:**
- Phase 1: 12 konkrete Viewer (PSimulator, PDurchlaufplan-Std/Design, PGObjBase, 3× PRess-Matrix, 2× PDlpl-Verknüpfung, AEinsatzWunsch/AKapBed/AGruppe)
- Phase 3: Form-Editor aus Engine-Reflection-Schema (ergänzt OViewer für strukturierte Felder)
- Phase 4: graphische Live-Viewer (`PDlplViewerGObj`-Erweiterung mit Animation)
- Phase 6: Report-/Chart-Viewer als Subklassen
- Phase 7+: Ressourcen-Matrix-/Gantt-Viewer im Vollausbau

**Vertiefung:** `OViewer.h` ist ~78 KB und für jeden Planner/Executor Pflichtlektüre.

### 2.8 GraphObject-Foundation (Querschnitt, Phase 1 Basis / Phase 4 Vollausbau)

`portal/src/graph/core/` ist ein **TypeScript-Port des `OSim2004/inc/GraphObj.h`-Konzepts**. Sie liefert die Basisklassen-Hierarchie für ALLE graphischen Viewer:

- `GObject` — Basisklasse mit Draw / HitTest / Region-Check / Phantom-Drawing / Animation-Hooks
- `GObjLink` (extends GObject) — mit In/Out-Link-Listen
- `GLink` / `GLinkPoint` — Kanten mit Richtungen (GLDirection-Enum, 16-Werte) und Multi-Waypoints
- `GObjSub` — hierarchischer Container (für nested Durchlaufpläne)
- `GraphView` — 4-Layer-Container (Background / Grid / Links / Foreground)
- `GraphList` (free-positioning), `GraphGrid` (Row/Col-Operations)

**Rendering-Backend:** React Flow als Adapter (Performance, Drag/Drop, Selection), darüber die GraphObject-Schicht für Domänen-Logik, Polymorphismus, Region-Check.

**Konsumenten:**
- Phase 1: nur Basis-Klassen (`GObject`, `GObjLink`, `GLink`) für `PDurchlaufplanViewer-Design`
- Phase 4: Vollausbau aller 18 GObjType-Klassen + Live-Animation
- Phase 6: optional Chart-/Auslastungs-Viewer als Subklassen
- Phase 7+: Ressourcen-Matrix-, Einsatzzeit-Gantt-, Auslöser-Viewer

Detail in `.planning/phases/04-live-viz/04-PRELIMINARY-PLAN.md`.

### 2.9 Engine-Reflection-Schema (Phase 3)

JSON-Modell-Schema wird per Reflection aus den osim-engine-Klassen generiert (`python -m osim_engine.schema dump`). osim-ui-Backend persistiert das Schema als Static-Asset, das Frontend nutzt es für den Form-Editor (`@rjsf/core` oder eigener Generator). So bleibt die Engine **Single Source of Truth** für das Modell-Vokabular. Engine-Erweiterungen erscheinen automatisch im UI nach Schema-Re-Generation.

Detail in `.planning/phases/03-json-editor/03-PRELIMINARY-PLAN.md`.

### 2.10 3fls-Embedded-Mode (Phase 7)

osim-ui hat einen `?embedded=1`-Modus, der die eigene Top-Navigation und Login-Page versteckt und stattdessen auf eine **PostMessage-Bridge** vom Parent-Frame (tbx_stzrim-Portal) hört. Auth erfolgt via **On-Behalf-Token-Exchange**: 3fls schickt sein Firebase-Token an osim-ui-Backend, das es gegen einen eigenen Custom-Token tauscht. So bleiben die GCP-Projekte getrennt.

Detail in `.planning/phases/07-3fls-iframe/07-PRELIMINARY-PLAN.md`.

### 2.11 Auth-Fluss

1. Browser: Firebase Login (E-Mail/Google) → ID-Token
2. Browser → API: `POST /api/v1/auth/me` mit `Authorization: Bearer <id-token>`
3. API: `TenantAuthMiddleware.verify_token()` → Custom-Claims (`tenant_id`, `role`) auslesen
4. API: `request.state.tenant_id` setzen; DB-Session setzt `search_path` darauf
5. Antwort: User-Profil + Tenant-Status

Erst-Login eines neuen Users:
- Firebase-Trigger (Cloud Function) erzeugt Tenant + User-Row + setzt Custom-Claims; ODER
- Backend macht's auf erstem `/auth/me`, falls noch nicht vorhanden (idempotent)

---

## 3. Datenflüsse — drei Kern-Szenarien

### 3.1 Modell-Upload + Bearbeitung (Phase 1)
1. Browser → `POST /api/v1/models/upload-otx` (multipart)
2. API: speichert Original-OTX in Storage, ruft `load_otx_file()` → `LoadResult`, serialisiert Simulator-Tree nach JSON
3. API: schreibt `models`-Row mit `artifact_uri` (Original-OTX) + `preview` (Top-Level-Summary)
4. Antwort: `model_id` + JSON-Tree + Coverage-Report (geladen/skipped/unsupported)
5. Browser: hält JSON-Tree in Zustand-Store; IndexedDB-Snapshot pro Änderung; Auto-Save alle 30 s
6. Save-back: Browser → `PUT /api/v1/models/{id}` mit JSON-Tree → API deserialisiert in Simulator → `dump_simulator_to_otx()` → neue OTX-Version in Storage abgelegt

### 3.2 Sim-Submit (Phase 2, Single-Run)
1. Browser → `POST /api/v1/runs` `{model_id, seed, start, end, period_len}`
2. API: `runs`-Row mit `status='queued'`, antwortet `run_id`
3. Orchestrator: spawnt Worker-Subprocess; Worker bekommt `model_uri` (aktuelle OTX-Version), `seed`, Sim-Zeitraum, `out_uri`
4. Worker: lädt OTX, baut `PSimulator`, ruft `.start()`, schreibt JSONL-Trace nach Storage
5. Browser: 2-s-Polling auf `GET /api/v1/runs/{id}`; bei `succeeded` Trace-Download via Signed URL
6. Worker fertig → `summary` an API → `runs.status='succeeded'`

### 3.3 Sim-Submit (Phase 4+, Live-Streaming)
- Wie 3.2, aber Browser öffnet zusätzlich `WS /ws/runs/{id}` und empfängt Live-Events; Polling entfällt.
- Worker streamt Events via `EventBus.subscribe("*", sink)` → in Phase 4 direkt (in-Process Queue), in Phase 5 via Pub/Sub.

### 3.4 Sim-Submit (Phase 5, Multi-Run / Parallel Seeds)
- Wie 3.3, aber `repeats=N` → Orchestrator legt N Cloud-Run-Jobs an, alle Pub/Sub-Events kommen unter demselben `run_id`-Prefix (mit Sub-Run-ID).
- Aggregation: in der API zusammenführen (KPI-Statistik über Seeds).

---

## 4. Sicherheits-Modell

| Risiko | Mitigation |
|---|---|
| User sieht fremde Modelle/Runs | Schema-per-Tenant; alle Queries laufen mit gesetztem `search_path` |
| OTX-Upload mit malicious Payload | Parser ist Text-Based; Schema-Validierung + Größenlimit (z.B. 30 MB), Datei-MIME-Check, Engine-Eval läuft im Worker-Container (Isolierung) |
| Trace-Download fremder Runs | Signed URLs nur über Auth-geprüfte API-Routen, kein Direct-GCS-Read |
| Worker-Container kompromittiert | Workload-Identity, IAM auf eigenes Tenant-Prefix in GCS-Bucket |
| DoS via teure Sims | Per-Tenant-Quota (Phase 5), Per-Run Hard-Timeout im Worker (Phase 2), Container-CPU-Limit |
| Sim-Lauf hängt | Worker-Timeout + Heartbeat-Pub/Sub-Topic; Orchestrator marked als `failed` nach Timeout |

---

## 5. Skalierungs-Pfad

| Stufe | Last | Setup |
|---|---|---|
| Dev | 1 User, 1 Lauf | `docker compose up` — Postgres + Firebase-Emulator + API + Portal |
| Stage | wenige User, 1–4 parallele Läufe | API mit eingebautem ProcessPoolExecutor |
| Prod-S | ≤50 User, ≤20 parallele Läufe | Cloud Run API + Cloud Run Workers (Auto-Scale 0–20); Pub/Sub für Streaming |
| Prod-M | 100+ User | + Cloud Tasks Queue mit Konkurrenz-Limit; Cloud SQL Multi-AZ; CDN für Portal |

---

## 6. Architektur-Entscheidungen (Stand 2026-05-21)

### 6.1 Beantwortet (verbindlich)
1. ✅ **Job-Queue-Wahl** (Phase 5): **Cloud Tasks + Cloud Run Jobs**.
2. ✅ **Pub/Sub vs. Direkter WS-Channel:** Phase 2 Polling, Phase 4 direkter WS (in-Process Queue), Phase 5 Pub/Sub.
3. ✅ **`.otx`-Original behalten:** beides — Original-Upload für Audit, versionierte Save-back-OTX als aktuelle Quelle (Phase 1).
4. ✅ **JSON-Modell-Schema-Quelle:** **per Engine-Reflection generiert**, hand-geschrieben ausgeschlossen (Phase 3).
5. ✅ **Multi-Tenant von Tag 1:** Auth + Schema-per-Tenant ab Phase 1, voll multi-tenant (kein Default-Tenant); Lazy Tenant-Bootstrap beim ersten `/auth/me`.
6. ✅ **WebSocket statt SSE.**
7. ✅ **OViewer-Foundation:** TypeScript-Port von `OViewer.h` in `portal/src/viewers/core/`, **Querschnitts-Foundation für ALLE Editing-/Form-Viewer**, Hybrid-Pattern (TS-Klassen für State, React-Components für Rendering); Phase 1 baut + 12 konkrete Viewer, alle späteren Phasen konsumieren/erweitern.
8. ✅ **GraphObject-Foundation:** TypeScript-Port von `GraphObj.h` in `portal/src/graph/core/`, **Querschnitts-Foundation für ALLE graphischen Viewer**, Phase 1 Basis-Klassen für Durchlaufplan-Design, Phase 4 Vollausbau, Phase 6+ erweitert.
9. ✅ **Cloud-Topologie:** **eigenes GCP-Projekt** für osim-ui (getrennt von 3fls).
10. ✅ **3fls-Integrationsform:** **Iframe-Embedding** mit On-Behalf-Token-Exchange (Phase 7).
11. ✅ **Save-Strategie:** Auto-Save 30 s + manueller Speichern-Button + IndexedDB-Snapshot pro Änderung + Single-Editor-Lock auf Modell-Ebene (Phase 1).

### 6.2 Noch offen
- **Cloud-Region** (europe-west3 vs. europe-west1) — Phase 5
- **PDF-Renderer** (WeasyPrint vs. Playwright) — Phase 6
- **Form-Editor-Lib** (`@rjsf/core` + shadcn vs. eigener Generator) — Phase 3
- **Canvas vs. DOM** für Node-Rendering bei sehr großen Graphen — Phase 4
- **3fls-Token-Exchange-Variante** A (geteiltes Firebase) vs. B (On-Behalf) — Phase 7 (Empfehlung B wegen 6.1#9)
- **Recharts ausreichend für Live-Animation?** → Phase 4 prüfen. Für 30 Updates/s evtl. Canvas/D3 nötig.
- **Undo/Redo-Mechanismus-Architektur** (Command-Pattern, Event-Sourcing, snapshot-basiert) — Phase 1 Claude's Discretion
- **IndexedDB-Lib** (`idb` vs. `dexie`) — Phase 1 Claude's Discretion

---

## 7. Was vom Original übernommen wird — und was bewusst nicht

### 7.1 Übernommen (zentral)
- **OViewer-Pattern** aus `OViewer.h` als Foundation-Layer in TypeScript (Phase 1)
- **9-er OCtrl-Familie** (Variable/Bool/Enum/Link/List/Method/TabViewer/COLORREF/LOGFONT) vollständig (Phase 1)
- **GraphObject-Konzept** aus `GraphObj.h` als Foundation-Layer in TypeScript (Phase 1 Basis, Phase 4 voll)
- **Domänen-Vokabular** (Durchlaufplan, Knoten, Auslöser, Verteilung, …) durchgängig
- **3-Perspektiven-Denken** (Prozess / Ressource / Arbeitszeit) als UI-Strukturprinzip
- **Live-Animation** der Knoten während der Sim (Status-Färbung) (Phase 4)
- **Hierarchische Durchlaufpläne** (GObjSub) (Phase 1 für Edit, Phase 4 für Live)
- **Grid-Layout-Modus** (OGraphGrid: Spalten/Zeilen-Insert/Remove) (Phase 1)
- **Originale KPIs** im Auswertungs-Modul (siehe `osim2004-ui-analysis.md` §5) als Report-Standard (Phase 6)

### 7.2 Bewusst NICHT übernommen
- **MDI-Fenster** → ersetzt durch Sidebar-Tree-Navigation + Single-Viewer-Bereich (Phase 1)
- **MFC-Auto-Binding** der OCtrl-Felder → React-Props-basierte Datenbindung (Hybrid-Pattern, Phase 1)
- **OGraphCtrl als Custom-Win32-Control** → ersetzt durch React Flow als Rendering-Backend, mit GraphObject-Layer darüber (Best-of-both, Phase 1 Basis / Phase 4 voll)
- **C++/WMF-Export** → ersetzt durch PDF (Phase 6) und JSON/CSV (Phase 3)
- **Pixel-genauer Original-Look (Skeuomorph)** → bewusst NICHT (PROJECT.md-Festlegung „UI darf modern sein")
- **AZeitSim.exe-Interop** → Backlog, nicht zentral

---

## 8. Aufwand-Schätzung (Grob)

| Phase | Wochen (1 Dev) | Engine-Voraussetzungen |
|---|---|---|
| 1 OViewer + OTX-Modellierung | 4–6 | **OTX-Writer** (`dump_simulator_to_otx`) als Welle 0 |
| 2 Sim-Lauf + Trace | 1.5–2 | keine (nutzt PSimulator-API) |
| 3 JSON-Schema + Form-Editor | 2–3 | **E2.1–E2.6** in osim-engine müssen vor Start erledigt sein |
| 4 Live-Viz + GraphObject-Vollausbau | 3–4 | EventBus-Topics reichen; Convenience-Hooks wünschenswert |
| 5 Parallel-Runs + Cloud | 2–3 | CLI-Entry-Point in engine wünschenswert |
| 6 Reports | 2 | KPI-Modul in `osim_engine.kpi` als Quelle |
| 7 3fls-Integration | 1–2 | keine |

**Gesamt MVP-Linie: ~15–22 Wochen**, abhängig von Engine-API-Reife (insb. OTX-Writer und Reflection-Generator E2.1–E2.6).

---

## 9. Referenzen

- [`.planning/PROJECT.md`](../.planning/PROJECT.md)
- [`.planning/research/osim-engine-api.md`](../.planning/research/osim-engine-api.md)
- [`.planning/research/osim2004-ui-analysis.md`](../.planning/research/osim2004-ui-analysis.md)
- [`.planning/research/3fls-patterns.md`](../.planning/research/3fls-patterns.md)
- [`.planning/research/copy-paste-guide.md`](../.planning/research/copy-paste-guide.md)
