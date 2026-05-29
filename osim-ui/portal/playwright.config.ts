/**
 * Playwright-Konfiguration für die End-to-End-Tests von osim-ui (Plan 01-12).
 *
 * Diese Tests laufen NICHT als Teil der Vitest-Unit-Suite. Sie setzen einen
 * laufenden docker-compose-Stack voraus (postgres + firebase-emulator + minio
 * + api + portal — siehe Plan 01-05) und prüfen die drei kritischen
 * User-Journeys der Phase 1:
 *
 *   1. modeling-flow.spec.ts    — Happy-Path (Upload → Edit → Save → Reload)
 *   2. lock-conflict.spec.ts    — Single-Editor-Lock zwischen zwei Sessions
 *   3. snapshot-restore.spec.ts — IndexedDB-Crash-Recovery-Dialog
 *
 * Ausführung:
 *   cd portal
 *   npx playwright install chromium    # einmalig
 *   npm run test:e2e                   # alle drei Specs
 *   npm run test:e2e:ui                # interaktive Playwright-UI
 *
 * Voraussetzungen vor `npm run test:e2e`:
 *   docker compose up -d
 *   bash scripts/wait-healthy.sh 90
 *   uv run alembic --config db/alembic.ini upgrade head
 *   uv run python scripts/seed_firebase_emulator.py
 *
 * Hinweis fuer Reproduzierbarkeit:
 *   fullyParallel=false + workers=1 — Tests teilen sich den docker-compose-State
 *   (Postgres-Tenant-Schema + Firebase-Emulator-User). Echte Parallelisierung
 *   erfordert per-Test-DB-Reset und ist im Phase-2-Backlog dokumentiert.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Phase-1-Specs liegen unter ./e2e; die Live-Stream-Spec (Plan 01-07,
  // AC-3/4/5) liegt vertraglich unter ./tests (PLAN-Frontmatter). testMatch
  // deckt beide Verzeichnisse ab, damit `npm run test:e2e` alle findet.
  testDir: ".",
  testMatch: ["e2e/**/*.spec.ts", "tests/**/*.spec.ts"],
  // Tests teilen sich den docker-compose-Stack — serielle Ausführung.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Timeout pro Test grosszuegig (Upload + Workspace-Load kann auf langsamen
  // Maschinen ~30 s dauern; 60 s als Sicherheits-Puffer).
  timeout: 60_000,
  expect: {
    // Default-Timeout fuer expect-Polls (z.B. expect(...).toBeVisible).
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: "http://localhost:3002",
    // Trace nur bei Re-Try (was bei retries=0 effektiv "nie" ist) plus
    // screenshot/video bei Fehler — laesst CI-Logs schlank.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Standard-Viewport; OSim-UI ist auf Desktop ausgelegt.
    viewport: { width: 1440, height: 900 },
    // Browser-Locale auf Deutsch, damit datetimeformatte etc. den
    // erwarteten Format ausgeben.
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // KEIN webServer-Block: Tests setzen voraus, dass `docker compose up`
  // bereits laeuft. Begruendung: webServer wuerde portal+api+postgres+firebase
  // separat starten muessen, was den compose-Stack dupliziert. README
  // dokumentiert die Vorbedingungen.
});
