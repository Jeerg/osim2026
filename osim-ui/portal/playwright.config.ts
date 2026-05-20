// Playwright-Konfiguration fuer das osim-ui-Portal (Plan 01-10 Task 2).
//
// Strategie: Tests laufen gegen das lokale Dev-Stack (docker-compose +
// uvicorn + npm run dev). Der Playwright-Test-Runner *startet keine
// Services selbst* -- wir setzen voraus, dass der Entwickler vor dem
// Lauf `docker compose up` + `uvicorn app.main:app` + `npm run dev`
// laufen hat. Das ist sauberer als webServer in der Config, weil:
//   - docker-compose-Lifecycle ist orthogonal zum Test-Lifecycle.
//   - Firebase-Emulator-Aufstart dauert 5-10s und blockiert sonst jeden
//     Lauf, auch lokale Re-Runs.
//
// Test-Suites:
//   00-smoke.spec.ts        — Health-Check / Login-Redirect
//   01-auth-flow.spec.ts    — Register/Login via Firebase-Emulator
//   02-upload-edit-save.spec.ts — Wichtigster E2E: Upload -> Edit -> Save -> Reload
//   03-viewer-navigation.spec.ts — Alle 12 Viewer ohne Crash
//   04-lock-recovery.spec.ts — Lock-Banner + IndexedDB-Recovery-Prompt
//
// Tests skippen sich automatisch, wenn das Backend nicht erreichbar ist
// (siehe e2e/fixtures/skip-if-no-backend.ts).
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false, // Tests teilen den Firebase-Emulator -- seriell ist sicherer.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // KEIN webServer-Config. Entwickler startet selber:
  //   1) docker compose up -d   (Postgres + Firebase-Emulator + Minio)
  //   2) uv run alembic upgrade head
  //   3) uv run uvicorn app.main:app   (Terminal 1)
  //   4) cd portal && npm run dev      (Terminal 2)
  //   5) npx playwright test           (Terminal 3)
});
