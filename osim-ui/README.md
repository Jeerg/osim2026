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

## Quickstart (Entwicklung, Phase 1 funktionsfähig)

> Voraussetzungen: Python 3.13, Node 20+, Docker Desktop, `uv` (`pipx install uv` oder `pip install uv`).

```bash
# 1. Engine als editable-install (osim-engine liegt unter ../engine im Monorepo)
#    bereits konfiguriert via [tool.uv.sources] in pyproject.toml

# 2. Backend-Deps
uv sync

# 3. Portal-Deps
cd portal && npm install && cd ..

# 4. Lokale Infrastruktur starten (Postgres + Firebase-Emulator + Minio)
docker compose up -d postgres firebase-emulator minio

# 5. Test-DB erstmalig anlegen (idempotent; wenn schon da: no-op)
DATABASE_URL="postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/postgres" \
  uv run python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
async def main():
    e = create_async_engine('postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/postgres', isolation_level='AUTOCOMMIT')
    async with e.connect() as c:
        if (await c.execute(text(\"SELECT 1 FROM pg_database WHERE datname='osim_ui_dev'\"))).scalar() is None:
            await c.execute(text('CREATE DATABASE osim_ui_dev'))
    await e.dispose()
asyncio.run(main())
"

# 6. DB-Migration (public-Schema; Tenant-Schemata werden lazy beim ersten Login angelegt)
DATABASE_URL="postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/osim_ui_dev" \
  uv run alembic -c db/alembic.ini upgrade head

# 7. Backend starten (Terminal 1)
DATABASE_URL="postgresql+asyncpg://osim_dev:osim_dev_password@localhost:5432/osim_ui_dev" \
  ENVIRONMENT=dev \
  uv run uvicorn app.main:app --port 8000

# 8. Frontend starten (Terminal 2)
cd portal && npm run dev
```

Portal läuft dann auf http://localhost:3000, API auf http://localhost:8000.

**Wichtig:** Wenn ein anderer Firebase-Emulator-Container (z.B. von `tbx_stzrim`) auf Port 9099 läuft, muss er gestoppt werden — sonst lehnt das osim-ui-Backend alle Tokens mit Audience-Mismatch als 401 ab. Siehe `docs/PHASE-1-VERIFICATION.md` → "Setup-Hinweis für E2E-Lauf gegen Firebase-Emulator".

## Phase 1: Features

Phase 1 liefert ein vollwertiges **Web-Modellierungs-Werkzeug für OSim-Modelle** im Browser, basierend auf dem `.otx`-Format:

- **Login & Multi-Tenancy:** Firebase-Auth-Emulator-basiert, Schema-per-Tenant in Postgres, Lazy Tenant-Bootstrap beim ersten `/auth/me`.
- **OTX-Roundtrip:** Server parst via `osim_engine.io.load_otx_file`, liefert JSON-Tree an Browser, deserialisiert Edits zurück via `dump_simulator_to_otx`, speichert versioniert im Object Storage.
- **12 Viewer:** PSimulatorViewer, PDurchlaufplanViewerStd, PDurchlaufplanViewerDesign (reactflow), PGObjBaseViewer, PRessBelegMatrixViewer, PRessMengeMatrixViewer, PRessVerknuepfungViewer, PDlplBetriebsmittelViewer, PDlplPersonalViewer, AEinsatzWunschViewer, AKapBedViewer, AGruppeViewer.
- **Sidebar-Tree-Navigation** mit Workspace-Hierarchie.
- **Save-Mechanik:** Auto-Save (30 s) + manueller Save + Strg+S + Single-Editor-Lock (15 min TTL) + IndexedDB-Snapshot + Recovery-Prompt.

Demo-Skript siehe `docs/PHASE-1-DEMO.md`. Verifikation gegen alle 18 Implementation-Decisions siehe `docs/PHASE-1-VERIFICATION.md`. Abnahme-Checkliste in `docs/PHASE-1-ACCEPTANCE.md`.

## Known Limitations (Phase 1)

- **Backend liefert kein `oid_mapping`:** Neue Skeleton-Knoten (TEMP-OIDs) gehen beim Save verloren. Workaround: nur bestehende Knoten editieren. Wird in Phase 2 nachgezogen.
- **Last-Write-Wins bei parallelen Edits:** Kein Conflict-Merge in Phase 1. Phase 4+.
- **Engine-Writer-Roundtrip-Workaround:** `_patch_ref_properties` in `app/services/otx_service.py` patcht fehlende Listen-Refs aus dem Original-OTX. Sollte in die Engine wandern (Plan 01-03 Deviation #1).
- **Performance-Cliffs bei sehr großen Modellen:** Bosch2_wechseln.otx (18 MB) lädt in 5-15 s; Sidebar-Render dauert; Viewer-Wechsel auch. Inkrementelle Snapshot-Strategie ist Phase-1-Backlog.
- **CI ohne Postgres:** Test-Suiten skippen sich graceful (`requires_db`-Marker).

## Tests

```bash
# Backend (mit Postgres up):
uv run pytest                        # 59 passed, 1 skipped (Minio)
uv run pytest tests/integration/     # 11 cross-plan integration tests
uv run ruff check .                  # clean

# Frontend (vitest):
cd portal && npm test -- --run       # 141 passed
cd portal && npm run lint            # clean
cd portal && npm run build           # clean

# End-to-End (mit Backend + Frontend + Firebase-Emulator up):
cd portal && npx playwright install chromium   # einmalig
cd portal && npx playwright test               # 9 Tests; auth-Tests brauchen
                                                # osim-ui-eigenen Firebase-Emulator
```

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

**Phase 1 (Vertical Slice) abgeschlossen, Stand 2026-05-20.** Web-Modellierungs-Werkzeug ist end-to-end funktional: Login, OTX-Upload, 12 Viewer, Edit, Save, Recovery, Lock. Manuelle Abnahme via `docs/PHASE-1-ACCEPTANCE.md` ausstehend.

**Next:** Phase 2 (JSON Editor + Sim-Lauf) gemäß `.planning/ROADMAP.md`.

## Verwandte Repos

- [`osim-engine`](../osim-engine) — die Python-Engine
- [`OSim2004`](../OSim2004) — das C++-Original (Referenz für Domäne und Workflows)
- [`tbx_stzrim`](../tbx_stzrim) — 3fls, Beratungs-Toolbox, Ziel-Integration ab Phase 6
