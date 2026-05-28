/**
 * E2E-Spec: Reload-Persistenz (Phase 1.1, Welle G13.1).
 *
 * Regression-Test für Welle G13. Verifiziert dass beim F5 auf einer
 * Workspace-Route mit offenem PDurchlaufplan:
 *
 *   1. Die URL `?selection=<oid>&hint=design` enthält.
 *   2. Nach `page.reload()` der Graph-Editor mit den Knoten wieder
 *      sichtbar ist (NICHT auf den Simulator-Root-Property-Viewer
 *      zurückspringt).
 *   3. KEIN Crash-Recovery-Dialog erscheint (Ghost-Snapshot-Filter
 *      aus useAutoSave verhindert das).
 *
 * Vor Welle G13 war Symptom: User berichtete "Knoten verschwinden
 * beim F5" — tatsächlich war loadFromWire setzte selection auf
 * simulator_oid und ViewerFrame zeigte PSimulatorViewer statt
 * PDurchlaufplanViewerDesign.
 *
 * Voraussetzungen wie demo-flow.spec.ts (docker compose, Firebase-Seed).
 */

import { expect, test } from "@playwright/test";

import { getIdToken, loginAs } from "./fixtures/auth";
import {
  ADMIN,
  API_BASE_URL,
  DUMMY_OTX_PATH,
} from "./fixtures/test-users";

test.describe("Reload-Persistenz Phase 1.1 (Welle G13)", () => {
  test("F5 auf offenem PDurchlaufplan: URL trägt selection+hint, Knoten bleiben sichtbar, kein Crash-Dialog", async ({
    page,
  }) => {
    let modelId: string | null = null;

    try {
      // ---- Setup: Login + Modell hochladen + Plan öffnen ---------------
      await loginAs(page, ADMIN.email, ADMIN.password);

      await page.goto("/models");
      await page.getByTestId("btn-upload-otx").click();
      await expect(page.getByTestId("upload-otx-dialog")).toBeVisible();
      await page.locator("#upload-otx-file").setInputFiles(DUMMY_OTX_PATH);
      await page.locator("#upload-otx-name").fill("G13-Reload-Test");
      await page.getByRole("button", { name: /^Hochladen$/i }).click();

      await page.waitForURL(/\/models\/[^/?]+(\?.*)?$/, { timeout: 15000 });
      const initialUrl = page.url();
      modelId = initialUrl.split("/").pop()?.split("?")[0] ?? null;
      expect(modelId).toBeTruthy();

      // Tree expandieren + ersten PDurchlaufplan klicken.
      const dplGroupRow = page
        .locator('[data-testid^="tree-row-grp:Durchlaufpläne:"]')
        .first();
      await expect(dplGroupRow).toBeVisible({ timeout: 10000 });
      await dplGroupRow.click();

      const dplPlanRow = page
        .locator('[data-klass="PDurchlaufplan"]')
        .first();
      await expect(dplPlanRow).toBeVisible({ timeout: 5000 });

      // OID des PDurchlaufplans aus dem Tree-Row-Attribut auslesen (für
      // URL-Assertion nach Reload). data-testid="tree-row-<id>" — id ist
      // entweder OID-Number-String oder "leaf-<oid>" / ähnlich.
      const planTestId = await dplPlanRow.getAttribute("data-testid");
      expect(planTestId).toBeTruthy();

      await dplPlanRow.click();

      // Canvas + mindestens 1 Knoten müssen sichtbar sein.
      const canvas = page.locator('[data-testid="graph-flow-canvas"]');
      await expect(canvas).toBeVisible({ timeout: 10000 });
      const nodesBeforeReload = canvas.locator(".react-flow__node");
      await expect(nodesBeforeReload.first()).toBeVisible({ timeout: 10000 });
      const nodeCountBefore = await nodesBeforeReload.count();
      expect(nodeCountBefore).toBeGreaterThan(0);

      // ---- Welle G13 Assertion 1: URL trägt selection + hint -----------
      const urlAfterClick = new URL(page.url());
      const selectionParam = urlAfterClick.searchParams.get("selection");
      const hintParam = urlAfterClick.searchParams.get("hint");
      expect(
        selectionParam,
        "URL muss ?selection=<oid> tragen nach Plan-Click (Welle G13)",
      ).toBeTruthy();
      expect(
        hintParam,
        "URL muss ?hint=design tragen für PDurchlaufplan (Welle G13)",
      ).toBe("design");

      // ---- F5: Page-Reload ---------------------------------------------
      await page.reload({ waitUntil: "networkidle" });

      // ---- Welle G13 Assertion 2: Graph-Editor wieder da ---------------
      // Workspace mountet neu, useModel lädt das Modell, useEffect liest
      // search.selection + search.hint und stellt State wieder her.
      const canvasAfterReload = page.locator(
        '[data-testid="graph-flow-canvas"]',
      );
      await expect(
        canvasAfterReload,
        "GraphFlowCanvas muss nach F5 wieder gerendert werden — KEIN Fallback auf PSimulatorViewer (Welle G13 Bug 1)",
      ).toBeVisible({ timeout: 15000 });

      const nodesAfterReload = canvasAfterReload.locator(".react-flow__node");
      await expect(nodesAfterReload.first()).toBeVisible({ timeout: 10000 });
      // Warte bis sich die Anzahl stabilisiert (fitView braucht 1-2 RAF-Ticks
      // bis onlyRenderVisibleElements alle Knoten im Viewport hat).
      await page.waitForTimeout(1000);
      const nodeCountAfter = await nodesAfterReload.count();
      // Welle G13: mindestens 1 Knoten muss sichtbar sein. Exact-Match ist
      // unzuverlässig, weil onlyRenderVisibleElements + fitView je nach
      // Viewport-Größe unterschiedlich viele Knoten im DOM hält. Vor Reload
      // (Plan-Click ohne fitView) sind oft weniger sichtbar als nach Reload
      // (fitView-Effect aus Welle G10 zoomt sofort aus). Beides ist OK.
      expect(
        nodeCountAfter,
        "Mindestens 1 Knoten muss nach F5 sichtbar sein (Welle G13)",
      ).toBeGreaterThan(0);

      // ---- Welle G13 Assertion 3: URL noch konsistent ------------------
      const urlAfterReload = new URL(page.url());
      expect(urlAfterReload.searchParams.get("selection")).toBe(selectionParam);
      expect(urlAfterReload.searchParams.get("hint")).toBe("design");

      // ---- Welle G13 Assertion 4: KEIN Crash-Recovery-Dialog -----------
      // Ghost-Snapshot-Filter in useAutoSave verhindert dass beim reinen
      // loadFromWire(server-wire) ein Snapshot persistiert wird → der
      // Crash-Recovery-Dialog darf NICHT erscheinen wenn nichts editiert
      // wurde (Welle G13 Bug 2).
      const restoreDialog = page.getByText(
        /Ungespeicherte Änderungen gefunden/i,
      );
      await expect(
        restoreDialog,
        "Crash-Recovery-Dialog darf NICHT erscheinen ohne User-Edit (Welle G13 Bug 2)",
      ).not.toBeVisible({ timeout: 2000 });
    } finally {
      if (modelId) {
        try {
          const token = await getIdToken(page);
          await page.request.delete(
            `${API_BASE_URL}/api/v1/models/${modelId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
        } catch {
          // Best-effort.
        }
      }
    }
  });
});
