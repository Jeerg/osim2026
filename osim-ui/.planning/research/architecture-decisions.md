# ADR: Architecture Decisions für osim-ui (basierend auf 3fls)

## ADR-001: Frontend Framework & Stack

**Decision:** React 19.2.4 + Vite 7 + TanStack Router + Zustand + TanStack Query

**Rationale:**
- 3fls verwendet exakt diesen Stack → bewährte Patterns vorhanden
- React: Riesiges Ökosystem, für Dashboard-Widgets ideal
- Vite 7: 3-5× schneller als Webpack, Oxc-basierter Transpiler
- TanStack Router: Moderne Alternative zu React Router, File-based routing
- Zustand: Minimal-Boilerplate für Client-State
- TanStack Query: Server-State, Caching, Refetch-Strategien

**Alternatives considered:**
- Next.js: Overkill für reine SPA (osim-ui ist Client-side SPA)
- Vue 3: Kleineres Ökosystem für Complex Dashboards
- Svelte: Zu nischig für Team-Standard

**Consequence:**
- ✅ Hohe Code-Wiederverwendung aus 3fls
- ✅ Großes Ökosystem (Libraries, Stackoverflow)
- ✅ Performance optimal für Live-Dashboards
- ❌ Node.js Build-Tool Komplexität (Bundler, Dependencies)

---

## ADR-002: Backend Framework & Runtime

**Decision:** FastAPI + Uvicorn + Python 3.13 + asyncio

**Rationale:**
- 3fls Bewährung: Produktiv seit Phase 1, stabil unter Last
- Async-Native: Ideal für I/O-Heavy Sim-API (mehrere Sims parallel)
- Pydantic v2: 5-50× schneller als v1, OpenAPI-Integration
- Cloud Run optimiert: Single Worker, Horizontal Scaling via Instances
- Development: Hot-reload via uvicorn --reload

**Alternatives considered:**
- Django: Sync-first, zu schwer für Sims
- Flask: Zu minimalistisch, keine Async-Unterstützung
- Litestar: Kleineres Ecosystem als FastAPI

**Consequence:**
- ✅ Async I/O für parallel Sims
- ✅ Built-in OpenAPI Documentation
- ✅ Schnelle Development Loop
- ❌ Python GIL für CPU-Heavy Transforms (mitigated: Cloud Run Jobs für Transforms)

---

## ADR-003: Database: PostgreSQL + Schema-per-Tenant

**Decision:** Cloud SQL PostgreSQL 17 + Schema-per-Tenant Isolation via search_path

**Rationale:**
- 3fls produziert damit: Strong Tenant Isolation ohne Container-Overhead
- DSGVO Compliance: DROP SCHEMA = Right to Erasure
- Performance: Native PostgreSQL, keine ORM-Overhead für Simple Queries
- Alembic Migrations: Version-Controlled Schema Changes
- Multi-Tenancy ohne Application-Layer Complexity: DB handles search_path

**Schema Layout:**
`sql
public.tenants, public.tenant_users    -- Shared
"tenant_01".simulations, "tenant_01".results  -- Per-tenant
"tenant_02".simulations, "tenant_02".results
`

**Alternatives considered:**
- AlloyDB: €200/month, overkill für MVP
- Multi-Row Tenancy (tenant_id column): Vulnerable to Row-Level-Confusion Bugs
- NoSQL (Firebase): Keine referential Integrity für Sim-Results

**Consequence:**
- ✅ DSGVO-Ready (Legal)
- ✅ Strong Isolation (Security)
- ✅ Cost-Effective (€10/month Cloud SQL)
- ❌ Migration Complexity (Alembic muss alle Schemas migrieren)

---

## ADR-004: Authentication: Firebase Auth

**Decision:** Firebase Auth + Custom JWT Claims (tenant_id, role)

**Rationale:**
- 3fls nutzt: Proven in Production
- GCP-Native: Kostenlos bis 10K MAU, enge GCP-Integration
- No Backend Auth Storage: Firebase Admin SDK verifiziert JWT
- OIDC/SAML Ready: Für Enterprise-SSO später
- Custom Claims: Tenant_id + Role im JWT → keine DB-Lookup nötig für Auth

**JWT Claims Structure:**
`json
{
  "tenant_id": "01",
  "role": "admin|viewer|editor",
  "email": "user@example.com"
}
`

**Alternatives considered:**
- Auth0: €1350/month für B2B SAPA DD
- Supabase Auth: Locks to Supabase Postgres
- DIY (session cookies): Security Risk, Session Storage nötig

**Consequence:**
- ✅ No Backend Session DB
- ✅ Scales Horizontally (Stateless)
- ✅ Google Ecosystem
- ❌ Vendor Lock-in (Google)

---

## ADR-005: Multi-Tenancy Strategy

**Decision:** Schema-per-Tenant + JWT Custom Claims for Tenant Routing

**Rationale:**
- Separation: DB-Level Isolation (search_path)
- Routing: JWT Claim Extraction in TenantAuthMiddleware → Request State
- Data Access: Per-Request SET search_path per Tenant
- Cost: Single DB Instance, no Container per Tenant

**Request Flow:**
`
Request → TenantAuthMiddleware extracts tenant_id from JWT
        → Sets request.state.tenant_id
        → get_db() dependency: SET search_path to tenant_id, public
        → SQLAlchemy finds tables in tenant_id schema
`

**Alternatives considered:**
- Container-per-Tenant: Cost & Ops Overhead
- Application-Layer Filtering (tenant_id in WHERE): Mistake Prone
- Separate DBs per Tenant: Cost & Migration Overhead

**Consequence:**
- ✅ Strong Isolation (DB-Level)
- ✅ Affordable (€10/month + compute)
- ✅ DSGVO Compliant
- ❌ Requires Careful Migration Management (Alembic, search_path handling)

---

## ADR-006: API Versioning

**Decision:** Path-based Versioning (/api/v1/, /api/v2/) + Legacy Sunset

**Rationale:**
- 3fls Pattern: /api/v1/graph (new), /api/v1/legacy-graph (old)
- Clear Deprecation: RFC 8594 Sunset Header
- Backend Isolation: Old routers in separate module
- Frontend Compatibility: gradual Migration via Feature Flags

**Sunset Header Example:**
`http
Sunset: Wed, 31 Dec 2026 23:59:59 GMT
Deprecation: true
Link: </api/v2/graphs>; rel="successor-version"
`

**Consequences:**
- ✅ Non-Breaking Evolution
- ✅ Clear Deprecation Timeline
- ❌ Router Duplication (Old + New)

---

## ADR-007: Realtime Updates (Status Polling vs SSE vs WebSockets)

**Decision:** MVP = Polling (React Query, staleTime=5s); Scale = SSE

**Rationale:**
- MVP: Keep it Simple (No new Infrastructure for WebSockets)
- React Query: Built-in Polling, Retry, Caching
- SSE Phase 2: If Sim Execution takes > 5 min (reduce polling overhead)
- WebSockets Phase 3: If > 100 concurrent Sims (bidirectional comms)

**Implementation:**
`	ypescript
// MVP: Poll every 5 seconds
useQuery({
  queryKey: ['simulations', simId],
  queryFn: fetchSimStatus,
  staleTime: 5000,  // 5 second cache
  refetchInterval: 5000,  // Auto-refetch
});

// SSE (Phase 2): Server Push
const eventSource = new EventSource(/api/v1/sims//events);
`

**Consequences:**
- ✅ MVP: No Server State Complexity
- ✅ Works over HTTP (no proxy issues)
- ⚠️ Higher Client-Server Traffic (mitigated by short staleTime)
- 🔄 Scale: Migrate to SSE/WebSockets later

---

## ADR-008: File Storage: GCS + Signed URLs

**Decision:** Google Cloud Storage + 15-min Signed URLs (via Fastify File-Server)

**Rationale:**
- 3fls Bewährung: Production-Tested
- Security: Time-Limited URLs, no API Token in Browser
- Fastify: Minimal Service for URL Generation + Auth Verification
- Cost: GCS €0.02/GB (first 1TB free, Compute Intensive)

**Flow:**
`
React App → Fastify /download/:bucket/:key
         → Verify Firebase JWT
         → Generate signed URL (15 min)
         → Return URL to Browser
         → Browser fetches from GCS directly (offload bandwidth)
`

**Alternatives considered:**
- Serve directly from FastAPI: Bandwidth Costs, Slower
- S3: Same cost, less GCP integration
- Direct GCS JSON Upload: Requires exposing Service Account (Security Risk)

**Consequence:**
- ✅ Secure (Time-limited, Auth-gated)
- ✅ Bandwidth Efficient (Direct Download)
- ✅ Scalable (GCS handles Large Files)
- ❌ Fastify Service as Dependency (Simple, but extra service)

---

## ADR-009: CI/CD: Cloud Build + Terraform

**Decision:** Google Cloud Build (GCP-Native) + Terraform for IaC

**Rationale:**
- 3fls Proven: Multi-Pipeline (API, Portal, Extractor)
- Path Filters: Avoid unnecessary rebuilds (only changed services)
- Terraform: Reproducible Infra, Version-Controlled
- Cost: Free Build Minutes (500 min/month in Free Tier)

**Build Pipeline Steps:**
`
Test → Validate → Build Docker → Push Artifact Registry → Migrate (Alembic) → Deploy Cloud Run
`

**Alternatives considered:**
- GitHub Actions: Works, but GCP-Native integrations less smooth
- GitLab CI: Overkill for simple Pipeline
- Jenkins: Self-Hosted Ops Overhead

**Consequence:**
- ✅ GCP-Native (no external Services)
- ✅ Path-based Triggers (avoid Bloat)
- ✅ Environment Secrets via Secret Manager
- ❌ Vendor Lock-in (GCP)

---

## ADR-010: Testing Strategy

**Decision:** Pytest (Backend) + Vitest (Frontend) + Optional Playwright (E2E)

**Rationale:**
- Backend: pytest + pytest-asyncio for async endpoint testing
- Frontend: Vitest (Vite-native, 10× faster than Jest)
- E2E: Playwright for Critical User Journeys (optional MVP)

**Test Pyramid:**
`
       E2E (Playwright)
    /
   / Unit + Integration (Vitest)
  /
 / Unit (Pytest, pytest-asyncio)
/___________________________________
`

**Consequence:**
- ✅ Fast Feedback Loop (Vitest, pytest watch)
- ✅ Async Support (pytest-asyncio)
- ✅ Type Safety (TypeScript, Mypy optional)
- ❌ E2E Tests Fragile (only critical paths)

---

*Version: 1.0*  
*Date: 2026-05-20*  
*Based on: 3fls RIM (tbx_stzrim) Production Experience*
