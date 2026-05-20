# EXECUTIVE SUMMARY — 3fls Stack Analysis

## Was ist erforscht worden

Gründliche Analyse von **tbx_stzrim** (RIM – Industrial Data Science Pipeline, Production SaaS) um wiederverwendbare Patterns für osim-ui zu extrahieren.

## Die Essenz (TL;DR)

### Frontend: React 19 + Vite 7 + TanStack Stack (Router, Query, Table)

`
package.json: react 19.2.4, vite 7.3.1, typescript 5.9.3
State: Zustand (client) + TanStack Query (server)
UI: Tailwind CSS 4.2 + shadcn + Recharts
Routing: TanStack Router 1.167 (File-based)
`

**Copy-Paste-Kandidaten:**
- ✅ auth-provider.tsx (170 Zeilen, 1:1)
- ✅ firebase.ts (23 Zeilen, 1:1)
- ✅ api/fetch.ts (133 Zeilen, 1:1)
- ✅ vite.config.ts (25 Zeilen, 1:1)
- ✅ app.tsx, main.tsx (70 Zeilen combined, 1:1)

### Backend: FastAPI + SQLAlchemy + PostgreSQL (Schema-per-Tenant!)

`
main.py: FastAPI + Uvicorn + asyncio
Auth: Firebase JWT Validation + TenantAuthMiddleware
DB: SQLAlchemy 2.0 + asyncpg + Alembic
Multi-Tenancy: PostgreSQL Schema-per-Tenant (CRITICAL!)
`

**Copy-Paste-Kandidaten:**
- ✅ app/auth/middleware.py (150 Zeilen, anpassen: Whitelist)
- ✅ app/auth/firebase.py (57 Zeilen, 1:1)
- ✅ app/core/config.py (90 Zeilen, 1:1)
- ✅ app/core/database.py (60 Zeilen, anpassen: search_path)
- ✅ db/models/base.py (95 Zeilen, 1:1)
- ✅ Dockerfile (Multi-Stage, 1:1)

### Deployment: Cloud Run + Firebase Hosting + Cloud Build + Terraform

`
Services: API (Cloud Run), Portal (Firebase Hosting), Optional: File-Server (Cloud Run)
Build: Test → Validate → Build Docker → Push → Migrate DB → Deploy
`

## Die 10 Recherche-Punkte: Status

| # | Bereich | Status | Copy-Paste? | Anpassung? |
|----|---------|--------|-----------|-----------|
| 1 | Frontend-Stack | ✅ DONE | 90% | 10% |
| 2 | Backend-Stack | ✅ DONE | 85% | 15% |
| 3 | Firebase Auth | ✅ DONE | 100% | 0% |
| 4 | PostgreSQL Schema | ✅ DONE | 95% | 5% |
| 5 | GCS Storage | ✅ DONE | 80% | 20% |
| 6 | Cloud Build/Deploy | ✅ DONE | 85% | 15% |
| 7 | Realtime (WebSocket/SSE) | ⚠️ N/A | 0% | N/A (MVP: Polling) |
| 8 | Monorepo Structure | ✅ DONE | 100% | 0% |
| 9 | CLAUDE.md & Docs | ✅ DONE | 100% | 0% |
| 10 | Dependencies | ✅ DONE | 95% | 5% |

## Critical Must-Haves (für osim-ui)

### 🔴 NICHT optional

1. **Schema-per-Tenant via search_path** — Komplette Multi-Tenancy davon abhängig
2. **TenantAuthMiddleware (ASGI)** — Tenant Context in Request State (niet BaseHTTPMiddleware!)
3. **Alembic Migrations** — Automatische DB-Schema-Versionierung
4. **Firebase JWT Custom Claims** — tenant_id + role in JWT, keine DB-Lookups
5. **Pool-Sizing: pool_size=20, max_overflow=10** — Für Concurrency unter Last

### 🟡 Strongly Recommended

6. Zustand + TanStack Query (statt Redux)
7. Tailwind CSS 4 + shadcn Components
8. TanStack Router (statt React Router)
9. Vite 7 (statt Webpack)
10. orjson für API Responses

## Was weglassen

❌ SAP Extractor, OData, JCo Bridge (osim-spezifisch)
❌ Billing/Stripe Integration (Phase 2+)
❌ Graph-API, BOM-Service (spezifisch für RIM)
❌ Excel Import/Export (spezifisch für RIM)
❌ Airflow Orchestration (Phase 2+, MVP: Cloud Scheduler)
❌ rim_ids Libraries (SAP-Domain)

## Nächste Schritte (sofort)

### Tag 1: Bootstrap (Struktur)

`ash
mkdir -p osim-ui/{app,portal,db,services,infra,.planning}

# Frontend
cd portal
npm create vite@latest . -- --template react-ts
npm install react@19.2.4 vite@7.3.1 @vitejs/plugin-react@5
npm install @tanstack/{react-query,react-router}@latest zustand tailwindcss recharts firebase

# Backend
cd ../
python -m venv .venv
uv init --python 3.13
uv add fastapi uvicorn sqlalchemy[asyncio] alembic psycopg[binary] firebase-admin
uv add --dev pytest pytest-asyncio ruff

# Database
alembic init db/alembic
`

### Tag 2: Copy-Paste Critical Files

`ash
# Copy-Paste aus tbx_stzrim:
cp tbx_stzrim/portal/src/auth/* osim-ui/portal/src/auth/
cp tbx_stzrim/portal/src/api/* osim-ui/portal/src/api/
cp tbx_stzrim/app/auth/* osim-ui/app/auth/
cp tbx_stzrim/app/core/* osim-ui/app/core/
cp tbx_stzrim/db/models/base.py osim-ui/db/models/
cp tbx_stzrim/Dockerfile osim-ui/
cp tbx_stzrim/docker-compose.yml osim-ui/
`

### Tag 3: Adapt für osim-ui Domain

`ash
# 1. Routes an/passen: /simulations, /results, /audit
# 2. Backend Routers: /simulations, /results
# 3. DB Models: Simulation, Result, AuditLog
# 4. Docker-Compose: Entfernen: airflow, sapcc, extractor (optional)
`

## Ressourcen in .planning/research/

1. **README.md** — Diese Zusammenfassung
2. **3fls-patterns.md** — Detaillierte Stack-Analyse (1-10 Punkte)
3. **copy-paste-guide.md** — Konkrete Dateien mit Zeilennummern
4. **architecture-decisions.md** — 10× ADRs (Architecture Decision Records)

## Confidence Level

**HIGH (95%+)**

- Alle Quellen verified (package.json, pyproject.toml, Source-Code)
- Production Code aus RIM (stabil, skalierbar, getestet)
- Patterns proven unter Real Load (50-user Concurrency Tests in Phase 17.8.5)

---

*Status: ✅ READY FOR IMPLEMENTATION*

*Erstellt: 2026-05-20 | Author: Claude (Haiku 4.5) | Search Depth: VERY THOROUGH*
