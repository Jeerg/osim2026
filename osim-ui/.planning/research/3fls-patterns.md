# 3fls Stack Patterns — Cookbook für osim-ui

**Quelle:** 	bx_stzrim Repository (RIM – Industrial Data Science Pipeline)  
**Recherche:** 2026-05-20  
**Ziel:** Patterns, Conventions und wiederverwendbare Code-Artefakte für eigenständiges Web-UI (osim-ui) identifizieren.

---

## 1. Frontend-Stack (portal/)

### 1.1 React-Version & Build-Tool

| Aspekt | 3fls (RIM) | Empfehlung für osim-ui |
|--------|-----------|----------------------|
| **React** | 19.2.4 | **1:1 übernehmen** – aktuelle Stable, großes Ökosystem |
| **Build-Tool** | Vite 7.3.1 | **1:1 übernehmen** – 3-5× schneller als Webpack, @vitejs/plugin-react v5 mit Oxc |
| **TypeScript** | 5.9.3 | **1:1 übernehmen** – Strict Mode, path aliases (@/*) |
| **Package Manager** | npm (lock-file) | **1:1 übernehmen** – package-lock.json committed |

### 1.2 Routing

**Pattern:** TanStack Router (1.167.4) + File-based routing

Struktur: portal/src/routes/__root.tsx, _authenticated.tsx, login.tsx, index.tsx

**Übernehmen für osim-ui:** Struktur beibehalten, beforeLoad Guards für Auth.

### 1.3 State Management

**Frontend-State:** Zustand 5.0.12 (Client-State) + TanStack Query 5.90.21 (Server-State)

Pattern: Zustand für UI-toggles, TanStack Query für API-Daten mit staleTime=5min.

**Übernehmen für osim-ui:** Exakt dieses Pattern – kein Redux, kein MobX.

### 1.4 UI-Komponenten & Styling

| Lib | Version | Einsatz |
|-----|---------|---------|
| **Tailwind CSS** | 4.2.1 | Utility-first, CSS-Variables für Theme |
| **shadcn** | 4.0.8 | Tailwind-basierte Komponenten-Lib |
| **Recharts** | 3.8.0 | Charts/Datenvisualisierung |

**Icons:** react-icons (global) – root-level package.json

### 1.5 Vite-Config

Port: 3002 (oder 3000/3001 für osim-ui)
Plugins: TanStackRouterVite, react, tailwindcss
Alias: @ → ./src

### 1.6 Typischer View-Aufbau

Routes mit useQuery + apiFetch, React-Router v1.x, komponenten-Struktur.

---

## 2. Backend-Stack

### 2.1 Framework & Runtime

- FastAPI 0.115+
- Uvicorn 0.34+
- Python 3.13+
- uv package manager (pyproject.toml)

### 2.2 Verzeichnisstruktur

`
app/
├── api/v1/                 # Versionierte API
├── api/routers/            # Legacy Entity-Routers
├── auth/                   # Firebase + Middleware
├── services/               # Business Logic
├── core/                   # Config, DB, Logging
├── models/ oder db/models/ # SQLAlchemy ORM Models
└── middleware/
`

### 2.3 Endpoint-Organisation

Router Aggregation via include_router() mit Prefixen (auth, billing, admin, etc.)

### 2.4 Database

SQLAlchemy 2.0 + asyncpg + Alembic Migrations

**Multi-Tenancy:** Schema-per-Tenant via PostgreSQL search_path

**Pool Sizing:** pool_size=20, max_overflow=10 (für 50-user concurrency)

### 2.5 Pydantic Schemas

RFC 7807 ProblemDetail, ConfigDict(extra="forbid"), Field-Beschreibungen

---

## 3. Firebase Auth Integration

### 3.1 Frontend

AuthProvider mit onAuthStateChanged, custom claims (tenant_id, role), AuthContext

### 3.2 API Client

openapi-fetch + Middleware für JWT, oder apiFetch mit manueller Token-Injection

### 3.3 Backend

Firebase Admin SDK, TenantAuthMiddleware (ASGI), verify_token()

### 3.4 Multi-Tenancy

Request-State: tenant_id, user_role, user_email aus JWT claims

---

## 4. PostgreSQL Conventions

### Naming
- Tabellen: Singular, snake_case
- Spalten: snake_case
- Meta-Columns: Underscore prefix (\_created_at → created_at in DB)
- ForeignKeys: {table}_id

### Migration Tool: Alembic

`ash
alembic revision --autogenerate -m "message"
alembic upgrade head
`

### Schema-per-Tenant

`sql
CREATE SCHEMA public;          -- Shared (tenants, users)
CREATE SCHEMA "tenant_01";     -- Per-tenant isolation
CREATE SCHEMA "tenant_02";
`

Set search_path per request.

---

## 5. Object Storage (GCS)

- Provider: Google Cloud Storage
- Signed URLs: Fastify Node.js Service (15-min TTL)
- CMEK: Customer-Managed Encryption Keys
- Python: google-cloud-storage
- Node.js: @google-cloud/storage

---

## 6. Cloud Build & Deployment

### Service Topologie (GCP)
- API: Cloud Run Service (FastAPI, Port 8080)
- File-Server: Cloud Run Service (Fastify, Port 3001)
- Portal: Firebase Hosting (React SPA)
- Extractor/Transform: Cloud Run Jobs (optional, nicht MVP)

### Docker (Multi-Stage)
Builder Stage (uv sync) → Runtime Stage (slim, .venv nur)

### Cloud Build Pipeline
Test → Validate → Build → Push → Migrate (Alembic) → Deploy

---

## 7. Realtime / WebSocket

**Nicht in 3fls implementiert.**

Empfehlungen für osim-ui:
- MVP: Polling via React Query (staleTime=5s)
- Scale: Server-Sent Events (SSE) für Sim-Status
- Falls nötig: WebSockets via Starlette/python-socketio

---

## 8. Monorepo Structure

Einziges Repo mit /app, /portal, /db, /services, /infra

Kein Separate Frontend Repo – alles gemeinsam deployed.

---

## 9. CLAUDE.md & Dokumentation

Format und Inhalte: Project Description, Dev Environment, API Namespaces, Commands, Language

---

## 10. Dependency Inventory

### Python (pyproject.toml)

Core: fastapi, uvicorn, sqlalchemy[asyncio], alembic, psycopg[binary]
Database: SQLAlchemy + asyncpg
GCP: google-cloud-storage, firebase-admin
Utils: structlog, orjson, httpx

Dev: pytest, pytest-asyncio, ruff, pre-commit

### Node.js (portal/package.json)

Core: react, react-dom, vite, typescript
Data: @tanstack/react-query, @tanstack/react-router, zustand
UI: tailwindcss, recharts, shadcn
Auth: firebase

---

## Copy-Paste Candidates

### ✅ 1:1 Copy-Paste
- portal/src/auth/* (auth-provider, firebase, use-auth)
- portal/src/api/* (fetch, client)
- portal/src/main.tsx, app.tsx
- portal/vite.config.ts, tsconfig.json, tailwind.config.ts
- app/auth/* (middleware, firebase)
- app/core/* (config, database, logging)
- db/models/base.py
- Dockerfile (Multi-Stage)
- pyproject.toml (angepasst)
- alembic.ini, db/alembic/env.py

### ⚠️ Anpassen (70-90%)
- portal/src/routes/* (Router-Struktur halten, Seiten neue)
- app/api/v1/router.py (Pattern halten, Routers anpassen)
- docker-compose.yml (Services reduzieren)
- cloudbuild-api.yaml (Service-Namen anpassen)

### ❌ Weglassen (osim-spezifisch)
- SAP Extractor, JCo Bridge
- Billing/Stripe
- Graph-API (nodes/links)
- BOM-Service
- Excel Import/Export
- Airflow (initial)
- Datalake medallion layers

---

## Patterns zu 1:1 übernehmen

### Frontend
1. AuthProvider + useAuth Hook
2. TanStack Router + File-based Routing
3. TanStack Query + apiFetch
4. Zustand für Client-State
5. Tailwind CSS 4 + shadcn
6. Vite Config

### Backend
1. TenantAuthMiddleware (ASGI)
2. Firebase Token Verification
3. SQLAlchemy ORM + Alembic
4. Schema-per-Tenant via search_path
5. Pydantic Schemas + RFC 7807
6. Router Aggregation Pattern
7. Settings via python-dotenv

### Infrastructure
1. Multi-Stage Docker
2. Cloud Build Pipeline
3. Secret Manager + Env Vars

---

*Erstellt: 2026-05-20 | Searched: very thorough | Confidence: HIGH*
