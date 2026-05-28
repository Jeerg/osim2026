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

Portal läuft dann auf http://localhost:3002, API auf http://localhost:8000.

## Lokales Setup (voller Compose-Stack)

Ab Plan 01-05 (Phase 1) startet `docker compose up` den vollen Dev-Stack
(Backend + Frontend + Postgres + Firebase-Emulator + Minio) ohne dass Sie
Python/Node lokal brauchen müssen.

```bash
# 1. Optional: .env-Dateien anlegen (Standard-Werte sind dev-tauglich)
cp .env.example .env
cp portal/.env.example portal/.env

# 2. Alle Services starten
docker compose up -d

# 3. Warten bis alle Services healthy sind (max. 90s)
bash scripts/wait-healthy.sh 90

# 4. DB-Migration (legt public.tenants + public.users an)
uv run alembic --config db/alembic.ini upgrade head

# 5. Firebase-Emulator mit Test-Usern seeden
uv run python scripts/seed_firebase_emulator.py

# 6. Browser oeffnen
#    http://localhost:3002  -> Portal (Login-Form)
#    http://localhost:8000  -> API (FastAPI)
#    http://localhost:4000  -> Firebase Emulator UI
#    http://localhost:9001  -> Minio Console (osim_dev / osim_dev_password)
```

**Test-Credentials:** `admin@osim-dev / admin123` (role=admin) und
`user@osim-dev / user123` (role=user). Beide haben beim ersten Login
automatisch ein Tenant-Schema (D-17 Self-Service, Lazy-Bootstrap).

### Stoppen + Bereinigen

```bash
docker compose down              # Container stoppen, Volumes bleiben
docker compose down -v           # auch Volumes loeschen (frischer Start)
```

## Tests

```bash
# Backend Unit-Tests (kein Docker noetig — laufen gegen SQLite-Mocks).
uv run pytest tests/backend

# Backend Integration-Tests (brauchen laufenden Postgres + Firebase + Minio).
docker compose up -d
bash scripts/wait-healthy.sh 90
uv run python scripts/seed_firebase_emulator.py
uv run pytest tests/backend -m integration

# Frontend Unit-Tests (vitest).
cd portal && npm run test:run
```

Tests mit den Markern `requires_postgres`, `requires_firebase_emulator`,
`requires_minio` und `requires_engine` werden automatisch geskippt, wenn der
jeweilige Service / die Engine nicht erreichbar ist (siehe
`tests/backend/conftest.py`).

## E2E-Tests (Playwright)

Die End-to-End-Tests laufen NICHT als Teil der vitest-Unit-Suite. Sie sind
ein separates Suite (`npm run test:e2e`) und decken die drei kritischen
User-Journeys der Phase 1 ab:

| Spec | Beweist |
|------|---------|
| `portal/e2e/modeling-flow.spec.ts` | SC-3 + SC-4 + SC-6 + SC-8 (Upload → Edit → Save → Reload → persistent) |
| `portal/e2e/lock-conflict.spec.ts` | SC-7 Lock-Mechanismus (zwei Sessions, zweite sieht Read-Only) |
| `portal/e2e/snapshot-restore.spec.ts` | SC-7 IndexedDB-Crash-Recovery (Edit ohne Save + Reload → Restore-Dialog) |

### Voraussetzungen

```bash
# 1. Voller docker-compose-Stack laeuft (api + portal + postgres + firebase + minio)
docker compose up -d
bash scripts/wait-healthy.sh 90

# 2. DB-Migration (legt public.tenants + public.users an)
uv run alembic --config db/alembic.ini upgrade head

# 3. Firebase-Emulator mit Test-Usern seeden
uv run python scripts/seed_firebase_emulator.py

# 4. Chromium-Browser fuer Playwright installieren (einmalig)
cd portal && npx playwright install chromium
```

### Ausführung

```bash
# Alle 3 Specs sequentiell (workers=1 wegen shared docker-compose-State)
cd portal && npm run test:e2e

# Interaktive Playwright-UI (gut zum Debuggen)
cd portal && npm run test:e2e:ui

# Einzelne Spec
cd portal && npx playwright test modeling-flow.spec.ts
```

Laufzeit: ~30-60 s je nach Maschine. Reporter schreibt HTML-Report nach
`portal/playwright-report/` (nicht im Git).

### Bekannte Limits

- **Re-Run-Cleanup ist best-effort.** Jeder Spec macht im finally-Block ein
  `DELETE /api/v1/models/{id}`. Wenn das scheitert (z.B. Token-Race),
  bleibt das Modell im Tenant-Schema. Workaround: `docker compose down -v`
  fuer einen frischen Start.
- **Sequentielle Ausfuehrung** (workers=1). Echte Parallelisierung
  erfordert per-Test-DB-Reset und ist im Phase-2-Backlog.
- **Multi-Tenant-Lock-Conflict.** Der lock-conflict-Test testet zwei
  Sessions desselben Users (admin@osim-dev), nicht zwei verschiedener
  Tenants. Echtes Cross-Tenant-Sharing ueber Share-Tokens ist Phase-5-
  Backlog.

## Phase-1-Status (Acceptance-Matrix)

Mapping der Success-Criteria SC-1..SC-9 auf konkret nachvollziehbare Tests.
`/gsd-verify-work` nutzt diese Matrix als Abnahme-Grundlage.

| SC | Beschreibung | Beweis (Test-Command) |
|----|--------------|------------------------|
| SC-1 | docker compose Stack startet healthy | `bash scripts/wait-healthy.sh 90` → exit 0 |
| SC-2 | Login + Lazy-Tenant-Bootstrap | `uv run pytest tests/backend/test_auth_endpoints.py tests/backend/test_lazy_bootstrap_race.py -m integration` |
| SC-3 | OTX-Upload → Tree-Navigation | `uv run pytest tests/backend/test_models_endpoints.py -m integration` + `npm run test:e2e -- modeling-flow.spec.ts` |
| SC-4 | 12 Viewer-Klassen | `cd portal && npm run test:run` + manueller Smoke-Test (Workspace im Browser) |
| SC-5 | 9er OCtrl-Familie | `cd portal && npm run test:run -- viewers/core/octrl` |
| SC-6 | Edit-Operationen | `npm run test:e2e -- modeling-flow.spec.ts` + `cd portal && npm run test:run -- viewers` |
| SC-7 | Auto-Save + Lock + IndexedDB | `npm run test:e2e -- modeling-flow.spec.ts lock-conflict.spec.ts snapshot-restore.spec.ts` + `uv run pytest tests/backend/test_lock_endpoints.py -m integration` |
| SC-8 | Save als neue Version (byte-identisch) | `uv run pytest tests/backend/test_otx_upload_roundtrip.py::test_dummy_otx_byte_identical_through_pipeline -m integration` |
| SC-9 | Multi-Tenant-Isolation | `uv run pytest tests/backend/test_search_path_isolation.py -m integration` |

Alle Backend-Integration-Tests werden via Pytest-Marker `-m integration`
gegen den laufenden docker-compose-Stack ausgefuehrt; ohne Stack werden sie
auto-geskippt (siehe `tests/backend/conftest.py`).

## Bekannte Hinweise

- **Windows-CRLF in Shell-Skripten:** Git auf Windows konvertiert Line-Endings
  beim Checkout. `scripts/wait-healthy.sh` braucht LF; bei `bash: $'\r':
  command not found` einmal `git config core.autocrlf input` setzen und
  Repository neu klonen.
- **`PYTHONPATH`-Leak in der Eltern-Shell** kann andere Python-Projekte
  (z. B. 3fls) shadowen — beim Test-Lauf `env -u PYTHONPATH uv run pytest`
  nutzen oder die Variable temporär unsetzen.
- **`FIREBASE_AUTH_EMULATOR_HOST`** darf in Production NICHT gesetzt sein;
  das Production-Firebase-SDK würde sonst gegen den Emulator sprechen
  (Pitfall #9).

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
