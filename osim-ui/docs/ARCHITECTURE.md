# osim-ui — Systemarchitektur

**Stand:** 2026-05-20  
**Status:** Entwurf für Diskussion, vor Phase-1-Plan

> Dieses Dokument beschreibt die Ziel-Architektur. Phase 1 setzt davon nur die MVP-Slice um — Vollausbau über die Roadmap (`.planning/ROADMAP.md`).

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
                          │  GraphObject-Foundation    │  ← Phase 3+,
                          │  (portal/src/graph/core)   │    Querschnitt für
                          │  + React-Flow-Adapter      │    ALLE graphischen
                          │  + OSim-Subklassen         │    Viewer
                          │  ───────────────────────── │
                          │  Embedded-Mode-Bridge      │  ← Phase 6,
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
- **Routen-Skelett (Phase 1):**
  - `/login` — Login/Sign-up
  - `/` — Dashboard (eigene Modelle + Läufe)
  - `/models` — Modell-Bibliothek (Upload `.otx`/JSON, Liste)
  - `/models/:id` — Modell-Detail + Sim-Konfiguration
  - `/runs/:id` — Lauf-Live-Ansicht (Status + JSONL-Tail später Charts)
  - `/runs` — Lauf-Historie

### 2.2 API-Backend (`app/`)
- **Stack:** FastAPI 0.115+, Uvicorn, Python 3.13, SQLAlchemy 2.0 async + asyncpg, Alembic, uv
- **Routen (Phase 1):**
  - `POST /api/v1/auth/me` — Tenant-Status-Bootstrap nach Login (3fls-Pattern)
  - `GET/POST /api/v1/models` — Modelle CRUD
  - `POST /api/v1/models/{id}/upload-otx` — `.otx`-Upload → Parse → GCS-Ref + JSON-Vorschau
  - `POST /api/v1/runs` — Lauf submitten (model_id, seed, periods, repeats)
  - `GET /api/v1/runs/{id}` — Lauf-Status + Summary
  - `GET /api/v1/runs/{id}/trace` — Signed-URL für JSONL-Trace
  - `WS /ws/runs/{id}` — Live-Event-Stream
- **Auth-Middleware:** `TenantAuthMiddleware` (1:1 aus 3fls) — extrahiert `tenant_id`, `role`, `email` aus Firebase-Token
- **Multi-Tenancy:** Schema-per-Tenant via `SET search_path` per Request (1:1 aus 3fls)

### 2.3 Run-Orchestrator (in-API Service)
- **Aufgabe:** Submit-/Cancel-/Status-API für Sim-Läufe.
- **Implementierung Phase 1:** lokaler `multiprocessing.Pool` (in API-Process) oder kleiner async Subprocess-Manager.
- **Implementierung Phase ≥4:** Job-Queue (RQ + Redis ODER Cloud Tasks → Cloud Run Jobs). Entscheidung in Phase 4 mit Last-Daten.
- **Repeats (mehrere Seeds parallel):** N unabhängige Worker-Jobs aus 1 UI-Submit.

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
- **Phase 1:** simpler Direkt-Weg ohne Pub/Sub (Worker → API via Queue/Pipe), funktioniert nur bei Single-Host. Cloud-Skala folgt in Phase 4.

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
│       └── reports/...              (Phase 5+)
```

### 2.7 GraphObject-Foundation (Querschnitt, Phase 3+)

`portal/src/graph/core/` ist ein **TypeScript-Port des `OSim2004/inc/GraphObj.h`-Konzepts** (J.W. Fischer, 1997 ff.). Sie liefert die Basisklassen-Hierarchie für ALLE graphischen Viewer im UI:

- `GObject` — Basisklasse mit Draw / HitTest / Region-Check / Phantom-Drawing / Animation-Hooks
- `GObjLink` (extends GObject) — mit In/Out-Link-Listen
- `GLink` / `GLinkPoint` — Kanten mit Richtungen (GLDirection-Enum, 16-Werte) und Multi-Waypoints
- `GObjSub` — hierarchischer Container (für nested Durchlaufpläne)
- `GraphView` — 4-Layer-Container (Background / Grid / Links / Foreground)
- `GraphList` (free-positioning), `GraphGrid` (Row/Col-Operations)

**Rendering-Backend:** React Flow als Adapter (Performance, Drag/Drop, Selection), darüber die GraphObject-Schicht für Domänen-Logik, Polymorphismus, Region-Check.

**Konsumenten:**
- Phase 3: Durchlaufplan-Live-Viewer (`PSimulatorViewerGfx`-Equivalent)
- Phase 5: optional Chart-/Auslastungs-Viewer als Subklassen
- Phase 7+: Ressourcen-Matrix-, Einsatzzeit-Gantt-, Auslöser-Viewer

Detail-Skizze in `.planning/milestones/v0.1.0/phase-3-live-viz/PLAN.md` §4.

### 2.8 Engine-Reflection-Schema (Phase 2)

JSON-Modell-Schema wird per Reflection aus den osim-engine-Klassen generiert (`python -m osim_engine.schema dump`). osim-ui-Backend persistiert das Schema als Static-Asset, das Frontend nutzt es für den Form-Editor (`@rjsf/core` oder eigener Generator). So bleibt die Engine **Single Source of Truth** für das Modell-Vokabular. Engine-Erweiterungen erscheinen automatisch im UI nach Schema-Re-Generation.

Detail in `.planning/milestones/v0.1.0/phase-2-json-editor/PLAN.md`.

### 2.9 3fls-Embedded-Mode (Phase 6)

osim-ui hat einen `?embedded=1`-Modus, der die eigene Top-Navigation und Login-Page versteckt und stattdessen auf eine **PostMessage-Bridge** vom Parent-Frame (tbx_stzrim-Portal) hört. Auth erfolgt via **On-Behalf-Token-Exchange**: 3fls schickt sein Firebase-Token an osim-ui-Backend, das es gegen einen eigenen Custom-Token tauscht. So bleiben die GCP-Projekte getrennt.

Detail in `.planning/milestones/v0.1.0/phase-6-3fls-iframe/PLAN.md`.

### 2.10 Auth-Fluss

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

### 3.1 Modell-Upload (`.otx`)
1. Browser → `POST /api/v1/models/upload-otx` (multipart)
2. API: speichert Datei temporär, ruft `parse_otx_file()` → validiert, dann `load_otx_file()` → `LoadResult.summary()`
3. API: lädt Original + JSON-Vorschau nach GCS, schreibt `models`-Row
4. Antwort: `model_id` + Coverage-Report (geladen/skipped/unsupported)

### 3.2 Sim-Submit (Single-Run)
1. Browser → `POST /api/v1/runs` `{model_id, seed, periods}`
2. API: `runs`-Row mit `status='queued'`, antwortet `run_id`
3. Orchestrator: spawnt Worker-Subprocess; Worker bekommt `model_uri`, `seed`, `periods`, `bus_topic`, `out_uri`
4. Worker: lädt Modell, läuft Sim, streamt Events in Pub/Sub, schreibt Trace nach GCS
5. Browser: öffnet `WS /ws/runs/{id}` parallel zur Antwort; sieht Events live
6. Worker fertig → `summary` an API → `runs.status='succeeded'`

### 3.3 Sim-Submit (Multi-Run / Parallel Seeds)
- Gleich wie 3.2, aber `repeats=N` → Orchestrator legt N Worker-Jobs an, alle Pub/Sub-Events kommen unter demselben `run_id`-Prefix (mit Sub-Run-ID).
- Aggregation: in der API zusammenführen (KPI-Statistik über Seeds).
- Phase 1: `repeats=1` reicht; `>1` ab Phase 4.

---

## 4. Sicherheits-Modell

| Risiko | Mitigation |
|---|---|
| User sieht fremde Modelle/Runs | Schema-per-Tenant; alle Queries laufen mit gesetztem `search_path` |
| OTX-Upload mit malicious Payload | Parser ist Text-Based; Schema-Validierung + Größenlimit (z.B. 30 MB), Datei-MIME-Check, Engine-Eval läuft im Worker-Container (Isolierung) |
| Trace-Download fremder Runs | Signed URLs nur über Auth-geprüfte API-Routen, kein Direct-GCS-Read |
| Worker-Container kompromittiert | Workload-Identity, IAM auf eigenes Tenant-Prefix in GCS-Bucket |
| DoS via teure Sims | Per-Tenant-Quota (Phase 4), Per-Run Hard-Timeout im Worker, Container-CPU-Limit |
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

## 6. Architektur-Entscheidungen (Stand 2026-05-20)

### 6.1 Beantwortet (verbindlich)
1. ✅ **Job-Queue-Wahl** (Phase 4): **Cloud Tasks + Cloud Run Jobs**.
2. ✅ **Pub/Sub vs. Direkter WS-Channel:** MVP (Phase 1+3) direkt (in-Process Queue), Prod (Phase 4) Pub/Sub.
3. ✅ **`.otx`-Original behalten:** beides — Original für Audit, JSON für UI-Rendering (Phase 1).
4. ✅ **JSON-Modell-Schema-Quelle:** **per Engine-Reflection generiert**, hand-geschrieben ausgeschlossen (Phase 2).
5. ✅ **Multi-Tenant von Tag 1:** Auth + tenant_id-Spalten von Tag 1, Schema-per-Tenant von Tag 1 (Default-Tenant für Phase 1).
6. ✅ **WebSocket statt SSE.**
7. ✅ **GraphObject-Foundation:** TypeScript-Port von `GraphObj.h` in `portal/src/graph/core/`, **Foundation für ALLE graphischen Viewer**, nicht nur Durchlaufplan (Phase 3 baut, Phase 5+ konsumiert).
8. ✅ **Cloud-Topologie:** **eigenes GCP-Projekt** für osim-ui (getrennt von 3fls).
9. ✅ **3fls-Integrationsform:** **Iframe-Embedding** mit On-Behalf-Token-Exchange (Phase 6).

### 6.2 Noch offen
- **Cloud-Region** (europe-west3 vs. europe-west1) — Phase 4
- **PDF-Renderer** (WeasyPrint vs. Playwright) — Phase 5
- **Form-Editor-Lib** (`@rjsf/core` + shadcn vs. eigener Generator) — Phase 2
- **Canvas vs. DOM** für Node-Rendering bei sehr großen Graphen — Phase 3
- **3fls-Token-Exchange-Variante** A (geteiltes Firebase) vs. B (On-Behalf) — Phase 6 (Empfehlung B wegen 6.1#8)
7. **Recharts ausreichend für Live-Animation?**  
   → Phase 3 prüfen. Für 30 Updates/s evtl. Canvas/D3 nötig. MVP: nur Polling-Refresh, kein Live-Chart.

---

## 7. Was vom Original übernommen wird — und was bewusst nicht

### 7.1 Übernommen (zentral)
- **GraphObject-Konzept** aus `GraphObj.h` als Foundation-Layer in TypeScript (Phase 3+)
- **Domänen-Vokabular** (Durchlaufplan, Knoten, Auslöser, Verteilung, …) durchgängig
- **3-Perspektiven-Denken** (Prozess / Ressource / Material) als UI-Strukturprinzip
- **Live-Animation** der Knoten während der Sim (Status-Färbung)
- **Hierarchische Durchlaufpläne** (GObjSub)
- **Grid-Layout-Modus** (OGraphGrid: Spalten/Zeilen-Insert/Remove)
- **Originale KPIs** im Auswertungs-Modul (siehe `osim2004-ui-analysis.md` §5) als Report-Standard (Phase 5)

### 7.2 Bewusst NICHT übernommen
- **MDI-Fenster** → ersetzt durch Router-basierte Single-Page-Views + optional Split-Panels
- **MFC-OViewer-Auto-Binding** → React-Components pro Domänen-Objekt, ohne Auto-Binding-Framework
- **OGraphCtrl als Custom-Win32-Control** → ersetzt durch React Flow als Rendering-Backend, mit GraphObject-Layer darüber (Best-of-both)
- **C++/WMF-Export** → ersetzt durch PDF (Phase 5) und JSON/CSV (Phase 2)
- **AZeitSim.exe-Interop** → optional Phase 7+, nicht zentral

---

## 8. Aufwand-Schätzung (Grob)

| Phase | Wochen (1 Dev) | Engine-Voraussetzungen |
|---|---|---|
| 1 Vertical Slice | 2–3 | keine (nutzt existierenden OTX-Loader) |
| 2 JSON-Schema + Form-Editor | 2–3 | **E2.1–E2.6** in osim-engine müssen vor Start erledigt sein |
| 3 Live-Viz + GraphObject | 3–4 | EventBus-Topics reichen; Convenience-Hooks wünschenswert |
| 4 Parallel-Runs + Cloud | 2–3 | CLI-Entry-Point in engine wünschenswert |
| 5 Reports | 2 | KPI-Modul in `osim_engine.kpi` als Quelle |
| 6 3fls-Integration | 1–2 | keine |

**Gesamt MVP-Linie: ~12–17 Wochen**, abhängig von Engine-API-Reife (insb. Reflection-Generator E2.1–E2.6).

---

## 9. Referenzen

- [`.planning/PROJECT.md`](../.planning/PROJECT.md)
- [`.planning/research/osim-engine-api.md`](../.planning/research/osim-engine-api.md)
- [`.planning/research/osim2004-ui-analysis.md`](../.planning/research/osim2004-ui-analysis.md)
- [`.planning/research/3fls-patterns.md`](../.planning/research/3fls-patterns.md)
- [`.planning/research/copy-paste-guide.md`](../.planning/research/copy-paste-guide.md)
