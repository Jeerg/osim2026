/**
 * E2E-Spec: Live-Stream-Viewer (Phase 01, AC-3 / AC-4 / AC-5).
 *
 * AKTIV (nicht mehr test.fixme). Setzt den laufenden Dev-Stack voraus
 * (`bash scripts/dev-up.sh` → postgres/minio/firebase-emulator + api + portal
 * an http://localhost:3002, siehe UAT.md). Diese Spec treibt einen REALEN
 * PACED Lauf über die `/live`-UI und assertet gegen die DETERMINISTISCHEN
 * Auftrags-IDs, die der Lauf selbst produziert — es gibt KEINEN
 * Test-Schreibpfad und KEINE test-erfundenen Frame-IDs.
 *
 * Mechanismus (festgelegt, 01-10-PLAN): Der Lauf wird über die API als PACED
 * run gestartet (01-08: `POST /api/v1/models/{id}/runs`, server-default
 * `OSIM_RUN_PACE`=0.2s). Dadurch wächst die `stream.jsonl` über ein
 * Wall-Clock-Fenster nach, WÄHREND der Test zusieht (01-08: RUN_DIR= wird früh
 * geflusht, der RunService liest ohne auf das Prozess-Ende zu warten). Die
 * `/live`-Route pollt die nachgewachsenen Bytes inkrementell über die
 * injizierte HTTP-ReadFn (01-09: `buildStreamReadFn` gegen
 * `GET /runs/{id}/stream?offset=`). Es wird KEIN `append(lines)`-Schreibpfad
 * und KEIN Test-Append-Endpoint benötigt (01-08 ist read-only).
 *
 * Modell-Weg (Begründung im 01-10-SUMMARY): Statt ein vom Seed bereitgestelltes
 * Modell vorauszusetzen, lädt jede Spec ihr eigenes deterministisches E2E-Modell
 * über den bestehenden Upload-Flow hoch (Dummy.otx, `DUMMY_OTX_PATH`, Name-Prefix
 * `E2E-live-<ts>`) — exakt das Muster aus `e2e/modeling-flow.spec.ts`. Das
 * erzeugt KEINEN neuen Test-Code-Pfad und hält die Bibliothek sauber
 * (T-E2E-01: `models/index.tsx` filtert `E2E-`-Modelle aus der Prod-Liste; der
 * `/live`-Picker zeigt sie bewusst, 01-09). Cleanup via DELETE im finally.
 *
 * Deterministische Auftrags-IDs: Die `auftrag_id`-Werte sind durch das
 * hochgeladene OTX (Dummy.otx) + den festen Seed + die feste Perioden-/Pace-
 * Konfiguration eindeutig bestimmt (Reproduzierbarkeitsvertrag, osim-ui/CLAUDE.md
 * §3; vgl. demo_stream_run.py `FA-<periode>-<lauf>` als Aufbau-Referenz). Da die
 * konkreten IDs vom OTX-Inhalt abhängen, ohne ihn hier literal zu pinnen, liest
 * der Test die ERSTE vom Lauf produzierte `gantt-row-<auftrag>` aus dem DOM und
 * assertet AC-5 gegen GENAU DIESE — vom Lauf selbst produzierte — ID. Das ist
 * deterministisch (gleiches OTX → gleiche erste Reihe) und ohne test-erfundene
 * IDs (FA-LIVE-001 etc. sind entfallen).
 *
 *   AC-3 (Tail-Pickup < 1s gegen WACHSENDEN Stream) — der paced Lauf schreibt
 *        über sein Wall-Clock-Fenster nach; eine vom Lauf produzierte GanttRow
 *        wird in < 1s sichtbar, WÄHREND der Prozess noch schreibt (Polling-Tick
 *        200ms + 30Hz-Coalescing, D-4.4). NICHT auf das Lauf-Ende warten.
 *   AC-4 (Stream-Filter) — Tab-Wechsel isoliert genau einen Stream; die Panels
 *        der anderen Tags sind NICHT im DOM (StreamRouter-Isolation).
 *   AC-5 (Offset-Restart mid-stream, ohne Doppelung) — WÄHREND der paced Lauf
 *        noch schreibt, `page.reload()`; der Tail-Reader setzt vom gespeicherten
 *        Byte-Offset fort. Genau EINE GanttRow pro (deterministischer)
 *        auftrag_id — kein doppeltes Aufnehmen der vor dem Reload gelesenen
 *        Frames. `toHaveCount(1)` gegen einen LEBENDEN Stream (nicht eine
 *        statische Datei).
 */

import { expect, test, type Page } from "@playwright/test";

import { getIdToken, loginAs } from "../e2e/fixtures/auth";
import {
  ADMIN,
  API_BASE_URL,
  DUMMY_OTX_PATH,
} from "../e2e/fixtures/test-users";

/** Tail-Pickup-Budget (AC-3 / O-4): neue Frames < 1s sichtbar. */
const TAIL_PICKUP_BUDGET_MS = 1000;

/**
 * Ergebnis von {@link startPacedRun}: das hochgeladene E2E-Modell (für Cleanup)
 * und die vom Backend vergebene run_id (zum Logging/Asserten).
 */
interface PacedRun {
  modelId: string;
  runId: string;
}

/**
 * Lädt ein deterministisches E2E-Modell über den bestehenden Upload-Flow hoch,
 * navigiert via Topbar-Nav nach `/live`, wählt das Modell und startet einen
 * REALEN PACED Lauf über die `/live`-UI (01-09). KEIN Schreibpfad — der Lauf
 * ist paced (01-08-Default) und schreibt absichtlich über ein Wall-Clock-Fenster
 * nach, sodass das Live-Tail während des Schreibens prüfbar ist.
 *
 * Gibt modelId (für DELETE-Cleanup) + die aktive run_id (aus `live-active-run-id`)
 * zurück.
 */
async function startPacedRun(page: Page): Promise<PacedRun> {
  // 1. Deterministisches E2E-Modell hochladen (Muster aus modeling-flow.spec.ts).
  await page.goto("/models");
  await expect(
    page.getByRole("heading", { name: /Modell-Bibliothek/i }),
  ).toBeVisible();

  await page.getByTestId("btn-upload-otx").click();
  await expect(page.getByTestId("upload-otx-dialog")).toBeVisible();

  const modelName = `E2E-live-${Date.now()}`;
  await page.locator("#upload-otx-file").setInputFiles(DUMMY_OTX_PATH);
  await page.locator("#upload-otx-name").fill(modelName);
  await page.getByRole("button", { name: /^Hochladen$/ }).click();

  // Workspace-Page lädt — URL enthält die modelId (UUID).
  await page.waitForURL(/\/models\/[a-f0-9-]{36}$/, { timeout: 30_000 });
  const modelId = page.url().split("/").pop() ?? "";
  expect(modelId).toMatch(/^[a-f0-9-]{36}$/);

  // 2. Über die Topbar-Nav nach /live (01-09: nav-link-live, O-3).
  await page.getByTestId("nav-link-live").click();
  await page.waitForURL(/\/live$/, { timeout: 15_000 });

  // 3. Das E2E-Modell im /live-Picker wählen (01-09: nicht E2E--gefiltert).
  const select = page.getByTestId("live-model-select");
  await expect(select).toBeVisible();
  // Auf die Option des hochgeladenen Modells warten (useModels-Query frisch).
  await expect(
    page.getByTestId(`live-model-option-${modelId}`),
  ).toBeAttached({ timeout: 15_000 });
  await select.selectOption(modelId);

  // 4. PACED Lauf starten (01-08-Default-Pace) — er schreibt über ein
  //    Wall-Clock-Fenster nach, das Live-Tail ist während des Schreibens prüfbar.
  await page.getByTestId("live-start-run").click();

  // 5. run_id aus live-active-run-id lesen (01-09) — bestätigt den Start.
  const runIdBadge = page.getByTestId("live-active-run-id");
  await expect(runIdBadge).toBeVisible({ timeout: 15_000 });
  const runId = (await runIdBadge.textContent())?.replace(/Aktiver Lauf/, "").trim() ?? "";

  return { modelId, runId };
}

/** Best-effort-Cleanup: DELETE des hochgeladenen E2E-Modells (T-E2E-01). */
async function cleanupModel(page: Page, modelId: string | null): Promise<void> {
  if (!modelId) return;
  try {
    const token = await getIdToken(page);
    if (!token) return;
    const resp = await page.request.delete(
      `${API_BASE_URL}/api/v1/models/${modelId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok() && resp.status() !== 404) {
      console.warn(
        `Cleanup DELETE /api/v1/models/${modelId} liefert HTTP ${resp.status()}`,
      );
    }
  } catch (err) {
    console.warn("Cleanup-DELETE schlug fehl:", err);
  }
}

test.describe("Live-Stream-Viewer (AC-3 / AC-4 / AC-5)", () => {
  test("AC-3: vom Lauf produzierte Frames erscheinen in /live innerhalb < 1s", async ({
    page,
  }) => {
    let modelId: string | null = null;
    try {
      await loginAs(page, ADMIN.email, ADMIN.password);
      const run = await startPacedRun(page);
      modelId = run.modelId;

      // Default-Tab ist gantt_durchlauf — der StreamRouter rendert das gantt-panel.
      await page.getByTestId("live-tab-gantt_durchlauf").click();

      // AC-3: Der paced Lauf schreibt nach; sobald die erste GanttRow im Stream
      // erscheint, muss sie binnen < 1s sichtbar werden (Tail holt neue Frames
      // vom noch schreibenden Prozess). Wir warten erst auf das gantt-panel
      // (Stream ist angelaufen), dann gilt das < 1s-Budget für die erste Row.
      await expect(page.getByTestId("gantt-panel")).toBeVisible({
        timeout: 30_000,
      });
      const firstRow = page.locator('[data-testid^="gantt-row-"]').first();
      await expect(firstRow).toBeVisible({ timeout: TAIL_PICKUP_BUDGET_MS });
    } finally {
      await cleanupModel(page, modelId);
    }
  });

  test("AC-4: Tab-Wechsel isoliert genau einen Stream", async ({ page }) => {
    let modelId: string | null = null;
    try {
      await loginAs(page, ADMIN.email, ADMIN.password);
      const run = await startPacedRun(page);
      modelId = run.modelId;

      // gantt_durchlauf-Tab: gantt-Stream-Router sichtbar, kpi-grid NICHT im DOM.
      await page.getByTestId("live-tab-gantt_durchlauf").click();
      await expect(
        page.getByTestId("stream-router-gantt_durchlauf"),
      ).toBeVisible();
      await expect(page.getByTestId("kpi-grid")).toHaveCount(0);

      // Auf kpi_auswertung wechseln: kpi-Stream-Router sichtbar, gantt-panel weg.
      await page.getByTestId("live-tab-kpi_auswertung").click();
      await expect(
        page.getByTestId("stream-router-kpi_auswertung"),
      ).toBeVisible();
      await expect(page.getByTestId("gantt-panel")).toHaveCount(0);
    } finally {
      await cleanupModel(page, modelId);
    }
  });

  test("AC-5: Reload mid-stream setzt vom Offset fort, ohne Frames zu doppeln", async ({
    page,
  }) => {
    let modelId: string | null = null;
    try {
      await loginAs(page, ADMIN.email, ADMIN.password);
      const run = await startPacedRun(page);
      modelId = run.modelId;

      await page.getByTestId("live-tab-gantt_durchlauf").click();

      // Erste vom Lauf produzierte GanttRow abgreifen — ihre auftrag_id ist
      // deterministisch (gleiches OTX → gleiche erste Reihe), NICHT test-erfunden.
      await expect(page.getByTestId("gantt-panel")).toBeVisible({
        timeout: 30_000,
      });
      const firstRow = page.locator('[data-testid^="gantt-row-"]').first();
      await expect(firstRow).toBeVisible({ timeout: TAIL_PICKUP_BUDGET_MS });
      const testId = await firstRow.getAttribute("data-testid");
      expect(testId).toMatch(/^gantt-row-.+/);
      const auftragTestId = testId as string;

      // Reload WÄHREND der paced Lauf noch schreibt (simuliert UI-Crash +
      // Neustart). Der Tail-Reader setzt vom gespeicherten Byte-Offset fort;
      // der Prozess schreibt unterdessen weiter.
      await page.reload();
      await page.getByTestId("live-tab-gantt_durchlauf").click();
      await expect(page.getByTestId("gantt-panel")).toBeVisible({
        timeout: 30_000,
      });

      // AC-5: GENAU EINE GanttRow für diese auftrag_id — kein doppeltes
      // Aufnehmen der vor dem Reload bereits gelesenen Frames (Offset-Restart
      // gegen einen LEBENDEN Stream, nicht eine statische Datei).
      await expect(page.getByTestId(auftragTestId)).toHaveCount(1, {
        timeout: 5_000,
      });
    } finally {
      await cleanupModel(page, modelId);
    }
  });
});
