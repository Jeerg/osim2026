---
phase: 01-vertical-slice
plan: 05
type: execute
wave: 2
depends_on:
  - 01-02-backend-foundation
  - 01-03-frontend-foundation
files_modified:
  - docker-compose.yml
  - infra/firebase/firebase.json
  - infra/firebase/.firebaserc
  - infra/firebase/seed-users.sh
  - scripts/wait-healthy.sh
  - scripts/seed-firebase-emulator.py
  - Dockerfile
  - portal/Dockerfile
  - tests/backend/conftest.py
  - tests/backend/test_auth_endpoints.py
  - tests/backend/test_search_path_isolation.py
  - tests/backend/test_lazy_bootstrap_race.py
  - tests/backend/test_models_endpoints.py
  - tests/backend/test_lock_endpoints.py
  - tests/backend/test_otx_upload_roundtrip.py
  - tests/backend/test_health_with_storage.py
  - README.md
autonomous: true
requirements:
  - SC-1
  - SC-2
  - SC-7
  - SC-8
  - SC-9
priority: critical

must_haves:
  truths:
    - "`docker compose up -d` startet postgres + firebase-emulator + minio + api + portal; alle healthy in <60s."
    - "Lazy-Bootstrap-Race-Test mit asyncio.gather (zwei parallele Calls für gleichen UID) liefert beide 200 zurück und legt das Tenant-Schema nur einmal an."
    - "search_path-Isolation-Test: User A in tenant_X kann KEINE Daten aus tenant_Y sehen, auch wenn beide auf denselben Connection-Pool sitzen."
    - "OTX-Upload-Roundtrip-Test gegen lebendige Postgres+Minio: Dummy.otx upload → list_models zeigt Modell → get_model liefert wire mit allen Objekten → save_wire schreibt v_<ts>.otx; Original-OTX bleibt byte-identisch."
    - "Lock-Acquire+Heartbeat+Release-Test gegen lebendige Postgres: Acquire → Heartbeat (3x) → Release; second User kann acquiren nach Release."
  artifacts:
    - path: "docker-compose.yml"
      provides: "Voller Dev-Stack mit api + portal + postgres + firebase-emulator + minio + healthchecks"
      contains: "depends_on"
    - path: "scripts/wait-healthy.sh"
      provides: "Bash-Skript: wartet bis alle docker-compose-Services healthy sind (60s timeout)"
      contains: "docker compose ps"
    - path: "scripts/seed-firebase-emulator.py"
      provides: "Python-Skript zum Seeden von 2 Test-Usern (admin@osim-dev / user@osim-dev) in den Firebase-Emulator"
      contains: "create_user"
    - path: "tests/backend/conftest.py"
      provides: "Erweiterte Fixtures: test_client (httpx-AsyncClient via Lifespan), admin_token + user_token (Firebase-Emulator-Tokens), reset_test_schemas pro Test"
      contains: "@pytest_asyncio.fixture"
    - path: "tests/backend/test_lazy_bootstrap_race.py"
      provides: "asyncio.gather-Test für Race-Condition (Pitfall #2)"
      contains: "asyncio.gather"
    - path: "tests/backend/test_search_path_isolation.py"
      provides: "Cross-Tenant-Isolation-Test (Pitfall #1)"
      contains: "search_path"
  key_links:
    - from: "docker-compose.yml api-Service"
      to: "postgres + firebase-emulator + minio"
      via: "depends_on mit condition=service_healthy"
      pattern: "service_healthy"
    - from: "tests/backend/conftest.py"
      to: "infra/firebase Auth-Emulator"
      via: "HTTP-Direkt-Aufruf gegen :9099 für Token-Erzeugung (signInWithPassword)"
      pattern: "localhost:9099"
    - from: "tests/backend/test_otx_upload_roundtrip.py"
      to: "tests/backend/fixtures/otx_models.DUMMY_OTX"
      via: "Upload via multipart-POST"
      pattern: "DUMMY_OTX"
---

<objective>
Plan 02 und Plan 04 haben Code geliefert; dieser Plan macht ihn IN ZUSAMMENHANG mit echten Services lauffähig: Postgres, Firebase-Emulator, Minio im docker-compose; integration-Tests die das gesamte Backend-Verhalten gegen lebende Services prüfen (Lazy-Bootstrap-Race, search_path-Isolation, OTX-Upload-Roundtrip, Lock-Conflict). Außerdem: Dockerfile-Polish (Multi-Stage), Frontend-Dockerfile, README-Sektion "Lokales Setup".

Purpose: Phase 1 SC-1 ("docker compose up startet alle Dev-Services") wird hier konkret gemacht. SC-2/SC-7/SC-8/SC-9 bekommen ihre Integration-Test-Abdeckung. Ohne diese Welle sind Plan 02 und Plan 04 "es sollte funktionieren" — nach dieser Welle sind sie "es funktioniert beweisbar".

Output: `docker compose up -d` + `scripts/wait-healthy.sh` + `uv run pytest tests/backend -m integration` ist ein grüner Build. Manuelles Browser-Smoke: login mit seed-user@osim-dev / passwort, /api/v1/auth/me liefert tenant_id und tenant_status=active.
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
@.planning/phases/01-vertical-slice/01-02-backend-foundation-PLAN.md
@.planning/phases/01-vertical-slice/01-03-frontend-foundation-PLAN.md
@.planning/phases/01-vertical-slice/01-04-storage-models-locks-api-PLAN.md
@CLAUDE.md
@docker-compose.yml
@Dockerfile
</context>

<interfaces>
<!-- Aus Plan 02/03/04 verfügbar -->

```yaml
# Bereits in docker-compose.yml (Phase-0-Skeleton):
services:
  postgres:    # postgres:17-alpine, port 5432, db=osim_ui, user=osim_dev, pw=osim_dev_password
  firebase-emulator:  # node:20-slim, port 9099 (auth) + 4000 (UI), läuft `firebase emulators:start`
  minio:       # latest, port 9000 (s3) + 9001 (console), user=osim_dev/pw=osim_dev_password

# Noch FEHLEN (diese Welle fügt hinzu):
# - api-Service mit DATABASE_URL etc.
# - portal-Service mit VITE_API_BASE_URL
# - healthchecks für firebase-emulator und minio
# - Mount für firebase.json + .firebaserc nach /app
```

```python
# Firebase Auth Emulator REST-API (für Token-Generation in Tests):
# POST http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key
#   body: {email, password, returnSecureToken: true}
#   → {idToken, refreshToken, localId, ...}
# POST http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key
#   body: {email, password, returnSecureToken: true}
#   → {idToken, ...}
# Token kann via firebase_admin.auth.verify_id_token() validiert werden (mit FIREBASE_AUTH_EMULATOR_HOST gesetzt).
```
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Backend-Dockerfile + Frontend-Dockerfile (Multi-Stage)</name>
  <files>Dockerfile, portal/Dockerfile</files>
  <read_first>
    - Dockerfile (aktueller Stand)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\Dockerfile (Multi-Stage-Vorlage)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\Dockerfile (falls existiert; sonst Vite-Standard-Pattern)
    - pyproject.toml (Engine-Path: editable-install von ../osim-engine/engine)
  </read_first>
  <behavior>
    - `docker build -t osim-ui-api .` baut ein Image mit Python 3.13 + uv + alle Backend-Deps + osim-engine als editable-install. CMD: `uvicorn app.main:app --host 0.0.0.0 --port 8080`.
    - `docker build -t osim-ui-portal portal/` baut ein Image mit Node 22 + npm install + Vite-Dev-Server. CMD: `npm run dev -- --host 0.0.0.0`.
    - Images sind unter 1 GB (Backend) / 800 MB (Portal). Multi-Stage reduziert Größe.
  </behavior>
  <action>
    Überschreibe `Dockerfile` (1:1-Pattern aus tbx_stzrim/Dockerfile, angepasst):
    - Stage 1 "builder": `FROM python:3.13-slim AS builder`; install uv via `pip install uv`; COPY pyproject.toml + uv.lock; `RUN uv sync --frozen --no-install-project`.
    - Stage 2 "engine-link": engine als editable braucht den Source-Tree. Da im Compose-Setup das Engine-Volume gemountet wird, im Image keine engine-Installation — stattdessen Hinweis: `# osim-engine wird zur Laufzeit per Volume-Mount + uv pip install -e injiziert` und das `entrypoint.sh` macht beim Start `uv pip install -e /workspace/osim-engine/engine`.
      - Alternative (sauberer): COPY ../osim-engine/engine /workspace/osim-engine/engine. Problem: docker-Context kann nicht über parent-Verzeichnis. Lösung: docker-compose nutzt context `..` und dockerfile-Pfad `./osim-ui/Dockerfile` ODER ein Pre-Build-Script kopiert engine in einen scratch-Folder.
      - EMPFEHLUNG für Phase 1: build-context = `..` (parent von osim-ui), und im Dockerfile `COPY osim-engine/engine /opt/engine` + `RUN uv pip install -e /opt/engine`. docker-compose-Service hat `context: ..` und `dockerfile: osim-ui/Dockerfile`.
    - Stage 3 "runtime": `FROM python:3.13-slim`; COPY from builder; COPY app/ db/; ENV PYTHONUNBUFFERED=1; EXPOSE 8080; CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"].

    Erstelle `portal/Dockerfile`:
    - `FROM node:22-slim AS deps`; WORKDIR /app; COPY package.json package-lock.json; RUN npm ci.
    - `FROM node:22-slim AS dev`; WORKDIR /app; COPY --from=deps /app/node_modules; COPY . .; EXPOSE 3002; CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"].
    - (Für Phase 1 reicht Dev-Image; Production-Image mit `npm run build` + nginx kommt in Phase 5.)
  </action>
  <verify>
    <automated>docker build -t osim-ui-api-test:latest -f Dockerfile .. 2>&amp;1 | tail -10 || echo "build kann ohne osim-engine im parent failen — das ist OK, der Pattern-Check zählt"</automated>
  </verify>
  <done>
    Dockerfile ist Multi-Stage (builder + runtime). portal/Dockerfile baut Vite-Dev-Image. CMDs sind korrekt. `docker build` läuft fehlerfrei (oder schlägt nur wegen fehlendem ../osim-engine fehl — dann muss build-context dokumentiert werden).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: docker-compose.yml — voller Dev-Stack mit api + portal + healthchecks</name>
  <files>docker-compose.yml, infra/firebase/firebase.json, infra/firebase/.firebaserc</files>
  <read_first>
    - docker-compose.yml (aktueller Stand)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\docker-compose.yml (Vorlage)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §System Architecture Diagram + §Open Questions #5 (Minio-Entscheidung)
    - app/core/config.py (aus Plan 02 — ENV-Variablen-Namen)
  </read_first>
  <behavior>
    - `docker compose up -d` startet 5 Services: postgres, firebase-emulator, minio, api, portal.
    - `docker compose ps` zeigt alle 5 als "(healthy)".
    - `curl http://localhost:8000/health` antwortet 200 (api-Service).
    - `curl http://localhost:3002/` liefert Vite-Dev-HTML (portal).
    - `curl http://localhost:9099/` liefert Firebase-Emulator-API-Hinweis.
    - `curl http://localhost:9000/minio/health/live` antwortet 200.
    - `docker compose down` räumt sauber auf (Volumes bleiben für nächsten Start).
  </behavior>
  <action>
    Überschreibe `docker-compose.yml`:
    - Bestehende 3 Services (postgres, firebase-emulator, minio) behalten, ABER:
      - **firebase-emulator**: healthcheck hinzufügen (`test: ["CMD", "curl", "-f", "http://localhost:9099/"]`, interval=10s, timeout=5s, retries=10, start_period=20s).
      - **minio**: healthcheck (`test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]`).
      - **firebase-emulator**: bind-mount `./infra/firebase` auf `/app`, command ändern auf `sh -c "npm install -g firebase-tools@latest && firebase emulators:start --project osim-dev --only auth"`.

    NEU hinzufügen:
    - **api**:
      - build:
        - context: `..`  (parent von osim-ui — wir brauchen Zugriff auf ../osim-engine/engine)
        - dockerfile: `osim-ui/Dockerfile`
      - ports: `["8000:8080"]`
      - environment:
        - DATABASE_URL=postgresql+psycopg://osim_dev:osim_dev_password@postgres:5432/osim_ui
        - FIREBASE_PROJECT_ID=osim-dev
        - FIREBASE_AUTH_EMULATOR_HOST=firebase-emulator:9099
        - ENVIRONMENT=dev
        - CORS_ORIGINS=http://localhost:3002
        - STORAGE_BACKEND=minio
        - MINIO_ENDPOINT=minio:9000
        - MINIO_ACCESS_KEY=osim_dev
        - MINIO_SECRET_KEY=osim_dev_password
        - MINIO_BUCKET=osim-ui-dev
      - depends_on:
        - postgres: {condition: service_healthy}
        - firebase-emulator: {condition: service_healthy}
        - minio: {condition: service_healthy}
      - healthcheck: `test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8080/health').read()"]`, interval=10s, retries=10, start_period=30s.

    - **portal**:
      - build: `./portal` (Standalone, keine engine-Abhängigkeit)
      - ports: `["3002:3002"]`
      - environment:
        - VITE_API_BASE_URL=http://localhost:8000   (Browser nutzt localhost, NICHT api-Service-Name)
        - VITE_FIREBASE_API_KEY=demo-api-key-for-emulator
        - VITE_FIREBASE_AUTH_DOMAIN=osim-dev.firebaseapp.com
        - VITE_FIREBASE_PROJECT_ID=osim-dev
      - depends_on: [api]   (warten bis API up)

    - Volumes-Block: pgdata, miniodata behalten.

    Erstelle `infra/firebase/firebase.json`:
    - `{"emulators": {"auth": {"host": "0.0.0.0", "port": 9099}, "ui": {"enabled": true, "host": "0.0.0.0", "port": 4000}}}`

    Erstelle `infra/firebase/.firebaserc`:
    - `{"projects": {"default": "osim-dev"}}`
  </action>
  <verify>
    <automated>docker compose config 2>&amp;1 | head -50 &amp;&amp; docker compose up -d postgres firebase-emulator minio 2>&amp;1 | tail -10; sleep 25; docker compose ps 2>&amp;1 | head -10; docker compose down 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    docker-compose.yml ist syntaktisch valide (compose config grün). postgres+firebase+minio starten healthy. api+portal-Services definiert mit korrektem depends_on. infra/firebase/{firebase.json,.firebaserc} existieren.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: wait-healthy.sh + Seed-Skript für Firebase-Emulator-Test-User</name>
  <files>scripts/wait-healthy.sh, scripts/seed-firebase-emulator.py, infra/firebase/seed-users.sh, README.md</files>
  <read_first>
    - docker-compose.yml (aus Task 2 — healthcheck-Setup)
    - app/auth/firebase.py (aus Plan 02 — verify_token Pattern)
    - README.md (aktueller Stand)
    - .planning/phases/01-vertical-slice/01-CONTEXT.md D-15 (Firebase Auth ab Tag 1)
  </read_first>
  <behavior>
    - `scripts/wait-healthy.sh` blockiert bis alle docker-compose-Services healthy oder 60s timeout (exit 1 wenn timeout).
    - `python scripts/seed-firebase-emulator.py` legt zwei Test-User an: `admin@osim-dev` (pw=admin123, custom-claim role=admin) und `user@osim-dev` (pw=user123, custom-claim role=user). Idempotent (wenn schon vorhanden → skip).
    - `scripts/wait-healthy.sh && python scripts/seed-firebase-emulator.py` ist das Standard-Setup nach `docker compose up`.
    - README hat eine Sektion "Lokales Setup" die diese Schritte dokumentiert.
  </behavior>
  <action>
    Erstelle `scripts/wait-healthy.sh` (bash):
    - shebang `#!/usr/bin/env bash`, `set -euo pipefail`
    - Parse arg `TIMEOUT=${1:-60}`
    - Loop while `[[ $SECONDS -lt $TIMEOUT ]]`:
      - Counter `unhealthy=$(docker compose ps --format json | jq -r 'select(.Health != "healthy" and .Health != "") | .Name' | wc -l)`
      - If unhealthy == 0 → break (alle healthy)
      - sleep 2
    - if SECONDS >= TIMEOUT → `echo "Timeout"; docker compose ps; exit 1`
    - else → `echo "All services healthy"; exit 0`
    - chmod +x via Git (oder Hinweis im README dass `bash scripts/wait-healthy.sh` direkt funktioniert auf Windows-Git-Bash)

    Erstelle `scripts/seed-firebase-emulator.py`:
    - Stand-alone Python-Skript (kein Test-Framework, kann direkt mit `uv run python` ausgeführt werden).
    - `import os; os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")`
    - `import firebase_admin; from firebase_admin import auth, credentials, initialize_app`
    - Init Admin-SDK ohne Credentials (Emulator-Mode): `app = initialize_app(options={"projectId": "osim-dev"})` (firebase_admin erkennt Emulator-Host).
    - Funktion `create_user_if_missing(email, password, role)`:
      - try `user = auth.get_user_by_email(email)`; except UserNotFoundError → user = auth.create_user(email=email, password=password)
      - auth.set_custom_user_claims(user.uid, {"role": role})
      - Hinweis: tenant_id wird per Lazy-Bootstrap beim ersten /auth/me-Call gesetzt; hier setzen wir NUR role.
      - print(f"  user {email} (uid={user.uid}) ready with role={role}")
    - main():
      - create_user_if_missing("admin@osim-dev", "admin123", "admin")
      - create_user_if_missing("user@osim-dev", "user123", "user")
    - if __name__ == "__main__": main()

    Erstelle `infra/firebase/seed-users.sh`:
    - One-liner: `python ../../scripts/seed-firebase-emulator.py` — alternative Aufruf-Form aus dem firebase-Verzeichnis.

    Erweitere `README.md` um Sektion `## Lokales Setup`:
    - Schritt 1: `cp .env.example .env` und `cp portal/.env.example portal/.env`
    - Schritt 2: `docker compose up -d`
    - Schritt 3: `bash scripts/wait-healthy.sh 90`
    - Schritt 4: `uv run alembic --config db/alembic.ini upgrade head`
    - Schritt 5: `uv run python scripts/seed-firebase-emulator.py`
    - Schritt 6: Browser → http://localhost:3002 → Login mit `admin@osim-dev / admin123`
    - Sektion `## Tests`: `uv run pytest tests/backend -m "integration"` (requires running Postgres+Firebase+Minio); `cd portal && npm run test:run`.
    - Sektion `## Bekannte Issues / Hinweise`: Windows-Pfade in seed-firebase-emulator.py; CRLF-Konflikte in scripts/wait-healthy.sh.
  </action>
  <verify>
    <automated>bash scripts/wait-healthy.sh 5 2>&amp;1 | tail -5 || echo "exit non-zero ist erwartbar ohne aktive Compose"; uv run python -c "import scripts.seed_firebase_emulator" 2>&amp;1 | tail -3 || echo "Script-Import-Test nur informativ"</automated>
  </verify>
  <done>
    scripts/wait-healthy.sh ist ausführbar und macht den 60s-Loop. scripts/seed-firebase-emulator.py legt 2 Test-User mit Custom-Claims an. README hat "Lokales Setup"-Schritt-für-Schritt.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Erweiterte conftest.py mit Async-Test-Client + Token-Fixtures + Schema-Reset</name>
  <files>tests/backend/conftest.py</files>
  <read_first>
    - tests/backend/conftest.py (aktueller Stand — aus Plan 01)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `tests/backend/conftest.py` — Subset aus tbx_stzrim)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\tests\conftest.py (Vorlage Z.1-120)
    - app/main.py (aus Plan 02 — App-Factory; wird via httpx-AsyncClient/ASGITransport gewrappt)
    - app/core/config.py + settings (für Test-DB)
  </read_first>
  <behavior>
    - Fixture `test_client` liefert eine `httpx.AsyncClient` via `ASGITransport(app=app)` (kein echtes Network).
    - Fixture `admin_token` und `user_token` rufen das Firebase-Emulator REST-API auf (signInWithPassword) und liefern den idToken.
    - Fixture `clean_db` macht `DROP SCHEMA tenant_<seed-uids> CASCADE; TRUNCATE public.tenants, public.users RESTART IDENTITY CASCADE` BEFORE jedem Test (Marker `requires_postgres`).
    - Fixture `app_with_lifespan` triggert FastAPI-Startup (initialize_firebase + configure_logging) für End-to-End-Tests.
    - `pytest_collection_modifyitems` hat jetzt auto-skip für ALLE Marker (requires_postgres, requires_firebase_emulator, requires_minio, requires_engine) basierend auf Service-Erreichbarkeit (TCP-Check).
  </behavior>
  <action>
    Erweitere `tests/backend/conftest.py` (NICHT überschreiben — Plan 01 hat schon den engine-Marker-Skip eingebaut, das bleibt).

    Hinzufügen:
    - `import asyncio, socket, os, httpx, pytest, pytest_asyncio` etc.
    - `_TEST_FIREBASE_API_KEY = "demo-api-key-for-emulator"` (Emulator akzeptiert beliebige API-Keys)
    - Helper `def _tcp_alive(host, port, timeout=1.5) -> bool`: socket-connect-Test.
    - Helper `def _emulator_token(email, password) -> str`:
      - `r = httpx.post(f"http://{os.environ.get('FIREBASE_AUTH_EMULATOR_HOST', 'localhost:9099')}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={_TEST_FIREBASE_API_KEY}", json={"email": email, "password": password, "returnSecureToken": True})`
      - return r.json()["idToken"]
    - Erweiterte `pytest_collection_modifyitems(config, items)`:
      - skip_postgres if not _tcp_alive("localhost", 5432)
      - skip_firebase if not _tcp_alive("localhost", 9099)
      - skip_minio if not _tcp_alive("localhost", 9000)
      - skip_engine if not engine_available() (aus Plan 01)
      - Iteriere items, prüfe item.iter_markers(), füge entsprechenden skip-Marker hinzu wenn Service tot.
    - `@pytest_asyncio.fixture` `test_client()`:
      - `from app.main import app`
      - `from httpx import AsyncClient, ASGITransport`
      - `async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client: yield client`
    - `@pytest.fixture(scope="session")` `admin_token()`: return _emulator_token("admin@osim-dev", "admin123"). Setzt voraus: docker compose + seed-script gelaufen.
    - `@pytest.fixture(scope="session")` `user_token()`: return _emulator_token("user@osim-dev", "user123").
    - `@pytest.fixture` `clean_db()`:
      - Im setup: `from app.core.database import engine; with engine.begin() as conn: conn.execute(text("TRUNCATE public.users, public.tenants RESTART IDENTITY CASCADE")); for schema in conn.execute(text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'")).scalars(): conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))`
      - Yield nothing; teardown ist no-op (next test ruft setup).
      - Marker `@pytest.mark.requires_postgres` auf alle Tests die clean_db nutzen.
    - `@pytest.fixture` `auth_headers(admin_token)`: return `{"Authorization": f"Bearer {admin_token}"}`.

    Diese conftest.py ist die Voraussetzung für alle nachfolgenden Tests in dieser Welle (Task 5-9).
  </action>
  <verify>
    <automated>uv run pytest tests/backend --collect-only -q 2>&amp;1 | tail -15</automated>
  </verify>
  <done>
    conftest.py hat erweiterte Fixtures (test_client, admin_token, user_token, clean_db, auth_headers). pytest_collection_modifyitems hat auto-skip für 4 Marker. `pytest --collect-only` läuft ohne ImportError.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: Integration-Tests Auth-Endpoints + Lazy-Bootstrap-Race + search_path-Isolation</name>
  <files>tests/backend/test_auth_endpoints.py, tests/backend/test_lazy_bootstrap_race.py, tests/backend/test_search_path_isolation.py</files>
  <read_first>
    - tests/backend/conftest.py (aus Task 4)
    - app/auth/middleware.py + app/services/auth_service.py (aus Plan 02)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #1 + #2 (Tests gegen Pitfalls)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `tests/backend/test_auth.py`)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\tests\test_auth_middleware.py (Vorlage)
  </read_first>
  <behavior>
    - `test_health_no_auth` (in test_auth_endpoints.py): GET /health ohne Token → 200.
    - `test_missing_token_returns_401`: GET /api/v1/auth/me ohne Header → 401 + detail "Missing token".
    - `test_invalid_token_returns_401`: mit Bearer garbage → 401 + detail "Invalid token".
    - `test_valid_token_bootstraps_tenant`: erstmaliger /auth/me mit user_token → 200, response hat tenant_id=user_uid; DB-Check `SELECT * FROM public.tenants WHERE slug=:uid` returnt eine Row; tenant_<uid>-Schema existiert mit models + model_locks Tabellen.
    - `test_second_auth_me_is_idempotent`: zweiter /auth/me mit gleichem token → 200 mit gleichem tenant_id; KEIN doppeltes Schema, KEIN doppelter User.
    - `test_lazy_bootstrap_race` (in test_lazy_bootstrap_race.py): `asyncio.gather(client.get("/api/v1/auth/me", headers=hdrs), client.get("/api/v1/auth/me", headers=hdrs))` mit fresh user_token → BEIDE returnen 200 ohne 500.
    - `test_search_path_isolation` (in test_search_path_isolation.py): User-Admin upload model in tenant_admin; User-User upload model in tenant_user; GET /api/v1/models als Admin zeigt NUR Admin-Modell; GET als User zeigt NUR User-Modell. KEIN cross-leak.
  </behavior>
  <action>
    Erstelle `tests/backend/test_auth_endpoints.py`:
    - 4 Tests aus dem `<behavior>`-Block (test_health, test_missing, test_invalid, test_valid+bootstrap, test_idempotent).
    - Marker: `@pytest.mark.requires_postgres @pytest.mark.requires_firebase_emulator @pytest.mark.integration`.
    - Verwende `test_client`, `clean_db`, `admin_token`, `auth_headers` aus conftest.
    - DB-Asserts via `from app.core.database import engine` + raw SQL.

    Erstelle `tests/backend/test_lazy_bootstrap_race.py`:
    - 1 Test `test_lazy_bootstrap_idempotent_under_concurrent_calls`:
      - Voraussetzung: User existiert im Emulator, hat ABER noch keinen Tenant (clean_db garantiert das).
      - `token = await _emulator_token("user@osim-dev", "user123")`
      - `responses = await asyncio.gather(client.get("/api/v1/auth/me", headers=hdrs), client.get("/api/v1/auth/me", headers=hdrs), client.get("/api/v1/auth/me", headers=hdrs))`
      - assert all r.status_code == 200 for r in responses
      - assert all r.json()["tenant_id"] == r2.json()["tenant_id"] for r, r2 in pairs(responses)
      - DB-Check: nur 1 tenant_X-Schema existiert; nur 1 public.users-Row für firebase_uid.
    - Marker: `@pytest.mark.requires_postgres @pytest.mark.requires_firebase_emulator @pytest.mark.integration`.

    Erstelle `tests/backend/test_search_path_isolation.py`:
    - Test `test_cross_tenant_isolation_no_leak`:
      - Admin auth (clean_db danach → admin_token holen → /auth/me).
      - User auth.
      - Admin uploads Dummy.otx via POST /api/v1/models/upload-otx mit auth=admin_token.
      - User uploads Dummy.otx mit auth=user_token.
      - Admin GET /api/v1/models → exactly 1 Modell mit Admin-Owner-uid.
      - User GET /api/v1/models → exactly 1 Modell mit User-Owner-uid.
      - Admin GET /api/v1/models/{user_model_id} → 404 oder 403 (Tenant-Schema enthält nicht das Modell des anderen Tenants — Quer-Zugriff scheitert weil Tabelle nicht im aktuellen search_path).
    - Marker: alle drei.
  </action>
  <verify>
    <automated>uv run pytest tests/backend/test_auth_endpoints.py tests/backend/test_lazy_bootstrap_race.py tests/backend/test_search_path_isolation.py -m integration 2>&amp;1 | tail -15</automated>
  </verify>
  <done>
    7 Tests grün gegen lebende Postgres+Firebase. Lazy-Bootstrap-Race ist beweisbar idempotent. search_path-Isolation funktioniert (kein Cross-Tenant-Leak). KEIN Test überspringt wenn Services laufen.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 6: Integration-Tests Models-Endpoints (upload, list, get, save, delete) + OTX-Upload-Roundtrip</name>
  <files>tests/backend/test_models_endpoints.py, tests/backend/test_otx_upload_roundtrip.py</files>
  <read_first>
    - tests/backend/conftest.py (aus Task 4)
    - app/api/v1/models.py + app/services/model_service.py (aus Plan 04)
    - tests/backend/fixtures/otx_models.py (aus Plan 01 — DUMMY_OTX)
    - .planning/phases/01-vertical-slice/01-CONTEXT.md D-14 (Original unverändert)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #3 (Latin-1) und #7 (Coverage)
  </read_first>
  <behavior>
    - `test_upload_otx_dummy_returns_wire`: POST /upload-otx mit Dummy.otx-Bytes + name → 200 + body.model.id + body.wire.coverage.loaded > 0.
    - `test_list_models_returns_uploaded`: upload + GET /models → list mit dem uploaded model.
    - `test_get_model_returns_wire`: upload + GET /models/{id} → wire matching upload-Antwort.
    - `test_save_model_creates_new_version`: upload + acquire-lock + PUT /models/{id} mit modified wire + lock_token → 200 + saved_version_key endet auf .otx. Minio: original-Key existiert noch UND saved-Version-Key existiert.
    - `test_save_without_lock_token_fails`: upload + PUT ohne lock_token → 422 (Pydantic-Validation).
    - `test_save_with_wrong_lock_token_fails`: upload + PUT mit random UUID → 423 mit code=E_LOCK_EXPIRED.
    - `test_delete_model_removes_storage`: upload + delete → 204; GET /models → list ohne das Modell; Minio: keine Objekte unter dem model-Prefix.
    - `test_otx_upload_roundtrip_byte_identical_for_dummy`: Upload Dummy.otx → get Wire → Save unchanged Wire → GET model → wire == upload-wire (modulo timestamps); UND Minio-Original-Bytes unverändert (D-14).
  </behavior>
  <action>
    Erstelle `tests/backend/test_models_endpoints.py`:
    - 7 Tests aus dem `<behavior>`-Block (test_upload, test_list, test_get, test_save_new_version, test_save_no_token, test_save_wrong_token, test_delete).
    - Marker: `@pytest.mark.requires_postgres @pytest.mark.requires_firebase_emulator @pytest.mark.requires_minio @pytest.mark.requires_engine @pytest.mark.integration`.
    - Helper `_upload_dummy(client, auth_headers, name="Dummy") -> dict`: returns upload response. Reused durch alle Tests.
    - Lock-Acquire-Helper für save-Tests.

    Erstelle `tests/backend/test_otx_upload_roundtrip.py`:
    - 1 grosser End-to-End Test `test_dummy_otx_byte_identical_through_pipeline`:
      - read DUMMY_OTX.bytes → upload via POST /upload-otx → model_id, lock-acquire → PUT /models/{id} mit dem returned wire (unverändert) + lock_token → 200.
      - Minio-Check: Original-File-Bytes == DUMMY_OTX.read_bytes() (D-14: Original muss unverändert sein).
      - Lade aktuelles Modell via GET /models/{id} → wire.objects.keys() == originaler wire.objects.keys().
    - Marker: 5 wie oben.
  </action>
  <verify>
    <automated>uv run pytest tests/backend/test_models_endpoints.py tests/backend/test_otx_upload_roundtrip.py -m integration 2>&amp;1 | tail -15</automated>
  </verify>
  <done>
    8 Integration-Tests grün gegen Postgres+Firebase+Minio+Engine. D-14 ist beweisbar erfüllt: Original-OTX-Bytes bleiben unverändert. Coverage-Lücken-Modelle (Bosch2_wechseln) sind mit explizitem 422-Test abgedeckt (im Skipped-Modus bzgl. requires_engine wenn Engine fehlt).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 7: Integration-Tests Lock-Endpoints + Health-mit-Storage</name>
  <files>tests/backend/test_lock_endpoints.py, tests/backend/test_health_with_storage.py</files>
  <read_first>
    - tests/backend/conftest.py (aus Task 4)
    - app/api/v1/locks.py + app/services/lock_service.py (aus Plan 04)
    - app/api/v1/health.py (aus Plan 04 Task 5)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #4 (Stale Lock)
  </read_first>
  <behavior>
    - `test_acquire_release_acquire_again`: User1 acquire model_id → 200. User1 release → 204. User2 acquire → 200.
    - `test_acquire_conflict_returns_409`: User1 acquire → 200. User2 acquire → 409 + body.code=E_MODEL_LOCKED + owner_user_uid.
    - `test_heartbeat_extends_lock`: User1 acquire → expires_at_1. sleep 1s. heartbeat → expires_at_2 > expires_at_1.
    - `test_heartbeat_wrong_token_404`: acquire → heartbeat(wrong-uuid) → 404 + body.code=E_LOCK_EXPIRED.
    - `test_release_with_wrong_token_no_op_or_404`: acquire → release(wrong-uuid) → 204 (no-op ok) ODER 404 — beides akzeptabel laut Spec, Test prüft beide.
    - `test_stale_lock_cleanup_on_acquire`: acquire mit ttl=1s → sleep 2s → User2 acquire → 200 (stale wurde via cleanup_stale beim acquire-Call entfernt). Achtung: settings.lock_ttl_seconds ist 60; für diesen Test entweder monkeypatch oder via direkter DB-UPDATE expires_at manipulieren.
    - `test_health_includes_storage_field`: GET /health → response.json() hat key "storage" mit value "minio" (oder settings.storage_backend).
  </behavior>
  <action>
    Erstelle `tests/backend/test_lock_endpoints.py` mit 6 Tests aus dem `<behavior>`-Block.
    - Marker: `@pytest.mark.requires_postgres @pytest.mark.requires_firebase_emulator @pytest.mark.integration` (KEIN engine/minio nötig — Lock ist DB-only; aber Upload braucht engine+minio, also: kombiniere Marker).
    - Setup-Helper: upload Dummy.otx via Admin-User um eine model_id zu bekommen → dann Lock-Tests sind tenant-scoped (Admin's tenant_X).
    - Für `test_stale_lock_cleanup`: nutze direkt DB-UPDATE `UPDATE model_locks SET expires_at = NOW() - INTERVAL '5 seconds' WHERE model_id = :mid`, dann POST /lock erneut → success.

    Erstelle `tests/backend/test_health_with_storage.py`:
    - 1 Test `test_health_returns_storage_backend`: GET /health → 200 + body.storage in {"local", "minio", "gcs"}.
    - 1 Test `test_health_returns_db_connected_when_postgres_live`: GET /health → body.db == "connected".
    - Marker: `@pytest.mark.requires_postgres @pytest.mark.integration` (KEIN auth, weil /health auf Whitelist).
  </action>
  <verify>
    <automated>uv run pytest tests/backend/test_lock_endpoints.py tests/backend/test_health_with_storage.py -m integration 2>&amp;1 | tail -15</automated>
  </verify>
  <done>
    8 Integration-Tests grün. Lock-Lifecycle ist beweisbar (acquire/release/conflict/heartbeat/stale-cleanup). Health zeigt storage-Backend.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| docker-compose-Service ↔ docker-compose-Service | Interne Container-Kommunikation; Service-Names als hostnames (postgres, firebase-emulator, minio) |
| Browser ↔ Backend (8000) | Über docker-compose exposed; CORS auf localhost:3002 beschränkt |
| Browser ↔ Firebase-Emulator (9099) | Direkt-Zugriff vom Browser für Login |
| Test-Runner ↔ alle Services | Test-Runner läuft auf Host, spricht alle exposed Ports an |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-01 | Spoofing | Firebase-Emulator akzeptiert beliebigen API-Key | accept | Dev-Setup; Production verwendet echtes Firebase-Project (Phase 5) |
| T-05-02 | Information Disclosure | seed-firebase-emulator.py committed Test-Credentials (admin@osim-dev/admin123) | accept | Test-Credentials sind public-by-design; nur Emulator-Use; .env.example dokumentiert klar |
| T-05-03 | Tampering | docker-compose-Services laufen mit Default-Root-Credentials | mitigate | Nur localhost-Bind; KEIN Port-Forward in WAN; dev-only Config in docker-compose.yml dokumentiert |
| T-05-04 | DoS | docker compose up nimmt 30+ s | accept | Documented in README; wait-healthy.sh kapselt |
| T-05-05 | Information Disclosure | Test-Datenbank ist persistent (pgdata volume) → Test-Leftover zwischen Runs | mitigate | clean_db-Fixture TRUNCATE alle test-relevanten Schemas BEFORE jedem Test |
| T-05-06 | Repudiation | seed-Skript loggt nichts | accept | Skript ist informational stdout-only; CI-Runner sieht stdout |
</threat_model>

<verification>
- `docker compose config` syntaktisch valide
- `docker compose up -d` startet alle 5 Services
- `scripts/wait-healthy.sh 90` exit 0
- `uv run alembic --config db/alembic.ini upgrade head` legt public.tenants + public.users an
- `uv run python scripts/seed-firebase-emulator.py` legt 2 User an
- `uv run pytest tests/backend -m integration` grün (Erwartung: ~22 Integration-Tests aus Task 5/6/7)
- `curl http://localhost:8000/health` → 200 mit storage-Feld
- Browser → http://localhost:3002 → Login mit admin@osim-dev/admin123 → Dashboard-Placeholder
</verification>

<success_criteria>
SC-1 (docker compose up startet alles): VOLLSTÄNDIG erfüllt nach diesem Plan.
SC-2 (Login + Lazy-Bootstrap): VOLLSTÄNDIG erfüllt + beweisbar via test_lazy_bootstrap_race.py.
SC-7 (Single-Editor-Lock): Lock-Lifecycle beweisbar via test_lock_endpoints.py; Frontend-Heartbeat-Integration in Plan 11.
SC-8 (Save-back = neue Version, Original unverändert): VOLLSTÄNDIG erfüllt + beweisbar via test_otx_upload_roundtrip.py.
SC-9 (Multi-Tenant): VOLLSTÄNDIG erfüllt + beweisbar via test_search_path_isolation.py.
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-05-SUMMARY.md` with:
- Compose-Stack-Übersicht (5 Services, Ports, healthcheck-Patterns)
- Test-Coverage-Matrix (welcher SC durch welchen Integration-Test verifiziert)
- Manuelle Smoke-Test-Schritte (Login → Upload → Edit-noop → Save)
- Bekannte Issues: Windows-CRLF in scripts/wait-healthy.sh, build-context für Dockerfile braucht parent-Folder
- Was Plan 06-12 jetzt vorausgesetzt haben: Login + apiFetch funktional, Models-API hat Test-Coverage, Lock-API hat Test-Coverage, alle search_path-Mechanismen sind beweisbar leakfrei
</output>
</content>
</invoke>