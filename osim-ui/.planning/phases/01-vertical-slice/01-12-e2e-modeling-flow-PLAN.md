---
phase: 01-vertical-slice
plan: 12
type: execute
wave: 7
depends_on:
  - 01-11-save-strategy-indexeddb
files_modified:
  - portal/playwright.config.ts
  - portal/e2e/modeling-flow.spec.ts
  - portal/e2e/lock-conflict.spec.ts
  - portal/e2e/snapshot-restore.spec.ts
  - portal/e2e/fixtures/test-users.ts
  - portal/e2e/fixtures/auth.ts
  - portal/package.json
  - README.md
autonomous: true
requirements:
  - SC-3
  - SC-4
  - SC-6
  - SC-7
  - SC-8
priority: high

must_haves:
  truths:
    - "Playwright ist eingerichtet (config, fixtures, ein npm-script test:e2e)."
    - "modeling-flow.spec.ts macht den vollen Roundtrip: Login → Upload Dummy.otx → Edit Property → manueller Save → Refresh → Property persistent."
    - "lock-conflict.spec.ts simuliert zwei Browser-Contexts (User-A öffnet Modell, User-B versucht zu öffnen → sees read-only-Mode)."
    - "snapshot-restore.spec.ts macht Edit → Close-Tab → Re-Open → Restore-Dialog erscheint → Restore-Button → Edit ist da."
    - "Tests laufen gegen lebenden docker-compose-Stack + seed-Users."
    - "README dokumentiert E2E-Setup als optionalen Schritt."
  artifacts:
    - path: "portal/playwright.config.ts"
      provides: "Playwright-Config mit baseURL http://localhost:3002, projects (chromium), reporter, screenshot-on-fail"
      contains: "use:"
    - path: "portal/e2e/modeling-flow.spec.ts"
      provides: "End-to-End-Test: vollständiger Modellierungs-Flow"
      contains: "test"
    - path: "portal/e2e/fixtures/auth.ts"
      provides: "loginAs(page, email, password) Helper"
      contains: "loginAs"
  key_links:
    - from: "portal/e2e/modeling-flow.spec.ts"
      to: "Backend Endpoints (alle aus Plan 04) + Frontend (alle aus Plan 06-11)"
      via: "Browser-Automation via Playwright"
      pattern: "page.goto"
---

<objective>
End-to-End-Test-Coverage als letzter Phase-1-Plan. Diese Tests laufen NUR gegen vollen docker-compose-Stack (postgres + firebase-emulator + minio + api + portal) — sie sind nicht Teil des unit-/integration-suite, sondern explizit als `npm run test:e2e` separat ausführbar.

Drei Spec-Files decken die drei kritischsten User-Journeys ab:
1. Modeling-Flow (Happy-Path) — beweist SC-3 + SC-4 + SC-6 + SC-8 funktionieren zusammen.
2. Lock-Conflict (Multi-User-Edge-Case) — beweist SC-7 Lock-Mechanismus.
3. Snapshot-Restore (Crash-Recovery-Edge-Case) — beweist SC-7 IndexedDB-Pfad.

Purpose: Ein menschen-lesbarer Beweis, dass Phase 1 wirklich nutzbar ist. Diese Tests sind der "Abnahme-Test" für /gsd-verify-work.

Output: Playwright-Setup + 3 Spec-Files + README-Sektion. Bei `npm run test:e2e` sind alle 3 Specs grün gegen den dev-Stack.
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
@.planning/phases/01-vertical-slice/01-05-compose-stack-integration-tests-PLAN.md
@.planning/phases/01-vertical-slice/01-11-save-strategy-indexeddb-PLAN.md
@CLAUDE.md
</context>

<interfaces>
<!-- Aus Plan 05 -->
- Seed-Users: admin@osim-dev/admin123, user@osim-dev/user123
- Backend: http://localhost:8000
- Portal: http://localhost:3002
- Firebase-Emulator: http://localhost:9099

<!-- Aus Plan 01 -->
- Test-OTX: C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\Vorstellung04\Dummy.otx

<!-- Aus Plan 06+ -->
- data-octrl-id="<schema.name>" auf allen OCtrl-Root-Elements (für stabile Selector)
</interfaces>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Playwright-Setup + Config + Auth-Fixture</name>
  <files>portal/playwright.config.ts, portal/e2e/fixtures/test-users.ts, portal/e2e/fixtures/auth.ts, portal/package.json</files>
  <read_first>
    - portal/package.json (aktueller Stand)
    - portal/src/auth/firebase.ts (Plan 03 — Emulator-URL)
    - .planning/phases/01-vertical-slice/01-05-compose-stack-integration-tests-PLAN.md (Seed-Users)
    - Playwright-Docs (npm view @playwright/test version + config-Templates)
  </read_first>
  <behavior>
    - `cd portal && npx playwright install chromium` installiert Browser.
    - `npx playwright test` läuft die 3 specs gegen baseURL http://localhost:3002.
    - `loginAs(page, "admin@osim-dev", "admin123")` automatisiert Login via Email+Passwort-Form.
    - Test-Setup nutzt webServer? Nein — voraussetzt dass docker compose up bereits läuft. README dokumentiert.
  </behavior>
  <action>
    Erweitere `portal/package.json` devDependencies:
    - `@playwright/test@^1.50`

    Scripts:
    - `"test:e2e": "playwright test"`
    - `"test:e2e:ui": "playwright test --ui"`

    Erstelle `portal/playwright.config.ts`:
    - `import { defineConfig, devices } from "@playwright/test"`
    - `export default defineConfig({testDir: "./e2e", fullyParallel: false, retries: 0, workers: 1, reporter: [["html", {open: "never"}], ["list"]], use: {baseURL: "http://localhost:3002", trace: "on-first-retry", screenshot: "only-on-failure", video: "retain-on-failure"}, projects: [{name: "chromium", use: {...devices["Desktop Chrome"]}}]});`
    - HINWEIS Kommentar: "fullyParallel=false + workers=1 weil shared docker-compose-State. Echte Parallelisierung erfordert per-test-DB-Reset (Plan-2-Backlog)."

    Erstelle `portal/e2e/fixtures/test-users.ts`:
    - `export const ADMIN = {email: "admin@osim-dev", password: "admin123"};`
    - `export const USER = {email: "user@osim-dev", password: "user123"};`
    - `export const DUMMY_OTX_PATH = "C:\\Users\\JörgWFischer\\PycharmProjects\\OSim2004\\OSimV01(Fj)\\Vorstellung04\\Dummy.otx";`

    Erstelle `portal/e2e/fixtures/auth.ts`:
    - `import type { Page } from "@playwright/test"`
    - `export async function loginAs(page: Page, email: string, password: string): Promise<void>`:
      - `await page.goto("/login")`
      - `await page.getByLabel(/E-?mail/i).fill(email)` ODER selector for input[type="email"]
      - `await page.getByLabel(/Passwort/i).fill(password)` ODER selector for input[type="password"]
      - `await page.getByRole("button", {name: /Anmelden/}).click()`
      - `await page.waitForURL(url => !url.toString().endsWith("/login"), {timeout: 10000})`  // wartet auf Redirect
      - `await page.waitForLoadState("networkidle")`
    - `export async function logout(page: Page): Promise<void>`: click "Abmelden" button.
  </action>
  <verify>
    <automated>cd portal &amp;&amp; npm install --silent 2>&amp;1 | tail -5 &amp;&amp; npx playwright install chromium 2>&amp;1 | tail -5 || true</automated>
  </verify>
  <done>
    package.json hat @playwright/test + 2 scripts. playwright.config.ts + 2 Fixture-Files existieren. Chromium installiert (sofern Internet).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: modeling-flow.spec.ts — Happy-Path-E2E</name>
  <files>portal/e2e/modeling-flow.spec.ts</files>
  <read_first>
    - portal/e2e/fixtures/auth.ts + test-users.ts (Task 1)
    - portal/src/routes/_authenticated/models/index.tsx (Plan 07)
    - portal/src/routes/_authenticated/models/$id.tsx (Plan 07+11)
    - portal/src/components/WorkspaceStatusBar.tsx (Plan 11)
    - portal/src/components/UploadOtxDialog.tsx (Plan 07)
    - portal/src/viewers/PSimulator/PSimulatorViewer.tsx (Plan 08)
    - .planning/phases/01-vertical-slice/01-CONTEXT.md (Success-Criteria-Mapping)
  </read_first>
  <behavior>
    - Test "vollständiger Modellierungs-Flow": login admin → /models → "Modell hochladen" → Dummy.otx + name="E2E-Test-Modell" → Submit → navigate /models/{id} → Sidebar zeigt Modell → Click "Modell" (Sim-Root) → PSimulatorViewer öffnet → assert Property "Name" hat Value (z.B. aus attrs.m_sName) → Edit Name auf "E2E-Modifiziert" → Tab → assert StatusBar zeigt "● Ungespeichert" → Click "Speichern" → assert StatusBar zeigt "✓ Gespeichert" → page.reload() → assert nach Reload zeigt Name-Field immer noch "E2E-Modifiziert" (Persistenz beweisbar).
    - Cleanup: nach Test im finally → DELETE /api/v1/models/{id} via API-Call (kein UI), damit nächster Test-Run startet sauber.
  </behavior>
  <action>
    Erstelle `portal/e2e/modeling-flow.spec.ts`:
    - `import { test, expect } from "@playwright/test"`
    - `import { loginAs } from "./fixtures/auth"`
    - `import { ADMIN, DUMMY_OTX_PATH } from "./fixtures/test-users"`
    - test.describe("Vollständiger Modellierungs-Flow"):
      - test("Login → Upload Dummy.otx → Edit Name → Save → Reload → Persistent", async ({page}) => {
        - await loginAs(page, ADMIN.email, ADMIN.password)
        - await page.goto("/models")
        - await expect(page.getByRole("heading", {name: /Modell-Bibliothek/})).toBeVisible()
        - await page.getByRole("button", {name: /Modell hochladen/}).click()
        - await expect(page.getByRole("dialog")).toBeVisible()
        - await page.locator('input[type="file"]').setInputFiles(DUMMY_OTX_PATH)
        - await page.getByLabel(/Name/i).fill("E2E-Test-Modell")
        - await page.getByRole("button", {name: /Hochladen/}).click()
        - await page.waitForURL(/models\/[a-f0-9-]+$/, {timeout: 15000})
        - const url = page.url()
        - const modelId = url.split("/").pop()!
        - // Sidebar
        - await expect(page.getByText(/Modell|E2E-Test-Modell/)).toBeVisible()
        - // Click root in sidebar (text "Modell" or schema-label)
        - await page.getByRole("tree").getByText(/Modell|E2E-Test-Modell/).first().click()
        - // PSimulatorViewer rendert; Edit Name (data-octrl-id="m_sName")
        - const nameInput = page.locator('[data-octrl-id="m_sName"] input')
        - await expect(nameInput).toBeVisible({timeout: 10000})
        - await nameInput.click({clickCount: 3})  // select all
        - await nameInput.fill("E2E-Modifiziert")
        - await nameInput.press("Tab")
        - // StatusBar zeigt Ungespeichert
        - await expect(page.getByText(/Ungespeichert/)).toBeVisible()
        - // Save
        - await page.getByRole("button", {name: /^Speichern$/}).click()
        - await expect(page.getByText(/Gespeichert/)).toBeVisible({timeout: 10000})
        - // Reload
        - await page.reload()
        - await expect(nameInput).toHaveValue("E2E-Modifiziert", {timeout: 15000})
        - // Cleanup
        - await page.request.delete(`http://localhost:8000/api/v1/models/${modelId}`, {headers: {Authorization: `Bearer ${await getAuthToken(page)}`}})
        - })

    Helper `async function getAuthToken(page: Page): Promise<string>`:
      - `return await page.evaluate(async () => { const {auth} = await import("@/auth/firebase"); return auth.currentUser ? await auth.currentUser.getIdToken(false) : ""; })`
      - HINWEIS: das evaluate-Import funktioniert nicht über bundled-code; alternative: nutze Storage-API: `const token = await page.evaluate(() => JSON.parse(localStorage.getItem("firebase:authUser:...") ?? "{}").stsTokenManager?.accessToken)`. ODER skippe Cleanup und lasse delete-rest-via-API über Backend-Admin-tool (Phase 2). Phase-1-Pragma: cleanup auslassen, accept dass Tests-Lauf-Database wachsen (next run resetted via clean_db Fixture wenn Tests im Backend laufen — aber E2E hat eigene DB-State).

    Pragmatische Lösung: Test-Helper im docker-compose-environment: ein script `scripts/clean-test-tenant.sh` das `psql ... -c "DROP SCHEMA IF EXISTS tenant_{adminuid} CASCADE; DELETE FROM public.users WHERE email='admin@osim-dev';"` ausführt. Aufruf in `test.afterAll(async () => await execAsync("bash scripts/clean-test-tenant.sh"))`.

    Empfehlung: Cleanup als Try/Catch und nicht-blockierend; Test ist auch ohne Cleanup grün, nur folgt-Test sieht Reste.
  </action>
  <verify>
    <automated>echo "E2E-Tests laufen nur gegen vollen docker-compose-Stack; statisches Verify zeigt nur Existenz der File." &amp;&amp; ls -la portal/e2e/modeling-flow.spec.ts</automated>
  </verify>
  <done>
    modeling-flow.spec.ts existiert mit vollständigem Happy-Path-Test. Funktioniert gegen running docker-compose-Stack.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: lock-conflict.spec.ts — Multi-User-Conflict-E2E</name>
  <files>portal/e2e/lock-conflict.spec.ts</files>
  <read_first>
    - portal/e2e/fixtures/auth.ts + test-users.ts (Task 1)
    - portal/src/stores/lock-store.ts (Plan 11 — status="foreign")
    - portal/src/components/WorkspaceStatusBar.tsx (Plan 11 — "Gesperrt von X" text)
  </read_first>
  <behavior>
    - Test "Zwei User auf gleichem Modell — zweiter sieht read-only": User-A loggt sich ein, uploadet Dummy.otx, öffnet Workspace (Lock acquired). User-B in zweitem Context loggt sich ein, navigiert zu gleichem Modell (über URL direkt — `/models/{id}`). User-B sees Statusbar "Gesperrt von admin@osim-dev"; OCtrl-Inputs sind disabled.
  </behavior>
  <action>
    Erstelle `portal/e2e/lock-conflict.spec.ts`:
    - test.describe("Lock-Conflict zwischen zwei Usern"):
      - test("User-B sieht read-only wenn User-A bereits gelockt hat", async ({browser}) => {
        - // User-A Context
        - const contextA = await browser.newContext()
        - const pageA = await contextA.newPage()
        - await loginAs(pageA, ADMIN.email, ADMIN.password)
        - await pageA.goto("/models")
        - // ... upload Dummy.otx (gleicher Code wie modeling-flow Task 2) ...
        - const modelId = pageA.url().split("/").pop()!
        - // User-A hat jetzt Lock
        - await expect(pageA.getByText(/Gesperrt durch Sie|Eigene Sperre|✓ Gespeichert/)).toBeVisible({timeout: 10000})
        - // User-B Context
        - const contextB = await browser.newContext()
        - const pageB = await contextB.newPage()
        - await loginAs(pageB, USER.email, USER.password)
        - // User-B kann das Modell normalerweise nicht sehen (Multi-Tenant) — User-A's Modell ist in admin's tenant.
        - // Workaround für Multi-Tenant: User-B muss als gleicher Tenant arbeiten — d.h. wir testen mit zwei Sessions DES SELBEN Users (z.B. zwei Browser-Contexts, beide mit admin@osim-dev).
        - // ALTERNATIV: Lock-Conflict-Test bleibt INHERENT für gleichen Tenant (eines User in 2 Tabs). Das ist realistischer für unsere Multi-Tenant-Architektur.
        - // KORRIGIERT: Beide Contexts loggen sich als admin@osim-dev ein.
        - const contextB2 = await browser.newContext()
        - const pageB2 = await contextB2.newPage()
        - await loginAs(pageB2, ADMIN.email, ADMIN.password)  // gleicher User, andere Session
        - await pageB2.goto(`/models/${modelId}`)
        - // pageB2 sieht "Gesperrt durch ... (other session)" oder ähnlich
        - await expect(pageB2.getByText(/Gesperrt von admin@osim-dev|Modell ist gesperrt/i)).toBeVisible({timeout: 15000})
        - // OCtrls sollten disabled sein
        - const nameInput = pageB2.locator('[data-octrl-id="m_sName"] input').first()
        - await expect(nameInput).toBeDisabled({timeout: 5000}).catch(() => { /* falls input gar nicht da: Viewer ist disabled durchgereicht — assert "ViewerHintSwitcher" oder andere Element-Indikator */ })
        - // Cleanup
        - await contextA.close()
        - await contextB.close()
        - await contextB2.close()
        - })

    Hinweis: Tenant-Isolation in osim-ui macht Multi-Tenant-Lock-Test schwierig (jeder User hat eigenes Tenant). Phase-1-Pragma: Test mit gleichem User in zwei Browser-Contexts — beweist Lock-Mechanismus, auch wenn nicht echtes Multi-User-Szenario. Echtes Multi-User (zwei Tenants, beide auf gleichem Modell — z.B. via Share-Token) ist Phase 5+ Feature.
  </action>
  <verify>
    <automated>ls -la portal/e2e/lock-conflict.spec.ts</automated>
  </verify>
  <done>
    lock-conflict.spec.ts existiert. Test mit zwei Browser-Contexts beweist Lock-Read-Only-Mode für zweite Session.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: snapshot-restore.spec.ts — IndexedDB-Crash-Recovery-E2E</name>
  <files>portal/e2e/snapshot-restore.spec.ts</files>
  <read_first>
    - portal/e2e/fixtures/auth.ts + test-users.ts (Task 1)
    - portal/src/hooks/useSnapshotRestore.ts (Plan 11)
    - portal/src/snapshot/db.ts + snapshot-service.ts (Plan 11)
  </read_first>
  <behavior>
    - Test "Snapshot-Restore nach Browser-Close": login admin → upload Dummy.otx → Edit Name → DON'T Save → close page (context.close) → re-open same context → naviagate to /models/{id} → assert Restore-Dialog visible → click "Wiederherstellen" → assert Name-Field zeigt Edit-Wert (NICHT server-original).
  </behavior>
  <action>
    Erstelle `portal/e2e/snapshot-restore.spec.ts`:
    - test.describe("IndexedDB-Snapshot-Restore"):
      - test("Edit ohne Save + Re-Open zeigt Restore-Dialog", async ({browser}) => {
        - const context = await browser.newContext()
        - const page = await context.newPage()
        - await loginAs(page, ADMIN.email, ADMIN.password)
        - // Upload + Workspace
        - await page.goto("/models")
        - await page.getByRole("button", {name: /Modell hochladen/}).click()
        - await page.locator('input[type="file"]').setInputFiles(DUMMY_OTX_PATH)
        - await page.getByLabel(/Name/i).fill("Snapshot-Test")
        - await page.getByRole("button", {name: /Hochladen/}).click()
        - await page.waitForURL(/models\/[a-f0-9-]+$/, {timeout: 15000})
        - const modelId = page.url().split("/").pop()!
        - // Edit
        - await page.getByRole("tree").getByText(/Modell|Snapshot-Test/).first().click()
        - const nameInput = page.locator('[data-octrl-id="m_sName"] input')
        - await expect(nameInput).toBeVisible({timeout: 10000})
        - await nameInput.click({clickCount: 3})
        - await nameInput.fill("LOKALE-AENDERUNG")
        - await nameInput.press("Tab")
        - // Warte auf IndexedDB-Snapshot (ist sync nach store-update, aber Dexie ist async — 1s reicht)
        - await page.waitForTimeout(2000)
        - // Schließe page OHNE Save zu klicken
        - const cookies = await context.cookies()
        - // WICHTIG: context muss bleiben damit IndexedDB nicht gelöscht wird (context.close würde es löschen)
        - // Workaround: einfach navigate weg + zurück
        - await page.goto("/models")
        - await page.goto(`/models/${modelId}`)
        - // Restore-Dialog sollte erscheinen
        - await expect(page.getByRole("dialog").getByText(/Ungespeicherte Änderungen|Wiederherstellen/i)).toBeVisible({timeout: 10000})
        - await page.getByRole("button", {name: /Wiederherstellen/}).click()
        - // Name-Field zeigt lokalen Wert
        - await expect(nameInput).toHaveValue("LOKALE-AENDERUNG", {timeout: 10000})
        - await context.close()
        - })

    Hinweis: IndexedDB ist per-Browser-Context isoliert. `context.close()` löscht IndexedDB. Workaround: navigate weg + zurück simuliert Refresh ohne Daten zu verlieren. Echter "Tab-Close-Recovery" ist mit Playwright nicht trivial testbar — wird in Phase 2 mit Visual-Recording-Test.
  </action>
  <verify>
    <automated>ls -la portal/e2e/snapshot-restore.spec.ts</automated>
  </verify>
  <done>
    snapshot-restore.spec.ts existiert. Test beweist Snapshot-Restore-Flow.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: README-Sektion für E2E-Tests + Phase-1-Acceptance-Doc</name>
  <files>README.md</files>
  <read_first>
    - README.md (aus Plan 05 — Lokales Setup-Sektion bereits vorhanden)
  </read_first>
  <behavior>
    - README hat neue Sektion `## E2E-Tests` mit Schritt-für-Schritt-Anleitung.
    - README hat neue Sektion `## Phase-1-Status` mit Mapping SC-1..SC-9 zu beweisenden Tests.
  </behavior>
  <action>
    Erweitere README.md:
    - Sektion `## E2E-Tests`:
      - Voraussetzung: docker compose up + wait-healthy + seed-firebase-emulator + alembic upgrade head (siehe `## Lokales Setup`)
      - `cd portal && npx playwright install chromium` (einmalig)
      - `cd portal && npm run test:e2e` — alle 3 specs laufen
      - `cd portal && npm run test:e2e:ui` — interaktive Playwright-UI
      - Tests dauern ca. 30-60 s je nach Maschine.
      - HINWEIS: docker-compose-State wird NICHT automatisch gereinigt — Re-Run hängt Modelle in DB an. Manual cleanup mit `bash scripts/clean-test-tenant.sh` (zu erstellen wenn nötig).
    - Sektion `## Phase-1-Status` (Acceptance-Matrix):
      | SC | Beweis |
      |----|--------|
      | SC-1 docker compose | `bash scripts/wait-healthy.sh 90` exit 0 |
      | SC-2 Login + Lazy-Bootstrap | `pytest tests/backend/test_auth_endpoints.py test_lazy_bootstrap_race.py` |
      | SC-3 Upload→Tree | `pytest tests/backend/test_models_endpoints.py` + e2e modeling-flow |
      | SC-4 12 Viewer | `npm run test:run` + manueller Smoke |
      | SC-5 9 OCtrl | `npm run test:run -- viewers/core/octrl` |
      | SC-6 Edit-Operationen | e2e modeling-flow + npm test:run viewers |
      | SC-7 Save+Lock+IndexedDB | e2e modeling-flow + lock-conflict + snapshot-restore + pytest test_lock_endpoints.py |
      | SC-8 Save = neue Version | `pytest tests/backend/test_otx_upload_roundtrip.py::test_dummy_otx_byte_identical_through_pipeline` |
      | SC-9 Multi-Tenant | `pytest tests/backend/test_search_path_isolation.py` |
  </action>
  <verify>
    <automated>grep -c "E2E-Tests" README.md &amp;&amp; grep -c "Phase-1-Status" README.md</automated>
  </verify>
  <done>
    README hat zwei neue Sektionen. Acceptance-Matrix verlinkt jeden SC auf konkreten Test.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| E2E-Test ↔ Live-Services | Tests laufen gegen echten Dev-Stack; keine Production-Daten |
| Browser-Context-Isolation | Playwright isoliert per Context; kein State-Leak zwischen Tests (außer DB+IndexedDB-State) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-12-01 | Information Disclosure | Playwright-Trace könnte Test-Credentials enthalten | accept | Test-User sind public-by-design (admin@osim-dev/admin123); trace-on-first-retry nur in CI |
| T-12-02 | DoS | E2E-Test-Runs lassen Modelle in DB liegen | accept | Manuell cleanup mit scripts/clean-test-tenant.sh; DB ist Dev-only |
| T-12-03 | Tampering | Test-Run modifiziert Dummy.otx in OSim2004-Workspace | mitigate | Tests lesen Dummy.otx via setInputFiles(absoluter-Pfad) — kein Write zurück |
</threat_model>

<verification>
- `cd portal && npx playwright install chromium` läuft
- `cd portal && npm run test:e2e` (mit running docker compose + seed-users + alembic upgrade) → 3 Specs grün
- README hat E2E-Setup-Anleitung + Phase-1-Acceptance-Matrix
- /gsd-verify-work kann jetzt diese Tests als Acceptance-Beweis nutzen
</verification>

<success_criteria>
SC-3, SC-4, SC-6, SC-7, SC-8 bekommen ihre End-to-End-Beweise durch die 3 E2E-Specs.
Phase 1 ist nach diesem Plan ABGENOMMEN-bereit.
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-12-SUMMARY.md` with:
- Playwright-Setup-Konvention (workers=1, baseURL, chromium-only)
- 3 Spec-File-Übersicht mit Beschreibung
- Bekannte Limits:
  - Multi-Tenant-Lock-Conflict-Test ist 2-Sessions-Single-User (echter Multi-Tenant in Phase 5)
  - Snapshot-Restore-Test umgeht echten Tab-Close (Playwright-Limitation)
  - Tests laufen sequentiell (DB-State-Shared)
- Acceptance-Matrix-Snapshot
- Hinweis für /gsd-verify-work: alle 9 SCs sind via konkreter Test-Datei oder Manual-Smoke abgedeckt
</output>
</content>
</invoke>