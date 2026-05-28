/**
 * E2E-Spec: Lock-Konflikt zwischen zwei Editor-Sessions (Plan 01-12 Task 3).
 *
 * Beweist den Single-Editor-Lock-Mechanismus (SC-7, D-13):
 *
 *   Session-A: loginAs(admin) -> Upload Dummy.otx -> Workspace
 *              -> useLockHeartbeat acquired Lock -> StatusBar 'Sperre aktiv'
 *   Session-B: in zweitem Browser-Context loginAs(admin)
 *              -> navigate /models/{id} (selbe modelId)
 *              -> acquire() bekommt 409 -> lockStore.status='foreign'
 *              -> StatusBar zeigt 'Gesperrt von admin@osim-dev'
 *              -> alle OCtrls disabled (ViewerFrame.disabled=true)
 *
 * Wichtig: Wir testen mit ZWEI Sessions desselben Users (admin@osim-dev),
 * NICHT mit admin + user. Begruendung: Die Multi-Tenant-Architektur isoliert
 * User-Schemas (Schema-per-Tenant); admin und user sehen einander's Modelle
 * gar nicht. Der Lock-Mechanismus ist aber zwischen Sessions DESSELBEN
 * Tenants relevant (z.B. Berater mit zwei Browser-Tabs / zwei Geraeten).
 *
 * Echtes Multi-User-Sharing (zwei Tenants auf gleichem Modell ueber einen
 * Share-Token) ist Phase-5-Backlog und nicht in Phase 1 abgedeckt.
 */

import { expect, test } from "@playwright/test";

import { getIdToken, loginAs } from "./fixtures/auth";
import {
  ADMIN,
  API_BASE_URL,
  DUMMY_OTX_PATH,
} from "./fixtures/test-users";

test.describe("Lock-Konflikt zwischen zwei Editoren", () => {
  test("Zweite Session sieht foreign-Lock und Read-Only-Mode", async ({
    browser,
  }) => {
    // ---- Session A: laed't das Modell hoch + haelt den Lock ----
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    let modelId: string | null = null;

    try {
      await loginAs(pageA, ADMIN.email, ADMIN.password);

      // Upload Dummy.otx als Modell.
      await pageA.goto("/models");
      await pageA.getByTestId("btn-upload-otx").click();
      await pageA
        .locator("#upload-otx-file")
        .setInputFiles(DUMMY_OTX_PATH);
      await pageA.locator("#upload-otx-name").fill("E2E-Lock-Modell");
      await pageA.getByRole("button", { name: /^Hochladen$/ }).click();

      // Warte bis Workspace geladen + Lock aquiriert ist.
      await pageA.waitForURL(/\/models\/[a-f0-9-]{36}$/, {
        timeout: 30_000,
      });
      const urlA = pageA.url();
      modelId = urlA.split("/").pop() ?? null;
      expect(modelId).toMatch(/^[a-f0-9-]{36}$/);

      await expect(pageA.getByTestId("model-workspace")).toBeVisible();
      // Sperre aktiv (eigener Lock) — Session A hat den Lock.
      await expect(pageA.getByTestId("status-lock-own")).toBeVisible({
        timeout: 15_000,
      });

      // ---- Session B: separater Browser-Context, selber User ----
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();

      try {
        await loginAs(pageB, ADMIN.email, ADMIN.password);

        // Navigiere zu derselben modelId — der Workspace ruft
        // useLockHeartbeat.acquire(), das eine 409 vom Backend bekommt,
        // weil Session A den Lock haelt.
        await pageB.goto(`/models/${modelId}`);
        await expect(pageB.getByTestId("model-workspace")).toBeVisible();

        // Session B muss "Gesperrt von ..."-Status zeigen.
        // WorkspaceStatusBar.tsx (Plan 11): status==='foreign' rendert
        // data-testid="status-lock-foreign" mit Text "Gesperrt von <ownerLabel>".
        await expect(pageB.getByTestId("status-lock-foreign")).toBeVisible({
          timeout: 15_000,
        });

        // Owner-Label muss admin@osim-dev enthalten (oder Nutzer-Praefix
        // falls Email nicht im Lock-Response ist; auf jeden Fall Text-Inhalt
        // nicht leer).
        const lockText = await pageB
          .getByTestId("status-lock-foreign")
          .textContent();
        expect(lockText ?? "").toMatch(/Gesperrt von/i);

        // Read-Only-Wiring: Das m_name-Input sollte disabled sein
        // (ViewerFrame.disabled=true ist im Workspace verdrahtet, sobald
        // lockStatus !== 'own').
        const nameInput = pageB
          .locator('[data-octrl-id="m_name"] input')
          .first();
        // Das Input rendert nur, wenn der PSimulatorViewer geladen wird;
        // bei foreign-Lock laedt der Workspace die Wire trotzdem (Read-Only-
        // Modus), aber Inputs sind disabled.
        await expect(nameInput).toBeVisible({ timeout: 15_000 });
        await expect(nameInput).toBeDisabled();

        // Save-Button ist ebenfalls disabled (status !== 'own').
        const saveButton = pageB.getByTestId("status-save-button");
        await expect(saveButton).toBeDisabled();
      } finally {
        await contextB.close();
      }
    } finally {
      // Cleanup: Modell loeschen (best-effort).
      if (modelId) {
        try {
          const token = await getIdToken(pageA);
          if (token) {
            await pageA.request.delete(
              `${API_BASE_URL}/api/v1/models/${modelId}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
          }
        } catch (err) {
          console.warn("Cleanup-DELETE schlug fehl:", err);
        }
      }
      await contextA.close();
    }
  });
});
