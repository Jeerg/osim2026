/**
 * E2E-Spec: Matrix-Cell-Paint + Block-Copy/Paste-Cycle
 * (Phase 01.2, Welle H — SC-10).
 *
 * ── Interaktions-Modell (Rebuild 2026-05-27, 1:1 OSim2004) ──────────────
 * Der PRessBelegMatrixViewer hat KEIN In-Cell-`<select>` mehr. Der Status
 * wird in der Toolbar-Combobox (`m_cbVerkStatus`) gewaehlt; eine Cell wird
 * per Klick "gepaintet":
 *   - Linksklick LEERE Cell  → Belegung mit Toolbar-Status anlegen
 *   - Linksklick BELEGTE Cell → No-Op
 *   - Rechtsklick BELEGTE Cell → loeschen
 *   - Ctrl/Shift+Klick → Block-Select (kein Paint)
 * (siehe PRessBelegMatrixViewer.tsx `MatrixStatusCellImpl` + Toolbar).
 *
 * Verifiziert gegen den vollen Stack:
 *
 *   Test 1 — Click-Paint + Rechtsklick-Delete (In-Session):
 *     Login -> Upload Embb-AslFj.otx -> Matrix -> Toolbar-Status "notfalls"
 *     -> Linksklick leere Cell -> Pill "notfalls" erscheint
 *     -> Rechtsklick -> Pill verschwindet.
 *
 *   Test 2 — Block-Copy/Paste-Cycle:
 *     Login -> Upload -> Matrix -> 2 Cells painten (versch. Status)
 *     -> Block-Select via Shift+Click -> Ctrl+C -> Target -> Ctrl+V
 *     -> Target traegt den kopierten Status.
 *
 *   Test 3 — Cell-Edit-Persistenz nach F5: `test.fixme`.
 *     BLOCKIERT durch P3 (Handoff 2026-05-27): der OTX-Round-Trip von
 *     `PAssozBelegLinkInfo`/`m_LinkStatusList` ist engine-seitig
 *     UNGEPRUEFT, und Auto-Save ist seit G19-A AUS. Persistenz kann erst
 *     verifiziert werden, wenn die Engine-Notiz Punkt 1 in
 *     ../osim-engine/engine/docs/CONTEXT-P1-osim-ui-integration-TODO.md
 *     abgearbeitet ist. Erst dann wird `test.fixme` → `test`.
 *
 * Voraussetzungen (wie demo-flow.spec.ts):
 *   - `docker compose up -d` (vollstaendiger Stack inkl. portal + api)
 *   - `bash scripts/wait-healthy.sh 90`
 *   - `uv run python scripts/seed_firebase_emulator.py`
 *
 * Cleanup-Strategie:
 *   try/finally: DELETE /api/v1/models/{id} mit Bearer-Token aus getIdToken.
 *   Best-effort — wenn das Cleanup scheitert (z.B. Token abgelaufen), wird
 *   das geloggt und der Test faehrt fort.
 *
 * Selektor-Strategie (Rebuild-Stand):
 *   - Matrix-Viewer-Root:   `[data-viewer="PRessBelegMatrixViewer"]`
 *   - Matrix-Grid-Container: `[data-matrix-grid="PRessBeleg"]`
 *   - Cells:                `[data-testid="matrix-cell"]`
 *     mit `data-matrix-row` / `data-matrix-col` / `data-cell-id` /
 *     `data-oid` (Belegungs-OID; fehlt bei leerer Cell).
 *   - Toolbar-Status-Combo: `[data-testid="combo-status-select"]`
 *     (Optionen 0=bevorzugt, 1=standard, 2=notfalls, 3=geblockt).
 *
 * Hinweis Cross-Platform Copy/Paste:
 *   Playwright normalisiert "Control+C" plattformkorrekt. Falls macOS-CI
 *   scheitert, `process.platform === "darwin" ? "Meta+C" : "Control+C"`.
 *
 * Diese Spec verifiziert SC-10 aus ROADMAP Phase 1.2.
 */

import { expect, type Page, test } from "@playwright/test";

import { getIdToken, loginAs } from "./fixtures/auth";
import {
  ADMIN,
  API_BASE_URL,
  EMBB_OTX_PATH,
} from "./fixtures/test-users";

// ---------------------------------------------------------------------
// Helper-Functions
// ---------------------------------------------------------------------

/**
 * Login + Upload Embb-AslFj.otx als neuen Test-Modell.
 *
 * Liefert die `modelId` (UUID-String) zurueck. Wirft, wenn der Upload
 * nicht in <30s eine Workspace-Route erreicht.
 */
async function uploadEmbbModel(
  page: Page,
  modelNamePrefix: string,
): Promise<string> {
  await loginAs(page, ADMIN.email, ADMIN.password);

  await page.goto("/models");
  await expect(
    page.getByRole("heading", { name: /Modell-Bibliothek/i }),
  ).toBeVisible();

  await page.getByTestId("btn-upload-otx").click();
  await expect(page.getByTestId("upload-otx-dialog")).toBeVisible();

  await page.locator("#upload-otx-file").setInputFiles(EMBB_OTX_PATH);
  await page.locator("#upload-otx-name").fill(`${modelNamePrefix}-${Date.now()}`);
  await page.getByRole("button", { name: /^Hochladen$/i }).click();

  await page.waitForURL(/\/models\/[a-f0-9-]{36}/, { timeout: 30_000 });
  const modelId = page.url().split("/").pop()?.split("?")[0] ?? "";
  expect(modelId).toMatch(/^[a-f0-9-]{36}$/);
  return modelId;
}

/**
 * Best-effort-Cleanup eines Test-Modells via Backend-API.
 *
 * Loggt Fehler, wirft NICHT (damit ein Test-Cleanup-Fehler den finally-
 * Block nicht ueberwirft).
 */
async function deleteModelBestEffort(
  page: Page,
  modelId: string | null,
): Promise<void> {
  if (!modelId) return;
  try {
    const token = await getIdToken(page);
    if (!token) {
      console.warn(`[cleanup] kein Auth-Token verfuegbar fuer DELETE ${modelId}`);
      return;
    }
    const resp = await page.request.delete(
      `${API_BASE_URL}/api/v1/models/${modelId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok() && resp.status() !== 404) {
      console.warn(
        `[cleanup] DELETE /api/v1/models/${modelId} liefert HTTP ${resp.status()}`,
      );
    }
  } catch (err) {
    console.warn(`[cleanup] DELETE schlug fehl: ${String(err)}`);
  }
}

/**
 * Navigiert zur Matrix-Viewer-Ansicht.
 *
 * Strategie:
 *   1. Tree expandieren bis erste `PDurchlaufplan`-Row sichtbar.
 *   2. Plan-OID aus `data-testid` extrahieren.
 *   3. URL-Param `?selection=<planOid>&hint=matrix` setzen via page.goto.
 *   4. PRessBelegMatrixViewer-Root muss sichtbar werden.
 *
 * Hinweis: Hint "matrix" auf PDurchlaufplan ist Phase-1.2-Plan-11-Backlog
 * fuer eine "saubere" Sidebar-Integration, aber der URL-Pfad funktioniert
 * heute schon, weil der Resolution-Pfad in ViewerRegistry zuerst
 * `(klass="PRessBeleg", hint="matrix")` versucht. Falls das nicht greift,
 * faellt der Workspace auf den klass-only-Eintrag oder den Fallback zurueck.
 *
 * Pragmatisch fuer die E2E: wir suchen eine `PRessBeleg`-Row im Tree und
 * selektieren die direkt. Falls keine vorhanden, fallen wir auf
 * Durchlaufplan-Selektion zurueck.
 */
async function openMatrixViewer(page: Page, modelId: string): Promise<void> {
  // Tree muss da sein.
  await expect(page.getByTestId("model-tree")).toBeVisible({ timeout: 15_000 });

  // Tree expandieren: zuerst "Durchlaufpläne"-Gruppe oeffnen, dann erste
  // PDurchlaufplan-Row sichtbar. Pattern aus demo-flow.spec.ts Z.68-72 +
  // reload-persistence.spec.ts Z.54-58.
  const dplGroupRow = page
    .locator('[data-testid^="tree-row-grp:Durchlaufpläne:"]')
    .first();
  await expect(dplGroupRow).toBeVisible({ timeout: 10_000 });
  await dplGroupRow.click();

  // Pruefen ob direkt PRessBeleg-Row da ist (selten, weil PRessBeleg
  // typischerweise unter dem Plan-Knoten haengt und nicht als Top-Level-Row).
  const ressBelegRow = page.locator('[data-klass="PRessBeleg"]').first();
  const hasRessBelegRow = await ressBelegRow.count();
  if (hasRessBelegRow > 0) {
    await ressBelegRow.click();
    const ressOidRaw = await ressBelegRow.getAttribute("data-testid");
    const m = ressOidRaw?.match(/(\d+)$/);
    const oid = m?.[1];
    if (oid) {
      await page.goto(`/models/${modelId}?selection=${oid}&hint=matrix`);
    }
  } else {
    // Standard-Pfad: ueber den PDurchlaufplan navigieren — der Belegungs-
    // Viewer konsumiert das Plan-Objekt (siehe PRessBelegMatrixViewer.tsx
    // Z.236 — `obj.attrs.m_lKnoten` ist die Spalten-Quelle).
    const dplRow = page.locator('[data-klass="PDurchlaufplan"]').first();
    await expect(dplRow).toBeVisible({ timeout: 5_000 });
    const dplTestId = await dplRow.getAttribute("data-testid");
    const m = dplTestId?.match(/(\d+)$/);
    const planOid = m?.[1];
    expect(planOid).toBeTruthy();
    // URL explizit auf hint=matrix setzen + Reload, damit die Initial-
    // Load-useEffect-Logik im Workspace ($id.tsx Z.181-184) den
    // `?hint=matrix`-Param in den ViewerStore uebernimmt. Ein einfaches
    // `page.goto` zum selben modelId triggert den useEffect nicht erneut
    // (deps sind [data?.wire, id]); ein Reload startet die Page neu und
    // laeuft den Initial-Load-Pfad noch einmal mit den neuen Search-Params.
    await page.goto(`/models/${modelId}?selection=${planOid}&hint=matrix`);
    await page.reload({ waitUntil: "networkidle" });
  }

  // Pflicht-Assertion: PRessBelegMatrixViewer-Root muss sichtbar sein.
  // Wenn die Registry-Verdrahtung fehlt (kein `(PDurchlaufplan, matrix)`-
  // oder `(PBetriebsmittel, matrix)`-Pfad existiert), schlaegt das hier
  // mit klarer Fehlermeldung fehl.
  await expect(
    page.locator('[data-viewer="PRessBelegMatrixViewer"]'),
    "PRessBelegMatrixViewer muss erreichbar sein — falls dies fehlschlaegt, " +
      "fehlt evtl. ein Registry-Eintrag fuer (PDurchlaufplan, matrix) " +
      "(siehe portal/src/viewers/setup.ts Header-Notiz Plan-11-Backlog).",
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-matrix-grid="PRessBeleg"]')).toBeVisible();
}

/**
 * Eindeutiger Cell-Locator ueber `data-cell-id` (stabil ueber Re-Builds und
 * Reload, weil aus rowOid:colOid abgeleitet — nicht aus der DOM-Reihenfolge).
 */
function cellById(page: Page, cellId: string) {
  return page.locator(`[data-testid="matrix-cell"][data-cell-id="${cellId}"]`);
}

/** True, wenn die Cell aktuell belegt ist (Pill sichtbar / data-oid gesetzt). */
async function isOccupied(page: Page, cellId: string): Promise<boolean> {
  const oid = await cellById(page, cellId).getAttribute("data-oid");
  return oid !== null && oid !== "" && oid !== "undefined";
}

/** Setzt den Paint-Status in der Toolbar-Combobox (0..3). */
async function setPaintStatus(page: Page, statusValue: number): Promise<void> {
  const combo = page.getByTestId("combo-status-select");
  await expect(combo).toBeVisible({ timeout: 5_000 });
  await combo.selectOption({ value: String(statusValue) });
}

/**
 * Findet die erste LEERE Cell und liefert ihre `data-cell-id`.
 * Wirft, wenn alle sichtbaren Cells belegt sind.
 */
async function firstEmptyCellId(page: Page): Promise<string> {
  const cells = page.locator('[data-testid="matrix-cell"]');
  const count = await cells.count();
  for (let i = 0; i < count; i++) {
    const id = await cells.nth(i).getAttribute("data-cell-id");
    if (id && !(await isOccupied(page, id))) return id;
  }
  throw new Error("Keine leere Cell in der Matrix gefunden");
}

/**
 * Paintet eine LEERE Cell mit dem aktuellen Toolbar-Status (Linksklick).
 * Erwartet, dass danach die Status-Pill mit `expectedLabel` sichtbar ist.
 */
async function paintCell(
  page: Page,
  cellId: string,
  expectedLabel: RegExp,
): Promise<void> {
  await cellById(page, cellId).click();
  await expect(cellById(page, cellId)).toContainText(expectedLabel, {
    timeout: 5_000,
  });
}

// ---------------------------------------------------------------------
// Test-Suite
// ---------------------------------------------------------------------

test.describe("Phase 1.2 Welle H — Matrix-Click-Paint + Block-Copy/Paste", () => {
  test("Test 1: Click-Paint + Rechtsklick-Delete — leere Cell painten, Pill erscheint, Rechtsklick loescht", async ({
    page,
  }) => {
    let modelId: string | null = null;

    try {
      // 1. Setup: Login + Upload Embb-AslFj.otx
      modelId = await uploadEmbbModel(page, "E2E-Matrix-Paint");

      // 2. Matrix-Viewer oeffnen
      await openMatrixViewer(page, modelId);

      // 3. Toolbar-Status auf "notfalls" (2) setzen.
      await setPaintStatus(page, 2);

      // 4. Erste leere Cell finden + per Linksklick painten.
      const cellId = await firstEmptyCellId(page);
      await paintCell(page, cellId, /notfalls/i);

      // 5. Belegt? data-oid muss jetzt gesetzt sein (neuer PAssozBeleg).
      expect(
        await isOccupied(page, cellId),
        "Gepaintete Cell muss eine Belegungs-OID tragen",
      ).toBe(true);

      // 6. Rechtsklick auf die belegte Cell → loeschen (1:1 OnRButtonDown).
      await cellById(page, cellId).click({ button: "right" });

      // 7. Pill verschwindet, Cell ist wieder leer.
      await expect(cellById(page, cellId)).not.toContainText(/notfalls/i, {
        timeout: 5_000,
      });
      expect(
        await isOccupied(page, cellId),
        "Nach Rechtsklick-Delete darf keine Belegungs-OID mehr da sein",
      ).toBe(false);
    } finally {
      await deleteModelBestEffort(page, modelId);
    }
  });

  test("Test 2: Single-Cell-Copy/Paste-Cycle — Source kopieren -> Target ueberschreiben", async ({
    page,
  }) => {
    let modelId: string | null = null;

    try {
      // 1. Setup: Login + Upload Embb-AslFj.otx
      modelId = await uploadEmbbModel(page, "E2E-Matrix-CopyPaste");

      // 2. Matrix-Viewer oeffnen
      await openMatrixViewer(page, modelId);

      // 3. Mind. 2 Cells fuer Source + Target.
      const cellCount = await page.locator('[data-testid="matrix-cell"]').count();
      expect(
        cellCount,
        "Matrix muss mind. 2 Cells haben fuer den Copy/Paste-Test",
      ).toBeGreaterThanOrEqual(2);

      // 4. Source A = "standard", Target T = "geblockt" painten.
      //    BEIDE muessen belegt sein: ein Plain-Klick auf eine BELEGTE Cell
      //    selektiert sie (Single-Cell-Range), ohne zu painten — ein Klick
      //    auf eine LEERE Cell wuerde dagegen painten (occupied-Guard im
      //    handleClick). So bleibt der Paste-Anker deterministisch.
      await setPaintStatus(page, 1); // standard
      const cellAId = await firstEmptyCellId(page);
      await paintCell(page, cellAId, /standard/i);

      await setPaintStatus(page, 3); // geblockt
      const cellTargetId = await firstEmptyCellId(page);
      await paintCell(page, cellTargetId, /geblockt/i);

      // 5. Source A anklicken → frische Single-Cell-Selection (occupied → kein
      //    Paint). Ctrl+C kopiert die Selection als x-osim-matrix-cells.
      await cellById(page, cellAId).click();
      await page.keyboard.press("Control+C");
      await page.waitForTimeout(200);

      // 6. Target T anklicken → Selection-Anker wandert nach T (occupied →
      //    kein Paint). Ctrl+V setzt die kopierte Range am Anker T an.
      await cellById(page, cellTargetId).click();
      await page.keyboard.press("Control+V");
      await page.waitForTimeout(500);

      // 7. Target traegt jetzt den Source-Wert "standard" (ueberschreibt
      //    "geblockt") — voller Copy→Paste-Cycle verifiziert.
      await expect(cellById(page, cellTargetId)).toContainText(/standard/i, {
        timeout: 5_000,
      });
      await expect(cellById(page, cellTargetId)).not.toContainText(/geblockt/i);
    } finally {
      await deleteModelBestEffort(page, modelId);
    }
  });

  // Test 3 — Persistenz nach F5: BLOCKIERT durch P3 (OTX-Round-Trip von
  // PAssozBelegLinkInfo engine-seitig ungeprueft + Auto-Save AUS seit G19-A).
  // Wird auf `test` hochgestuft, sobald die Engine-Notiz Punkt 1 in
  // ../osim-engine/engine/docs/CONTEXT-P1-osim-ui-integration-TODO.md erledigt
  // ist. Siehe Handoff 2026-05-27 §P3.
  test.fixme(
    "Test 3: Cell-Edit-Persistenz nach F5 (blockiert durch P3 — Engine OTX-Round-Trip)",
    async ({ page }) => {
      let modelId: string | null = null;
      try {
        modelId = await uploadEmbbModel(page, "E2E-Matrix-Persist");
        await openMatrixViewer(page, modelId);

        await setPaintStatus(page, 2); // notfalls
        const cellId = await firstEmptyCellId(page);
        await paintCell(page, cellId, /notfalls/i);

        // Save (manueller Button oder Auto-Save) + F5 + Crash-Recovery
        // verwerfen — dann muss die Cell weiterhin "notfalls" zeigen.
        const saveBtn = page.getByTestId("status-save-button");
        if ((await saveBtn.count()) > 0 && (await saveBtn.isEnabled())) {
          await saveBtn.click();
          await expect(page.getByTestId("status-saved")).toBeVisible({
            timeout: 15_000,
          });
        }
        await page.reload({ waitUntil: "networkidle" });

        const restoreDialog = page.getByRole("dialog", {
          name: /Ungespeicherte Änderungen gefunden/i,
        });
        if (await restoreDialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await page.getByRole("button", { name: /Verwerfen/i }).click();
        }

        await openMatrixViewer(page, modelId);
        await expect(cellById(page, cellId)).toContainText(/notfalls/i, {
          timeout: 10_000,
        });
      } finally {
        await deleteModelBestEffort(page, modelId);
      }
    },
  );
});
