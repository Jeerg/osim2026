/**
 * E2E-Spec: Demo-Flow (Phase 1.1, Welle 11, CONTEXT D-1.1-17).
 *
 * Verifiziert die zentrale Demo-Sequenz:
 *
 *   Login (existing admin) -> /models (Bibliothek)
 *      -> Click auf Dummy-Modell-Karte
 *      -> Workspace lädt
 *      -> Tree expanded "Durchlaufpläne"
 *      -> Click auf den ersten Durchlaufplan
 *      -> ContextMenu "Im Graph-Editor öffnen"
 *      -> GraphView rendert mit Knoten + Kanten auf der neuen Foundation
 *
 * Assertion: data-testid="graph-flow-canvas" enthält ReactFlow-Nodes
 * (mindestens 1 .react-flow__node-Element) UND optional Edges (für
 * Durchlaufpläne mit ≥2 Knoten).
 *
 * Voraussetzungen wie modeling-flow.spec.ts (docker compose, Firebase-Seed).
 *
 * Diese Spec verifiziert SC-5 (GraphView-Reachability) + SC-11 (Demo-Smoke-
 * Test) aus ROADMAP Phase 1.1.
 */

import { expect, test } from "@playwright/test";

import { getIdToken, loginAs } from "./fixtures/auth";
import {
  ADMIN,
  API_BASE_URL,
  DUMMY_OTX_PATH,
} from "./fixtures/test-users";

test.describe("Demo-Flow Phase 1.1", () => {
  test("Login -> Bibliothek -> Workspace -> Durchlaufplan -> GraphView rendert", async ({
    page,
  }) => {
    let modelId: string | null = null;

    try {
      // 1. Login als Admin.
      await loginAs(page, ADMIN.email, ADMIN.password);

      // 2. Dummy.otx hochladen — gibt uns ein bekanntes Modell für den Test.
      // UploadOtxDialog nutzt einen sichtbaren <input type="file"> (kein
      // verstecktes Pattern + Drop-Zone), Playwright-Pattern dafür ist
      // setInputFiles direkt auf den Input.
      await page.goto("/models");
      await page.getByTestId("btn-upload-otx").click();
      await expect(page.getByTestId("upload-otx-dialog")).toBeVisible();
      await page
        .locator("#upload-otx-file")
        .setInputFiles(DUMMY_OTX_PATH);
      // Name-Default wird vom Dialog aus dem Dateinamen gesetzt — Override.
      const nameInput = page.locator("#upload-otx-name");
      await nameInput.fill("Demo-Flow-Dummy");
      await page.getByRole("button", { name: /^Hochladen$/i }).click();

      // 3. Workspace lädt — URL ändert sich auf /models/{id}.
      await page.waitForURL(/\/models\/[^/]+$/, { timeout: 15000 });
      const url = page.url();
      modelId = url.split("/").pop() ?? null;
      expect(modelId).toBeTruthy();

      // 4. Sim-Root ist initial expanded (initialOpenState), aber die
      //    Sub-Gruppen (Durchlaufpläne, Auslöser, …) sind collapsed.
      //    Klick auf die "Durchlaufpläne"-Gruppen-Row expandiert sie.
      //    Tree-Rows haben data-testid="tree-row-grp:<Label>:<parent-oid>".
      const dplGroupRow = page
        .locator('[data-testid^="tree-row-grp:Durchlaufpläne:"]')
        .first();
      await expect(dplGroupRow).toBeVisible({ timeout: 10000 });
      await dplGroupRow.click();

      // 5. Erste konkrete PDurchlaufplan-Row klicken. Tree-Rows haben seit
      //    Welle G5 data-tree-kind und data-klass — Plan-Rows sind eindeutig
      //    via data-klass="PDurchlaufplan". (data-tree-kind ist "branch",
      //    weil Pläne Knoten/Kanten als Sub-Gruppen haben — nicht "leaf".)
      const dplPlanRow = page
        .locator('[data-klass="PDurchlaufplan"]')
        .first();
      await expect(dplPlanRow).toBeVisible({ timeout: 5000 });
      await dplPlanRow.click();

      // 6. Workspace setzt viewerHint automatisch auf "design", sobald ein
      //    PDurchlaufplan selektiert wird (siehe $id.tsx handleSelectionChange).
      //    Der ViewerHintSwitcher rendert nur bei availableHints.length > 1
      //    — wir verifizieren stattdessen direkt das GraphFlowCanvas.

      // 7. GraphFlowCanvas muss sichtbar sein.
      const canvas = page.locator('[data-testid="graph-flow-canvas"]');
      await expect(canvas).toBeVisible({ timeout: 10000 });

      // 8. Mindestens ein React-Flow-Node muss gerendert sein.
      const nodes = canvas.locator(".react-flow__node");
      await expect(nodes.first()).toBeVisible({ timeout: 10000 });
      const nodeCount = await nodes.count();
      expect(nodeCount).toBeGreaterThan(0);

      // Demo erfolgreich.
    } finally {
      // Cleanup: Modell löschen.
      if (modelId) {
        try {
          const token = await getIdToken(page);
          await page.request.delete(`${API_BASE_URL}/api/v1/models/${modelId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Best-effort.
        }
      }
    }
  });
});
