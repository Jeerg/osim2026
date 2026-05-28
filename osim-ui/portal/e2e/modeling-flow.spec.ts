/**
 * E2E-Spec: Vollstaendiger Modellierungs-Flow (Plan 01-12 Task 2).
 *
 * Deckt die kritische Happy-Path-Reise eines Beraters ab:
 *
 *   Login -> /models -> "Modell hochladen" -> Dummy.otx + Name -> Submit
 *      -> Workspace oeffnet (/models/{id})
 *      -> Sidebar zeigt Tree mit "Modell"-Root
 *      -> Klick auf Sim-Root oeffnet PSimulatorViewer
 *      -> Edit Property "Name" (m_name)
 *      -> StatusBar zeigt "● Ungespeichert"
 *      -> Click "Speichern" -> StatusBar zeigt "✓ Gespeichert"
 *      -> page.reload()
 *      -> Name-Field zeigt nach Reload den geaenderten Wert (Persistenz-Beweis)
 *
 * Beweist SC-3 + SC-4 + SC-6 + SC-8 zusammen.
 *
 * Voraussetzungen:
 *   - docker compose up -d (vollstaendiger Stack inkl. portal + api)
 *   - bash scripts/wait-healthy.sh 90
 *   - uv run alembic --config db/alembic.ini upgrade head
 *   - uv run python scripts/seed_firebase_emulator.py
 *
 * Cleanup-Strategie:
 *   try/finally: DELETE /api/v1/models/{id} mit Bearer-Token aus getIdToken.
 *   Best-effort: Wenn das Cleanup scheitert (z.B. Token bereits abgelaufen),
 *   loggt der Test und faehrt fort — der naechste Test-Run sieht das Modell
 *   im Tenant-Schema, was harmlos ist (Multi-Tenant; admin@osim-dev's Tenant).
 */

import { expect, test } from "@playwright/test";

import { getIdToken, loginAs } from "./fixtures/auth";
import {
  ADMIN,
  API_BASE_URL,
  DUMMY_OTX_PATH,
} from "./fixtures/test-users";

test.describe("Vollstaendiger Modellierungs-Flow", () => {
  test("Login -> Upload Dummy.otx -> Edit Name -> Save -> Reload -> persistent", async ({
    page,
  }) => {
    let modelId: string | null = null;

    try {
      // 1. Login als Admin.
      await loginAs(page, ADMIN.email, ADMIN.password);

      // 2. Navigiere zur Modell-Bibliothek.
      await page.goto("/models");
      await expect(
        page.getByRole("heading", { name: /Modell-Bibliothek/i }),
      ).toBeVisible();

      // 3. Upload-Dialog oeffnen.
      await page.getByTestId("btn-upload-otx").click();
      await expect(page.getByTestId("upload-otx-dialog")).toBeVisible();

      // 4. Datei + Name eintragen und absenden.
      await page
        .locator("#upload-otx-file")
        .setInputFiles(DUMMY_OTX_PATH);
      await page.locator("#upload-otx-name").fill("E2E-Test-Modell");
      await page.getByRole("button", { name: /^Hochladen$/ }).click();

      // 5. Workspace-Page laedt — URL enthaelt die modelId (UUID).
      await page.waitForURL(/\/models\/[a-f0-9-]{36}$/, {
        timeout: 30_000,
      });
      const url = page.url();
      modelId = url.split("/").pop() ?? null;
      expect(modelId).toMatch(/^[a-f0-9-]{36}$/);

      // 6. Workspace ist geladen: Tree + Viewer sichtbar.
      await expect(page.getByTestId("model-workspace")).toBeVisible();
      await expect(page.getByTestId("model-tree")).toBeVisible();

      // 7. Click auf Sim-Root im Tree. Der Sim-Root-Label kommt aus dem
      //    wire.simulator_oid-Objekt; der Default-Selektor selektiert ihn
      //    bereits beim Mount (effectiveSelection = wire.simulator_oid in
      //    routes/models/$id.tsx). Wir warten nur auf das Render des
      //    PSimulatorViewer durch das m_name-Input.
      const nameInput = page.locator('[data-octrl-id="m_name"] input').first();
      await expect(nameInput).toBeVisible({ timeout: 15_000 });

      // 8. Property "Name" editieren — Select-All + Fill + Blur via Tab.
      await nameInput.click({ clickCount: 3 });
      await nameInput.fill("E2E-Modifiziert");
      await nameInput.press("Tab");

      // 9. StatusBar muss "Ungespeichert" zeigen (dirty=true).
      await expect(page.getByTestId("status-dirty")).toBeVisible({
        timeout: 5_000,
      });

      // 10. Click "Speichern".
      await page.getByTestId("status-save-button").click();

      // 11. Nach erfolgreichem Save muss StatusBar "Gespeichert" zeigen.
      await expect(page.getByTestId("status-saved")).toBeVisible({
        timeout: 15_000,
      });

      // 12. Reload — die Wire wird vom Server frisch geladen, der lokale
      //     ModelStore wird zurueckgesetzt und neu mit Server-Wire befuellt.
      await page.reload();
      await expect(page.getByTestId("model-workspace")).toBeVisible();

      // 13. Persistenz-Check: Nach Reload muss das Name-Field weiterhin
      //     "E2E-Modifiziert" zeigen — das beweist, dass der Server den
      //     Save akzeptiert + persistiert hat.
      const nameInputAfterReload = page
        .locator('[data-octrl-id="m_name"] input')
        .first();
      await expect(nameInputAfterReload).toHaveValue("E2E-Modifiziert", {
        timeout: 15_000,
      });
    } finally {
      // Best-effort-Cleanup: Modell loeschen, damit Re-Runs nicht in
      // den vorherigen Stand laufen.
      if (modelId) {
        try {
          const token = await getIdToken(page);
          if (token) {
            const resp = await page.request.delete(
              `${API_BASE_URL}/api/v1/models/${modelId}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!resp.ok() && resp.status() !== 404) {
                  console.warn(
                `Cleanup DELETE /api/v1/models/${modelId} ` +
                  `liefert HTTP ${resp.status()}`,
              );
            }
          }
        } catch (err) {
          console.warn("Cleanup-DELETE schlug fehl:", err);
        }
      }
    }
  });
});
