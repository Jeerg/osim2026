# CLAUDE.md — osim-ui

Dieses Repo enthält **osim-ui**: Web-Frontend + Orchestrator-Backend für die headless `osim-engine` (PPS-Simulator).

## Brand & UI Style (verbindlich für alle Neuentwicklungen · Stand 2026-05-26)

Dieses Repo folgt dem 3FLS-EAM Brand & UI Style Guide. Bei **jeder** UI-/Frontend-/Branding-/Style-Arbeit und in **jeder UI-Phase** ist `docs/3FLS-EAM-STYLE-GUIDE.md` verbindlich zu lesen und einzuhalten:

- **Blau-Primary** (`#1E4F9C`, re-keyed von Cyan `#0EA5C7`); Magenta `#C026D3` strikt Logo-Bound (keine UI-Verwendung).
- shadcn als UI-Library, Token-Architektur per `portal/src/styles/tokens.css` (ad-hoc Hex/RGB ESLint-blockiert).
- Topbar: diagonaler Blau-Gradient (Navy `#1F264C` → Ice-Blau `#B2C9E8`), **weiße Schrift**; **Logo unverändert, ohne Backdrop** rechts (Asset `portal/public/logo-3fls-eam.png`).
- Tree-View-Pattern: Header neutral-grau, Item-Icon Blau, Indentation 22 px, Monospace-IDs (Cascadia Code).
- **Segoe UI** als Body-Font (vormals Geist Variable), 4 px-Spacing-Grid.
- A11y: `:focus-visible` mit Token-Focus-Ring, Status nie nur via Farbe.

Bei Unklarheiten: Guide-Datei konsultieren, nicht eigenmächtig Design-Entscheidungen treffen.

## Was Claude wissen muss

1. **Drei verwandte Codebasen** im gleichen Workspace (`C:\Users\JörgWFischer\PycharmProjects\`):
   - `osim-engine` — die Python-Engine. **Importpfad:** `osim_engine.*` (siehe `.planning/research/osim-engine-api.md`).
   - `OSim2004` — das C++-Original. **Domänen- und UI-Konzept-Referenz.** (siehe `.planning/research/osim2004-ui-analysis.md`).
   - `tbx_stzrim` — 3fls. **Stack-, Pattern- und Code-Spender** (siehe `.planning/research/3fls-patterns.md` + `.planning/research/copy-paste-guide.md`).

2. **Sechs Architektur-Entscheidungen** sind festgeschrieben (siehe `.planning/PROJECT.md` § 4):
   - Standalone-Repo, 3fls-kompatibler Stack
   - Datenmodell-/Konzept-Treue zum Original, UI darf modern sein (keine Skeuomorphie)
   - Multi-User × Multi-Run, container-orchestriert
   - Live-Visualisierung während der Sim (WebSocket)
   - Firebase Auth
   - Postgres + Object Storage (GCS)

3. **Engine-Reproduzierbarkeitsvertrag ist heilig:**
   - PAWLICEK-LCG ist Modul-Singleton in `osim_engine.core.distribution.s_verteil`
   - → Sim-Läufe NUR in **separaten OS-Prozessen**, niemals Threads
   - → Seed + (start_date, end_date, period_len) identifizieren einen Run eindeutig
   - → UI darf KEINE Reihenfolge/Aggregation einschieben, die die RNG-Reihenfolge verändert

4. **Sprache & Doku:** Deutsch in User-facing Texten und Modell-Begriffen (Auftrag, Maschine, Durchlaufplan, Knoten, Verteilung, Auslöser, …). Code-Identifier können Englisch sein (`Models`, `runs`, `tenants`).

5. **Pattern-Quelle:** Vor neuen Konventionen IMMER prüfen, ob 3fls (tbx_stzrim) schon eine etablierte hat — wenn ja, übernehmen. Stack-Parität ist strategisch wichtig.

## Häufige Operationen

| Aufgabe | Command |
|---|---|
| Backend-Deps installieren | `uv sync` |
| Engine als editable-install | `uv pip install -e ../osim-engine` |
| Lokale DB starten | `docker compose up -d postgres firebase-emulator` |
| Migration anlegen | `uv run alembic revision --autogenerate -m "msg"` |
| Migration anwenden | `uv run alembic upgrade head` |
| Backend starten | `uv run uvicorn app.main:app --reload` |
| Frontend starten | `cd portal && npm run dev` |
| Tests | `uv run pytest` und `cd portal && npm test` |
| Linting | `uv run ruff check .` und `cd portal && npm run lint` |

## Projekt-Konventionen

- **Versionierte API:** alle Endpoints unter `/api/v1/*`
- **Schema-per-Tenant:** Postgres `search_path` wird per Request via `TenantAuthMiddleware` gesetzt
- **Auth:** Firebase Custom Claims (`tenant_id`, `role`) — keine DB-Lookups im Hot-Path
- **Live-Channel:** WebSocket unter `/ws/runs/{run_id}` (nicht SSE; bidirektional vorbereitet)
- **Worker-Isolation:** 1 Worker = 1 OS-Prozess = 1 PSimulator-Instanz

## Nicht in dieses Repo

- Engine-Logik selbst (gehört in `osim-engine`)
- C++-Quellcode oder MFC-Reverse-Engineering (gehört in `OSim2004`-Read-Only-Referenz)
- SAP-Connector, Billing, Excel-Import (gehört in `tbx_stzrim`, falls Bedarf)

## GSD-Workflow

Dieses Projekt nutzt GSD (Get Shit Done). Phasen liegen unter `.planning/milestones/`. Workflow-Befehle: `/gsd-progress`, `/gsd-plan-phase`, `/gsd-execute-phase`, `/gsd-verify-work`.
