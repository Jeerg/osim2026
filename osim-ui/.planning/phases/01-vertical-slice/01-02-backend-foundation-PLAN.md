---
phase: 01-vertical-slice
plan: 02
type: execute
wave: 1
depends_on:
  - 01-01-engine-roundtrip-verify
files_modified:
  - app/main.py
  - app/core/__init__.py
  - app/core/config.py
  - app/core/database.py
  - app/core/logging.py
  - app/auth/__init__.py
  - app/auth/firebase.py
  - app/auth/middleware.py
  - app/auth/dependencies.py
  - app/auth/schemas.py
  - app/auth/router.py
  - app/api/__init__.py
  - app/api/v1/__init__.py
  - app/api/v1/router.py
  - app/api/v1/health.py
  - app/api/schemas/__init__.py
  - app/api/schemas/common.py
  - app/services/__init__.py
  - app/services/auth_service.py
  - app/db/__init__.py
  - app/db/models.py
  - db/alembic.ini
  - db/alembic/env.py
  - db/alembic/script.py.mako
  - db/alembic/versions/001_initial_schema.py
  - .env.example
autonomous: true
requirements:
  - SC-1
  - SC-2
  - SC-9
priority: critical

must_haves:
  truths:
    - "uvicorn startet die FastAPI-App ohne Fehler; /health antwortet ohne Auth mit 200 und JSON {status:ok,db:connected,version:0.1.0}."
    - "Jede Request außer Whitelist-Paths benötigt einen Bearer-Token; ohne Token → 401 mit RFC-7807-Body."
    - "Beim ersten /api/v1/auth/me eines neuen Firebase-Users wird automatisch ein Postgres-Schema tenant_{uid} angelegt und die public.users-Row idempotent eingefügt."
    - "DB-Sessions in API-Endpoints haben pro Request ein gesetztes search_path TO tenant_{uid}, public; kein Leak in den Connection-Pool."
    - "alembic upgrade head läuft erfolgreich gegen ein frisches Postgres und legt public.tenants + public.users an."
  artifacts:
    - path: "app/main.py"
      provides: "FastAPI-App-Factory mit lifespan, RFC-7807-Handler, TenantAuthMiddleware, API-Router"
      contains: "def create_app"
    - path: "app/auth/middleware.py"
      provides: "TenantAuthMiddleware als Pure-ASGI-Klasse mit Lazy-Bootstrap-Hook"
      contains: "class TenantAuthMiddleware"
    - path: "app/core/database.py"
      provides: "sync SQLAlchemy-Engine + get_db-Dependency mit per-request SET search_path"
      contains: "def get_db"
    - path: "app/services/auth_service.py"
      provides: "bootstrap_tenant_if_missing(uid, email) → tenant_id (idempotent gegen Race)"
      contains: "def bootstrap_tenant_if_missing"
    - path: "db/alembic/versions/001_initial_schema.py"
      provides: "Initial-Migration für public.tenants + public.users"
      contains: "def upgrade"
    - path: ".env.example"
      provides: "Template aller Environment-Variablen mit Default-Werten für Dev"
      contains: "DATABASE_URL="
  key_links:
    - from: "app/main.py"
      to: "app/auth/middleware.py"
      via: "app.add_middleware(TenantAuthMiddleware)"
      pattern: "add_middleware\\(TenantAuthMiddleware"
    - from: "app/auth/middleware.py"
      to: "app/services/auth_service.bootstrap_tenant_if_missing"
      via: "Aufruf bei fehlendem tenant_id-Claim"
      pattern: "bootstrap_tenant_if_missing"
    - from: "app/auth/router.py"
      to: "app/core/database.get_db"
      via: "Depends(get_db) im /auth/me-Endpoint"
      pattern: "Depends\\(get_db\\)"
    - from: "db/alembic/env.py"
      to: "app/core/config.settings.database_url"
      via: "alembic liest DATABASE_URL aus Settings, nicht aus alembic.ini"
      pattern: "from app.core.config import settings"
---

<objective>
Volle FastAPI-Backend-Foundation in einem Plan, weil die Files extrem kohärent sind (Config liest .env, DB liest Config, Middleware nutzt Firebase + Database, Router hängt an Middleware). Ziel: ein deployable Backend-Skelett mit Auth-gesicherten /api/v1/-Endpoints, automatischem Lazy-Bootstrap für neue Tenants, sicherem search_path-Setup (Pitfall #1), strukturiertem Logging und RFC-7807-Errors. Stack-Entscheidungen folgen 3fls (sync SQLAlchemy + psycopg3 + Pure-ASGI-Middleware, NICHT async + asyncpg + BaseHTTPMiddleware) — Begründung in CONTEXT D-18 (korrigiert 2026-05-21) und PATTERNS.md §Stack-Drift.

Purpose: SC-1 (docker-compose startet alles), SC-2 (Login + Lazy-Bootstrap), SC-9 (Multi-Tenant-Isolation) sind nach diesem Plan technisch fundiert; die produktiven Models-/Locks-Endpoints in Plan 04 hängen sich an dieses Skelett.

Output: Das Backend startet via `uv run uvicorn app.main:app --reload` mit verbundenem Postgres und antwortet auf `/health` und (mit Firebase-Token) auf `/api/v1/auth/me`. `alembic upgrade head` legt das initiale Public-Schema an.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/01-vertical-slice/01-CONTEXT.md
@.planning/phases/01-vertical-slice/01-RESEARCH.md
@.planning/phases/01-vertical-slice/01-PATTERNS.md
@.planning/research/copy-paste-guide.md
@.planning/research/3fls-patterns.md
@CLAUDE.md
@app/main.py
@pyproject.toml
@.env.example
</context>

<interfaces>
<!-- 3fls-Vorlage-Files (READ-ONLY). Executor liest diese 1:1 und passt sie für osim-ui an. -->

Backend-Vorlagen aus tbx_stzrim, die in dieser Welle übernommen werden (vollständige Pfade — als read_first in jeder Task):
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\main.py (App-Factory + Lifespan + RFC-7807-Handler — Z.120-241)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\core\config.py (Settings-Klasse mit __init__-Pattern — Z.1-34)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\core\database.py (sync Engine + get_db mit search_path — Z.1-137)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\core\logging.py (structlog-Config)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\middleware.py (TenantAuthMiddleware Pure-ASGI — Z.1-209)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\firebase.py (Firebase-Init + verify_token — Z.1-56)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\dependencies.py (get_current_user, require_admin — Z.1-40)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\schemas.py (CurrentUser, UserRole)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\router.py (/auth/me-Endpoint — Z.12-25)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\api\v1\router.py (Router-Aggregator — Z.13-80, drastisch reduzieren)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\api\v1\health.py (Health-Endpoint — Z.34-65, vereinfacht)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\api\schemas\common.py (ProblemDetail mit code-Field — Z.41-64)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\db\alembic.ini, db\alembic\env.py (Alembic-Setup)
- C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\.env.example
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Config + Logging + .env.example + Settings-Singleton</name>
  <files>app/core/__init__.py, app/core/config.py, app/core/logging.py, .env.example</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\core\config.py (Z.1-34 sind die Pattern-Vorlage; Z.39-86 gezielt WEGLASSEN — Stripe/SMTP/Bridge/Graph-Felder gehören nicht in osim-ui)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\core\logging.py (structlog-Default-Config)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\.env.example (lesen und osim-spezifisch reduzieren)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/core/config.py` — Liste der osim-spezifischen Felder)
    - .env.example (aktueller Zustand im osim-ui-Repo)
  </read_first>
  <action>
    Erstelle `app/core/__init__.py` (leer).

    Erstelle `app/core/config.py` als plain `class Settings`-Pattern (3fls-Stil, KEIN pydantic-BaseSettings — Stack-Parität mit 3fls Z.1-34). Settings hat einen `__init__(self)` der ENV-Variablen einliest. Felder:
    - `database_url: str` aus `DATABASE_URL` mit Default `postgresql+psycopg://osim_dev:osim_dev_password@localhost:5432/osim_ui`; bei Präfix `postgresql://` automatisch auf `postgresql+psycopg://` umschreiben (3fls Z.13-17 Pattern).
    - `firebase_project_id: str` aus `FIREBASE_PROJECT_ID`, Default `osim-dev`.
    - `firebase_auth_emulator_host: str | None` aus `FIREBASE_AUTH_EMULATOR_HOST` (None = Produktion).
    - `environment: str` aus `ENVIRONMENT`, Default `dev`.
    - `cors_origins: list[str]` aus `CORS_ORIGINS` (Komma-getrennt, gestripped), Default `["http://localhost:3000"]`.
    - osim-spezifisch (siehe PATTERNS.md Sektion `app/core/config.py`): `storage_backend`, `minio_endpoint`, `minio_access_key`, `minio_secret_key`, `minio_bucket` mit Defaults `minio` / `localhost:9000` / `osim_dev` / `osim_dev_password` / `osim-ui-dev`.
    - osim-spezifisch: `lock_ttl_seconds: int = 60` (initial-TTL), `lock_max_inactivity_seconds: int = 900` (D-13: 15 min).
    - Modul-Bottom: `settings = Settings()` als Singleton-Export.
    - Datei-Top: `import os` + `from dotenv import load_dotenv` + `load_dotenv()` (3fls-Konvention).
    - NICHT pydantic-settings verwenden (3fls Stil ist plain class — Stack-Parität). KEIN AsyncSettings.

    Erstelle `app/core/logging.py` mit `configure_logging() -> None` die structlog konfiguriert (JSON-Output in Prod, ConsoleRenderer in Dev — Schalter über `settings.environment == "dev"`). Anlehnung an 3fls-Logging-Pattern: Processors `add_log_level`, `format_exc_info`, `TimeStamper(fmt="iso")`, `JSONRenderer` (Prod) bzw. `ConsoleRenderer(colors=True)` (Dev). `contextvars.merge_contextvars` als erstes Processor.

    Überschreibe `.env.example` (aktuelle Zustand ist Phase-0-Skeleton, jetzt vollwertig):
    - `DATABASE_URL=postgresql+psycopg://osim_dev:osim_dev_password@localhost:5432/osim_ui`
    - `FIREBASE_PROJECT_ID=osim-dev`
    - `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`
    - `ENVIRONMENT=dev`
    - `CORS_ORIGINS=http://localhost:3000,http://localhost:3002`
    - `STORAGE_BACKEND=minio`
    - `MINIO_ENDPOINT=localhost:9000`
    - `MINIO_ACCESS_KEY=osim_dev`
    - `MINIO_SECRET_KEY=osim_dev_password`
    - `MINIO_BUCKET=osim-ui-dev`
    - `LOCK_TTL_SECONDS=60`
    - `LOCK_MAX_INACTIVITY_SECONDS=900`
    - Kommentar-Header `# osim-ui Phase 1 — Dev-Defaults; Production-Werte in Secret-Manager (Phase 5)`.

    KEINE fenced code blocks in der Datei-Action. Direkt schreiben.
  </action>
  <verify>
    <automated>uv run python -c "from app.core.config import settings; print('db=', settings.database_url); print('storage=', settings.storage_backend); print('cors=', settings.cors_origins); print('lock_ttl=', settings.lock_ttl_seconds)" &amp;&amp; uv run python -c "from app.core.logging import configure_logging; configure_logging(); import structlog; structlog.get_logger().info('test', foo=1)"</automated>
  </verify>
  <done>
    app/core/config.py exportiert `settings`-Singleton mit allen 13 Feldern aus dem action-Block, korrekt aus ENV gelesen. DATABASE_URL wird auto-präfix-konvertiert. app/core/logging.py exportiert configure_logging(). .env.example listet alle 12 Variablen.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Database (sync engine + get_db mit search_path-Defense-in-Depth)</name>
  <files>app/core/database.py, app/db/__init__.py, app/db/models.py</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\core\database.py (Z.1-137 vollständig — Phase-19-Fix für search_path-Persistenz ist Pflicht-Übernahme)
    - app/core/config.py (aus Task 1)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/core/database.py` — KONFLIKT mit RESEARCH.md auf SET LOCAL ist dort dokumentiert, Pattern folgt 3fls)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #1 (search_path-Leak)
  </read_first>
  <behavior>
    - `from app.core.database import engine, get_db, SessionLocal` funktioniert.
    - `engine.connect_args` enthält `options='-c search_path="public"'` (startup-Default; 3fls Z.36-43 Phase-19-Fix).
    - `get_db(request)` setzt vor `yield conn` per `SET search_path TO tenant_<id>, public` und nach Yield `SET search_path TO public` zurück.
    - Whitelist-Regex `^[a-zA-Z0-9_]+$` schützt vor SQL-Injection im tenant_id (3fls Z.114-137 + RESEARCH §Common Pitfalls).
    - `app/db/models.py` definiert SQLAlchemy 2 declarative `Base` + 2 Modelle: `Tenant(id: UUID, slug: str, created_at: datetime)` und `User(id: UUID, firebase_uid: str unique, email: str, tenant_id: UUID FK, role: str default "user", created_at: datetime)`. Beide leben im `public`-Schema.
    - Pytest-Unit `test_get_db_rejects_invalid_tenant_slug` prüft dass invalides tenant_id (z.B. `"; DROP TABLE x; --`) ValueError wirft VOR DB-Zugriff.
  </behavior>
  <action>
    Erstelle `app/core/database.py` mit:
    - Engine via `create_engine(settings.database_url, poolclass=QueuePool, pool_size=20, max_overflow=10, pool_pre_ping=True, pool_reset_on_return="rollback", pool_timeout=10, connect_args={"options": '-c search_path="public"'})` (3fls Z.23-47 Phase-19-Fix wörtlich).
    - `SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)`.
    - Kompilierter Regex `_SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")` auf Modul-Ebene.
    - `def get_db(request: Request) -> Iterator[Connection]` (FastAPI-Dependency, NICHT async): liest `tenant_id` aus `request.state.tenant_id`, prüft gegen Slug-Regex, wirft ValueError wenn invalid. Mit `engine.connect()` öffnen, `conn.execute(text(f'SET search_path TO "tenant_{tenant_id}", public'))` setzen, yield conn, im finally `conn.execute(text("SET search_path TO public"))`. Pattern aus 3fls Z.114-137.
    - Helper `def reset_search_path_default(conn) -> None`: explizites SET search_path TO public — zur Klarheit als named function statt inline.

    Erstelle `app/db/__init__.py` (leer).

    Erstelle `app/db/models.py` mit:
    - `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column`
    - `class Base(DeclarativeBase): pass`
    - `class Tenant(Base): __tablename__ = "tenants"; __table_args__ = {"schema": "public"}; id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid.uuid4); slug: Mapped[str] = mapped_column(unique=True, nullable=False); created_at: Mapped[datetime] = mapped_column(server_default=func.now())`
    - `class User(Base): __tablename__ = "users"; __table_args__ = {"schema": "public"}; id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid.uuid4); firebase_uid: Mapped[str] = mapped_column(unique=True, nullable=False, index=True); email: Mapped[str] = mapped_column(nullable=False); tenant_id: Mapped[UUID] = mapped_column(ForeignKey("public.tenants.id"), nullable=False); role: Mapped[str] = mapped_column(default="user", nullable=False); created_at: Mapped[datetime] = mapped_column(server_default=func.now())`
    - Models für Modelle (`Model` ORM-Klasse) und Locks (`ModelLock`) NICHT hier — die kommen in Plan 04 (im tenant-spezifischen Schema, nicht in public).

    Erstelle `tests/backend/test_database.py` (kommt in den tests/backend-Ordner aus Plan 01):
    - `def test_get_db_rejects_invalid_tenant_slug()` baut ein Mock-Request mit `request.state.tenant_id = "'; DROP TABLE x; --"`, verifiziert dass `next(get_db(request))` ValueError wirft.
    - Marker `@pytest.mark.requires_postgres` für alle Tests die echtes Postgres brauchen — diesen Test KEIN Marker, weil reine Regex-Logik.

    KEINE async-Variante. KEIN async get_db (3fls-Parität).
  </action>
  <verify>
    <automated>uv run python -c "from app.core.database import engine, get_db, SessionLocal; from app.db.models import Base, Tenant, User; print('engine ok'); print('tables:', [t.name for t in Base.metadata.tables.values()])" &amp;&amp; uv run pytest tests/backend/test_database.py -x 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    app/core/database.py exportiert `engine`, `SessionLocal`, `get_db` mit search_path-Defense-in-Depth. app/db/models.py definiert Base + Tenant + User mit public-Schema. tests/backend/test_database.py::test_get_db_rejects_invalid_tenant_slug ist grün ohne Postgres.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Firebase + TenantAuthMiddleware + auth/dependencies + auth/schemas</name>
  <files>app/auth/__init__.py, app/auth/firebase.py, app/auth/middleware.py, app/auth/dependencies.py, app/auth/schemas.py</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\firebase.py (Z.1-56 — 1:1 übernehmen, nur project_id aus eigener config)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\middleware.py (Z.1-209 — Pure-ASGI-Pattern, KEIN BaseHTTPMiddleware; KEIN Subscription/Grace-Period weglassen für osim-ui)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\dependencies.py (Z.1-40 — 1:1)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\schemas.py (CurrentUser, UserRole — 1:1)
    - app/core/config.py (aus Task 1)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/auth/middleware.py` — osim-ui-Erweiterung: Lazy-Bootstrap-Aufruf)
  </read_first>
  <behavior>
    - `from app.auth.firebase import initialize_firebase, verify_token` funktioniert; `initialize_firebase()` ist idempotent.
    - `from app.auth.middleware import TenantAuthMiddleware` exportiert eine Pure-ASGI-Middleware-Klasse mit `__call__(self, scope, receive, send)` (NICHT BaseHTTPMiddleware).
    - Bei Request ohne `Authorization: Bearer ...` antwortet die Middleware mit 401 + JSON `{"detail": "Missing token"}`.
    - Bei expired Token → 401 + `{"detail": "Token expired"}`.
    - Bei invalidem Token → 401 + `{"detail": "Invalid token"}`.
    - Whitelist-Paths: `/`, `/health`, `/docs`, `/openapi.json`, `/redoc`, `/favicon.ico`. OPTIONS-Requests werden DURCHGELASSEN (CORS-Preflight).
    - Bei validem Token ohne `tenant_id`-Claim wird `bootstrap_tenant_if_missing(uid, email)` aufgerufen (per Lazy-Import aus app.services.auth_service — vermeidet Circular).
    - scope["state"] wird mit `tenant_id`, `user_role`, `user_email`, `user_uid` populiert.
    - structlog-contextvars werden mit `tenant_id`, `user_email`, `method`, `path` gebunden.
    - `CurrentUser(tenant_id, role, email, uid)` als pydantic-Modell oder dataclass; `UserRole` als StrEnum mit Werten `USER`, `ADMIN`.
    - `get_current_user(request) → CurrentUser` als FastAPI-Dependency liest aus request.state.
  </behavior>
  <action>
    Erstelle `app/auth/__init__.py` (leer).

    `app/auth/firebase.py`: 1:1 aus tbx_stzrim/app/auth/firebase.py. Einzige Änderung: `from app.core.config import settings` statt 3fls-Pfad; `initialize_firebase` liest `settings.firebase_project_id`; wenn `settings.firebase_auth_emulator_host` gesetzt → `os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.firebase_auth_emulator_host` VOR `firebase_admin.initialize_app(...)`.

    `app/auth/schemas.py`: 1:1 aus tbx_stzrim. UserRole als StrEnum (`USER = "user"`, `ADMIN = "admin"`). CurrentUser als pydantic.BaseModel mit Feldern `tenant_id: str`, `role: UserRole`, `email: str`, `uid: str`.

    `app/auth/dependencies.py`: 1:1 aus tbx_stzrim/app/auth/dependencies.py (Z.1-40). Funktionen `get_current_user(request)`, `require_admin(user)`, zusätzlich `get_tenant_id(request) -> str`, `get_user_uid(request) -> str`.

    `app/auth/middleware.py`: Pure-ASGI-Klasse (PATTERNS.md §`app/auth/middleware.py` Z.362-447 wörtlich folgen). WHITELIST = `frozenset({"/", "/health", "/docs", "/openapi.json", "/redoc", "/favicon.ico"})`. KEIN `/api/v1/webhooks/stripe` (kein Stripe). KEIN Subscription/Grace-Period-Code. Lazy-Bootstrap-Erweiterung gegenüber 3fls: nach `decoded = await asyncio.to_thread(verify_token, token)` prüfe `tenant_id = decoded.get("tenant_id")`; wenn None: `from app.services.auth_service import bootstrap_tenant_if_missing; tenant_id = await asyncio.to_thread(bootstrap_tenant_if_missing, decoded["uid"], decoded.get("email", ""))`. Begründung: bootstrap ist sync (sync SQLAlchemy nach D-18) und darf den Event-Loop nicht blockieren. Inline-Kommentar: `# Lazy-Bootstrap per D-17 (Self-Service): erstmaliger Login eines Firebase-Users → tenant_{uid}-Schema wird angelegt`.

    `_send_error(scope, receive, send, status_code, detail)` als statische Helper-Methode (PATTERNS.md Z.439-447) — JSON-Body via json.dumps, content-type application/json, kein RFC-7807 in der Middleware (das macht der FastAPI-HTTPException-Handler).

    KEIN BaseHTTPMiddleware — explizit Pure-ASGI wie 3fls (PATTERNS.md §Stack-Drift Spalte 3).
  </action>
  <verify>
    <automated>uv run python -c "from app.auth.firebase import initialize_firebase, verify_token; from app.auth.middleware import TenantAuthMiddleware; from app.auth.dependencies import get_current_user, get_tenant_id, get_user_uid; from app.auth.schemas import CurrentUser, UserRole; print('all imports ok'); print('UserRole values:', [r.value for r in UserRole])"</automated>
  </verify>
  <done>
    5 Auth-Files existieren. Alle Imports funktionieren. TenantAuthMiddleware ist Pure-ASGI. WHITELIST hat 6 Pfade. Lazy-Bootstrap-Hook ist verdrahtet (auch wenn auth_service noch nicht existiert — kommt in Task 5).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: API-Schemas + v1-Router-Aggregator + Health-Endpoint + Auth-Router</name>
  <files>app/api/__init__.py, app/api/schemas/__init__.py, app/api/schemas/common.py, app/api/v1/__init__.py, app/api/v1/router.py, app/api/v1/health.py, app/auth/router.py</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\api\schemas\common.py (Z.41-64 — ProblemDetail-Block 1:1; PaginationMeta optional)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\api\v1\router.py (Z.13-80 — drastisch reduzieren)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\api\v1\health.py (Z.34-65 — Storage-Check weglassen, nur DB)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\auth\router.py (Z.12-25 — Lazy-Bootstrap ist schon in Middleware, /auth/me bleibt minimal)
    - app/auth/dependencies.py (aus Task 3)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/api/v1/health.py`, `app/auth/router.py`, `app/api/v1/router.py`)
  </read_first>
  <behavior>
    - `ProblemDetail(type, title, status, detail, instance, code)` als pydantic.BaseModel mit `code: str | None` (Plan-24-04.2-Lesson aus 3fls — wichtig für Frontend-Error-Mapping).
    - `GET /health` antwortet ohne Auth mit `{"status": "ok" | "degraded", "db": "connected" | "disconnected", "version": "0.1.0"}`.
    - `GET /api/v1/auth/me` (mit Bearer-Token) antwortet mit `{"tenant_id": "<uid>", "role": "user|admin", "email": "...", "tenant_status": "active"}`.
    - `api_router` aggregiert auth + health (health bleibt aber außerhalb /api/v1 — nur in main.py).
  </behavior>
  <action>
    Erstelle `app/api/__init__.py`, `app/api/schemas/__init__.py`, `app/api/v1/__init__.py` (alle leer).

    `app/api/schemas/common.py`: aus tbx_stzrim 1:1 — ProblemDetail-Block (PATTERNS.md Z.41-64). PaginationMeta-Block ÜBERNEHMEN auch wenn in Phase 1 nicht genutzt (Konsistenz mit späteren Phasen). KEINE FreshnessMeta/EnvelopeResponse — nicht Phase-1-relevant.

    `app/api/v1/health.py`: Endpoint `GET /health` (PATTERNS.md Z.544-557 Pattern). Returns `{"status", "db", "version"}`. KEINE Storage-/Engine-Checks in Phase 1. `version` hardcoded `"0.1.0"` (aus pyproject.toml synchron halten — Kommentar an die Stelle).

    `app/auth/router.py`: `APIRouter(prefix="/auth", tags=["auth"])`. Endpoint `GET /me` (siehe PATTERNS.md Z.502-512): nimmt `user: CurrentUser = Depends(get_current_user)` an, returnt pydantic-Modell `AuthMeResponse(tenant_id: str, role: str, email: str, tenant_status: str = "active")`. AuthMeResponse als BaseModel im selben File (oder in app/api/schemas/auth.py — Executor entscheidet, aber NICHT in app/auth/schemas.py mischen).

    `app/api/v1/router.py`: `api_router = APIRouter()`; `api_router.include_router(auth_router)`. KEINE billing/admin/bom/graph/kpis-Router (PATTERNS.md Z.526-535). Models/Locks kommen in Plan 04.
  </action>
  <verify>
    <automated>uv run python -c "from app.api.schemas.common import ProblemDetail; p = ProblemDetail(type='about:blank', title='X', status=400, code='E_FOO'); print(p.model_dump_json())" &amp;&amp; uv run python -c "from app.api.v1.router import api_router; from app.api.v1.health import router as health_router; from app.auth.router import router as auth_router; print('routers ok')"</automated>
  </verify>
  <done>
    ProblemDetail hat code-Feld und ist instanziierbar. api_router enthält auth-Subrouter. /health-Endpoint existiert ohne Auth-Dep. /auth/me-Endpoint hängt an get_current_user.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Services-Layer mit Lazy-Tenant-Bootstrap-Service (idempotent gegen Race)</name>
  <files>app/services/__init__.py, app/services/auth_service.py</files>
  <read_first>
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/services/auth_service.py` — vollständiges Skelett)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #2 (Race) und §Code Examples Example 1
    - app/core/database.py (aus Task 2 — `engine` wird hier importiert)
    - .planning/phases/01-vertical-slice/01-CONTEXT.md D-17 (Lazy-Bootstrap, idempotent, Self-Service)
  </read_first>
  <behavior>
    - `bootstrap_tenant_if_missing(uid: str, email: str) -> str` ist idempotent: zwei parallele Aufrufe für gleichen uid liefern beide den gleichen `tenant_id` ohne IntegrityError zu werfen.
    - Funktion legt `CREATE SCHEMA IF NOT EXISTS "tenant_{uid}"` an, setzt search_path auf das neue Schema, legt `CREATE TABLE IF NOT EXISTS models (...)` und `CREATE TABLE IF NOT EXISTS model_locks (...)` an, und inseriert die User-Row in `public.users` mit `ON CONFLICT (firebase_uid) DO NOTHING`.
    - Funktion gibt `tenant_id = uid` zurück (Convention: tenant_id == firebase_uid per D-17 Self-Service).
    - Funktion ist SYNC (kein async — sync SQLAlchemy nach D-18). Wird in der Middleware via `asyncio.to_thread` aufgerufen.
    - Logging via structlog: `log.info("tenant.bootstrapped", tenant_id=..., uid=...)` nach Erfolg.
  </behavior>
  <action>
    Erstelle `app/services/__init__.py` (leer).

    `app/services/auth_service.py` — Implementierung nach PATTERNS.md §`app/services/auth_service.py` Skelett (Z.583-626):
    - `from app.core.database import engine`
    - `from sqlalchemy import text`
    - `import structlog`
    - Modul-Konstante `_log = structlog.get_logger(__name__)`
    - Funktion `bootstrap_tenant_if_missing(uid: str, email: str) -> str`:
      - `tenant_id = uid` (Convention)
      - `schema = f"tenant_{tenant_id}"`
      - Mit `engine.begin() as conn`:
        - `conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))` (Whitelist-Regex auf uid VORHER prüfen wie in get_db — sonst SQL-Injection-Vektor; baue gemeinsamen Helper `_validate_slug(s)` in app/core/database.py oder hier)
        - `conn.execute(text(f'SET search_path TO "{schema}", public'))`
        - `conn.execute(text('CREATE TABLE IF NOT EXISTS models (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, storage_key TEXT NOT NULL, original_storage_key TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), created_by_uid TEXT NOT NULL)'))` — Spalten match PATTERNS.md Z.601-606 + Plan 04-Erweiterung (`original_storage_key` zusätzlich für D-14 Original-Unchanged-Constraint).
        - `conn.execute(text('CREATE TABLE IF NOT EXISTS model_locks (model_id UUID PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE, owner_user_uid TEXT NOT NULL, acquired_at TIMESTAMP NOT NULL DEFAULT NOW(), expires_at TIMESTAMP NOT NULL, token UUID NOT NULL DEFAULT gen_random_uuid())'))` (PATTERNS.md Z.609-615 + Index in Plan 04 nachgereicht)
        - `conn.execute(text("INSERT INTO public.tenants(slug) VALUES(:s) ON CONFLICT (slug) DO NOTHING"), {"s": tenant_id})`
        - `conn.execute(text("INSERT INTO public.users(firebase_uid, email, tenant_id) VALUES(:u, :e, (SELECT id FROM public.tenants WHERE slug = :s)) ON CONFLICT (firebase_uid) DO NOTHING"), {"u": uid, "e": email, "s": tenant_id})`
      - `_log.info("tenant.bootstrapped", tenant_id=tenant_id, uid=uid)` (nach erfolgreichem commit)
      - return `tenant_id`

    Validierungs-Helper `_validate_slug(s: str) -> None`: regex-Check `^[a-zA-Z0-9_-]+$`; wirft `ValueError(f"Invalid tenant slug: {s!r}")` bei Mismatch. Wird VOR jeder f-string-Interpolation in raw SQL aufgerufen. Begründung: Firebase-UIDs sind 28 Zeichen, alphanumerisch + Bindestrich; Whitelist verhindert SQL-Injection (RESEARCH §Security Domain).

    KEIN Alembic-Programmatic-Upgrade in Phase 1 — explizites DDL reicht (PATTERNS.md Z.628-629 Lesson).
  </action>
  <verify>
    <automated>uv run python -c "from app.services.auth_service import bootstrap_tenant_if_missing, _validate_slug; _validate_slug('abc123_ok'); print('valid ok'); 
try:
    _validate_slug(chr(39) + '; DROP TABLE x; --')
    print('FAIL: should have raised')
except ValueError:
    print('rejected invalid ok')"</automated>
  </verify>
  <done>
    app/services/auth_service.py exportiert `bootstrap_tenant_if_missing`. SQL-Injection-Schutz via _validate_slug. Funktion ist sync, idempotent, mit ON CONFLICT. Logging via structlog. Test-Lauf mit echter DB kommt in Plan 05.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 6: Alembic-Setup + Initial-Migration für public.tenants + public.users</name>
  <files>db/alembic.ini, db/alembic/env.py, db/alembic/script.py.mako, db/alembic/versions/001_initial_schema.py</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\db\alembic.ini (1:1 außer sqlalchemy.url)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\db\alembic\env.py (Pattern: import settings, target_metadata aus eigenen Models)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\db\alembic\script.py.mako (1:1)
    - app/core/config.py (aus Task 1 — settings.database_url)
    - app/db/models.py (aus Task 2 — Base.metadata als target_metadata)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `db/alembic`)
  </read_first>
  <behavior>
    - `uv run alembic upgrade head` legt `public.tenants` (id UUID PK, slug TEXT UNIQUE, created_at) und `public.users` (id UUID PK, firebase_uid TEXT UNIQUE INDEX, email TEXT, tenant_id UUID FK -> public.tenants.id, role TEXT default 'user', created_at) an.
    - `uv run alembic revision --autogenerate -m "test"` erzeugt keine spurious Diffs (Base.metadata ↔ DB-Stand sind synchron nach upgrade head).
    - `db/alembic/env.py` liest DATABASE_URL aus `app.core.config.settings`, NICHT aus alembic.ini.
  </behavior>
  <action>
    Erstelle `db/alembic.ini` als Kopie aus tbx_stzrim/db/alembic.ini. Setze `script_location = db/alembic` und `sqlalchemy.url = ` (leer — wird in env.py aus settings überschrieben).

    Erstelle `db/alembic/env.py` (Standard-Alembic-Template angepasst):
    - Imports: `from alembic import context`, `from sqlalchemy import engine_from_config, pool`, `from app.core.config import settings`, `from app.db.models import Base`.
    - `config = context.config`; `config.set_main_option("sqlalchemy.url", settings.database_url)`.
    - `target_metadata = Base.metadata`.
    - `run_migrations_offline()` und `run_migrations_online()` als Standard-Alembic-Funktionen (autogenerate-fähig).
    - Im online-Pfad: `version_table_schema="public"` setzen (alembic_version Tabelle in public).

    Erstelle `db/alembic/script.py.mako` 1:1 aus tbx_stzrim.

    Erstelle `db/alembic/versions/001_initial_schema.py`:
    - `revision = "001_initial_schema"`, `down_revision = None`.
    - `def upgrade()`:
      - `op.create_table("tenants", Column("id", UUID, primary_key=True, server_default=func.gen_random_uuid()), Column("slug", String, nullable=False, unique=True), Column("created_at", DateTime, server_default=func.now()), schema="public")`
      - `op.create_table("users", ..., Column("tenant_id", UUID, ForeignKey("public.tenants.id"), nullable=False), ..., schema="public")`
      - `op.create_index("ix_users_firebase_uid", "users", ["firebase_uid"], unique=True, schema="public")`
      - WICHTIG: Aktiviere `pgcrypto`-Extension für gen_random_uuid (`op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")` als allerersten Befehl).
    - `def downgrade()`: drop_index + drop_table für users dann tenants.

    KEINE tenant_X-Schemas in dieser Migration — die werden lazy bei Bootstrap angelegt (D-17). Nur public-Schema.
  </action>
  <verify>
    <automated>uv run alembic --config db/alembic.ini check 2>&amp;1 | head -20 || true &amp;&amp; uv run python -c "import sys; sys.path.insert(0, '.'); from alembic.config import Config; from alembic.script import ScriptDirectory; c = Config('db/alembic.ini'); s = ScriptDirectory.from_config(c); print('revisions:', [r.revision for r in s.walk_revisions()])"</automated>
  </verify>
  <done>
    alembic.ini, env.py, script.py.mako, versions/001_initial_schema.py existieren. `alembic` CLI sieht genau eine Revision (001_initial_schema). `alembic check` läuft (kann ohne DB-Connection einen Fehler werfen — das ist OK, dafür gibt es Plan 05; wichtig ist die statische Struktur).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 7: main.py erweitern — App-Factory mit Middleware-Stack + RFC-7807-Handler + Router-Inclusion</name>
  <files>app/main.py</files>
  <read_first>
    - app/main.py (aktueller Stand: minimaler GZip+CORS-Stub)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\main.py (Z.120-241 — App-Factory, RFC-7807-Handler, Middleware-Order)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `app/main.py`)
    - app/auth/middleware.py (aus Task 3)
    - app/auth/firebase.py (aus Task 3)
    - app/api/v1/router.py + app/api/v1/health.py + app/api/schemas/common.py (aus Task 4)
    - app/core/logging.py (aus Task 1)
  </read_first>
  <behavior>
    - `uv run uvicorn app.main:app --reload` startet ohne Fehler (auch ohne laufende DB — DB-Connection ist lazy).
    - `curl http://localhost:8000/health` → 200 + JSON.
    - `curl http://localhost:8000/api/v1/auth/me` → 401 + JSON `{"detail": "Missing token"}` (von Middleware; KEIN RFC-7807 weil Middleware vor Handler antwortet).
    - `curl http://localhost:8000/api/v1/foo` → 404 + RFC-7807-Body `{"type":"about:blank","title":"Not Found","status":404,...}` mit content-type `application/problem+json`.
    - structlog ist beim Startup konfiguriert.
    - CORS lässt `http://localhost:3000` und `http://localhost:3002` (Vite-Dev-Port) durch.
  </behavior>
  <action>
    Überschreibe `app/main.py` nach PATTERNS.md §`app/main.py`-Pattern (Z.180-249):

    Top-Imports: structlog, asynccontextmanager, FastAPI, HTTPException, Request, CORSMiddleware, ORJSONResponse, sowie app-eigene Imports (ProblemDetail aus app.api.schemas.common, api_router aus app.api.v1.router, health-router aus app.api.v1.health, TenantAuthMiddleware aus app.auth.middleware, settings aus app.core.config, configure_logging aus app.core.logging, initialize_firebase aus app.auth.firebase).

    `@asynccontextmanager async def lifespan(app: FastAPI): yield` — leer in Phase 1, aber Pattern-Pflicht (3fls).

    `def create_app() -> FastAPI`:
    1. `configure_logging()`
    2. `initialize_firebase()`
    3. `app = FastAPI(title="osim-ui API", version="0.1.0", description="Web-UI Orchestrator für osim-engine", lifespan=lifespan, default_response_class=ORJSONResponse)`
    4. Exception-Handler für HTTPException (PATTERNS.md Z.221-241): parsed exc.detail entweder als str oder als dict mit code/message-Keys. Bei dict: `code = exc.detail.get("code")`, `detail_text = str(exc.detail.get("message") or exc.detail)`, `title = code or "Error"`. Antwortet mit `ProblemDetail` als `ORJSONResponse(status_code=exc.status_code, content=problem.model_dump(), media_type="application/problem+json")`.
    5. `app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])`
    6. `app.add_middleware(TenantAuthMiddleware)` — Reihenfolge: TenantAuth wird ZUERST gemounted (FastAPI add_middleware ist outer-most-last → CORS wraps TenantAuth wraps App; bei OPTIONS-Preflight muss CORS antworten OHNE Auth → entsprechend Middleware-Reihenfolge: CORS-Middleware muss outer sein. WICHTIG: TenantAuth durfte OPTIONS passieren lassen — siehe Task 3 _send_error-Logik).
    7. `app.include_router(health_router)` (ohne prefix, /health bleibt absolut)
    8. `app.include_router(api_router, prefix="/api/v1")`
    9. return app
    10. `app = create_app()` als Modul-Bottom

    KEIN GZipMiddleware (3fls hat das auskommentiert; PATTERNS.md Z.254). KEIN RateLimit-Middleware. KEIN CORSWrapper (Starlette-CORSMiddleware reicht für Phase 1; bei späteren CORS-Bugs siehe 3fls-CORSWrapper-Pattern).

    Ergänze beim Startup-Log eine Zeile `_logger.info("app.started", environment=settings.environment, cors_origins=settings.cors_origins)`.
  </action>
  <verify>
    <automated>uv run python -c "from app.main import app; print('routes:', [(r.path, r.methods if hasattr(r, 'methods') else '-') for r in app.routes][:8])" &amp;&amp; uv run uvicorn app.main:app --host 127.0.0.1 --port 8765 &amp; sleep 3 &amp;&amp; (curl -sS http://127.0.0.1:8765/health | head -c 200; echo; curl -sS http://127.0.0.1:8765/api/v1/auth/me -o - -w "\nstatus=%{http_code}\n"; curl -sS http://127.0.0.1:8765/api/v1/nonexistent -o - -w "\nstatus=%{http_code}\n" -H "Authorization: Bearer foo"); pkill -f "uvicorn.*8765" || true</automated>
  </verify>
  <done>
    `uvicorn app.main:app` startet. /health antwortet 200 ohne Auth. /api/v1/auth/me ohne Token = 401 + JSON. RFC-7807-Body bei HTTPException. CORS funktioniert. structlog gibt Startup-Log aus.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Frontend → Backend (HTTP) | Bearer-Token im Authorization-Header; unauthentisierter Traffic muss bei /api/v1/* abgelehnt werden |
| Firebase → Backend | Firebase-signiertes JWT; nur Admin-SDK-verifizierte Tokens werden akzeptiert |
| Backend → Postgres | tenant_id wird in raw SQL als String interpoliert (`SET search_path TO "tenant_X"`) — Whitelist-Regex ist Pflicht |
| Backend ↔ Connection-Pool | search_path könnte zwischen Requests leaken — Defense-in-Depth via startup-options + per-request-SET + pool_reset_on_return |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Spoofing | Auth-Middleware | mitigate | firebase_admin SDK verifiziert Token-Signature; kein eigenes JWT-Parsing |
| T-02-02 | Tampering | tenant_id in raw SQL (CREATE SCHEMA / SET search_path) | mitigate | `_validate_slug` mit Whitelist-Regex `^[a-zA-Z0-9_-]+$` vor jeder f-string-Interpolation; assertion-style ValueError bei Mismatch |
| T-02-03 | Information Disclosure | search_path-Leak zwischen Requests (Pitfall #1) | mitigate | Drei-Mechanismen-Defense: connect_args `options='-c search_path="public"'` (startup), per-request SET, pool_reset_on_return="rollback" |
| T-02-04 | Tampering | Lazy-Bootstrap-Race (Pitfall #2) | mitigate | CREATE SCHEMA IF NOT EXISTS + ON CONFLICT für users-Insert; Test in Plan 05 mit asyncio.gather (zwei parallele Bootstraps für gleichen uid) |
| T-02-05 | Repudiation | Lack of audit logging für Auth-Events | accept | structlog mit contextvars (tenant_id, user_email, method, path) gebunden; ausreichend für Phase 1, dedizierte Audit-Log-Tabelle in Phase 5 |
| T-02-06 | DoS | Unbegrenzte Request-Body-Größe | accept | Phase 1: kein Body-Limit (Upload-Limit kommt mit Plan 04 für /models/upload-otx); FastAPI-Default reicht für /auth/me |
| T-02-07 | Information Disclosure | Firebase-Emulator in Production (Pitfall #9) | mitigate | settings.firebase_auth_emulator_host ist Opt-In via ENV; Dockerfile/Compose nur in Dev gesetzt; Production-Deploy-Check ist Phase-5-Aufgabe |
| T-02-08 | Tampering | Custom-Claims-Forgery via gefälschtes JWT | mitigate | Firebase Admin SDK macht Signatur-Check; Custom-Claims sind Firebase-signed |
| T-02-09 | Elevation of Privilege | Endpoint-Caller umgeht get_current_user durch direktes request.state-Setzen | accept | Externe Clients können request.state nicht setzen (nur ASGI-Middleware in unserer Codebase); Whitelist-Paths haben keine Sensitive-Logik |
</threat_model>

<verification>
- `uv run uvicorn app.main:app` startet ohne Exception
- `curl /health` → 200 + JSON mit status/db/version
- `curl /api/v1/auth/me` ohne Auth → 401 mit JSON detail=Missing token (Middleware-Antwort)
- `curl /api/v1/foo` (unknown) → 404 mit RFC-7807 Body + application/problem+json content-type
- `uv run alembic --config db/alembic.ini upgrade head` läuft fehlerfrei gegen lokales Postgres (Test in Plan 05)
- structlog gibt strukturiertes JSON aus in Prod-Mode / Console-Format in Dev-Mode
- Importpfade aller 16 Files funktionieren ohne ImportError
</verification>

<success_criteria>
SC-1 (docker-compose-Stack startet alles): Backend-Container ist startbar; voller Stack-Smoke-Test in Plan 05.
SC-2 (Login + Lazy-Bootstrap): Middleware ruft bootstrap_tenant_if_missing bei fehlendem tenant_id-Claim auf; Bootstrap ist idempotent. Live-Test in Plan 05.
SC-9 (Multi-Tenant-Isolation): get_db setzt search_path per Request; tenant_id wird Whitelist-validiert. Live-Test mit zwei Tenants in Plan 05.
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-02-SUMMARY.md` with:
- Welche 3fls-Patterns 1:1 übernommen wurden, welche reduziert, welche neu erfunden (Lazy-Bootstrap)
- Liste der Backend-Files und ihrer Aufgabe
- DDL-Schemas (public.tenants, public.users) als SQL-Block für Plan-04-Konsumenten
- Hinweise auf Stack-Drift-Entscheidungen (sync vs async, Pure-ASGI vs BaseHTTPMiddleware)
- Bekannte Limitierungen, die Plan 04 schließen muss (Models-API, Locks-API)
</output>
</content>
</invoke>