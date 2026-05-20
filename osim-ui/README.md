# osim-ui

**Mehrbenutzerfähiges Web-UI und Orchestrator-Backend für die headless [`osim-engine`](../osim-engine).**

`osim-ui` ist die moderne Web-Oberfläche für das PPS-Simulationssystem OSim, das ursprünglich 2003/2004 als Windows-MFC-App von J.W. Fischer entwickelt wurde und seit 2026 als headless Python-Engine ([`osim-engine`](../osim-engine)) vorliegt. Diese Anwendung liefert die User-Schicht: Login, Modellverwaltung, Sim-Ausführung über einen Worker-Pool, Live-Visualisierung und Reports — alles browserbasiert und so gebaut, dass die Anwendung später als Modul in das Beratungs-Toolbox-System [`tbx_stzrim`](../tbx_stzrim) (3fls) integriert werden kann.

## Stack

| Schicht | Technologie |
|---|---|
| Frontend | React 19 + TypeScript + Vite, TanStack Router/Query, Zustand, Tailwind 4, shadcn, Recharts |
| Backend | FastAPI + Python 3.13, SQLAlchemy 2.0 async, Alembic |
| Auth | Firebase Auth (Client) + Firebase Admin SDK (Backend) |
| Datenbank | PostgreSQL 17 (Schema-per-Tenant) |
| Object Storage | Google Cloud Storage |
| Live-Channel | WebSocket (Phase 3+) |
| Worker | Eigene OS-Prozesse (Engine ist nicht thread-safe wegen LCG-Singleton) |
| Deployment | Cloud Run + Cloud Build (analog 3fls) |

## Quickstart (Entwicklung)

> Voraussetzungen: Python 3.13, Node 20+, Docker Desktop, `uv` (`pipx install uv` oder `pip install uv`).

```bash
# 1. Engine als editable-install registrieren (nachdem osim-engine geklont ist)
uv pip install -e ../osim-engine

# 2. Backend-Deps
uv sync

# 3. Portal-Deps
cd portal && npm install && cd ..

# 4. Lokale Infrastruktur starten (Postgres + Firebase-Emulator)
docker compose up -d postgres firebase-emulator

# 5. DB-Migration
uv run alembic upgrade head

# 6. Backend starten
uv run uvicorn app.main:app --reload

# 7. Frontend starten (neues Terminal)
cd portal && npm run dev
```

Portal läuft dann auf http://localhost:3000, API auf http://localhost:8000.

## Verzeichnisstruktur

```
osim-ui/
├── app/                    # FastAPI-Backend
│   ├── api/v1/             # REST-Endpoints
│   ├── auth/               # Firebase-Auth-Middleware
│   ├── core/               # Config, DB-Engine, Logging
│   ├── models/             # SQLAlchemy-Modelle
│   ├── services/           # Business-Logic
│   └── worker/             # Sim-Worker-Entry-Point
├── db/                     # Alembic-Migrations
├── portal/                 # React-Frontend
│   └── src/
│       ├── auth/           # Firebase-Client + AuthProvider
│       ├── api/            # API-Client (apiFetch)
│       ├── routes/         # TanStack-Router-Pages
│       ├── components/
│       └── styles/
├── tests/
├── infra/                  # Cloud-Build, Terraform (später)
├── scripts/
├── docs/
│   └── ARCHITECTURE.md     # System-Architektur
└── .planning/              # GSD-Projektplanung
    ├── PROJECT.md          # Projektprofil
    ├── ROADMAP.md          # Phasen-Übersicht
    ├── research/           # Codebase-Analyse (3fls, OSim2004, Engine)
    └── milestones/
        └── v0.1.0/
            └── phase-1-vertical-slice/PLAN.md
```

## Architektur

Siehe [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Status

**Initial-Setup (2026-05-20).** Phase 1 (Vertical Slice) ist geplant aber noch nicht implementiert.

## Verwandte Repos

- [`osim-engine`](../osim-engine) — die Python-Engine
- [`OSim2004`](../OSim2004) — das C++-Original (Referenz für Domäne und Workflows)
- [`tbx_stzrim`](../tbx_stzrim) — 3fls, Beratungs-Toolbox, Ziel-Integration ab Phase 6
