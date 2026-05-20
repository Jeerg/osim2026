# osim-ui 3fls-Stack Research — Masterdokument

**Erstellt:** 2026-05-20  
**Quelle:** Gründliche Analyse von tbx_stzrim (RIM – Industrial Data Science Pipeline)  
**Status:** ✅ COMPLETE – Alle 10 Recherche-Punkte erforscht

---

## Übersicht

Dieses Verzeichnis enthält eine umfassende Analyse des 3fls-Stacks (tbx_stzrim), um die Patterns und Best Practices für osim-ui zu extrahieren.

### Dateien in dieser Research

| Datei | Zweck | Zielgruppe |
|-------|-------|-----------|
| **3fls-patterns.md** | Detaillierte Stack-Analyse aller 10 Punkte | Architekten, Lead-Dev |
| **copy-paste-guide.md** | Konkrete Dateien & Code-Snippets zum Copy-Paste | Frontend/Backend Devs |
| **architecture-decisions.md** | ADRs (Architecture Decision Records) 10x Key Decisions | Architekten, PMs |
| **Dieses Dokument** | Navigation & Quick-Ref | Alle |

---

## Die 10 Recherche-Punkte — Zusammenfassung

### 1. Frontend-Stack ✅

**React 19.2.4 + Vite 7 + TypeScript 5.9 + TanStack Router 1.167**

- ✅ **1:1 Übernehmen:** package.json, tsconfig.json, vite.config.ts
- ✅ **Copy-Paste:** auth-provider.tsx, firebase.ts, use-auth.ts, api/fetch.ts, app.tsx, main.tsx
- ⚠️ **Anpassen:** Routes (/__root__, /_authenticated/, /login) auf osim-Domain
- ❌ **Weglassen:** ExcelImportProvider, Graph-Viewer (Sigma.js), Datalake-Navigator

**State Management:** Zustand (5.0.12) + TanStack Query (5.90.21)
- Zustand: Client-State (UI toggles, preferences)
- TanStack Query: Server-State (API-Daten, Auto-Caching)

**UI/Styling:** Tailwind CSS 4.2 + shadcn + Recharts 3.8
- Tailwind: Utility-First, schnelle Builds
- shadcn: Headless Components, customizable
- Recharts: SVG-basierte Charts, React-native

### 2. Backend-Stack ✅

**FastAPI 0.115 + Uvicorn 0.34 + Python 3.13 + SQLAlchemy 2.0 + asyncpg 0.31**

- ✅ **1:1 Übernehmen:** main.py Structure, app/api/v1/router.py Pattern, app/core/ (config, database)
- ✅ **Copy-Paste:** app/auth/middleware.py, app/auth/firebase.py, app/auth/dependencies.py
- ⚠️ **Anpassen:** Router-Includes (keine BOM, Graph, Billing initial)
- ❌ **Weglassen:** SAP-Extractor, JCo Bridge, rim_ids, services/audit

**Database:** PostgreSQL 17 (Cloud SQL) + Alembic Migrations
- Schema-per-Tenant Isolation (CRITICAL für Multi-Tenancy!)
- Pool: pool_size=20, max_overflow=10 (für 50-user concurrency)
- Naming: Singular tables, snake_case, Meta-Columns mit Underscore-Prefix

### 3. Firebase Auth Integration ✅

**Frontend:**
- Firebase SDK + onAuthStateChanged Listener
- Custom Claims: tenant_id, role aus JWT
- AuthContext + useAuth Hook

**Backend:**
- Firebase Admin SDK + verify_token()
- TenantAuthMiddleware (Pure ASGI)
- Request State: tenant_id, user_role, user_email, user_uid

**Multi-Tenancy:** Request-scoped, via JWT Claims + search_path

### 4. PostgreSQL Schema ✅

**Naming Conventions:**
- Tables: Singular, snake_case (simulations, results, audit_logs)
- Columns: snake_case (simulation_id, status, created_at)
- Foreign Keys: {table}_id
- Meta Columns: Underscore prefix (_created_at → created_at in DB)

**Migration Tool:** Alembic (v1.14+)
- lembic revision --autogenerate -m "message"
- lembic upgrade head

**Multi-Tenancy:** Schema-per-Tenant
`sql
CREATE SCHEMA "tenant_01";
CREATE SCHEMA "tenant_02";
-- Each has identical tables, isolated data
`

### 5. Object Storage (GCS) ✅

**Provider:** Google Cloud Storage
**Pattern:** Signed URLs (15-min TTL) via Fastify File-Server
**Security:** Time-Limited, Auth-Gated, Bandwidth-Offloaded

### 6. Cloud Build & Deployment ✅

**Services:**
- **API:** Cloud Run Service (FastAPI, Port 8080)
- **File-Server:** Cloud Run Service (Fastify, Port 3001) — Optional
- **Portal:** Firebase Hosting (React SPA)
- **Extractor/Transform:** Cloud Run Jobs (Phase 2+, nicht MVP)

**Pipeline:** Test → Validate → Build → Push → Migrate → Deploy

**Docker:** Multi-Stage (Builder: uv sync → Runtime: slim .venv)

### 7. Realtime (WebSocket/SSE) ⚠️

**3fls:** Keine Realtime-Implementierung (reine REST API)

**osim-ui Empfehlung:**
- **MVP:** Polling via React Query (staleTime=5s)
- **Phase 2:** Server-Sent Events (SSE) für Sim-Progress
- **Phase 3+:** WebSockets falls > 100 concurrent Sims

### 8. Monorepo vs. Multi-Repo ✅

**3fls:** Single Monorepo (tbx_stzrim)

**Struktur:**
`
osim-ui/
├── main.py
├── app/               # FastAPI
├── portal/            # React SPA
├── services/file-server/  # Optional: Fastify
├── db/                # Migrations
├── infra/             # Terraform
└── .planning/         # GSD
`

**Vorteil:** Atomare Commits, Shared CI/CD, Knowledge in einem Repo

### 9. CLAUDE.md & Dokumentation ✅

**Format:** Project, Dev Environment, API Namespaces, Commands, Language

**Docs-Struktur:**
`
docs/
├── local-setup.md
├── deployment-runbook.md
├── README.md
└── architecture/
`

### 10. Dependency Inventory ✅

**Python (pyproject.toml):**
- Core: fastapi, uvicorn, sqlalchemy[asyncio], alembic, psycopg[binary]
- GCP: google-cloud-storage, firebase-admin
- Utils: structlog, orjson, httpx
- Dev: pytest, pytest-asyncio, ruff

**Node.js (portal/package.json):**
- Core: react, react-dom, vite, typescript
- Data: @tanstack/react-query, @tanstack/react-router, zustand
- UI: tailwindcss, recharts, shadcn
- Auth: firebase

---

## Quick-Reference: Was übernehmen? Was anpassen? Was weglassen?

### ✅ Übernehmen (1:1)

**Frontend:**
`
portal/src/auth/firebase.ts
portal/src/auth/auth-provider.tsx
portal/src/auth/use-auth.ts
portal/src/api/fetch.ts
portal/src/api/client.ts
portal/src/main.tsx
portal/src/app.tsx
portal/vite.config.ts
portal/tsconfig.json
`

**Backend:**
`
app/auth/firebase.py
app/auth/middleware.py
app/auth/dependencies.py
app/core/config.py
app/core/database.py
db/models/base.py
db/alembic.ini
Dockerfile
pyproject.toml
`

**Config:**
`
.env.example
docker-compose.yml (Struktur)
`

### ⚠️ Anpassen (70-90%)

`
portal/src/routes/      → Struktur halten, Routen neu
portal/src/components/  → shadcn behalten, Domain-spezifische Komponenten
app/api/v1/router.py    → Pattern halten, Routers zuschneiden
docker-compose.yml      → Services reduzieren (kein Airflow, SAP)
cloudbuild-api.yaml     → Steps halten, Namespaces anpassen
`

### ❌ Weglassen

`
❌ SAP-Extractor, OData Client
❌ JCo RFC Bridge
❌ Billing/Stripe Integration
❌ Graph-API (nodes/links/types)
❌ BOM-Service
❌ Excel Import/Export
❌ Airflow (unless Phase 2+)
❌ rim_ids (Domain Libraries)
❌ Datalake medallion layers
❌ Services/sapcc-2.19.0
`

---

## Implementation Roadmap

### Phase 1 (Woche 1-2): Bootstrap

1. Repo-Structure: pp/, portal/, db/, infra/
2. Copy-Paste: Auth (Firebase), API Skeleton, DB Models (Base)
3. Docker-Compose: postgres, firebase-emulator, api, portal
4. Routes: /login, /_authenticated (layout), /simulations (list), /simulations/:id (detail)
5. API: GET /api/v1/auth/me, GET /api/v1/simulations, POST /api/v1/simulations/run

### Phase 2 (Woche 3-4): Core Features

6. Simulation Execution: POST /api/v1/simulations/run
7. Status Polling: GET /api/v1/simulations/:id/status (staleTime=5s)
8. Results Download: GET /api/v1/simulations/:id/download → Signed URL
9. UI: Dashboard mit Sim-Liste, Detail-View, Progress-Bar
10. Tests: pytest + vitest Basics

### Phase 3 (Woche 5-6): Polish & Scale

11. SSE for Live Progress (if Sim > 5 min)
12. Cloud Build Pipeline Setup
13. Cloud Run Deployment
14. Monitoring (Cloud Logging, structlog)

---

## Critical Success Factors

### ✅ Muss befolgt werden (3fls-spezifisch)

1. **Schema-per-Tenant + search_path** — NICHT optional! Komplette Multi-Tenancy hängt davon ab
2. **TenantAuthMiddleware (ASGI)** — Pure ASGI, nicht BaseHTTPMiddleware (deprecated)
3. **Pool-Sizing:** pool_size=20, max_overflow=10 — für Concurrency-Tests
4. **Alembic Migrations** — Version control für Schema, Build step in Cloud Build
5. **FastAPI + Uvicorn** — Single Worker (Cloud Run skaliert via Instances)
6. **Firebase JWT Validation** — Beide Seiten (Frontend Emulator-Connect, Backend verify_token)

### ⚠️ Nice-to-Have (später)

- Prometheus/Grafana Monitoring
- SSE für Live-Streams
- WebSockets für > 100 concurrent Sims
- Custom Terraform Modules
- Airflow for Scheduled Jobs

---

## Nächste Schritte

1. **Lese 3fls-patterns.md** → Detaillierte Stack-Analyse
2. **Folge copy-paste-guide.md** → Konkrete Datei-Pfade
3. **Review architecture-decisions.md** → Entscheidungen ratifizieren
4. **Starte osim-ui Bootstrap** → Nutze Template-Struktur

---

## Links in dieser Research

- **3fls-patterns.md** — Stack Details (1-10 Punkte)
- **copy-paste-guide.md** — Konkrete Dateien zum Copy-Paste
- **architecture-decisions.md** — 10× ADRs mit Rationales

---

**Status:** ✅ READY FOR DEVELOPMENT

*Erstellt: 2026-05-20 | Confidence: HIGH | Source: tbx_stzrim full stack analysis*
