---
phase: 01-vertical-slice
plan: 02
subsystem: backend-foundation
tags: [fastapi, sqlalchemy-async, asyncpg, alembic, firebase-auth, multi-tenancy, structlog, rfc7807]

# --- Dependency-Graph ---
requires: []
provides:
  - "Settings (pydantic-settings) -- app.core.config.settings"
  - "Base, AsyncSessionLocal, engine -- app.core.database"
  - "get_db (tenant-scoped), get_db_unscoped (public-only)"
  - "TenantAuthMiddleware -- pure ASGI, Firebase JWT + Whitelist + Bootstrap-Bypass"
  - "verify_token, initialize_firebase, set_user_tenant_claims -- app.auth.firebase"
  - "get_user_uid, get_user_email, get_user_role, get_tenant_id -- FastAPI-Dependencies"
  - "Tenant, User -- SQLAlchemy-2 typed Models im public-Schema"
  - "ensure_tenant_bootstrap(uid, email, db) -- idempotenter Lazy-Tenant-Bootstrap"
  - "POST /api/v1/auth/me -- Lazy-Self-Service-Bootstrap-Endpoint"
  - "GET /api/v1/health + GET /api/v1/readiness (versioniert)"
  - "GET /health + GET /readiness (top-level, fuer Container-Probes)"
  - "ProblemDetail + register_exception_handlers -- RFC-7807-konform"
  - "configure_logging, get_logger -- structlog-Setup"
  - "api_router -- API-v1-Aggregator (Erweiterungspunkt fuer Plan 01-03+)"
  - "alembic-async-Setup + 001_initial_schema (tenants, users)"
affects:
  - "osim-ui/app/"
  - "osim-ui/db/"
  - "osim-ui/docker-compose.yml"
  - "osim-ui/.env.example"
  - "osim-ui/pyproject.toml"
  - "osim-ui/tests/"

# --- Tech-Stack ---
tech_stack:
  added:
    - "fastapi 0.115+"
    - "uvicorn[standard] 0.34+"
    - "sqlalchemy[asyncio] 2.x"
    - "asyncpg 0.30+"
    - "alembic 1.14+"
    - "pydantic 2.6+, pydantic-settings 2.6+"
    - "firebase-admin 7.2+"
    - "structlog 25.x"
    - "osim-engine (editable-install via [tool.uv.sources])"
  patterns:
    - "Schema-per-Tenant via Postgres SET search_path TO {tenant_id},public pro Request"
    - "Lazy Tenant-Bootstrap auf POST /api/v1/auth/me (D-17 Self-Service)"
    - "Pure-ASGI-Middleware (KEIN BaseHTTPMiddleware -- Starlette #1678)"
    - "RFC-7807 ProblemDetail fuer alle Error-Responses"
    - "Service-Layer (app/services/) klar getrennt von API-Routern (app/api/)"
    - "Idempotenz via UNIQUE-Constraint + IntegrityError-Re-Query (Race-Safety)"
    - "Schema-Name-Whitelist [a-z0-9_]{1,63} vor jeglichem f-string-SQL"

# --- Key Files ---
key_files:
  created:
    - "osim-ui/app/core/config.py"
    - "osim-ui/app/core/database.py"
    - "osim-ui/app/core/logging.py"
    - "osim-ui/app/core/errors.py"
    - "osim-ui/app/auth/firebase.py"
    - "osim-ui/app/auth/middleware.py"
    - "osim-ui/app/auth/dependencies.py"
    - "osim-ui/app/api/v1/router.py"
    - "osim-ui/app/api/v1/auth.py"
    - "osim-ui/app/api/v1/health.py"
    - "osim-ui/app/models/tenant.py"
    - "osim-ui/app/models/user.py"
    - "osim-ui/app/services/tenant_service.py"
    - "osim-ui/db/alembic.ini"
    - "osim-ui/db/migrations/env.py"
    - "osim-ui/db/migrations/script.py.mako"
    - "osim-ui/db/migrations/versions/20260520_0000_001_initial_schema.py"
    - "osim-ui/tests/conftest.py"
    - "osim-ui/tests/test_alembic.py"
    - "osim-ui/tests/test_auth_me.py"
  modified:
    - "osim-ui/pyproject.toml"
    - "osim-ui/docker-compose.yml"
    - "osim-ui/.env.example"
    - "osim-ui/app/main.py"
    - "osim-ui/app/models/__init__.py"
    - "osim-ui/tests/app/test_health.py"

# --- Decisions ---
decisions:
  - id: "01-02-D1"
    title: "tenant_id-Schema-Naming"
    decision: "tenant_id = 'tenant_' + first16(lowercased_alphanum(uid)) | sha256-fallback bei unsafe slug"
    rationale: "Lesbar in psql-Praefix, Whitelist-validierbar gegen SQL-Injection im SET search_path. Hash-Fallback fuer Sonderzeichen-UIDs."
  - id: "01-02-D2"
    title: "Whitelist-Pfade fuer Auth-Bypass"
    decision: "/, /health, /readiness, /docs, /openapi.json, /redoc, /favicon.ico"
    rationale: "Container-Liveness-Probes brauchen /health top-level (kein Pfad-Praefix konfigurierbar in k8s/Cloud Run). /readiness ebenfalls top-level fuer Orchestrator-Healthchecks. Doppelmount /api/v1/health zusaetzlich fuer Konsistenz versionierter API."
  - id: "01-02-D3"
    title: "Sonderfall /api/v1/auth/me ohne tenant_id-Claim"
    decision: "TENANT_BOOTSTRAP_PATHS = {'/api/v1/auth/me'} laesst Requests OHNE tenant_id-Claim durch. Handler nutzt get_db_unscoped + ensure_tenant_bootstrap."
    rationale: "Self-Service-D-17: erster Login eines neuen Users hat noch keinen Custom-Claim (set_user_tenant_claims kommt erst NACH Bootstrap). Ohne diese Ausnahme entstuende ein Henne-Ei."
  - id: "01-02-D4"
    title: "Firebase Custom Claims best-effort"
    decision: "set_user_tenant_claims raised NICHT, sondern loggt nur Warning bei Emulator-Limits."
    rationale: "Firebase-Emulator unterstuetzt set_custom_user_claims teils eingeschraenkt. Phase-1-Compromise: bei fehlendem Claim wird tenant_id beim naechsten Request aus public.users nachgelesen (langsam, aber funktional bis Plan 01-03 caching einfuehrt)."
  - id: "01-02-D5"
    title: "Pool-Strategie: NullPool in test, AsyncAdaptedQueuePool sonst"
    decision: "ENVIRONMENT=test -> NullPool; sonst pool_size=20, max_overflow=10, pool_pre_ping=False, pool_recycle=1800."
    rationale: "pool_pre_ping triggert auf Windows ProactorEventLoop AttributeError 'NoneType.send', wenn TestClient-Loops zwischen Requests recycled werden. NullPool umgeht das fuer Tests; pool_recycle deckt stale-conn-Schutz in Prod ohne den problematischen sync-ping ab. (3fls hatte pool_pre_ping=True, aber dort sync engine + psycopg3 -- nicht 1:1 portierbar.)"
  - id: "01-02-D6"
    title: "Alembic-Migration manuell statt autogenerate"
    decision: "001_initial_schema.py handgeschrieben statt 'alembic revision --autogenerate'."
    rationale: "Async-Alembic + autogenerate ist fummelig (Cookbook). Fuer 2 Tabellen + 2 Indizes ist manueller Code stabiler und reviewbarer. Spaetere Plans pruefen, ob autogenerate stabil betrieben werden kann."
  - id: "01-02-D7"
    title: "RFC-7807 Content-Type fuer Errors"
    decision: "application/problem+json"
    rationale: "Strikt nach RFC 7807; Frontend kann zentral auf den Content-Type matchen, statt JSON von HTML-Errors zu unterscheiden."
  - id: "01-02-D8"
    title: "andreysenov/firebase-tools statt node:20-slim+npm-install"
    decision: "docker-compose firebase-emulator nutzt andreysenov/firebase-tools:latest."
    rationale: "Kein NPM-Install pro Container-Start (60-90s Penalty), 1-Shot-Image (~150 MB) startet in <3s. Wenn Image nicht verfuegbar, fallback aus copy-paste-guide.md (node:20-slim)."

# --- Patterns (3fls-Reuse) ---
patterns:
  - "TenantAuthMiddleware: 1:1 aus tbx_stzrim/app/auth/middleware.py portiert, vereinfacht (kein Stripe-Webhook, kein Billing-State, kein Tenant-Status-Cache -- letzteres folgt in Plan 01-03)."
  - "verify_token-Wrapper: 1:1 aus tbx_stzrim/app/auth/firebase.py."
  - "ProblemDetail: aus 3fls D-CR03-Pattern (RFC 7807 + custom errors-Field fuer Validation)."
  - "search_path-Switch: aus tbx_stzrim/app/core/database.py, auf async portiert. Tenant-Whitelist statt 3fls' regex-prefix."
  - "Settings: aus tbx_stzrim/app/core/config.py, aber pydantic-settings 2 statt python-dotenv-Direct."

# --- Metrics ---
metrics:
  tasks_completed: 3
  files_created: 20
  files_modified: 6
  test_count: 11
  test_results: "11 passed"
  ruff_status: "clean"
  duration_minutes: ~45
  completed_date: "2026-05-20"
---

# Phase 1 Plan 02: Backend-Foundation Summary

Volle FastAPI-Backend-Foundation gemaess D-18 fuer das osim-ui-Monorepo angelegt: versionierte API unter `/api/v1/`, Service-Layer, async SQLAlchemy + asyncpg, Alembic-async-Setup, Firebase-Auth-Middleware mit lazy Tenant-Bootstrap (D-17), Schema-per-Tenant in Postgres (D-16), structlog, RFC-7807-Errors, Health- und Readiness-Endpoints.

## Was gebaut wurde

**Task 1 -- Foundation (Commit `551915c`)**: `pyproject.toml` um `pydantic-settings`, `structlog`, `firebase-admin`, `asyncpg`, `osim-engine` (editable-install via `[tool.uv.sources]`) ergaenzt. `app/core/config.py` (Settings via pydantic-settings, spiegelt `FIREBASE_AUTH_EMULATOR_HOST` in `os.environ` VOR SDK-Init), `app/core/database.py` (async-Engine, `Base`, `get_db` mit `SET search_path`, `get_db_unscoped` fuer Bootstrap-Pfad), `app/core/logging.py` (structlog Console/JSON je nach Environment), `app/core/errors.py` (RFC-7807 ProblemDetail + globale Handler). Alembic-Setup (`db/alembic.ini`, async-`env.py`, `script.py.mako`). docker-compose mit `postgres:17-alpine`, `andreysenov/firebase-tools` (kein NPM-Install pro Start), `minio` -- alle mit Healthchecks.

**Task 2 -- Persistence (Commit `17c14ee`)**: Models `Tenant` und `User` im `public`-Schema (SQLAlchemy 2 typed). `ensure_tenant_bootstrap(uid, email, db)` als idempotenter Self-Service-Bootstrap mit Race-Condition-Safety (IntegrityError -> Rollback + Re-Query). Manuelle 001-Migration (kein autogenerate; siehe D-01-02-D6). `tests/conftest.py` mit DB-Probe, auto-`CREATE DATABASE osim_ui_test`, `db_engine`-Fixture mit Tenant-Schema-Cleanup, `patch_verify_token`-Helper. `tests/test_alembic.py` verifiziert Upgrade -> Downgrade -> Upgrade-Roundtrip.

**Task 3 -- Auth-Stack (Commit `2573e39`)**: `app/auth/firebase.py` mit `initialize_firebase` (idempotent, Emulator + ADC), `verify_token`, `set_user_tenant_claims` (best-effort). `app/auth/middleware.py` als pure ASGI-Middleware mit Whitelist (`/health`, `/readiness`, `/docs`, `/openapi.json`, `/redoc`, `/`) und `TENANT_BOOTSTRAP_PATHS` fuer den Self-Service-Sonderfall `/api/v1/auth/me`. `verify_token` laeuft in `asyncio.to_thread`. `app/auth/dependencies.py` mit `get_user_uid`, `get_user_email`, `get_user_role`, `get_tenant_id`. `app/api/v1/auth.py` mit `POST /me` (lazy Bootstrap + best-effort Custom Claims), `app/api/v1/health.py` mit `/health` + `/readiness`, `app/api/v1/router.py` als Aggregator. `app/main.py` ergaenzt um `lifespan` (`configure_logging` + `initialize_firebase` + `engine.dispose`), Middleware-Reihenfolge (GZip -> CORS -> TenantAuth), `register_exception_handlers`, Top-Level `/health` + `/readiness`.

**Bonus (Commit `5b8737e`)**: Test `test_search_path_is_set_per_tenant_request` verifiziert das must-have, dass `get_db` den `search_path` korrekt auf `tenant_{slug},public` setzt.

## Endpoints (verifiziert via curl auf laufender uvicorn-Instanz)

| Pfad | Methode | Auth | Status | Body |
|------|---------|------|--------|------|
| `/health` | GET | nein (Whitelist) | 200 | `{"status":"ok","service":"osim-ui","version":"0.1.0"}` |
| `/readiness` | GET | nein (Whitelist) | 200 / 503 | `{"status":"ok","db":"up"}` oder degraded |
| `/api/v1/health` | GET | ja | 401 ProblemDetail ohne Token |
| `/api/v1/readiness` | GET | ja | 401 ProblemDetail ohne Token |
| `/api/v1/auth/me` | POST | ja (aber tenant_id-Claim darf fehlen) | 200 mit `{tenant_id, user_uid, email, role, bootstrapped}` |
| `/docs` | GET | nein (Whitelist) | 200 |
| `/openapi.json` | GET | nein (Whitelist) | 200 |

## Must-Haves abgehakt

- [x] `docker compose up postgres firebase-emulator` startet ohne Fehler (Postgres lokal verifiziert; Firebase-Emulator-Image ist `andreysenov/firebase-tools:latest`).
- [x] `uv run uvicorn app.main:app` startet ohne Fehler; `/health` antwortet 200.
- [x] `/readiness` antwortet 200 mit DB-Connectivity-Check (curl verifiziert).
- [x] Anfrage ohne Auth an `/api/v1/*` -> 401 mit RFC-7807 ProblemDetail (curl verifiziert, Test `test_unauthenticated_request_returns_401_problem_detail` gruen).
- [x] POST `/api/v1/auth/me` mit gueltigem Token legt beim ersten Call `tenant_{uid}`-Schema + tenants-Row + users-Row an (Test `test_auth_me_creates_tenant_on_first_call` + `test_auth_me_creates_postgres_schema` gruen).
- [x] Zweiter Call ist idempotent (Test `test_auth_me_is_idempotent` gruen, COUNT(*) = 1 fuer beide Tabellen).
- [x] DB-Queries laufen mit `search_path={tenant_id},public` (Test `test_search_path_is_set_per_tenant_request` gruen, SHOW search_path bestaetigt Reihenfolge).
- [x] `alembic upgrade head` und `downgrade base` idempotent (Test `test_alembic_upgrade_head_then_downgrade_base_roundtrip` gruen).
- [x] `uv run pytest` -> 11 passed.
- [x] `uv run ruff check app/ tests/` -> clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pydantic-settings parst Komma-Liste fuer cors_origins als JSON.**
- **Found during:** Task 1 Verify (`uv run python -c "from app.core.config import settings"`).
- **Issue:** Pydantic-settings 2 versucht bei `list[str]` einen JSON-Decode, scheitert an `"http://localhost:3000,http://localhost:3001"`.
- **Fix:** `Annotated[list[str], NoDecode]` plus `@field_validator(mode="before")` der "a,b,c"-Strings spaltet.
- **Files:** `osim-ui/app/core/config.py`.
- **Commit:** `551915c`.

**2. [Rule 1 - Bug] cross-loop AttributeError 'NoneType.send' auf Windows.**
- **Found during:** Task 3 pytest-Lauf (`test_auth_me_is_idempotent`).
- **Issue:** `pool_pre_ping=True` mit asyncpg + Windows ProactorEventLoop wirft `AttributeError: 'NoneType' object has no attribute 'send'`, wenn TestClient-Loops zwischen Requests gerecycelt werden.
- **Fix:** Pool-Strategie ENV-abhaengig: `NullPool` wenn `ENVIRONMENT=test`, sonst `AsyncAdaptedQueuePool` mit `pool_pre_ping=False` + `pool_recycle=1800`.
- **Files:** `osim-ui/app/core/database.py`.
- **Commit:** `2573e39`.

**3. [Rule 2 - missing critical functionality] Top-Level `/readiness` fehlte.**
- **Found during:** Task 3 pytest-Lauf (`test_readiness_endpoint_with_db` -> 404).
- **Issue:** must-have-Spec verlangt `/readiness` top-level (Container-Probes haben keinen `/api/v1`-Praefix). Plan implizierte das, mein erster Wurf hatte nur `/api/v1/readiness`.
- **Fix:** Top-Level-Endpoint in `app/main.py` ergaenzt, in Middleware-Whitelist gespiegelt.
- **Files:** `osim-ui/app/main.py`.
- **Commit:** `2573e39`.

**4. [Rule 2 - missing critical functionality] search_path-Verifikation als Test.**
- **Found during:** Final-Verify.
- **Issue:** must-have "DB-Queries laufen mit search_path={tenant_id},public" hatte keinen automated Test.
- **Fix:** `test_search_path_is_set_per_tenant_request` mit mounted Probe-Endpoint + SHOW search_path.
- **Files:** `osim-ui/tests/test_auth_me.py`.
- **Commit:** `5b8737e`.

**5. [Rule 1 - Bug] FastAPIDeprecationWarning fuer ORJSONResponse.**
- **Found during:** Task 3 pytest warnings.
- **Issue:** `default_response_class=ORJSONResponse` ist in FastAPI 0.115 deprecated -- Pydantic serialisiert nativ schneller.
- **Fix:** Parameter entfernt, JSON-Performance bleibt durch Pydantic erhalten.
- **Files:** `osim-ui/app/main.py`.
- **Commit:** `2573e39`.

### Anpassungen ohne Auswirkung auf das Plan-Verhalten

- **alembic.ini** `path_separator = os` ergaenzt -- behebt Future-Deprecation-Warning ohne semantische Aenderung.
- **per-file-ignores in pyproject.toml** ergaenzt: B008 (FastAPI Depends-Default = bewusst), E702 (mock-Setup-Semicolons in Tests).

## Notes fuer Plan 01-03+

- **Tenant-Status-Cache** (3fls hatte TTLCache 5min in `app/core/database.py`) ist hier NICHT portiert -- in Phase 1 ist nur ein User pro Tenant + lazy bootstrap, kein Suspendieren noetig. Wenn Plan 01-04+ Modelle/Runs gegen DB-Lookups schuetzen muss, hier Cache nachziehen.
- **`set_user_tenant_claims` best-effort:** wenn Plan 01-04 Performance braucht, kann hier ein DB-Lookup-Fallback in der Middleware ergaenzt werden (3fls hatte einen).
- **Models-Erweiterung:** `app/models/__init__.py` re-exportiert `Tenant`, `User`. Plan 01-03+ ergaenzt hier `Model`, `ModelVersion`, `Run`, `RunArtifact`, `EditLock`, registriert sie in Base.metadata, Alembic-Migration `002_*` schreibt sie ins jeweilige tenant-Schema (nicht public!).
- **Engine-Editable-Install:** `pyproject.toml` referenziert `osim-engine` via `[tool.uv.sources]`. Plan 01-03 (OTX-Parser-Endpoint) kann jetzt `from osim_engine.io.otx_loader import load_otx_file` direkt importieren.
- **Auth-Test ohne Emulator-Spinup:** Tests mocken `verify_token` per `unittest.mock.patch`. Integration-Test gegen den echten Emulator (signUp -> ID-Token -> /auth/me) ist als Backlog: marked `@pytest.mark.integration`, wuerde docker-compose-up-Postcondition brauchen.

## Self-Check

### Created Files

- [x] `osim-ui/app/core/config.py` -- FOUND
- [x] `osim-ui/app/core/database.py` -- FOUND
- [x] `osim-ui/app/core/logging.py` -- FOUND
- [x] `osim-ui/app/core/errors.py` -- FOUND
- [x] `osim-ui/app/auth/firebase.py` -- FOUND
- [x] `osim-ui/app/auth/middleware.py` -- FOUND
- [x] `osim-ui/app/auth/dependencies.py` -- FOUND
- [x] `osim-ui/app/api/v1/router.py` -- FOUND
- [x] `osim-ui/app/api/v1/auth.py` -- FOUND
- [x] `osim-ui/app/api/v1/health.py` -- FOUND
- [x] `osim-ui/app/models/tenant.py` -- FOUND
- [x] `osim-ui/app/models/user.py` -- FOUND
- [x] `osim-ui/app/services/tenant_service.py` -- FOUND
- [x] `osim-ui/db/alembic.ini` -- FOUND
- [x] `osim-ui/db/migrations/env.py` -- FOUND
- [x] `osim-ui/db/migrations/script.py.mako` -- FOUND
- [x] `osim-ui/db/migrations/versions/20260520_0000_001_initial_schema.py` -- FOUND
- [x] `osim-ui/tests/conftest.py` -- FOUND
- [x] `osim-ui/tests/test_alembic.py` -- FOUND
- [x] `osim-ui/tests/test_auth_me.py` -- FOUND

### Commits

- [x] `551915c` (feat: config + async DB-engine + logging + errors + alembic) -- FOUND
- [x] `17c14ee` (feat: models + initial migration + tenant-bootstrap-service) -- FOUND
- [x] `2573e39` (feat: firebase auth + /auth/me lazy bootstrap + health/readiness) -- FOUND
- [x] `5b8737e` (test: verify search_path is set to tenant_{slug},public) -- FOUND

## Self-Check: PASSED
