# Deferred Items — Phase 01 (live-viewer-bridge)

Out-of-scope discoveries during execution. NOT fixed (scope boundary: only
auto-fix issues directly caused by the current task's changes).

## Pre-existing repo-weite Lint-Fehler (entdeckt in Plan 01-02)

- **Befund:** `cd osim-ui/portal && npm run lint` meldet 77 Fehler (75×
  `@typescript-eslint/no-unused-vars`, 2× `react-hooks/static-components`).
- **Betroffene Dateien (alle pre-existing, NICHT von 01-02 berührt):**
  `packages/graphobject/src/*` (DrawContext, GLink, GLinkPoint, GObjLink,
  GObject, OGraphCollection, OGraphGrid), `src/components/ui/button.tsx`,
  `src/graph/foundation/OsimNode.tsx`, `src/routes/_authenticated/index.tsx`,
  `src/routes/_authenticated/models/$id.tsx`, `src/routes/_authenticated/models/index.tsx`,
  `src/routes/login.tsx`, `src/viewers/*`, `e2e/manual-pressmenge-uat.spec.ts`,
  `src/viewers/core/ViewerFrame.tsx` (static-components).
- **Verifikation, dass NICHT durch 01-02 verursacht:**
  - Installierte `eslint@10.4.0` + `typescript-eslint@8.59.4` == Lockfile-Pin
    (keine Versions-Regression durch die jsdom-Wiederherstellung).
  - `npx eslint src/features/live-stream src/routes/_authenticated/live.tsx`
    → 0 errors, 2 warnings (die gleichen react-refresh-Warnungen wie alle
    anderen Route-Dateien, etablierte TanStack-Konvention).
- **Status:** Lint war bereits auf `main` rot. Out-of-scope für 01-02. Sollte
  in einem eigenen Cleanup-Plan adressiert werden (z.B. `_`-Prefix für bewusst
  ungenutzte Parameter, oder Rule-Konfiguration für die graphobject-1:1-Ports).

## Pre-existing: jsdom fehlte in node_modules (in 01-02 repariert)

- **Befund:** `jsdom` (devDependency `^29.0.0`, Lockfile-Pin 29.1.1) war nicht
  in `node_modules` installiert → die GESAMTE Vitest-Suite konnte nicht starten
  (`Cannot find package 'jsdom'`).
- **Aktion (Rule 3 — blocking issue, deklarierte+gepinnte Dependency, kein
  neues Paket):** `npm install jsdom@29.1.1 --no-save` aus dem Lockfile-Pin
  wiederhergestellt. Danach Baseline-Spec grün.
- **Rest-Hinweis:** `npm ci` schlägt fehl, weil das committete Lockfile mit den
  Workspace-Paketen (`@osim/graphobject*`) out-of-sync ist (pre-existing). Ein
  `npm install` zum Re-Sync des Lockfiles ist ein separater Maintenance-Schritt.

## 01-08: osim-ui-venv — psycopg-Treiber + stale uv.sources (2026-05-29)

- **Befund:** Der osim-ui-`.venv` hat keinen Postgres-DBAPI-Treiber
  (`psycopg`/`psycopg2`) installiert — Folge eines unvollständigen `uv sync`.
  Die `[tool.uv.sources]`-Editable-Referenz auf die Engine zeigt nach der
  Repo-Migration auf einen doppelten Pfad
  (`osim-engine/osim-engine/engine`), was `uv run` mit "Distribution not found"
  blockiert. Workaround in 01-08: `.venv/Scripts/python.exe -m pytest` direkt
  (das `_editable_impl_osim_engine.pth` zeigt korrekt auf `engine/src`).
- **Folgen (pre-existing, NICHT durch 01-08 verursacht):**
  - 4 Tests in `tests/backend/test_database.py` failen mit
    `ModuleNotFoundError: No module named 'psycopg'` (App-Import triggert
    `app.core.database.create_engine`). Existieren VOR 01-08.
  - 4 endpoint-Tests in `test_runs_endpoints.py` (01-08) sind mit einem
    `needs_app_import`-Guard versehen und skippen ehrlich, solange der Treiber
    fehlt — sie failen NICHT und faken keinen Pass.
- **Fix-Vorschlag (eigener Housekeeping-Plan):** `[tool.uv.sources]`-Pfad auf
  `../engine` korrigieren + `uv sync` neu fahren (zieht psycopg + die Editable-
  Engine sauber ein). Danach laufen Endpoint- + test_database-Tests wieder.
