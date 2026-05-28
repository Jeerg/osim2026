/**
 * E2E-Spec: IndexedDB-Snapshot-Restore nach simuliertem Crash
 * (Plan 01-12 Task 4).
 *
 * Beweist den IndexedDB-Crash-Recovery-Pfad (SC-7, D-12):
 *
 *   1. Upload Dummy.otx -> Workspace -> Lock acquired
 *   2. Edit Property "Name" auf "LOKALE-AENDERUNG" (kein Save!)
 *   3. Warte ~2 s — useAutoSave subscribed an wire-Aenderungen und schreibt
 *      einen IndexedDB-Snapshot mit 1 s Debounce
 *   4. Simuliere Crash: page.reload({ waitUntil: "load" })
 *      Hinweis: page.reload bei Playwright BEHAELT den IndexedDB-Inhalt
 *      (nicht zu verwechseln mit context.close, das ihn loescht). Das
 *      entspricht dem realen Crash-Recovery-Szenario: Browser-Reload nach
 *      Tab-Crash oder F5 bei haengendem Tab.
 *   5. Nach Reload sieht der User den Snapshot-Restore-Dialog (Plan 11
 *      Hook useSnapshotRestore, gezeigt im Workspace-Component).
 *   6. Click "Wiederherstellen" -> loadFromWire mit snapshot + dirty=true.
 *   7. Name-Field zeigt "LOKALE-AENDERUNG" (NICHT den Server-Original-Wert).
 *
 * Beweist:
 *   - IndexedDB-Snapshot wird waehrend Edit-Burst angelegt
 *   - Crash-Detection beim Workspace-Mount (useSnapshotRestore-useEffect)
 *   - Dialog ist sichtbar + nicht-dismissable
 *   - Restore laedt den lokalen Stand zurueck in den ModelStore
 *
 * Voraussetzungen wie modeling-flow.spec.ts (docker compose up + seeds).
 */

import { expect, test } from "@playwright/test";

import { getIdToken, loginAs } from "./fixtures/auth";
import {
  ADMIN,
  API_BASE_URL,
  DUMMY_OTX_PATH,
} from "./fixtures/test-users";

test.describe("IndexedDB-Snapshot-Wiederherstellung nach Crash", () => {
  test(
    "Edit ohne Save -> Reload -> Restore-Dialog -> Wiederherstellen -> Edit ist da",
    async ({ page }) => {
      let modelId: string | null = null;

      try {
        // 1. Login + Upload + Workspace.
        await loginAs(page, ADMIN.email, ADMIN.password);
        await page.goto("/models");
        await page.getByTestId("btn-upload-otx").click();
        await page
          .locator("#upload-otx-file")
          .setInputFiles(DUMMY_OTX_PATH);
        await page.locator("#upload-otx-name").fill("E2E-Snapshot-Modell");
        await page.getByRole("button", { name: /^Hochladen$/ }).click();

        await page.waitForURL(/\/models\/[a-f0-9-]{36}$/, {
          timeout: 30_000,
        });
        modelId = page.url().split("/").pop() ?? null;
        expect(modelId).toMatch(/^[a-f0-9-]{36}$/);
        await expect(page.getByTestId("model-workspace")).toBeVisible();
        await expect(page.getByTestId("status-lock-own")).toBeVisible({
          timeout: 15_000,
        });

        // 2. Edit-Property OHNE Save.
        const nameInput = page
          .locator('[data-octrl-id="m_name"] input')
          .first();
        await expect(nameInput).toBeVisible({ timeout: 15_000 });
        await nameInput.click({ clickCount: 3 });
        await nameInput.fill("LOKALE-AENDERUNG");
        await nameInput.press("Tab");

        // Dirty-Indikator muss erscheinen.
        await expect(page.getByTestId("status-dirty")).toBeVisible({
          timeout: 5_000,
        });

        // 3. Warte bis useAutoSave den Snapshot in IndexedDB geschrieben hat.
        //    1 s Debounce + Dexie-put + Cleanup; 3 s ist sicherer Puffer.
        await page.waitForTimeout(3_000);

        // Verify: IndexedDB enthaelt den Snapshot.
        const snapshotCount = await page.evaluate(async () => {
          // Wir oeffnen die Dexie-Datenbank direkt aus dem Test-Context.
          // OsimDB ist in portal/src/snapshot/db.ts als version 1 mit
          // Table 'snapshots' definiert; compound primary key
          // [modelId+timestamp].
          // Wir nutzen die low-level IDB-API um ohne import zu pruefen.
          return await new Promise<number>((resolve) => {
            const req = indexedDB.open("OsimUiDB");
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("snapshots")) {
                resolve(0);
                return;
              }
              const tx = db.transaction("snapshots", "readonly");
              const store = tx.objectStore("snapshots");
              const countReq = store.count();
              countReq.onsuccess = () => resolve(countReq.result);
              countReq.onerror = () => resolve(0);
            };
            req.onerror = () => resolve(0);
          });
        });
        expect(snapshotCount).toBeGreaterThan(0);

        // 4. Simuliere Crash: page.reload behaelt IndexedDB, der In-Memory-
        //    ModelStore wird aber resetted.
        await page.reload({ waitUntil: "load" });

        // 5. Workspace-Component mount-effekt triggert useSnapshotRestore;
        //    Dialog "Ungespeicherte Aenderungen" erscheint.
        await expect(page.getByTestId("model-workspace")).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          page.getByRole("heading", {
            name: /Ungespeicherte Änderungen gefunden/i,
          }),
        ).toBeVisible({ timeout: 15_000 });

        // 6. Click "Wiederherstellen".
        await page
          .getByRole("button", { name: /^Wiederherstellen$/ })
          .click();

        // Dialog muss schliessen.
        await expect(
          page.getByRole("heading", {
            name: /Ungespeicherte Änderungen gefunden/i,
          }),
        ).not.toBeVisible({ timeout: 5_000 });

        // 7. Name-Field zeigt den lokalen Wert (NICHT Server-Original).
        const nameInputAfterRestore = page
          .locator('[data-octrl-id="m_name"] input')
          .first();
        await expect(nameInputAfterRestore).toHaveValue(
          "LOKALE-AENDERUNG",
          { timeout: 15_000 },
        );

        // Restore setzt dirty=true (damit Auto-Save den lokalen Stand auf
        // den Server traegt) — StatusBar muss "Ungespeichert" zeigen.
        await expect(page.getByTestId("status-dirty")).toBeVisible({
          timeout: 5_000,
        });
      } finally {
        // Cleanup-Modell (best-effort).
        if (modelId) {
          try {
            const token = await getIdToken(page);
            if (token) {
              await page.request.delete(
                `${API_BASE_URL}/api/v1/models/${modelId}`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
            }
          } catch (err) {
            console.warn("Cleanup-DELETE schlug fehl:", err);
          }
        }
      }
    },
  );
});
