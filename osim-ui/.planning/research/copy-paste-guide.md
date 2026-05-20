# Copy-Paste Referenzliste – Dateien & Code-Patterns

Dieses Dokument listet konkrete Dateien aus tbx_stzrim auf, die osim-ui 1:1 oder mit minimalen Anpassungen übernehmen kann.

## Authentifizierung

### ✅ 1:1 Übernehmen

**portal/src/auth/firebase.ts**
- Initialisiert Firebase App + Auth
- Emulator Auto-Connect in Dev

**portal/src/auth/auth-provider.tsx**
- onAuthStateChanged Listener
- JWT Claims Extraction (tenant_id, role)
- Tenant Status Fetch via /api/v1/auth/me
- AuthContext + Initial State

Anpassungen nur: Custom Claims umbenennen wenn nötig

**portal/src/auth/use-auth.ts**
- useAuth Hook
- AuthState Export

1:1

**portal/src/auth/.env.example**
`
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_API_BASE_URL=http://localhost:8000
`

**app/auth/firebase.py**
- initialize_firebase() (idempotent)
- verify_token(token: str) → dict

1:1

**app/auth/middleware.py**
- TenantAuthMiddleware (ASGI)
- Token Extraction + Verification
- Scope State Setup (tenant_id, user_role, user_email, user_uid)
- Whitelist Paths

Anpassungen: WHITELIST_PATHS (Stripe Webhooks entfernen wenn nicht nötig)

**app/auth/dependencies.py**
- get_tenant_id(request: Request) → str
- get_user_email(request: Request) → str

Ggf. get_user_role() + get_user_uid() hinzufügen

---

## API Client & Fetch

### ✅ 1:1 Übernehmen

**portal/src/api/fetch.ts**
- ApiError Class (status, body properties)
- apiFetch<T>(path, init) → Promise<T>
- apiFetchBlob(path, init) → Promise<{ blob, filename }>

Kritisch: ApiError.status für 404-Fallbacks in UI

**portal/src/api/client.ts**
- openapi-fetch Client
- Firebase JWT Middleware

**portal/src/api/error-message.ts**
- formatApiError(error: unknown): string
- extractErrorDetail(error.body)

1:1

---

## Vite & Config

### ✅ 1:1 Übernehmen

**portal/vite.config.ts**
`	ypescript
defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 3002,
    strictPort: true,
  },
})
`

Anpassung: Port bei Bedarf ändern

**portal/tsconfig.json**
- paths: { "@/*": ["./src/*"] }
- strict: true
- moduleResolution: "bundler"

1:1

**portal/tsconfig.app.json**
- include: ["src"], exclude: ["node_modules", "dist"]

1:1

**portal/tsconfig.node.json**
- Vite/Node types

1:1

**portal/eslint.config.js**
`javascript
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.json"],
      },
    },
    plugins: {
      react,
      "react-refresh": reactRefresh,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "react/jsx-no-target-blank": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
];
`

1:1

**portal/index.html**
- Script: main.tsx
- Div: root

1:1 (ggf. Title anpassen)

---

## React App Entry Points

### ✅ 1:1 Übernehmen

**portal/src/main.tsx**
`	ypescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import "@/i18n";
import { App } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`

Anpassung: @/i18n entfernen falls keine I18n nötig

**portal/src/app.tsx**
`	ypescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { AuthProvider } from "@/auth/auth-provider";
import { useAuth } from "@/auth/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { auth: undefined as any },
});

function InnerApp() {
  const auth = useAuth();
  return <>
    <Toaster position="top-right" richColors />
    <RouterProvider router={router} context={{ auth }} />
  </>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}
`

Anpassungen: GlobalExcelImportProvider entfernen

**portal/src/i18n/index.ts** (Optional)
- i18next init mit de/en

Falls nicht nötig: Config Deutsch als Default

---

## Routing (TanStack Router)

### ⚠️ Struktur übernehmen, Routen anpassen

**portal/src/routes/__root.tsx**
`	ypescript
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

interface RouterContext {
  auth: AuthState;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
`

1:1

**portal/src/routes/index.tsx**
- Root landing page

Anpassen für osim-ui

**portal/src/routes/login.tsx**
- Login/Sign-up page

Anpassen für osim-ui Branding

**portal/src/routes/_authenticated.tsx**
- Layout Wrapper
- beforeLoad Guard (prüft isAuthenticated)

`	ypescript
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => <AuthenticatedLayout />,
});
`

Struktur 1:1, Layout anpassen

---

## Python Backend Entry

### ✅ 1:1 Übernehmen (mit Anpassungen)

**main.py** (Auszug – Struktur)
`python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse
from app.auth.middleware import TenantAuthMiddleware
from app.api.v1.router import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Bridge Client, Graph Service, etc.
    app.state.bridge_client = BridgeClient(...)
    app.state.graph_service = GraphService(...)
    yield
    # Shutdown

app = FastAPI(
    title="osim-ui",
    version="0.1.0",
    response_class=ORJSONResponse,
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, ...)
app.add_middleware(TenantAuthMiddleware)

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(api_router, prefix="/api/v1")
`

Anpassungen: Startup/Shutdown für osim-spezifische Services

---

## Database Models & Migrations

### ✅ 1:1 Übernehmen

**db/models/base.py**
`python
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class SAPRawBase:
    # Raw Layer Mixin
    ...

class CuratedBase:
    # Curated Layer Mixin
    ...
`

Anpassung: Removed SAP-Mixins, halte nur Base + Custom Mixins

**app/core/database.py**
`python
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    settings.database_url,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_reset_on_return="rollback",
    pool_timeout=10,
    connect_args={
        "options": '-c search_path="3fls",curated,raw,public',
    },
)

async def get_db(request: Request):
    tenant_id = request.state.tenant_id
    async with SessionLocal() as session:
        await session.execute(text(f'SET search_path TO "{tenant_id}", public'))
        yield session
`

Anpassung: Default search_path, Tenant-Schema-Namen

**app/core/config.py**
`python
from dotenv import load_dotenv

class Settings:
    def __init__(self):
        self.database_url = os.environ.get(
            "DATABASE_URL",
            "postgresql+psycopg://user:pass@localhost:5432/osim_ui"
        )
        self.firebase_project_id = os.environ.get("FIREBASE_PROJECT_ID", "osim-dev")
        self.cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")]
        ...

settings = Settings()
`

1:1 (nur Werte anpassen)

**db/alembic/versions/001_initial_schema.py**
`python
def upgrade() -> None:
    op.create_table(
        'simulations',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime, server_default=func.now()),
    )

def downgrade() -> None:
    op.drop_table('simulations')
`

Template für erste Migration

**db/alembic.ini**
`ini
[alembic]
sqlalchemy.url = ...
`

1:1

---

## Docker & Deployment

### ✅ 1:1 Übernehmen

**Dockerfile** (Multi-Stage Python)
`dockerfile
FROM python:3.13-slim AS builder
...
RUN uv sync --no-dev

FROM python:3.13-slim
COPY --from=builder /app/.venv /app/.venv
...
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
`

1:1

**docker-compose.yml** (Auszug)
`yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: osim_ui
      POSTGRES_USER: osim_dev
    ports: ["5433:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  firebase-emulator:
    image: node:20-slim
    ports: ["9099:9099"]
    command: >
      npm install -g firebase-tools &&
      firebase emulators:start --project osim-dev --only auth

  api:
    build: .
    ports: ["8000:8080"]
    environment:
      DATABASE_URL: postgresql://...
      FIREBASE_PROJECT_ID: osim-dev

  portal:
    build: portal
    ports: ["3000:3000"]
    environment:
      VITE_API_BASE_URL: http://localhost:8000

volumes:
  pgdata:
`

Anpassung: Service-Namen (sapcc-2.19.0, airflow, extractor weglassen)

**.env.example**
`
DATABASE_URL=postgresql+psycopg://osim_dev:osim_dev_password@localhost:5432/osim_ui
FIREBASE_PROJECT_ID=osim-dev
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
CORS_ORIGINS=http://localhost:3000
ENVIRONMENT=dev
`

1:1 (mit osim-Werten)

---

## pyproject.toml

### ✅ Übernehmen mit Anpassungen

`	oml
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
    "structlog>=25.5.0",
    "google-cloud-storage>=3.9.0",
    "firebase-admin>=7.2.0",
    "orjson>=3.10",
    "httpx>=0.28.1",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.25",
    "ruff>=0.8",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
`

Weglassen: stripe, openpyxl, networkx, tenacity (optional), rim-ids

---

## Zusammenfassung: Priorität

### 🔥 Sofort (Tag 1)
1. App Structure: app/, db/, portal/src/
2. Auth: firebase.ts, auth-provider.tsx, middleware.py
3. Vite + TanStack Router: vite.config.ts, __root.tsx
4. FastAPI Entry: main.py, app/core/config.py
5. Database: SQLAlchemy engine, alembic.ini

### 📋 Tag 2-3
6. API Router Pattern: app/api/v1/router.py
7. React Components: Navigation, Layouts
8. Simulations Router: @router.post("/simulations/run")
9. docker-compose.yml

### 📚 Tag 4+
10. Tests (pytest, vitest)
11. Monitoring (structlog, Cloud Logging)
12. Deployment (Cloud Build, Terraform)

---

*Last updated: 2026-05-20*
