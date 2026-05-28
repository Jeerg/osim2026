# Phase 1: Vertical Slice — Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** ~85 Dateien (Backend + Frontend + Tests + Engine-Verifikation)
**Analogs found:** 38 exakte / 22 Konzept-Match / 25 ohne Analog (neue OViewer-/GraphObject-Schicht)

---

## Stack-Drift gegenüber RESEARCH.md (vorab klären!)

Die RESEARCH.md schlägt SQLAlchemy 2 **async + asyncpg** und IndexedDB via **dexie + zundo + react-arborist + @xyflow/react** vor. Die 3fls-Codebase (Analog-Quelle) nutzt jedoch:

| RESEARCH.md-Empfehlung | 3fls (tbx_stzrim) Realität | Empfehlung für osim-ui |
|------------------------|------------------------------|-------------------------|
| `sqlalchemy[asyncio]` + `asyncpg` | `sqlalchemy[asyncio]` + `psycopg[binary]` (sync, in `async def` mit `with engine.connect()`) | **Folge 3fls.** Stack-Parität schlägt theoretische Async-Reinheit. Pattern in `app/core/database.py` ist battle-tested für search_path-Leak-Prevention (Phase-19-Fix dokumentiert). |
| `asyncpg` DSN (`postgresql+asyncpg://`) | `postgresql+psycopg://` mit Auto-Replace in `Settings.__init__` | **Folge 3fls.** psycopg3 unterstützt async, aber 3fls nutzt sync — keine async-Notwendigkeit in Phase 1. |
| `BaseHTTPMiddleware` für Auth | **Pure ASGI-Middleware** (`__call__(self, scope, receive, send)`) — bewusst NICHT BaseHTTPMiddleware (deprecated per Starlette #1678) | **Folge 3fls.** Wichtiger Punkt. |
| `react-arborist` als Sidebar-Tree-Lib | 3fls hat eigene Tree-Implementierung (`pages/tree-builder/*` mit `@dnd-kit/core`, eigene Cell/Row-Components) | **Pragmatisch: react-arborist** als externe Lib in Phase 1 (RESEARCH-Empfehlung) UND parallel 3fls-tree-builder-Files als Code-Inspiration für `WBSBranch`/`Toolbar`/`InlineRenameInput`-Patterns lesen. |
| `@xyflow/react` (React Flow) | 3fls nutzt **sigma + graphology + dagre** in `features/graph-viewer/` | **Folge RESEARCH (@xyflow/react)** in Phase 1, weil Modell-Größen klein (~50 Knoten) und React Flow für editierbare Node-Graphen besser ist als sigma (read-only viewer). Hinweis: sigma-Stack ist Backup-Option für späteren Performance-Sturz. |
| `dexie` / `zundo` / `immer` | **3fls hat keines davon.** Persist nur via `zustand/middleware` (LocalStorage), kein IndexedDB, kein Undo-Stack. | **Folge RESEARCH.** Phase 1 baut Greenfield IndexedDB-Layer mit dexie + Undo mit zundo. Kein 3fls-Analog. |
| `react-icons` | 3fls nutzt `lucide-react` 0.577 | **Folge 3fls (lucide-react).** RESEARCH-Annahme war falsch. |
| `pyproject.toml` mit `pytest-asyncio` | 3fls hat `pytest-asyncio` + `asyncio_mode = "auto"` + `markers = [...]` + `filterwarnings` für strict-mode | **Folge 3fls 1:1.** |

**Konsequenz für Planner:** Die Pattern-Excerpts unten gehen von 3fls aus (sync SQLAlchemy + ASGI-Middleware + psycopg3). Wenn der Planner abweichen will, muss er D-18 (volle FastAPI-Foundation) explizit umentscheiden — sonst gilt 3fls-Parität.

---

## File Classification

### Backend — Foundation (FastAPI + Auth + DB + Config)

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `app/main.py` | API-Bootstrap | request-response | `tbx_stzrim/main.py` | exact |
| `app/core/config.py` | Config | startup | `tbx_stzrim/app/core/config.py` | exact |
| `app/core/database.py` | DB-Engine + get_db | request-response | `tbx_stzrim/app/core/database.py` | exact |
| `app/core/logging.py` | structlog-Config | startup | `tbx_stzrim/app/core/logging.py` | exact |
| `app/auth/firebase.py` | Firebase-Init + verify_token | startup + per-request | `tbx_stzrim/app/auth/firebase.py` | exact |
| `app/auth/middleware.py` | TenantAuthMiddleware (ASGI) | request-response | `tbx_stzrim/app/auth/middleware.py` | exact |
| `app/auth/dependencies.py` | FastAPI-Deps (get_current_user, require_admin) | request-response | `tbx_stzrim/app/auth/dependencies.py` | exact |
| `app/auth/schemas.py` | CurrentUser, UserRole | data-model | `tbx_stzrim/app/auth/schemas.py` | exact |
| `app/auth/router.py` | `/api/v1/auth/me` | request-response | `tbx_stzrim/app/auth/router.py` | exact (mit Bootstrap-Erweiterung) |
| `app/api/v1/router.py` | Router-Aggregator | startup | `tbx_stzrim/app/api/v1/router.py` | exact |
| `app/api/v1/health.py` | `/health`-Endpoint | request-response | `tbx_stzrim/app/api/v1/health.py` | exact (vereinfacht, ohne GCS-Check) |
| `app/api/schemas/common.py` | ProblemDetail (RFC 7807) | data-model | `tbx_stzrim/app/api/schemas/common.py` | exact |

### Backend — Storage + Models (NEU für osim-ui)

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `app/services/storage.py` | Storage-Abstraktion (local/minio/gcs) | file-I/O | `tbx_stzrim/datalake/storage.py` (zu lesen für GCS-Pattern) | konzeptuell |
| `app/services/auth_service.py` | Tenant-Bootstrap (lazy) | CRUD | **kein Analog** — 3fls ist Single-Tenant per Phase-17.8.1-Migration | NEU |
| `app/services/model_service.py` | OTX-Upload + JSON-Tree + Save-back | file-I/O + transform | **kein Analog** | NEU |
| `app/services/lock_service.py` | Single-Editor-Lock (DB-Row) | CRUD | **kein Analog** | NEU |
| `app/services/otx_json_tree.py` | OtxObject ↔ Wire-Format | transform | **kein Analog** | NEU |
| `app/api/v1/models.py` | `/models/upload-otx`, `/models/{id}` | request-response + file-I/O | `tbx_stzrim/app/api/v1/graph/router.py` (für Endpoint-Struktur), `tbx_stzrim/app/bom/router.py` (für File-Upload-Pattern) | konzeptuell |
| `app/api/v1/locks.py` | Lock-Acquire/Heartbeat/Release | CRUD | **kein Analog** | NEU |
| `app/db/models.py` | SQLAlchemy ORM (Tenants, Users, Models, Locks) | data-model | `tbx_stzrim/db/models/base.py` (Mixins-Pattern) | konzeptuell |
| `app/db/alembic/env.py` | Alembic-Env | startup | `tbx_stzrim/db/alembic/env.py` | exact |
| `app/db/alembic/versions/001_initial_schema.py` | Erste Migration | DDL | `tbx_stzrim/db/alembic/versions/*.py` | konzeptuell |
| `db/alembic.ini` | Alembic-Config | config | `tbx_stzrim/db/alembic.ini` | exact |
| `pyproject.toml` | Python-Deps + pytest-Config | config | `tbx_stzrim/pyproject.toml` | exact (subset) |

### Frontend — Foundation (Auth + Router + API-Client)

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `portal/src/main.tsx` | React-Entry | startup | `tbx_stzrim/portal/src/main.tsx` | exact (i18n-Import optional) |
| `portal/src/app.tsx` | App + Provider-Wrap | startup | `tbx_stzrim/portal/src/app.tsx` | exact (ohne `GlobalExcelImportProvider`) |
| `portal/src/auth/firebase.ts` | Firebase-Init (Client) | startup | `tbx_stzrim/portal/src/auth/firebase.ts` | exact |
| `portal/src/auth/auth-provider.tsx` | AuthContext + onAuthStateChanged | event-driven | `tbx_stzrim/portal/src/auth/auth-provider.tsx` | exact |
| `portal/src/auth/use-auth.ts` | useAuth Hook | data-model | `tbx_stzrim/portal/src/auth/use-auth.ts` | exact |
| `portal/src/api/fetch.ts` | apiFetch + ApiError | request-response | `tbx_stzrim/portal/src/api/fetch.ts` | exact (ohne apiFetchBlob fürs Erste) |
| `portal/src/api/error-message.ts` | apiErrorMessage + DE-Mapping | transform | `tbx_stzrim/portal/src/api/error-message.ts` | konzeptuell (eigene DE-Codes für osim) |
| `portal/vite.config.ts` | Vite-Build-Config | config | `tbx_stzrim/portal/vite.config.ts` | exact (Port anpassen) |
| `portal/tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | TS-Config | config | `tbx_stzrim/portal/tsconfig*.json` | exact |
| `portal/eslint.config.js` | ESLint-Config | config | `tbx_stzrim/portal/eslint.config.js` | exact |
| `portal/index.html` | HTML-Shell | config | `tbx_stzrim/portal/index.html` | exact (Title anpassen) |
| `portal/package.json` | npm-Deps | config | `tbx_stzrim/portal/package.json` | konzeptuell (Subset + Phase-1-Libs) |
| `portal/src/routes/__root.tsx` | Root-Route | request-response | `tbx_stzrim/portal/src/routes/__root.tsx` | exact |
| `portal/src/routes/_authenticated.tsx` | Auth-Guard-Layout | request-response | `tbx_stzrim/portal/src/routes/_authenticated.tsx` | exact (mit isReady-Fix aus Pitfall 8) |
| `portal/src/routes/login.tsx` | Login-Seite | request-response | `tbx_stzrim/portal/src/routes/login.tsx` | konzeptuell (anderes Branding) |
| `portal/src/routes/index.tsx` | Landing | request-response | `tbx_stzrim/portal/src/routes/index.tsx` | konzeptuell |
| `portal/src/routes/_authenticated/models/index.tsx` | Modell-Bibliothek + Upload | request-response | **kein direkter Analog**; siehe `tbx_stzrim/portal/src/pages/tree-builder/index.tsx` als Page-Struktur-Vorbild | konzeptuell |
| `portal/src/routes/_authenticated/models/$id.tsx` | Workspace (Sidebar + Viewer) | request-response | siehe `tbx_stzrim/portal/src/features/graph-viewer/graph-viewer-page.tsx` als Page-Layout-Vorbild | konzeptuell |

### Frontend — OViewer-Foundation (alle NEU, kein direktes 3fls-Analog)

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `portal/src/viewers/core/types.ts` | OBaseObj, ViewerProps, PropertyMeta, ClassSchema | data-model | RESEARCH.md §Pattern 1+3 (Skizzen) | NEU |
| `portal/src/viewers/core/ViewerRegistry.ts` | Map: (klass, hint) → Component | event-driven | RESEARCH.md §Pattern 1 (Skizze) | NEU |
| `portal/src/viewers/core/ClientCtrl.ts` | Routing-State (TS-Klasse) | event-driven | RESEARCH.md §Pattern 1 (Skizze) | NEU |
| `portal/src/viewers/core/ViewerFrame.tsx` | Frame-Wrapper + Toolbar + Resolver | request-response (UI) | RESEARCH.md §Pattern 1 (Skizze) | NEU |
| `portal/src/viewers/core/ChildDialog.tsx` | Base-Layout für Property-Editor | request-response (UI) | RESEARCH.md §Pattern 1 (Skizze) | NEU |

### Frontend — OCtrl-Familie (alle NEU)

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `portal/src/viewers/core/octrl/OCtrlVariable.tsx` | Text/Number-Input | request-response (UI) | shadcn `<Input>`; siehe `tbx_stzrim/portal/src/pages/tree-builder/editable-cell.tsx` als Edit-Pattern-Inspiration | konzeptuell |
| `portal/src/viewers/core/octrl/OCtrlBool.tsx` | Checkbox | request-response (UI) | shadcn `<Checkbox>` | konzeptuell |
| `portal/src/viewers/core/octrl/OCtrlEnum.tsx` | Dropdown/RadioGroup | request-response (UI) | shadcn `<Select>` | konzeptuell |
| `portal/src/viewers/core/octrl/OCtrlLink.tsx` | Objekt-Referenz + Combobox | request-response (UI) | shadcn `<Combobox>` (cmdk-basiert) | konzeptuell |
| `portal/src/viewers/core/octrl/OCtrlList.tsx` | Sub-Object-Tabelle | request-response (UI) | shadcn `<Table>` + `@tanstack/react-table` (siehe 3fls Dep) | konzeptuell |
| `portal/src/viewers/core/octrl/OCtrlMethod.tsx` | Button → Backend-Call | request-response | siehe `tbx_stzrim/portal/src/pages/tree-creator/hooks/use-create-tree-creator-node.ts` als useMutation-Pattern | konzeptuell |
| `portal/src/viewers/core/octrl/OCtrlTabViewer.tsx` | Tab-Container | request-response (UI) | shadcn `<Tabs>` | konzeptuell |
| `portal/src/viewers/core/octrl/OCtrlColorRef.tsx` | Color-Picker | request-response (UI) | `react-colorful` (4 KB Lib) | NEU |
| `portal/src/viewers/core/octrl/OCtrlLogFont.tsx` | Font-Picker | request-response (UI) | **kein Analog** — minimal mit Select+Input | NEU |

### Frontend — 12 konkrete Viewer (alle NEU)

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `portal/src/viewers/PSimulator/PSimulatorViewer.tsx` | Top-Level Modell-Übersicht | request-response (UI) | `OSim2004/inc/PSimulatorViewer.h` als Konzept; React-Pattern siehe ChildDialog-Skizze | NEU |
| `portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerStd.tsx` | Liste + Property | request-response (UI) | `OSim2004/inc/PDlplViewerStd.h` + `tbx_stzrim/portal/src/pages/tree-builder/spreadsheet-panel.tsx` als Layout-Vorbild | konzeptuell |
| `portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx` | Graphisch (React Flow) | request-response (UI) | `OSim2004/inc/PDlplViewerGObj.h` + `tbx_stzrim/portal/src/features/graph-viewer/graph-canvas.tsx` als Page-Struktur-Vorbild (sigma → React Flow Mapping) | konzeptuell |
| `portal/src/viewers/PGObjBase/PGObjBaseViewer.tsx` | Generischer Property-Editor (Fallback) | request-response (UI) | `OSim2004/inc/PGObjBaseViewer.h`; rendert alle OCtrls aus PropertySchema | NEU |
| `portal/src/viewers/PRess/PRessBelegMatrixViewer.tsx` | Belegungsressourcen-Matrix | request-response (UI) | `OSim2004/inc/PRessBelegMatrixViewer.h`; Tabellen-Layout via shadcn `<Table>` + `@tanstack/react-table` | NEU |
| `portal/src/viewers/PRess/PRessMengeMatrixViewer.tsx` | Mengenressourcen-Matrix | request-response (UI) | `OSim2004/inc/PRessMengeMatrixViewer.h` | NEU |
| `portal/src/viewers/PRess/PRessVerknuepfungViewer.tsx` | Ressourcen-Verknüpfung | request-response (UI) | `OSim2004/inc/PRessVerknuepfungViewer.h` | NEU |
| `portal/src/viewers/PDlpl/PDlplBetriebsmittelViewer.tsx` | Knoten ↔ Betriebsmittel | request-response (UI) | `OSim2004/inc/PDlplBetriebsmittelViewer.h` | NEU |
| `portal/src/viewers/PDlpl/PDlplPersonalViewer.tsx` | Knoten ↔ Personal | request-response (UI) | `OSim2004/inc/PDlplPersonalViewer.h` | NEU |
| `portal/src/viewers/AZeit/AEinsatzWunschViewer.tsx` | Schicht-Editor | request-response (UI) | `OSim2004/inc/AEinsatzWunschViewer.h` | NEU |
| `portal/src/viewers/AZeit/AKapBedViewer.tsx` | Kapazitätsbedarf | request-response (UI) | `OSim2004/inc/AKapBedViewer.h` | NEU |
| `portal/src/viewers/AZeit/AGruppeViewer.tsx` | Personal-Gruppen | request-response (UI) | `OSim2004/inc/AGruppeViewer.h` | NEU |

### Frontend — GraphObject-Basis + Sidebar + Stores + Snapshot (alle NEU)

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `portal/src/graph/core/GObject.ts` | Basis-Knoten-Klasse | data-model | `OSim2004/inc/GraphObj.h` Z.341 (`GObject`) | NEU |
| `portal/src/graph/core/GObjLink.ts` | Knoten mit In/Out-Listen | data-model | `OSim2004/inc/GraphObj.h` Z.533 (`GObjLink`) | NEU |
| `portal/src/graph/core/GLink.ts` | Kante | data-model | `OSim2004/inc/GraphObj.h` Z.1004 (`GLink`) | NEU |
| `portal/src/graph/core/ReactFlowAdapter.tsx` | GObject → React-Flow-Mapping | transform (UI) | RESEARCH.md §Pattern 5 (Skizze) | NEU |
| `portal/src/sidebar/ModelTree.tsx` | Workspace-Tree (react-arborist) | request-response (UI) | `tbx_stzrim/portal/src/pages/tree-builder/index.tsx` + `wbs-row.tsx` (Inspiration für DnD/Inline-Rename, NICHT 1:1 — 3fls hat eigene Lib statt arborist) | konzeptuell |
| `portal/src/sidebar/tree-builder.ts` | Wire → Arborist-TreeNode | transform | RESEARCH.md §Pattern 4 (Skizze) | NEU |
| `portal/src/stores/model-store.ts` | Modell-State + Undo + dirty | event-driven | `tbx_stzrim/portal/src/stores/tree-builder-store.ts` (zustand-Pattern, KEIN zundo dort) + RESEARCH.md §Example 4 für zundo-Integration | konzeptuell |
| `portal/src/stores/lock-store.ts` | Lock-Token + Heartbeat-Timer | event-driven | `tbx_stzrim/portal/src/stores/sidebar-store.ts` (zustand+persist-Pattern) | konzeptuell |
| `portal/src/stores/viewer-store.ts` | Selection + ViewerHint | event-driven | `tbx_stzrim/portal/src/stores/viewer-roots-store.ts` (pro-Viewer-State + persist) | konzeptuell |
| `portal/src/snapshot/db.ts` | dexie-Setup | file-I/O | **kein 3fls-Analog**; RESEARCH.md §Example 5 | NEU |
| `portal/src/snapshot/snapshot-service.ts` | save/restore + Sequence-Counter | file-I/O | RESEARCH.md §Example 5 + Pitfall 6 | NEU |

### Tests (Backend + Frontend)

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `tests/backend/conftest.py` | Test-DB-Fixture + Mocked Firebase | startup | `tbx_stzrim/tests/conftest.py` | exact (Subset; ohne SAP/Stripe/Bridge) |
| `tests/backend/test_auth.py` | Auth + Bootstrap + Isolation | integration | `tbx_stzrim/tests/test_auth_middleware.py` + `test_tenant_isolation.py` | exact |
| `tests/backend/test_models_upload.py` | OTX-Upload | integration | **kein Analog** — neu | NEU |
| `tests/backend/test_models_save.py` | Save-back + Versionierung | integration | **kein Analog** | NEU |
| `tests/backend/test_lock.py` | Lock-Acquire/Heartbeat/Stale | integration | **kein Analog** | NEU |
| `tests/backend/test_otx_roundtrip.py` | Dummy/Fertigungsstruktur1/Bosch2 Roundtrip | integration | **kein Analog** | NEU (Wave 0 Coverage-Gate) |
| `portal/vitest.config.ts` | Vitest-Config | config | `tbx_stzrim/portal/vitest.config.ts` | exact |
| `portal/src/viewers/core/octrl/__tests__/*.spec.tsx` | OCtrl-Component-Tests | unit | `tbx_stzrim/portal/src/__tests__/` (Pattern) | konzeptuell |
| `portal/src/stores/__tests__/model-store.spec.ts` | Store-Tests | unit | `tbx_stzrim/portal/src/stores/__tests__/*` (Pattern) | konzeptuell |
| `portal/playwright.config.ts` + `portal/e2e/modeling-flow.spec.ts` | E2E | e2e | **kein 3fls-Analog** (3fls hat puppeteer, kein Playwright) | NEU |

### Infrastruktur

| Neue Datei | Rolle | Data Flow | Closest Analog | Match |
|------------|-------|-----------|----------------|-------|
| `docker-compose.yml` (Update) | Service-Stack | config | `tbx_stzrim/docker-compose.yml` | konzeptuell (postgres + firebase-emulator + minio + api + portal) |
| `Dockerfile` (Update) | Backend-Multi-Stage | config | `tbx_stzrim/Dockerfile` | exact |
| `.env.example` | Env-Template | config | `tbx_stzrim/.env.example` (zu lesen) | exact |
| `scripts/wait-healthy.sh` | docker-health-Wait | utility | **kein Analog** | NEU |

### Engine-Wave 0 (in osim-engine, NICHT in osim-ui)

| Datei | Rolle | Status |
|-------|-------|--------|
| `osim-engine/engine/src/osim_engine/io/otx_writer.py` | OTX-Writer | **EXISTIERT BEREITS** (1125 LoC, verifiziert in RESEARCH.md Summary). Wave 0 ist **Verifikation** (Roundtrip-Coverage gegen Dummy/Fertigungsstruktur1/Bosch2), nicht Implementierung. Etwaige Loader-Lücken werden im Engine-Repo gefixt, nicht in osim-ui. |

---

## Pattern Assignments

### `app/main.py` (API-Bootstrap, request-response)

**Analog:** `tbx_stzrim/main.py`

**Imports + Lifespan-Skelett** (Zeilen 17–116, vereinfacht für osim-ui):
```python
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.schemas.common import ProblemDetail
from app.api.v1.health import router as health_router
from app.api.v1.router import api_router
from app.auth.middleware import TenantAuthMiddleware
from app.core.config import settings
from app.core.logging import configure_logging

_logger = structlog.get_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # osim-ui-spezifisch: kein BridgeClient, kein GraphService.
    # Optional: StorageClient (Minio) hier initialisieren und auf app.state.storage hängen.
    yield
```

**App-Factory** (Zeilen 120–241, mit RFC-7807-Error-Handler):
```python
def create_app() -> FastAPI:
    configure_logging()
    from app.auth.firebase import initialize_firebase
    initialize_firebase()

    app = FastAPI(
        title="osim-ui API",
        version="0.1.0",
        description="Web-UI Orchestrator für osim-engine",
        lifespan=lifespan,
        default_response_class=ORJSONResponse,
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        # Plan 24-04.2 D-OLS-F4 Pattern: structured detail wird in {code,title,detail} entpackt
        code: str | None = None
        title: str = "Error"
        detail_text: str = ""
        if isinstance(exc.detail, str):
            detail_text = exc.detail
            title = exc.detail or "Error"
        elif isinstance(exc.detail, dict):
            code = exc.detail.get("code")
            detail_text = str(exc.detail.get("message") or exc.detail)
            title = code or "Error"
        else:
            detail_text = str(exc.detail)
        problem = ProblemDetail(
            type="about:blank", title=title, status=exc.status_code,
            detail=detail_text, instance=str(request.url), code=code,
        )
        return ORJSONResponse(status_code=exc.status_code, content=problem.model_dump(),
                              media_type="application/problem+json")

    app.add_middleware(TenantAuthMiddleware)
    app.include_router(health_router)
    app.include_router(api_router, prefix="/api/v1")
    return app

app = create_app()
```

**Anmerkungen für Executor:**
- 3fls hat einen externen `CORSWrapper` (Z.276–356); für Phase 1 reicht Starlette's `CORSMiddleware` mit `cors_origins`-Allowlist. Den CORSWrapper-Pattern bei späterem CORS-Bug aus 3fls übernehmen.
- KEINE Rate-Limit-Middleware in Phase 1 (3fls hat `TenantRateLimiter`; weglassen — kein Bedarf bei Single-Editor-Lock).
- KEINE GZipMiddleware in Phase 1 (3fls hat sie auskommentiert; folge dieser Entscheidung).
- `lifespan` ist Pflicht-Pattern (3fls Z.44–116) — auch wenn leer, weil späterer Code (Phase 2+) dort BackgroundTasks startet.

---

### `app/core/config.py` (Config, startup)

**Analog:** `tbx_stzrim/app/core/config.py` (vollständig oben gelesen)

**Konkret zu übernehmen** (Z.1–34):
```python
import os
from dotenv import load_dotenv
load_dotenv()

class Settings:
    def __init__(self) -> None:
        self.database_url: str = os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://osim_dev:osim_dev_password@localhost:5432/osim_ui",
        )
        if self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace(
                "postgresql://", "postgresql+psycopg://", 1
            )

        self.firebase_project_id: str = os.environ.get("FIREBASE_PROJECT_ID", "osim-dev")
        self.environment: str = os.environ.get("ENVIRONMENT", "dev")

        cors_raw = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
        self.cors_origins: list[str] = [o.strip() for o in cors_raw.split(",") if o.strip()]

        self.firebase_auth_emulator_host: str | None = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")

        # osim-ui-spezifisch:
        self.storage_backend: str = os.environ.get("STORAGE_BACKEND", "minio")
        self.minio_endpoint: str = os.environ.get("MINIO_ENDPOINT", "localhost:9000")
        self.minio_access_key: str = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
        self.minio_secret_key: str = os.environ.get("MINIO_SECRET_KEY", "minioadmin")
        self.minio_bucket: str = os.environ.get("MINIO_BUCKET", "osim-ui-dev")

        # Lock-TTL aus D-13 (15 min)
        self.lock_ttl_seconds: int = int(os.environ.get("LOCK_TTL_SECONDS", "60"))  # initial; Heartbeat hält wach
        self.lock_max_inactivity_seconds: int = int(os.environ.get("LOCK_MAX_INACTIVITY_SECONDS", "900"))

settings = Settings()
```

**Anmerkungen:**
- Alle 3fls-Felder für Stripe/SMTP/Bridge/Graph-Settings (Z.39–86 des Originals) **WEGLASSEN** — nicht osim-relevant.
- `auth_tenant_fallback_default` (Z.84) in osim-ui NICHT übernehmen — D-17 (Lazy Bootstrap) liefert echten tenant_id, Fallback unnötig.

---

### `app/core/database.py` (DB-Engine + get_db, request-response)

**Analog:** `tbx_stzrim/app/core/database.py` (vollständig oben gelesen)

**Engine-Setup-Pattern** (Z.23–47 — kritischer Phase-19-Fix für search_path-Persistenz):
```python
engine = create_engine(
    settings.database_url,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_reset_on_return="rollback",
    pool_timeout=10,
    # Phase 19-final fix (2026-05-16): pin default search_path at connection-startup
    # via PostgreSQL `options=-c search_path=...`. Survives commit/rollback/reset.
    connect_args={
        "options": '-c search_path="public"',  # osim-ui: default = public; tenant-SET kommt per Request
    },
)
```

**get_db Dependency** (Z.114–137 — Schema-per-Tenant):
```python
import re
_SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_]+$")

async def get_db(request: Request):
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise ValueError("No tenant_id in request state")
    if not _SLUG_PATTERN.match(tenant_id):
        raise ValueError(f"Invalid tenant slug: {tenant_id}")
    schema_name = f"tenant_{tenant_id}"
    with engine.connect() as conn:
        conn.execute(text(f"SET search_path TO {schema_name}, public"))
        try:
            yield conn
        finally:
            conn.execute(text("SET search_path TO public"))
```

**Anmerkungen:**
- 3fls hat `get_tenant_status()` und `get_tenant_subscription_info()` (Z.63–111) mit cachetools-TTLCache; für osim-ui Phase 1 **vereinfachen**: nur `get_tenant_status` mit `TTLCache(maxsize=256, ttl=300)`, der bei Bootstrap-Existenz `"active"` zurückgibt.
- Die `connect_args` `options` ist der **wichtigste 3fls-Lesson-Learned** — RESEARCH.md Pitfall #1 (search_path-Leak) ist im 3fls-Code bereits gelöst über Doppel-Defense (startup-options + per-request-SET). Genau übernehmen.
- **WICHTIGER KONFLIKT mit RESEARCH.md Example 2:** RESEARCH zeigt `async with SessionLocal()` + `SET LOCAL search_path` innerhalb Transaction. 3fls macht stattdessen sync `engine.connect()` + persistent SET vor yield + Reset-SET nach yield. Beide Wege funktionieren; **bevorzuge 3fls-Pattern** weil battle-tested (Phase 19 final fix). `SET LOCAL` wäre theoretisch sauberer, aber 3fls hat damit Probleme gehabt (siehe Z.36–43-Kommentar).

---

### `app/auth/middleware.py` (TenantAuthMiddleware, request-response)

**Analog:** `tbx_stzrim/app/auth/middleware.py` (vollständig oben gelesen, Z.1–209)

**Pure-ASGI-Klasse** (Z.37–177, gekürzt — KEIN BaseHTTPMiddleware!):
```python
import asyncio
import json
import structlog
from firebase_admin import auth

from app.auth.firebase import verify_token
from app.core.config import settings

WHITELIST_PATHS = frozenset({
    "/", "/health", "/docs", "/openapi.json", "/redoc", "/favicon.ico",
})

class TenantAuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in WHITELIST_PATHS:
            await self.app(scope, receive, send)
            return

        if scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return

        headers = dict(
            (k.decode("latin-1") if isinstance(k, bytes) else k,
             v.decode("latin-1") if isinstance(v, bytes) else v)
            for k, v in scope.get("headers", [])
        )
        auth_header = headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            await self._send_error(scope, receive, send, 401, "Missing token")
            return

        token = auth_header[7:]
        try:
            # 3fls-Lesson: verify_token ist SYNC -> in to_thread wrappen,
            # damit der Event-Loop frei bleibt
            decoded = await asyncio.to_thread(verify_token, token)
        except auth.ExpiredIdTokenError:
            await self._send_error(scope, receive, send, 401, "Token expired")
            return
        except (auth.InvalidIdTokenError, Exception):
            await self._send_error(scope, receive, send, 401, "Invalid token")
            return

        # osim-ui-Erweiterung gegenüber 3fls: Lazy-Bootstrap wenn kein tenant_id im Token
        tenant_id = decoded.get("tenant_id")
        if not tenant_id:
            # Lazy-Bootstrap via Service (idempotent dank CREATE SCHEMA IF NOT EXISTS + ON CONFLICT)
            from app.services.auth_service import bootstrap_tenant_if_missing
            tenant_id = await bootstrap_tenant_if_missing(
                uid=decoded["uid"], email=decoded.get("email", "")
            )

        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["tenant_id"] = tenant_id
        scope["state"]["user_role"] = decoded.get("role", "user")
        scope["state"]["user_email"] = decoded.get("email", "")
        scope["state"]["user_uid"] = decoded.get("uid", decoded.get("user_id", ""))

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            tenant_id=tenant_id, user_email=decoded.get("email", ""),
            method=scope.get("method", ""), path=path,
        )
        await self.app(scope, receive, send)

    @staticmethod
    async def _send_error(scope, receive, send, status_code: int, detail: str):
        body = json.dumps({"detail": detail}).encode("utf-8")
        response_headers = [
            [b"content-type", b"application/json"],
            [b"content-length", str(len(body)).encode("utf-8")],
        ]
        await send({"type": "http.response.start", "status": status_code, "headers": response_headers})
        await send({"type": "http.response.body", "body": body})
```

**Anmerkungen:**
- 3fls hat zusätzlich Subscription/Grace-Period-Logik (Z.121–158); für osim-ui **weglassen** (kein Billing in Phase 1).
- 3fls hat `auth_tenant_fallback_default` (Z.99); für osim-ui **weglassen** (siehe config.py-Pattern oben).
- Die `asyncio.to_thread(verify_token, ...)`-Wrap (Z.88) ist Phase-17.8.5-Lesson — übernehmen.
- WHITELIST in osim-ui: KEIN `/api/v1/webhooks/stripe` (kein Stripe).

---

### `app/auth/firebase.py` (Firebase-Init, startup)

**Analog:** `tbx_stzrim/app/auth/firebase.py` — **1:1 übernehmen** (Z.1–56, vollständig oben gezeigt). Nur `firebase_project_id` aus eigener config lesen.

---

### `app/auth/dependencies.py` (FastAPI-Deps)

**Analog:** `tbx_stzrim/app/auth/dependencies.py` — **1:1 übernehmen** (Z.1–40, oben gezeigt).

**Excerpt:**
```python
def get_current_user(request: Request) -> CurrentUser:
    try:
        return CurrentUser(
            tenant_id=request.state.tenant_id,
            role=request.state.user_role,
            email=request.state.user_email,
            uid=request.state.user_uid,
        )
    except AttributeError:
        raise HTTPException(status_code=401, detail="Not authenticated")

def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Insufficient permissions. Admin role required.")
    return user
```

---

### `app/auth/router.py` (`/api/v1/auth/me`)

**Analog:** `tbx_stzrim/app/auth/router.py` — **mit Lazy-Bootstrap-Erweiterung**

**3fls-Original** (Z.12–25):
```python
router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/me", response_model=AuthMeResponse)
async def auth_me(user: CurrentUser = Depends(get_current_user)) -> AuthMeResponse:
    return AuthMeResponse(tenant_id=user.tenant_id, role=user.role.value, email=user.email)
```

**osim-ui-Erweiterung:** Da der Lazy-Bootstrap bereits in der Middleware passiert (siehe oben), bleibt `/auth/me` minimal. Optional zusätzlich `tenant_status` aus DB lesen für Frontend-AuthProvider (siehe `auth-provider.tsx` Z.62 — `tenant_status`-Field wird erwartet):
```python
@router.get("/me", response_model=AuthMeResponse)
async def auth_me(
    user: CurrentUser = Depends(get_current_user),
    db = Depends(get_db),
) -> AuthMeResponse:
    # Optional: tenant_status aus DB; in Phase 1 reicht "active" (Lazy-Bootstrap stellt das sicher)
    return AuthMeResponse(
        tenant_id=user.tenant_id, role=user.role.value, email=user.email,
        tenant_status="active",
    )
```

---

### `app/api/v1/router.py` (Router-Aggregator)

**Analog:** `tbx_stzrim/app/api/v1/router.py` — Pattern übernehmen, viel kleiner

**3fls-Pattern** (Z.13–80, drastisch reduziert für osim-ui):
```python
from fastapi import APIRouter

from app.auth.router import router as auth_router
from app.api.v1.models import router as models_router
from app.api.v1.locks import router as locks_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(models_router, prefix="/models", tags=["models"])
api_router.include_router(locks_router, tags=["locks"])  # prefix in router selbst
```

**Anmerkungen:** Keine billing/admin/bom/graph/kpis-Router. Health wird in `main.py` separat eingebunden (3fls-Pattern Z.236).

---

### `app/api/v1/health.py` (`/health`)

**Analog:** `tbx_stzrim/app/api/v1/health.py` — **vereinfachen** (keine GCS-Check, evtl. Minio-Check)

**Excerpt (3fls Z.34–65 vereinfacht):**
```python
@router.get("/health")
async def health():
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        log.warning("db_health_check_failed", exc_info=True)

    status = "ok" if db_ok else "degraded"
    return {"status": status, "db": "connected" if db_ok else "disconnected", "version": "0.1.0"}
```

**Anmerkungen:** Optional Storage-Check (`StorageService.ping()`) in `/readiness` (separater Endpoint), nicht in `/health`.

---

### `app/api/schemas/common.py` (ProblemDetail RFC 7807)

**Analog:** `tbx_stzrim/app/api/schemas/common.py` — **ProblemDetail-Block 1:1 übernehmen** (Z.41–64, oben gezeigt)

**Anmerkungen:** PaginationMeta, FreshnessMeta, EnvelopeResponse in Phase 1 nicht zwingend nötig — aber sinnvoll für Konsistenz mit späteren Phasen. `code: str | None` (Z.60) ist die Plan-24-04.2-Lesson, übernehmen!

---

### `app/services/auth_service.py` (Tenant-Bootstrap)

**Kein Analog** in 3fls (Single-Tenant per Phase-17.8.1). Folge RESEARCH.md Pitfall #2 + Example 1 + CONTEXT D-17.

**Skelett:**
```python
import structlog
from sqlalchemy import text
from app.core.database import engine

log = structlog.get_logger(__name__)

async def bootstrap_tenant_if_missing(uid: str, email: str) -> str:
    """Idempotent: CREATE SCHEMA IF NOT EXISTS + ON CONFLICT für users-Insert.

    Returns: tenant_id (z.B. "tenant_{uid}")
    """
    tenant_id = uid  # Convention: tenant_id == firebase_uid in Phase 1 (Self-Service)
    schema = f"tenant_{tenant_id}"

    with engine.begin() as conn:
        # 1. Schema anlegen (idempotent)
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))

        # 2. Alembic-Tabellen im neuen Schema anlegen.
        # MVP: explizites SQL für models + model_locks; Phase 2 ersetzt mit
        # Alembic-Programmatic-Upgrade pro Schema.
        conn.execute(text(f'SET search_path TO "{schema}", public'))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS models (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                created_by_uid TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS model_locks (
                model_id UUID PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
                owner_user_uid TEXT NOT NULL,
                acquired_at TIMESTAMP NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL,
                token UUID NOT NULL DEFAULT gen_random_uuid()
            )
        """))

        # 3. User in public.users registrieren (ON CONFLICT für Race aus Pitfall #2)
        conn.execute(text("""
            INSERT INTO public.users(firebase_uid, email, tenant_id)
            VALUES(:u, :e, :t)
            ON CONFLICT (firebase_uid) DO NOTHING
        """), {"u": uid, "e": email, "t": tenant_id})

    log.info("tenant.bootstrapped", tenant_id=tenant_id, uid=uid)
    return tenant_id
```

**Anmerkungen für Executor:** Phase 1 nutzt **explizites Per-Schema-DDL** (kein Alembic-Programmatic-Upgrade) für Einfachheit. Phase 2+ ersetzt mit `alembic.command.upgrade(config, "head")` mit `search_path`-Override.

---

### `app/services/model_service.py` (OTX-Upload + JSON-Tree + Save-back)

**Kein direkter Analog.** Konzeptuelle Verwandte: `tbx_stzrim/app/bom/router.py` für File-Upload-Pattern (zu lesen für `UploadFile`-Handling).

**Skelett basierend auf RESEARCH.md §Pattern 3 + osim_engine-API:**
```python
import uuid
from pathlib import Path
from fastapi import UploadFile
from osim_engine.io.otx_loader import load_otx_file
from osim_engine.io.otx_writer import dump_simulator_to_otx
from app.services.storage import StorageService
from app.services.otx_json_tree import load_to_wire, wire_to_otx

class ModelService:
    def __init__(self, storage: StorageService, db):
        self.storage = storage
        self.db = db

    async def upload_otx(self, file: UploadFile, tenant_id: str, user_uid: str) -> dict:
        model_id = str(uuid.uuid4())
        # Latin-1-Decode (siehe Pitfall #3!)
        content = await file.read()
        text = content.decode("latin-1")
        storage_key = f"tenants/{tenant_id}/models/{model_id}/original.otx"
        await self.storage.put_object(storage_key, text.encode("latin-1"))

        # Engine-Parse zur Wire-Form
        # Achtung: load_otx_file erwartet Path -> temp-File schreiben oder erweitern
        ...
```

**Anmerkungen:**
- `load_otx_file()` signatur erwartet ein Path-Argument (siehe RESEARCH.md Engine-Pfad). Entweder Temp-File schreiben oder Engine um `load_otx_string(text)` erweitern (kleines Engine-PR).
- **Pitfall #3 zwingend beachten:** `encoding="latin-1"` durchgängig.
- Save-back-Pfad: `tenants/{tid}/models/{mid}/v_{timestamp}.otx`. Original-Pfad bleibt unverändert (D-14).

---

### `app/services/lock_service.py` + `app/api/v1/locks.py` (Single-Editor-Lock)

**Kein Analog.** Folge RESEARCH.md §Example 3 + Pitfall #4.

**Excerpt aus RESEARCH §Example 3** (oben gezeigt, Z.1057–1116 der RESEARCH.md):
```python
@router.post("/models/{model_id}/lock", response_model=LockOut)
async def acquire_lock(model_id: UUID, user_uid: str = Depends(get_user_uid),
                       db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    expires = now + timedelta(seconds=60)
    await db.execute(text(
        "DELETE FROM model_locks WHERE model_id = :mid AND expires_at < :now"
    ), {"mid": model_id, "now": now})
    try:
        result = await db.execute(text("""
            INSERT INTO model_locks(model_id, owner_user_uid, expires_at)
            VALUES (:mid, :uid, :exp)
            RETURNING token, expires_at
        """), {"mid": model_id, "uid": user_uid, "exp": expires})
        row = result.one()
        return LockOut(token=row.token, expires_at=row.expires_at)
    except IntegrityError:
        # 409 mit owner-Info; siehe RESEARCH Z.1077–1087
        ...
```

**Anmerkungen:**
- 3fls hat KEIN Lock-Pattern (kein Multi-Editor-Use-Case dort).
- DB-Row (NICHT Redis/In-Memory) wegen Pitfall #4 + Anti-Pattern aus RESEARCH.md.
- TTL: 60 s initial, Heartbeat alle 30 s verlängert (D-13: 15 min Max-Inaktivität — wird über Cleanup-Endpoint enforced, nicht per Lock-Row).

---

### `pyproject.toml` (Python-Deps)

**Analog:** `tbx_stzrim/pyproject.toml` (oben gezeigt, Z.1–96)

**osim-ui-Anpassungen:**
```toml
[project]
name = "osim-ui"
version = "0.1.0"
requires-python = ">=3.13"

dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "sqlalchemy[asyncio]>=2.0",
    "alembic>=1.14",
    "psycopg[binary]>=3.2",
    "python-dotenv>=1.0",
    "firebase-admin>=7.2.0",
    "structlog>=25.5.0",
    "cachetools>=7.0.5",
    "httpx>=0.28.1",
    "orjson>=3.10",
    "python-multipart>=0.0.20",  # für UploadFile
    "boto3>=1.42.69",            # Minio via S3-API
    # Engine als editable: in dev .env oder uv-source
]

[tool.uv.sources]
osim-engine = { path = "../osim-engine/engine", editable = true }

[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.25",
    "ruff>=0.8",
    "pre-commit>=4.0",
    "httpx>=0.28.1",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = ["-ra", "--strict-markers"]
filterwarnings = [
    "error::pytest.PytestUnknownMarkWarning",
]
markers = [
    "requires_docker: Test benötigt laufenden Docker-Daemon",
    "requires_postgres: Test benötigt erreichbares Postgres @ localhost:5432",
    "requires_firebase_emulator: Test benötigt Firebase Auth Emulator @ localhost:9099",
    "requires_minio: Test benötigt erreichbares Minio @ localhost:9000",
    "integration: Integration-Test mit echter DB",
]

[tool.ruff]
line-length = 120
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]
```

**Weggelassen** (gegenüber 3fls): `stripe`, `google-cloud-storage` (Phase 5+), `openpyxl`, `networkx`, `tenacity`, `pyarrow`, `typer`, `rich`, `rim-ids`.

---

### `portal/src/main.tsx` + `portal/src/app.tsx`

**Analog:** `tbx_stzrim/portal/src/main.tsx` + `app.tsx` — **1:1 mit minimalen Anpassungen**

**main.tsx (3fls Z.1–11):**
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
// "@/i18n" — Phase 1 weglassen (Sprache ist Deutsch hardcoded; i18n in Phase 6 mit RIM-Integration sinnvoll)
import { App } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**app.tsx (3fls Z.1–70, ohne GlobalExcelImportProvider):**
```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "@/auth/auth-provider";
import { useAuth } from "@/auth/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

const router = createRouter({
  routeTree,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: { auth: undefined as any },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth }} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

---

### `portal/src/auth/*` (firebase.ts, auth-provider.tsx, use-auth.ts)

**Analog:** `tbx_stzrim/portal/src/auth/*` — **alle drei Files 1:1 übernehmen** (oben vollständig gezeigt)

**Wichtige Stellen:**
- `firebase.ts` Z.14–22: Auto-Connect zum Emulator in DEV-Mode (Pitfall #9 — sicherstellen dass `import.meta.env.DEV` korrekt evaluiert; NICHT via custom env-var)
- `auth-provider.tsx` Z.46–87: `onAuthStateChanged` mit Token-Claims-Extraction + `/api/v1/auth/me`-Fetch — exakte Stelle wo `tenant_status` aus `data.tenant_status` gelesen wird → Backend muss das Feld in `AuthMeResponse` liefern (siehe `app/auth/router.py` Pattern oben)
- `use-auth.ts` Z.1–14: trivial; 1:1 übernehmen

**Anmerkungen Pitfall #8 (Auth-Race):** 3fls's `auth-provider.tsx` setzt `isLoading: true` initial und nach Resolve `isLoading: false`. Das ist die Lösung; `_authenticated.tsx` Z.11 prüft `if (context.auth.isLoading) return;`. Kein zusätzlicher `isReady`-Flag nötig — `isLoading` reicht. RESEARCH.md Z.952 schlägt extra `isReady` vor; das wäre Doppelung. **Folge 3fls-Pattern.**

---

### `portal/src/api/fetch.ts` (apiFetch)

**Analog:** `tbx_stzrim/portal/src/api/fetch.ts` — **apiFetch + ApiError 1:1**, apiFetchBlob in Phase 1 weglassen

**Excerpt (3fls Z.15–89):**
```typescript
import { auth } from "@/auth/firebase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, statusText: string, body: unknown) {
    super(`API error ${status}: ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken(false);
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let body: unknown = null;
    try {
      const text = await response.text();
      body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    } catch {}
    throw new ApiError(response.status, response.statusText, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
```

**Anmerkungen:** `getIdToken(false)` — Firebase cached/refreshed automatisch. `ApiError.status` als Property für status-spezifisches Branching im Caller — wichtig für 409 (Lock-Konflikt) vs 423 (Locked) im Save-Endpoint.

---

### `portal/src/api/error-message.ts` (DE-Toast-Mapping)

**Analog:** `tbx_stzrim/portal/src/api/error-message.ts` — **Pattern übernehmen, eigene osim-Codes definieren**

**Excerpt (3fls Z.23–135):**
```typescript
import { ApiError } from "./fetch";

const TOAST_DE: Record<string, string> = {
  // osim-ui-spezifische Codes:
  E_MODEL_LOCKED:
    "Modell wird gerade von einem anderen Nutzer bearbeitet.",
  E_LOCK_EXPIRED:
    "Ihre Bearbeitungs-Sperre ist abgelaufen. Bitte Seite neu laden.",
  E_OTX_PARSE_FAILED:
    "Die OTX-Datei konnte nicht gelesen werden. Encoding muss Latin-1 sein.",
  E_OTX_COVERAGE_INCOMPLETE:
    "Modell enthält Objekte, die nicht zurück nach OTX gespeichert werden können.",
  E_VERSION_CONFLICT:
    "Modell wurde inzwischen geändert. Bitte neu laden und Änderungen wiederholen.",
};

export function extractErrorCode(err: unknown): string {
  if (!(err instanceof ApiError) || err.body == null) return "";
  const body = err.body as { code?: unknown; detail?: unknown };
  if (typeof body.code === "string" && body.code.length > 0) return body.code;
  // ... fallback-Logik wie 3fls Z.78–92
  return "";
}

export function apiErrorMessage(err: unknown, fallback = "Fehler"): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : fallback;
  }
  const code = extractErrorCode(err);
  if (code && TOAST_DE[code]) return TOAST_DE[code];
  const body = err.body as { detail?: unknown } | null;
  if (body && typeof body.detail === "string" && body.detail.length > 0) return body.detail;
  return `${fallback} (HTTP ${err.status}).`;
}
```

---

### `portal/src/routes/_authenticated.tsx` (Auth-Guard)

**Analog:** `tbx_stzrim/portal/src/routes/_authenticated.tsx` — **1:1 übernehmen** (Z.1–27, oben gezeigt)

**Excerpt:**
```tsx
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) return;
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    // osim-ui: kein tenantStatus-Check (Lazy-Bootstrap garantiert active)
  },
  component: WorkspaceLayout,  // osim-ui-eigene Layout-Komponente statt DashboardLayout
});
```

**Anmerkungen:** Statt 3fls's `DashboardLayout` baut osim-ui ein eigenes `WorkspaceLayout` mit Header + Sidebar-Slot + Main-Content-Slot (für Sidebar-Tree + Viewer-Pane).

---

### `portal/src/routes/_authenticated/models/$id.tsx` (Workspace)

**Kein direkter Analog.** Konzeptuelle Vorbilder:
- `tbx_stzrim/portal/src/features/graph-viewer/graph-viewer-page.tsx` für Page-Layout-Struktur (Sidebar + Canvas + Toolbar)
- `tbx_stzrim/portal/src/pages/tree-builder/index.tsx` für Workspace-mit-Tree-Page-Pattern

**Skelett (aus RESEARCH §Example 6 Z.1271–1285):**
```tsx
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/models/$id")({
  component: ModelWorkspace,
});

function ModelWorkspace() {
  const { id } = Route.useParams();
  // useLockAcquire(id) — Hook startet Lock + Heartbeat, gibt frei beim Unmount
  // useModelLoad(id) — Hook lädt Wire vom Server + restored IndexedDB-Snapshot
  return (
    <div className="grid grid-cols-[280px_1fr] h-full">
      <ModelTreeSidebar modelId={id} />
      <ViewerFrame />
    </div>
  );
}
```

---

### `portal/src/stores/model-store.ts` (Zustand + zundo + Immer)

**Konzept-Analog:** `tbx_stzrim/portal/src/stores/tree-builder-store.ts` (oben Z.1–100 gezeigt) — Pattern für `create + persist + Helper-Funktionen außerhalb`. ABER: 3fls hat keinen `zundo`-Undo-Stack, kein `immer`. Diese müssen **neu eingeführt** werden.

**Skelett aus RESEARCH §Example 4 (Z.1118–1185):**
```typescript
import { create } from "zustand";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import type { ModelTreeWire } from "@/lib/octrl-types";

interface ModelStore {
  wire: ModelTreeWire | null;
  selection: number | null;
  dirty: boolean;
  loadFromWire: (wire: ModelTreeWire) => void;
  selectObject: (oid: number | null) => void;
  patchObject: (oid: number, patch: Record<string, unknown>) => void;
  deleteObject: (oid: number) => void;
  createObject: (klass: string, attrs: Record<string, unknown>) => number;
  resetDirty: () => void;
}

export const useModelStore = create<ModelStore>()(
  temporal(
    immer((set, get) => ({
      wire: null, selection: null, dirty: false,
      loadFromWire: (wire) => set((s) => {
        s.wire = wire; s.dirty = false; s.selection = wire.simulator_oid;
      }),
      // ... (siehe RESEARCH §Example 4)
    })),
    { limit: 100, partialize: (state) => ({ wire: state.wire }) },
  ),
);
```

**Anmerkungen:**
- 3fls-Pattern für **Selektoren-Hooks** (Z.1–8 von `tree-builder-store.ts` zeigt eigenständige Helper-Funktionen außerhalb des Stores) übernehmen.
- 3fls-Pattern für **persist-Middleware** (`sidebar-store.ts` Z.20–46) NICHT übernehmen für model-store — der Modell-State ist zu groß für LocalStorage; geht in IndexedDB via separatem snapshot-service.

---

### `portal/src/stores/lock-store.ts` (Lock + Heartbeat)

**Konzept-Analog:** `tbx_stzrim/portal/src/stores/viewer-roots-store.ts` (oben gezeigt) — Pattern für `zustand + persist + setter pattern`

**Skelett:**
```typescript
import { create } from "zustand";

interface LockState {
  token: string | null;
  expiresAt: Date | null;
  acquire: (modelId: string) => Promise<void>;
  heartbeat: (modelId: string) => Promise<void>;
  release: (modelId: string) => Promise<void>;
}

export const useLockStore = create<LockState>((set, get) => ({
  token: null, expiresAt: null,
  acquire: async (modelId) => {
    const { token, expires_at } = await apiFetch<{token: string, expires_at: string}>(
      `/api/v1/models/${modelId}/lock`, { method: "POST" }
    );
    set({ token, expiresAt: new Date(expires_at) });
    // Heartbeat-Timer aufsetzen: alle 30 s heartbeat() ausführen
  },
  // ...
}));
```

---

### `portal/src/snapshot/db.ts` + `snapshot-service.ts` (IndexedDB)

**Kein 3fls-Analog.** Folge RESEARCH.md §Example 5 (Z.1187–1236) wortwörtlich.

**Excerpt (RESEARCH Z.1192–1236):**
```typescript
import Dexie, { type Table } from "dexie";

interface SnapshotRow {
  modelId: string;
  timestamp: number;
  sequence: number;
  wire: ModelTreeWire;
}

class OsimDB extends Dexie {
  snapshots!: Table<SnapshotRow, [string, number]>;
  constructor() {
    super("OsimUiDB");
    this.version(1).stores({
      snapshots: "[modelId+timestamp], modelId, sequence",
    });
  }
}
export const db = new OsimDB();

let seq = 0;
export async function saveSnapshot(modelId: string, wire: ModelTreeWire): Promise<void> {
  const mySeq = ++seq;
  await db.snapshots.put({
    modelId, timestamp: Date.now(), sequence: mySeq,
    wire: structuredClone(wire),
  });
  // Cleanup: 20 letzte behalten
  const all = await db.snapshots.where("modelId").equals(modelId).reverse().sortBy("timestamp");
  if (all.length > 20) {
    await db.snapshots.bulkDelete(all.slice(20).map(s => [s.modelId, s.timestamp]));
  }
}
```

**Anmerkungen Pitfall #6 (IndexedDB-Race):** Sequence-Counter ist Pflicht; **NICHT** entfernen "weil unnötig kompliziert". Tests in `__tests__/snapshot-service.spec.ts` mit `Promise.all([save(A), save(B)])` schreiben.

---

### `portal/src/viewers/core/*` (OViewer-Foundation)

**KEIN 3fls-Analog.** Komplett neue Schicht basierend auf C++-`OViewer.h` (Konzept-Vorlage) + RESEARCH.md §Pattern 1 (Skizze).

**Pflichtlektüre vor Implementierung:** `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\inc\OViewer.h` (Z.1–540 für Konzept-Grundlage; Routing-Details als Hintergrund, NICHT als Vorlage für 1:1-Port — siehe Anti-Pattern in RESEARCH.md "1:1 MFC-Routing-Port").

**Skelett komplett aus RESEARCH §Pattern 1 (Z.455–547 der RESEARCH.md)** — Executor: ausführliche Excerpts liegen dort.

**Pro File (kurz):**

- `types.ts`: `OBaseObj`, `ViewerProps<T>`, `ViewerCommand`, `PropertyMeta`, `ClassSchema`
- `ViewerRegistry.ts`: `register(entry)`, `setFallback(C)`, `resolve(klass, hint?)` — Map-basierte Resolution mit Fallback auf `PGObjBaseViewer`
- `ClientCtrl.ts`: TS-Klasse, hält `selection` + `viewerHint`, ruft `registry.resolve()`. KEINE React-Hooks intern.
- `ViewerFrame.tsx`: React-Wrapper, holt aktuelles Object via `useModelStore`, Toolbar mit Nav-Buttons (`◄◄ ◄ ► ►► + - x =`), rendert resolved Viewer
- `ChildDialog.tsx`: Base-Layout-Component, Composition mit OCtrl-Components als Kinder

---

### `portal/src/viewers/core/octrl/*` (9 OCtrl-Components)

**KEIN 3fls-Analog** (3fls hat keine vergleichbare generische Property-Editor-Familie).

**Bibliotheken-Mapping aus RESEARCH §Pattern 2** (Z.550–574):

| OCtrl | Lib |
|-------|-----|
| OCtrlVariable | shadcn `<Input>` |
| OCtrlBool | shadcn `<Checkbox>` |
| OCtrlEnum | shadcn `<Select>` ODER `<RadioGroup>` |
| OCtrlLink | shadcn `<Combobox>` (cmdk-basiert) |
| OCtrlList | shadcn `<Table>` + `@tanstack/react-table` |
| OCtrlMethod | shadcn `<Button>` + useMutation-Pattern |
| OCtrlTabViewer | shadcn `<Tabs>` |
| OCtrlColorRef | `react-colorful` (4 KB Lib, MIT) |
| OCtrlLogFont | Eigenbau: `<Select>` + `<Input type="number">` + Toggles |

**Inspiration für Edit-Pattern (Click-to-Edit, Auto-Save-onBlur):** `tbx_stzrim/portal/src/pages/tree-builder/editable-cell.tsx` (oben Z.1–60 gezeigt) — zeigt `editing`-State, `inputRef.current?.focus()`, Tab/Enter/Arrow-Navigation. **Dieses Pattern für `OCtrlVariable` übernehmen** (Click toggles Edit-Mode).

**Common Props (alle OCtrls, aus RESEARCH §Pattern 2 Z.566–573):**
```typescript
interface OCtrlBaseProps<T> {
  value: T | null;
  onChange: (value: T | null) => void;
  schema: PropertyMeta;
  disabled?: boolean;
  "data-octrl-id"?: string;
}
```

---

### `portal/src/graph/core/*` (GraphObject-Basis)

**KEIN Analog.** Folge RESEARCH §Pattern 5 (Z.726–803) + `OSim2004/inc/GraphObj.h` (Z.341 für GObject, Z.533 für GObjLink, Z.1004 für GLink).

**Mini-Schnitt für Phase 1** (RESEARCH §Pattern 5):
- `GObject.ts`: Basis mit `id`, `position {x,y}`, `data {label, state?, viewedOid}`
- `GObjLink.ts`: `extends GObject`, mit `prev: string[]`, `next: string[]`
- `GLink.ts`: `{id, from: string, to: string, direction: GLDirection}`
- `ReactFlowAdapter.tsx`: Mapping zwischen GObject/GLink und React-Flow's `Node[]`/`Edge[]`

**Excerpt aus RESEARCH §Pattern 5 Z.768–800:**
```typescript
import { ReactFlow, type Node, type Edge } from "@xyflow/react";

export function PDurchlaufplanGraphRenderer({ plan, store }: Props) {
  const graph = useMemo(() => buildGraph(plan, store), [plan, store]);
  const reactFlowNodes: Node[] = graph.nodes.map(n => ({
    id: n.id, type: "osim", position: n.position, data: n.data,
  }));
  const reactFlowEdges: Edge[] = graph.links.map(l => ({
    id: l.id, source: l.from, target: l.to, type: "smoothstep",
  }));
  return (
    <ReactFlow
      nodes={reactFlowNodes} edges={reactFlowEdges}
      nodeTypes={{ osim: OsimCustomNode }}    // Pitfall #5: OUTSIDE component body!
      onNodeDragStop={(_, node) => store.patchPosition(node.id, node.position)}
      onConnect={(c) => store.createKante(c.source!, c.target!)}
      onlyRenderVisibleElements    // Pitfall #5: Viewport-Culling
      fitView
    />
  );
}
```

**Anmerkungen Pitfall #5:**
- `OsimCustomNode = memo(...)` mit `React.memo`
- `nodeTypes`-Map AUSSERHALB der Component
- `onNodeDragStop` mit `useCallback`

---

### `portal/src/sidebar/ModelTree.tsx` (react-arborist-Wrapper)

**Konzept-Analog:** `tbx_stzrim/portal/src/pages/tree-builder/index.tsx` + `wbs-row.tsx` (eigene Tree-Implementierung, NICHT arborist — aber lesenswert für DnD-Pattern via `@dnd-kit/core`, Inline-Rename via `inline-rename-input.tsx`, Toolbar via `toolbar.tsx`).

**Da Phase 1 react-arborist verwendet:** Vorlage ist RESEARCH §Pattern 4 (Z.692–724) für `tree-builder.ts` (Wire → Arborist-TreeNode).

**Excerpt aus RESEARCH §Pattern 4 (oben gezeigt):**
```typescript
import type { NodeApi } from "react-arborist";

interface TreeNode {
  id: string;            // "oid:42"
  oid: number;
  klass: string;
  label: string;
  children?: TreeNode[];
}

export function buildTree(wire: ModelTreeWire): TreeNode[] {
  const sim = wire.objects[wire.simulator_oid];
  return [
    {
      id: `oid:${sim.oid}`, oid: sim.oid, klass: sim.klass, label: "Modell",
      children: [
        groupNode("Auslöser", findByKlass(wire, "PAslEinzel"), wire),
        groupNode("Durchlaufpläne", findByKlass(wire, "PDurchlaufplan"), wire, ...),
        // ...
      ],
    },
  ];
}
```

---

### `tests/backend/conftest.py` (Test-Fixtures)

**Analog:** `tbx_stzrim/tests/conftest.py` (oben Z.1–120 gezeigt) — **Subset übernehmen**

**Konkret zu übernehmen:**
- `_load_dotenv_if_present()` (Z.39–102): Walk-up für `.env` (Phase-25.5-Lesson, falls Tests aus `worktrees/` laufen sollen)
- `_db_url()` + Auto-`psycopg`-Dialect (Z.105–111)
- `_db_available()` (Z.114+ ohne RG-Code), `requires_db`, `requires_firebase` Marker-Decorators
- `test_client` Fixture (httpx.AsyncClient mit Mocked Firebase-Token via Emulator-API)

**Anmerkungen:**
- 3fls hat `pytest_collection_modifyitems`-Hook für auto-skip — übernehmen.
- Markers in `pyproject.toml` registrieren (siehe oben).

---

### `tests/backend/test_auth.py`

**Analog:** `tbx_stzrim/tests/test_auth_middleware.py` (oben Z.1–80 gezeigt) — **vollständig 1:1 für WHITELIST + Missing-Token + Invalid-Token-Klassen**

**Excerpt (3fls Z.18–71):**
```python
class TestWhitelistPaths:
    def test_health_no_auth(self, test_client):
        response = test_client.get("/health")
        assert response.status_code == 200

class TestMissingToken:
    def test_missing_token_returns_401(self, test_client):
        response = test_client.get("/api/v1/auth/me")
        assert response.status_code == 401
        assert response.json()["detail"] == "Missing token"

class TestInvalidToken:
    def test_invalid_token_returns_401(self, test_client):
        response = test_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"})
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid token"
```

**osim-spezifische Ergänzungen** (kein 3fls-Vorbild):
- `test_lazy_bootstrap_parallel` — `asyncio.gather` mit 2 Calls für gleichen UID, beide müssen 200 zurückgeben (Pitfall #2)
- `test_search_path_isolation` — Tenant-A-User darf KEIN Tenant-B-Datensatz sehen (Pitfall #1)

---

## Shared Patterns

### Authentifizierung (alle FastAPI-Endpoints)

**Source:** `tbx_stzrim/app/auth/dependencies.py` + `tbx_stzrim/app/auth/middleware.py`
**Apply to:** Alle Endpoints außer `/health`, `/`, `/docs`, `/openapi.json`

```python
from fastapi import Depends
from app.auth.dependencies import get_current_user
from app.auth.schemas import CurrentUser

@router.get("/foo")
async def foo(user: CurrentUser = Depends(get_current_user)):
    # user.tenant_id, user.uid, user.email, user.role verfügbar
    ...
```

Die TenantAuthMiddleware (im `main.py` via `add_middleware`) setzt `request.state.tenant_id` etc. — der `get_current_user`-Dep liest diese.

---

### Error-Handling (alle FastAPI-Endpoints)

**Source:** `tbx_stzrim/main.py` Z.154–182 (HTTPException-Handler) + `app/api/schemas/common.py` (ProblemDetail mit `code`-Field)
**Apply to:** Alle Service-Errors → `HTTPException(status_code, detail={"code": "E_FOO", "message": "..."})`

```python
# Im Service:
from fastapi import HTTPException

if locked_by_other:
    raise HTTPException(status_code=409, detail={
        "code": "E_MODEL_LOCKED",
        "message": f"Modell wird gerade von {owner_email} bearbeitet",
    })
```

Die Frontend-`apiErrorMessage()` mappt `E_MODEL_LOCKED` automatisch auf die DE-Toast-Message.

---

### DB-Zugriff (alle Endpoints, die DB nutzen)

**Source:** `tbx_stzrim/app/core/database.py` Z.114–137 (`get_db` mit search_path)
**Apply to:** Alle Endpoints mit DB-Zugriff via `db = Depends(get_db)`

```python
from sqlalchemy import text
from app.core.database import get_db

@router.get("/models/{model_id}")
async def get_model(model_id: UUID, db = Depends(get_db)):
    # db hat bereits search_path TO tenant_X gesetzt
    result = db.execute(text("SELECT * FROM models WHERE id = :mid"), {"mid": model_id})
    ...
```

**Achtung:** 3fls verwendet sync SQLAlchemy in `async def`. Das ist OK weil psycopg3 sync schnell genug ist; bei Performance-Bedarf in Phase 2+ auf async psycopg umstellen.

---

### Frontend-Mutations (alle Edit-Operationen)

**Source:** `tbx_stzrim/portal/src/pages/tree-creator/hooks/use-create-tree-creator-node.ts` (oben gezeigt)
**Apply to:** Alle Backend-mutierenden Operationen (create/update/delete) im Frontend

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/api/fetch";
import { apiErrorMessage } from "@/api/error-message";

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation<ModelResponse, Error, UpdateModelArgs>({
    mutationFn: async ({ modelId, wire, lockToken }) =>
      apiFetch<ModelResponse>(`/api/v1/models/${modelId}`, {
        method: "PUT",
        body: JSON.stringify({ wire, lock_token: lockToken }),
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["model", vars.modelId] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Modell konnte nicht gespeichert werden"));
    },
  });
}
```

---

### Zustand-Store-Pattern (alle Client-State-Slices)

**Source:** `tbx_stzrim/portal/src/stores/viewer-roots-store.ts` (oben gezeigt) für persist+Map-Pattern; `tree-builder-store.ts` für Helper-Funktionen-außerhalb-Pattern
**Apply to:** Alle Zustand-Stores in `portal/src/stores/`

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Helper-Funktionen (NICHT im Store-Definitions-Body)
function computeDerived(state: MyState): ... { ... }

interface MyState { ... }

export const useMyStore = create<MyState>()(
  persist(
    (set) => ({ ... }),
    {
      name: "osim-mystore",
      merge: (persisted, current) => { /* defensiv normalisieren */ },
    }
  )
);
```

---

### Tests-Marker-Pattern (alle Backend-Tests mit Infrastructure-Bedarf)

**Source:** `tbx_stzrim/pyproject.toml` Z.69–80 + `tests/conftest.py` `pytest_collection_modifyitems`-Hook
**Apply to:** Tests, die Postgres/Firebase-Emulator/Minio brauchen

```python
import pytest

@pytest.mark.requires_postgres
@pytest.mark.requires_firebase_emulator
class TestLazyBootstrap:
    def test_idempotent_parallel_bootstrap(self, test_client, get_firebase_token):
        ...
```

Marker werden in `pyproject.toml` registriert; conftest auto-skipped bei fehlenden Services.

---

## No Analog Found

Files mit **keinem** vergleichbaren Pattern in tbx_stzrim — Executor folgt **ausschließlich** RESEARCH.md + C++-Header:

| File | Rolle | Quelle | Hinweis |
|------|-------|--------|---------|
| `app/services/auth_service.py` (Lazy-Bootstrap) | service, CRUD | RESEARCH §Example 1 + Pitfall #2 | 3fls Single-Tenant; osim-ui ist erstes Multi-Tenant-Repo mit Self-Service |
| `app/services/model_service.py` (OTX-Upload + JSON-Tree) | service, file-I/O + transform | RESEARCH §Pattern 3 + Engine-API | Komplett neu |
| `app/services/lock_service.py` (Lock-TTL + Heartbeat) | service, CRUD | RESEARCH §Example 3 + Pitfall #4 | DB-Row-Lock, kein 3fls-Vorbild |
| `app/services/otx_json_tree.py` (Wire-Adapter) | utility, transform | RESEARCH §Pattern 3 | OtxObject ↔ Wire |
| `app/api/v1/locks.py` | controller | RESEARCH §Example 3 | DB-Lock-Endpoints |
| `app/api/v1/models.py` | controller, file-I/O | RESEARCH §Pattern 3 | Multipart-Upload + JSON-Tree-CRUD |
| `app/db/models.py` (ORM) | model | RESEARCH §Architecture | Tenants/Users/Models/Locks ORM |
| `portal/src/viewers/core/types.ts` | data-model | RESEARCH §Pattern 1 | Komplett neu (TypeScript-Port-Foundation) |
| `portal/src/viewers/core/ViewerRegistry.ts` | utility | RESEARCH §Pattern 1 | Komplett neu |
| `portal/src/viewers/core/ClientCtrl.ts` | utility (state) | RESEARCH §Pattern 1 | Komplett neu |
| `portal/src/viewers/core/ViewerFrame.tsx` | component | RESEARCH §Pattern 1 | Komplett neu |
| `portal/src/viewers/core/ChildDialog.tsx` | component | RESEARCH §Pattern 1 | Komplett neu |
| `portal/src/viewers/core/octrl/*.tsx` (alle 9) | component | RESEARCH §Pattern 2 + C++-OCtrl-Headers + shadcn-Docs | Komplett neu |
| `portal/src/viewers/{PSimulator,PDurchlaufplan,PGObjBase,PRess,PDlpl,AZeit}/*.tsx` (alle 12) | component | C++-Viewer-Headers + RESEARCH §Architecture | Komplett neu |
| `portal/src/graph/core/{GObject,GObjLink,GLink}.ts` | data-model | C++-`GraphObj.h` Z.341/533/1004 + RESEARCH §Pattern 5 | Komplett neu |
| `portal/src/graph/core/ReactFlowAdapter.tsx` | utility, transform | RESEARCH §Pattern 5 + xyflow-Docs | Komplett neu |
| `portal/src/sidebar/tree-builder.ts` | utility, transform | RESEARCH §Pattern 4 | Komplett neu |
| `portal/src/snapshot/{db,snapshot-service}.ts` | utility, file-I/O | RESEARCH §Example 5 + Pitfall #6 | dexie-basiert, kein 3fls-Pattern |
| `portal/src/stores/model-store.ts` | store | RESEARCH §Example 4 (zundo+immer) | 3fls hat kein Undo-Pattern |
| `portal/src/stores/lock-store.ts` | store | RESEARCH §Architecture | osim-spezifisch |
| `tests/backend/test_models_upload.py`, `test_models_save.py`, `test_lock.py`, `test_otx_roundtrip.py` | test | RESEARCH §Validation + Pitfalls | osim-spezifisch |
| `portal/playwright.config.ts` + `portal/e2e/modeling-flow.spec.ts` | test | RESEARCH §Validation | 3fls hat puppeteer, nicht Playwright |

---

## Metadata

**Analog search scope:**
- `C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\app\**` (Backend Foundation, Auth, API, Services)
- `C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\portal\src\**` (Frontend Foundation, Stores, Pages, Features)
- `C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\tests\**` (Test-Fixtures, Auth-Tests)
- `C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\db\**` (Alembic-Config)
- `C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\pyproject.toml`, `main.py`, `portal/package.json`, `portal/vite.config.ts`

**Files gelesen (Volltext oder gezielte Ranges):**
- Backend: `main.py`, `app/auth/{middleware,firebase,dependencies,router}.py`, `app/core/{config,database}.py`, `app/api/v1/{router,health}.py`, `app/api/schemas/common.py`, `tests/conftest.py` (head), `tests/test_auth_middleware.py` (head), `db/alembic.ini`, `pyproject.toml`
- Frontend: `main.tsx`, `app.tsx`, `auth/{firebase.ts,auth-provider.tsx,use-auth.ts}`, `api/{fetch.ts,error-message.ts}`, `routes/{__root,_authenticated}.tsx`, `stores/{tree-builder-store,graph-viewer-store,sidebar-store,viewer-roots-store}.ts` (head), `pages/tree-builder/editable-cell.tsx` (head), `pages/tree-creator/hooks/use-create-tree-creator-node.ts`, `vite.config.ts`, `package.json`

**Pattern extraction date:** 2026-05-21
**Confidence:** HIGH für alle 3fls-Pattern-Excerpts (direkt aus Quellcode verifiziert); MEDIUM für die "Kein-Analog"-Skizzen (folgen RESEARCH.md, das selbst HIGH-Confidence ist)

---

## Special Notes for Planner

1. **Stack-Drift gegenüber RESEARCH.md** (siehe Sektion oben) muss bewusst entschieden werden — Empfehlung: 3fls folgen wo möglich (sync SQLAlchemy + psycopg3 + ASGI-Middleware + zustand+persist-Pattern für State), RESEARCH-Empfehlungen nur dort wo 3fls keinen Pattern hat (dexie, zundo, immer, react-arborist, xyflow, react-colorful).

2. **OTX-Writer Wave-0 ist Verifikation, nicht Implementierung** (RESEARCH-Summary). Plan-Wave-0 = Roundtrip-Coverage-Bericht für Dummy/Fertigungsstruktur1/Bosch2_wechseln.

3. **OViewer-/GraphObject-Schicht ist Querschnitts-Foundation** ([[graphobject-is-viewer-foundation]] Memory) — Phase-1-Code lebt in `portal/src/viewers/core/` und `portal/src/graph/core/`, NICHT in einem phase-1-spezifischen Unterordner. Phase 3+/5+ erweitert mit Subklassen.

4. **Lazy-Bootstrap-Race-Tests sind Pflicht** (Pitfall #2). Ohne `asyncio.gather`-Test in `test_auth.py` ist die Implementierung nicht abnahmebereit.

5. **search_path-Defense-in-Depth** (Pitfall #1): startup-`connect_args.options` + per-request-SET + Whitelist-Regex auf tenant_id. Alle drei sind nötig.

6. **Latin-1-Encoding** (Pitfall #3): Tests müssen Umlaut-Roundtrip prüfen. Klasse-Namen wie "Verknüpfung", Attribut-Werte mit `m_sName="Maschine Größer 5"`.

7. **3fls hat KEIN React-Flow und KEIN react-arborist** — diese Libs sind echte Greenfield-Adoptionen. Im Verlauf der Phase prüfen, ob die Default-Lib-Wahl trägt; sonst sigma/graphology + 3fls-tree-builder-Pattern als Fallback.

8. **Frontend braucht KEINE i18n in Phase 1** — Deutsch hardcoded reicht; i18n-Lib einführen wenn 3fls-Integration (Phase 7) kommt.

9. **Engine-Pfad korrigieren:** `../osim-engine/engine` (NICHT `../osim-engine` — siehe Assumption A8 in RESEARCH.md). In `pyproject.toml` `[tool.uv.sources]`-Section entsprechend setzen.
