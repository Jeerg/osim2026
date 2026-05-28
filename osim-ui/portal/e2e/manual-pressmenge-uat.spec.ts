import { test, expect } from "@playwright/test";
import { loginAs, getIdToken } from "./fixtures/auth";
import { API_BASE_URL } from "./fixtures/test-users";

const USER = { email: "jwfischer69@gmail.com", password: "123456" };
const OTX =
  "C:\\Users\\JörgWFischer\\PycharmProjects\\osim-engine\\engine\\tests\\fixtures\\otx\\passozmenge_minimal.otx";
const SHOT = "uat-shots";

test.describe("Phase 1.3 UAT — PRessMengeMatrixViewer", () => {
  test.setTimeout(180_000);

  test("upload → tree → design → matrix", async ({ page }) => {
    let modelId: string | null = null;

    page.on("console", (m) => {
      const t = m.type();
      if (t === "error" || t === "warning") {
        console.log(`[browser ${t}] ${m.text()}`);
      }
    });

    await loginAs(page, USER.email, USER.password);
    await page.screenshot({ path: `${SHOT}/01-after-login.png`, fullPage: true });

    await page.goto("/models");
    await expect(
      page.getByRole("heading", { name: /Modell-Bibliothek/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${SHOT}/02-library.png`, fullPage: true });

    await page.getByTestId("btn-upload-otx").click();
    await expect(page.getByTestId("upload-otx-dialog")).toBeVisible();
    await page.locator("#upload-otx-file").setInputFiles(OTX);
    await page.locator("#upload-otx-name").fill(`uat-passozmenge-${Date.now()}`);
    await page.screenshot({ path: `${SHOT}/03-upload-dialog.png`, fullPage: true });
    await page.getByRole("button", { name: /^Hochladen$/i }).click();

    await page.waitForURL(/\/models\/[a-f0-9-]{36}/, { timeout: 30_000 });
    modelId = page.url().split("/").pop()?.split("?")[0] ?? "";
    console.log(`modelId: ${modelId}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOT}/04-workspace.png`, fullPage: true });

    // Tree expandieren — "Mengenressourcen"-Gruppe öffnen (passozmenge_minimal
    // hat keine PDurchlaufpläne; wir selektieren direkt PRessMenge).
    await expect(page.getByTestId("model-tree")).toBeVisible({ timeout: 15_000 });
    const mengeGroupRow = page
      .locator('[data-testid^="tree-row-grp:Mengenressourcen:"]')
      .first();
    if (await mengeGroupRow.count()) {
      await mengeGroupRow.click();
      await page.waitForTimeout(300);
    }

    // Erste PRessMenge-Row finden
    const pressMengeRow = page.locator('[data-klass="PRessMenge"]').first();
    if (await pressMengeRow.count()) {
      await pressMengeRow.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `${SHOT}/05-pressmenge-selected.png`, fullPage: true });

    // PRessMenge-OID extrahieren
    const pmTid = await pressMengeRow.getAttribute("data-testid").catch(() => null);
    const planOid = pmTid?.match(/(\d+)$/)?.[1];
    console.log(`pressMengeOid: ${planOid}`);

    if (planOid) {
      // Grafik-Viewer (hint=design) — Memory feedback-sim-grafik-viewer-immer
      await page.goto(`/models/${modelId}?selection=${planOid}&hint=design`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${SHOT}/06-design-viewer.png`, fullPage: true });

      // Matrix-Hint
      await page.goto(`/models/${modelId}?selection=${planOid}&hint=matrix`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOT}/07-matrix-viewer.png`, fullPage: true });

      // Inspektion: welcher Viewer?
      const viewerRoot = page.locator('[data-viewer]');
      const viewerCount = await viewerRoot.count();
      for (let i = 0; i < viewerCount; i++) {
        const attr = await viewerRoot.nth(i).getAttribute("data-viewer");
        console.log(`data-viewer #${i}: ${attr}`);
      }

      // PRessMengeMatrixViewer-Marker
      const pressMengeViewer = page.locator('[data-viewer="PRessMengeMatrixViewer"]');
      const hasPRessMenge = await pressMengeViewer.count();
      console.log(`PRessMengeMatrixViewer instances: ${hasPRessMenge}`);

      const pressBelegViewer = page.locator('[data-viewer="PRessBelegMatrixViewer"]');
      const hasPRessBeleg = await pressBelegViewer.count();
      console.log(`PRessBelegMatrixViewer instances: ${hasPRessBeleg}`);

      // Matrix-Cells im DOM
      const cells = page.locator('[data-matrix-cell]');
      const cellCount = await cells.count();
      console.log(`matrix cells in DOM: ${cellCount}`);
      const cellTexts = await cells.allTextContents();
      console.log(`cell texts (first 8): ${JSON.stringify(cellTexts.slice(0, 8))}`);

      // Toolbar
      const dropdown = page.locator('select, [role="combobox"]');
      const dropdownCount = await dropdown.count();
      console.log(`dropdowns/comboboxes: ${dropdownCount}`);
      for (let i = 0; i < Math.min(dropdownCount, 5); i++) {
        const text = await dropdown.nth(i).textContent().catch(() => null);
        console.log(`dropdown #${i}: ${text?.slice(0, 100)}`);
      }

      // Pills mit E/V/Z/A
      const allText = await page.locator("main").innerText().catch(() => "");
      const hasE = /\bErzeuger\b|\b\(E\)\b/.test(allText);
      const hasV = /\bVerbraucher\b|\b\(V\)\b/.test(allText);
      const hasZ = /\bZwischen\b|\b\(Z\)\b/.test(allText);
      const hasA = /\bAbfrage\b|\b\(A\)\b/.test(allText);
      console.log(
        `text markers — E=${hasE} V=${hasV} Z=${hasZ} A=${hasA}`,
      );

      // Sample header text
      const headers = await page.locator('[data-row-header], [data-col-header], th').allTextContents();
      console.log(`headers (first 10): ${JSON.stringify(headers.slice(0, 10))}`);
    }

    // Cleanup
    if (modelId) {
      const token = await getIdToken(page);
      if (token) {
        await page.request.delete(`${API_BASE_URL}/api/v1/models/${modelId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  });
});
