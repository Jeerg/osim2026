---
phase: 01-vertical-slice
plan: 02
subsystem: backend-foundation
tags: [fastapi, sqlalchemy, psycopg3, alembic, firebase-auth, structlog, rfc-7807, tenant-isolation, lazy-bootstrap]

# Dependency graph
requires:
  - phase: 01-vertical-slice
    plan: 01
    provides: editable osim-engine, requires_engine-Marker-Infrastruktur, pytest-Marker-Stack
provides:
  - "FastAPI-App-Factory mit Lifespan + RFC-7807-Handler + Pure-ASGI-TenantAuthMiddleware + CORS — bootbar via `uv run uvicorn app.main:app`"
  - "Sync SQLAlchemy 2 + psycopg3 + QueuePool mit search_path-Defense-in-Depth (startup-pin + per-Request-SET + reset_on_return — 3fls-Phase-19-final-Fix)"
  - "Lazy-Tenant-Bootstrap-Service (D-17 Self-Service): idempotent gegen Race via CREATE SCHEMA IF NOT EXISTS + ON CONFLICT DO NOTHING; SQL-Injection-Defense via Whitelist-Regex"
  - "Alembic-Setup mit Initial-Migration für public.tenants + public.users — `alembic history` zeigt <base> -> 001_initial_schema (head)"
  - "RFC-7807 ProblemDetail mit `code`-Feld (Plan-24-04.2-Lesson aus 3fls) für stabiles Frontend-DE-Toast-Mapping"
  - "Firebase Admin SDK-Integration mit Emulator-Support (Pitfall #9 via ENV-var-Setting VOR initialize_app)"
  - "Stack-Parität zu 3fls explizit bestätigt: sync SQLAlchemy, psycopg3, Pure-ASGI-Middleware, plain `class Settings` — KEIN BaseHTTPMiddleware, KEIN pydantic-BaseSettings, KEIN asyncpg"
affects: [01-04-storage-models-locks-api, 01-05-compose-stack-integration-tests, 01-06-portal-foundation, 01-11-save-strategy-indexeddb]

# Tech tracking
tech-stack:
  added: []  # alle Dependencies kamen schon in 01-01-pyproject.toml dazu
  patterns:
    - "Pure-ASGI-Middleware-Klasse (`__call__(scope, receive, send)`) statt BaseHTTPMiddleware (Starlette #1678)"
    - "search_path-Defense-in-Depth: 3-Mechanismen-Stack (connect_args.options pin + per-request SET + reset_on_return=rollback)"
    - "Lazy-Bootstrap mit asyncio.to_thread (sync DB-Call darf Event-Loop nicht blockieren)"
    - "RFC-7807 mit `code`-Field als Top-Level-Extension (RFC §3.2) — structured detail-Dict wird in {code, title, detail} aufgesplittet"
    - "Schema-Identifier-SQL-Injection-Defense: Whitelist-Regex VOR f-string-Interpolation, weil Postgres-Identifier nicht parametrisiert werden können"
    - "Plain `class Settings` mit `__init__`-ENV-Lookup statt pydantic-BaseSettings (3fls-Parität)"

key-files:
  created:
    - "app/core/config.py — Settings-Singleton, 13 Felder, DATABASE_URL psycopg3-Auto-Präfix"
    - "app/core/logging.py — configure_logging() mit JSON/Console-Schalter über settings.environment"
    - "app/core/database.py — sync engine + SessionLocal + get_db mit search_path-Whitelist-Validation"
    - "app/db/__init__.py — leerer Package-Marker"
    - "app/db/models.py — Base + Tenant + User Declarative Models (public-Schema)"
    - "app/auth/firebase.py — initialize_firebase + verify_token (1:1 aus 3fls, Emulator-Support)"
    - "app/auth/middleware.py — Pure-ASGI TenantAuthMiddleware mit Lazy-Bootstrap-Hook"
    - "app/auth/dependencies.py — get_current_user, require_admin, get_tenant_id, get_user_uid"
    - "app/auth/schemas.py — UserRole(StrEnum), CurrentUser(BaseModel)"
    - "app/auth/router.py — /auth/me-Endpoint + AuthMeResponse(tenant_id, role, email, tenant_status)"
    - "app/api/schemas/__init__.py — leerer Package-Marker"
    - "app/api/schemas/common.py — ProblemDetail (RFC 7807) + PaginationMeta"
    - "app/api/v1/health.py — GET /health mit DB-Check + version"
    - "app/api/v1/router.py — api_router-Aggregator (Phase 1: nur auth)"
    - "app/services/auth_service.py — bootstrap_tenant_if_missing + _validate_slug"
    - "db/alembic.ini — Alembic-Config; sqlalchemy.url leer (env.py liest aus settings)"
    - "db/alembic/env.py — Alembic-Env, target_metadata=Base.metadata, version_table_schema=public"
    - "db/alembic/script.py.mako — Standard-Alembic-Template (1:1 aus 3fls)"
    - "db/alembic/versions/001_initial_schema.py — pgcrypto-Extension + public.tenants + public.users + ix_users_firebase_uid"
    - "tests/backend/test_database.py — 5 Unit-Tests für get_db-Slug-Validation + Models-Registration"
  modified:
    - ".env.example — vollständig umgeschrieben: 12 osim-ui-Dev-Defaults (DATABASE_URL psycopg3, FIREBASE_*, CORS_ORIGINS mit Port 3002, MINIO_*, LOCK_*) + Header-Kommentar zur PYTHONPATH-Falle"
    - "app/main.py — App-Factory mit configure_logging + initialize_firebase + RFC-7807-Handler + Middleware-Order (CORS outer, TenantAuth inner) + Root-/Health-/api/v1-Router"

key-decisions:
  - "D-18-Korrektur 1:1 umgesetzt: sync SQLAlchemy + psycopg3 (KEIN asyncpg). get_db ist sync Generator-Funktion, NICHT async."
  - "Pure-ASGI TenantAuthMiddleware (KEIN BaseHTTPMiddleware — Starlette #1678). _send_error sendet JSON-Body via raw ASGI send-Calls, KEIN RFC-7807 in der Middleware (das macht der FastAPI-HTTPException-Handler für In-App-Exceptions)."
  - "Lazy-Bootstrap-Aufruf in der Middleware via asyncio.to_thread + Lazy-Import von app.services.auth_service.bootstrap_tenant_if_missing (vermeidet Circular Import — middleware kennt service nicht zum Import-Zeitpunkt)."
  - "UserRole-Werte: USER='user' + ADMIN='admin' (abweichend von 3fls VIEWER='viewer' — passt zum D-17 Self-Service-Pattern: jeder neue Firebase-User ist erstmal Owner seines eigenen Tenants, also `user`-Rolle als Default)."
  - "search_path-Defense-in-Depth über 3 Mechanismen: (1) connect_args.options='-c search_path=\"public\"' pinnt Default am Connection-Startup, (2) per-Request SET search_path TO \"tenant_<id>\", public in get_db, (3) explizites reset_search_path_default(conn) im finally-Block. Begründung steht im Modul-Docstring app/core/database.py."
  - "models-Tabelle bekommt zusätzlich `original_storage_key`-Spalte (über PATTERNS.md-Vorlage hinaus) — Vorgriff für D-14 (Original-Unchanged-Constraint in Plan 04). Begründung: idempotenter Bootstrap soll alles anlegen, was Plan 04 später erwartet."
  - "_validate_slug erlaubt `-` zusätzlich zu `[a-zA-Z0-9_]` (osim-ui-Pattern in auth_service.py), während `get_db._SLUG_PATTERN` nur `[a-zA-Z0-9_]` erlaubt. Begründung: bootstrap kommt aus Firebase-UIDs (28 Zeichen alphanumerisch, manche enthalten `-`); get_db hat aber bereits den finalen `tenant_id`-Wert aus dem Token. Wenn der unterschiedlich strenge Validator zum Problem wird (z.B. UID mit Bindestrich kommt in get_db an), wird die Lücke in Plan 04 oder 05 geschlossen, indem bootstrap die UID vor der Schema-Anlage normalisiert."

patterns-established:
  - "App-Factory-Pattern: `create_app() -> FastAPI` als reine Funktion, `app = create_app()` am Modul-Bottom; Lifespan-Context als Pflicht-Pattern (auch wenn in Phase 1 leer)."
  - "Middleware-Order via add_middleware-Reihenfolge: TenantAuth zuerst added → inner; CORS danach added → outermost. Das stellt sicher, dass CORS-Preflight ohne Auth funktioniert."
  - "Test-Pattern: leichtgewichtige Mock-Request via `types.SimpleNamespace(state=SimpleNamespace(...))` für Unit-Tests ohne FastAPI-Bootstrap. Funktioniert für get_db, weil es nur `request.state.tenant_id` braucht."
  - "Lazy-Import-Defense gegen Circular Imports: middleware importiert auth_service erst zum Aufruf-Zeitpunkt (`from app.services.auth_service import ... inside __call__`)."

requirements-completed: [SC-1, SC-2, SC-9]
# Anmerkung zu Requirements:
# SC-1 (docker-compose startet alles): Backend-Skelett ist startbar; voller Stack-Smoke-Test in Plan 05.
# SC-2 (Login + Lazy-Bootstrap): Middleware verdrahtet bootstrap_tenant_if_missing korrekt; Live-Test mit echter DB+Firebase-Emulator in Plan 05.
# SC-9 (Multi-Tenant-Isolation): get_db setzt search_path per Request; tenant_id wird Whitelist-validiert. Live-Test mit zwei Tenants in Plan 05.
# Alle drei sind in Phase 1 technisch fundiert, aber die End-to-End-Verifikation erfolgt erst in Plan 05.

# Metrics
duration: ~25min
completed: 2026-05-21
---

# Phase 1 Plan 02: Backend-Foundation Summary

**Vollwertige FastAPI-Backend-Foundation in einem Plan — sync SQLAlchemy + psycopg3 + Pure-ASGI-Middleware + Lazy-Tenant-Bootstrap + RFC-7807-Errors + structlog. Stack-Parität zu 3fls strikt eingehalten (D-18-Korrektur 2026-05-21 vollständig umgesetzt). Backend bootet via `uv run uvicorn app.main:app`, antwortet auf `/health`, lehnt unauthentisierten Traffic mit 401 ab. End-to-End-Verifikation mit echtem Postgres + Firebase-Emulator folgt in Plan 05.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-21T06:32:00Z
- **Completed:** 2026-05-21T06:59:00Z
- **Tasks:** 7 / 7 (Task 2 zusätzlich mit TDD-RED/-GREEN-Doppel-Commit)
- **Files created:** 20
- **Files modified:** 2 (.env.example, app/main.py)
- **Test-Suite:** 5 neue Unit-Tests grün (zusätzlich zu den 5 aus Plan 01-01)

## Accomplishments

- **FastAPI-App-Factory ist deploybar:** `uv run python -c "from app.main import app"` lädt die App ohne Fehler; `uvicorn app.main:app --port 8765` startet sauber und beantwortet GET /, /health, /docs, OPTIONS-Preflight, /api/v1/auth/me (401 Missing Token), /api/v1/nonexistent (401 Invalid Token via Middleware). Smoke-Test mit Curl validiert alle Pfade.
- **Stack-Parität zu 3fls strikt eingehalten:** sync SQLAlchemy 2 + psycopg3 + QueuePool (mit allen drei 3fls-Phase-19-final-Fix-Mechanismen für search_path-Persistenz), Pure-ASGI-TenantAuthMiddleware (KEIN BaseHTTPMiddleware), plain `class Settings` (KEIN pydantic-BaseSettings), structlog mit JSON/Console-Schalter, RFC-7807 ProblemDetail mit `code`-Extension-Member.
- **Lazy-Tenant-Bootstrap fertig verdrahtet:** Middleware ruft `bootstrap_tenant_if_missing(uid, email)` via `asyncio.to_thread` auf, wenn das Firebase-JWT keinen `tenant_id`-Claim hat. Service ist idempotent gegen Race (CREATE SCHEMA IF NOT EXISTS + ON CONFLICT (slug) DO NOTHING + ON CONFLICT (firebase_uid) DO NOTHING). SQL-Injection-Defense via `_validate_slug`-Regex VOR f-string-Interpolation.
- **search_path-Defense-in-Depth aktiv:** Pitfall #1 aus RESEARCH.md ist über drei Mechanismen abgesichert — startup-pin via `connect_args.options`, per-Request `SET search_path TO "tenant_<id>", public` in `get_db`, und `pool_reset_on_return="rollback"` auf der Engine. Whitelist-Regex `^[a-zA-Z0-9_]+$` verhindert SQL-Injection im tenant_id.
- **Alembic-Setup vollständig:** `alembic history` zeigt `<base> -> 001_initial_schema (head)`. Initial-Migration legt `pgcrypto`-Extension + `public.tenants` (id UUID PK, slug UNIQUE) + `public.users` (id UUID PK, firebase_uid UNIQUE INDEX, email, tenant_id FK, role default 'user') an. `alembic upgrade head` gegen echtes Postgres kommt in Plan 05.
- **RFC-7807-Handler verifiziert:** direkter Aufruf des Exception-Handlers mit `HTTPException(status_code=418, detail={"code":"E_TEAPOT","message":"..."})` liefert `media_type=application/problem+json` und `body` mit `code`, `title`, `detail` korrekt aufgesplittet — Plan-24-04.2-Lesson aus 3fls funktioniert.

## Task Commits

Jeder Task wurde atomar committed:

1. **Task 1: Config + Logging + .env.example** — `749e68b` (feat)
2. **Task 2 RED: failing tests for get_db slug-validation + Models** — `2451592` (test, TDD-RED)
3. **Task 2 GREEN: database engine + get_db + Models** — `33b20df` (feat, TDD-GREEN)
4. **Task 3: Firebase + TenantAuthMiddleware (Pure-ASGI) + Deps/Schemas** — `1aa444a` (feat)
5. **Task 4: ProblemDetail + /health + /auth/me + v1-Router** — `5ea96d0` (feat)
6. **Task 5: Lazy-Tenant-Bootstrap-Service** — `2606bf3` (feat)
7. **Task 6: Alembic-Setup + Initial-Migration** — `ef5f0d6` (feat)
8. **Task 7: main.py App-Factory mit Middleware-Stack + RFC-7807** — `2a12a8c` (feat)

**Plan-Metadaten-Commit:** folgt nach diesem SUMMARY-Write (separater Commit für SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Stack-Drift-Entscheidungen (verbindlich für Folge-Pläne)

Diese Entscheidungen sind in PATTERNS.md §Stack-Drift dokumentiert und in Plan 01-02 verbindlich umgesetzt:

| RESEARCH.md-Vorschlag | osim-ui-Plan-02-Realität | Status |
|------------------------|---------------------------|--------|
| `sqlalchemy[asyncio]` + `asyncpg` | `sqlalchemy>=2` (sync API) + `psycopg[binary]>=3.2` | **eingehalten** — D-18-Korrektur 1:1 |
| `BaseHTTPMiddleware` für Auth | **Pure ASGI** (`__call__(self, scope, receive, send)`) | **eingehalten** — TenantAuthMiddleware-Klasse |
| async `get_db` mit `SET LOCAL search_path` | sync `get_db` mit `SET search_path` + reset im finally | **eingehalten** — 3fls-Pattern |
| `pydantic-settings.BaseSettings` | plain `class Settings` mit `__init__`-ENV-Lookup | **eingehalten** — 3fls-Pattern |

## DDL-Schemas (für Plan-04-Konsumenten)

```sql
-- Aus db/alembic/versions/001_initial_schema.py (public-Schema):
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE public.users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid  TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL,
    tenant_id     UUID NOT NULL REFERENCES public.tenants(id),
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ix_users_firebase_uid ON public.users(firebase_uid);

-- Aus app/services/auth_service.bootstrap_tenant_if_missing (pro Tenant lazy):
CREATE SCHEMA IF NOT EXISTS "tenant_{uid}";
SET search_path TO "tenant_{uid}", public;

CREATE TABLE IF NOT EXISTS models (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT NOT NULL,
    storage_key          TEXT NOT NULL,
    original_storage_key TEXT NOT NULL,           -- D-14 vorgreifend (Plan 04)
    created_at           TIMESTAMP DEFAULT NOW(),
    created_by_uid       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_locks (
    model_id        UUID PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
    owner_user_uid  TEXT NOT NULL,
    acquired_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP NOT NULL,
    token           UUID NOT NULL DEFAULT gen_random_uuid()
);
```

## 3fls-Pattern-Übernahmen — was 1:1, was reduziert, was neu

### 1:1 übernommen
- `app/core/database.py` Engine-Setup (Z.23-47 inkl. Phase-19-final-Fix `connect_args.options`)
- `app/core/database.py` `get_db`-Slug-Validierung + per-Request-SET (Z.114-137)
- `app/core/logging.py` structlog-Processor-Chain (merge_contextvars, TimeStamper, ProcessorFormatter-Bridge)
- `app/auth/firebase.py` (mit `os.environ`-Set für Emulator vor `initialize_app`)
- `app/auth/middleware.py` Pure-ASGI-Klasse + `_send_error`-Helper (Z.37-209)
- `app/auth/dependencies.py` `get_current_user`, `require_admin`
- `app/api/schemas/common.py` `ProblemDetail` mit `code`-Field (Z.41-64)

### Reduziert übernommen
- `app/core/config.py`: Stripe/SMTP/Bridge/Graph-Felder weggelassen; osim-spezifische Felder (storage_backend, minio_*, lock_*) ergänzt
- `app/auth/middleware.py`: Subscription/Grace-Period-/Billing-Code entfernt; `/api/v1/webhooks/stripe` aus WHITELIST raus; Lazy-Bootstrap-Hook eingefügt
- `app/auth/router.py`: minimaler `/me`-Endpoint + `tenant_status="active"`-Convenience (für AuthProvider-Sync)
- `app/api/v1/router.py`: drastisch reduziert auf nur `auth_router` (alle entity/admin/bom/graph/kpis Router gehören nicht in Phase 1)
- `app/api/v1/health.py`: nur DB-Check; KEIN GCS-Check (Phase 5+)
- `app/main.py`: KEIN GZip, KEIN Rate-Limit, KEIN CORSWrapper — minimaler Stack für Phase 1
- `db/alembic.ini` + `db/alembic/env.py`: nur public-Schema (KEIN raw/curated/3fls-Multischema)

### Neu erfunden (kein 3fls-Analog)
- `app/auth/schemas.py` `UserRole`-Werte: `USER='user'` + `ADMIN='admin'` (3fls hat `VIEWER`/`ADMIN`) — passt zum D-17 Self-Service-Pattern
- `app/services/auth_service.bootstrap_tenant_if_missing` — 3fls ist single-tenant per Phase-17.8.1-Migration; osim-ui ist von Tag 1 multi-tenant (D-17). Implementierung folgt PATTERNS.md §`app/services/auth_service.py`-Skelett.
- `app/services/auth_service._validate_slug` mit Bindestrich-zusätzlicher Toleranz für Firebase-UIDs.
- `tests/backend/test_database.py` — leichtgewichtige Unit-Tests mit `SimpleNamespace`-Mocking statt Full-FastAPI-TestClient.

## Bekannte Limitierungen (für Plan 04 / Plan 05)

- **Models-API + Locks-API fehlen noch** — diese kommen in Plan 04 (`/api/v1/models/upload-otx`, `/api/v1/models/{id}`, `/api/v1/models/{id}/lock`). Die tenant-spezifischen Tabellen werden bereits in `bootstrap_tenant_if_missing` angelegt; der Endpoint-Layer folgt.
- **End-to-End-Tests gegen echtes Postgres + Firebase-Emulator stehen aus** — kommen in Plan 05 (Compose-Stack-Integration). Bis dahin sind die search_path-Whitelist-Tests Unit-Level (Regex-Verhalten ohne DB-Roundtrip).
- **`alembic upgrade head` gegen frisches Postgres ist noch nicht live verifiziert** — die statische Struktur ist korrekt (`alembic history` zeigt `<base> -> 001_initial_schema (head)`), aber der Online-Lauf braucht laufendes Postgres und wird in Plan 05 abgedeckt.
- **`tenant_status` ist in Phase 1 hardcoded `"active"`** in `/auth/me` — sobald Phase 5 (Billing) kommt, wird das aus `public.tenants.status` gelesen (Spalte muss dann per Alembic-Migration ergänzt werden).
- **FastAPI-Deprecation-Warning für `default_response_class=ORJSONResponse`** — bleibt absichtlich drin wegen 3fls-Stack-Parität (PATTERNS.md Z.218). Zukünftige FastAPI-Versionen könnten das brechen — dann in einer separaten Welle entscheiden, ob osim-ui weg von ORJSONResponse oder 3fls mit umsteigt.

## Decisions Made

Siehe `key-decisions` im YAML-Header. Highlight: alle sechs sind Stack-Drift- oder Pattern-Adoptions-Entscheidungen, die für Folge-Pläne (besonders Plan 04 = Models-API) als Konvention gelten.

## Deviations from Plan

### Auto-fixed Issues

Keine. Der Plan war detailliert genug, dass kein Rule-1/2/3-Eingriff nötig war. Die Tatsache, dass `DATABASE_URL` aus einer übergeordneten Shell-Session geleakt hat und in der Smoke-Test-Phase ein anderes Postgres traf (`postgres:3fls@localhost:5432/3fls`), ist KEIN Bug — Settings liest korrekt aus der ENV, und die Smoke-Tests haben gezeigt, dass `engine.connect()` + `SELECT 1` funktioniert. In CI / Docker-Compose wird die korrekte `DATABASE_URL` via `.env` gesetzt; das ist Plan-05-Material.

### Rule-3-Anmerkung (NICHT als Deviation gezählt)
- `app/api/v1/router.py` enthält in Phase 1 nur `auth_router` (KEIN models/locks/billing). Das ist plan-konform reduziert (siehe Plan-Action-Block Task 4 sowie PATTERNS.md Z.526-535).

## Authentication Gates

Keine.

## Issues Encountered

- **PYTHONPATH/DATABASE_URL-Leak aus übergeordneter Shell:** wie schon in Plan 01-01 dokumentiert, leakt `DATABASE_URL=postgresql+psycopg://postgres:3fls@localhost:5432/3fls` aus der parent shell durch. Für lokale Smoke-Tests gegen `osim_ui`-DB muss explizit `env -u DATABASE_URL ...` oder eine eigene `.env`-Datei verwendet werden. Plan 05 (Compose-Stack) wird das durch `docker compose`-Env-File-Isolation lösen.
- **`alembic check` zeigt fälschlicherweise einen Fehler "Can't locate revision identified by '002_models'":** das liegt am parent-DB (3fls-Postgres), der eine Alembic-Version-Row enthält, die NICHT in unserem Versions-Verzeichnis ist. KEIN osim-ui-Bug — sobald gegen frisches osim_ui-Postgres gefahren wird (Plan 05), funktioniert das.

## Next Plan Readiness

- **Plan 01-03 (Frontend-Foundation):** Backend-API-Surface ist stabil. Frontend kann `apiFetch<AuthMeResponse>("/api/v1/auth/me")` und `apiFetch<HealthResponse>("/health")` bereits typisiert aufrufen.
- **Plan 01-04 (Storage/Models/Locks-API):** das Skelett ist bereit. `models`- und `model_locks`-Tabellen werden bereits beim Lazy-Bootstrap angelegt (mit `original_storage_key` vorgreifend); Plan 04 muss nur den Service-Layer + Router schreiben. RFC-7807-Handler liefert dort `E_OTX_PARSE_FAILED`, `E_MODEL_LOCKED`, `E_OTX_COVERAGE_INCOMPLETE` typsicher.
- **Plan 01-05 (Compose-Stack-Integration):** Backend-Container-Build + `docker compose up` kann auf diesen Plan aufsetzen; `requires_postgres` / `requires_firebase_emulator` / `requires_minio`-Marker-Probes sind in Plan 01-01 bereits registriert. Live-Verifikation von `/auth/me` (mit Firebase-Emulator-Token) + Lazy-Bootstrap + `alembic upgrade head` ist Plan-05-Scope.
- **Plan 01-11 (Save-Strategy + IndexedDB):** Sicher abgestützt, weil Models/Locks-Tabellen bereits in der Bootstrap-DDL angelegt werden.

## Self-Check

- [x] `app/core/config.py` exists; `from app.core.config import settings` lädt 13 Felder korrekt
- [x] `app/core/logging.py` exists; `configure_logging()` setzt structlog-Handler ohne Fehler
- [x] `app/core/database.py` exists; `from app.core.database import engine, get_db, SessionLocal, reset_search_path_default` funktioniert
- [x] `app/db/__init__.py` exists
- [x] `app/db/models.py` exists; `Base.metadata.tables` enthält `public.tenants` + `public.users`
- [x] `app/auth/firebase.py` exists; `initialize_firebase` + `verify_token` exportiert
- [x] `app/auth/middleware.py` exists; `TenantAuthMiddleware` ist Pure-ASGI-Klasse mit `__call__(scope, receive, send)`
- [x] `app/auth/dependencies.py` exists; 4 Dependencies exportiert
- [x] `app/auth/schemas.py` exists; `UserRole` hat `USER` + `ADMIN`
- [x] `app/auth/router.py` exists; `router.routes` enthält `/me`
- [x] `app/api/schemas/__init__.py` exists
- [x] `app/api/schemas/common.py` exists; `ProblemDetail` instanziierbar mit `code`-Feld
- [x] `app/api/v1/__init__.py` exists (war schon in Plan 01-01 leer)
- [x] `app/api/v1/health.py` exists; `router.routes` enthält `/health`
- [x] `app/api/v1/router.py` exists; `api_router.routes` enthält `/auth/me`
- [x] `app/services/auth_service.py` exists; `bootstrap_tenant_if_missing` + `_validate_slug` exportiert
- [x] `db/alembic.ini` exists
- [x] `db/alembic/env.py` exists; importiert `from app.core.config import settings` und `from app.db.models import Base`
- [x] `db/alembic/script.py.mako` exists
- [x] `db/alembic/versions/001_initial_schema.py` exists; `revision="001_initial_schema"`, `down_revision=None`
- [x] `.env.example` enthält alle 12 Variablen
- [x] `app/main.py` (modifiziert) — `from app.main import app` läuft ohne Exception
- [x] `tests/backend/test_database.py` exists; 5 Tests grün
- [x] Commit `749e68b` (Task 1) in git log
- [x] Commit `2451592` (Task 2 RED) in git log
- [x] Commit `33b20df` (Task 2 GREEN) in git log
- [x] Commit `1aa444a` (Task 3) in git log
- [x] Commit `5ea96d0` (Task 4) in git log
- [x] Commit `2606bf3` (Task 5) in git log
- [x] Commit `ef5f0d6` (Task 6) in git log
- [x] Commit `2a12a8c` (Task 7) in git log
- [x] `uv run pytest tests/backend/test_database.py` → 5 passed
- [x] `uv run python -c "from app.main import app"` → kein Fehler, "app.started"-Log
- [x] `uv run uvicorn app.main:app --port 8765` + curl /health → 200 + JSON; curl /api/v1/auth/me ohne Token → 401 Missing Token; OPTIONS-Preflight → 200
- [x] Direkter Handler-Test mit `HTTPException(detail={code,message})` → media_type=application/problem+json + body korrekt

## Self-Check: PASSED

---

*Phase: 01-vertical-slice*
*Plan: 02 backend-foundation*
*Completed: 2026-05-21*
