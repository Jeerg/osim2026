// Viewer-Navigation (Plan 01-10 Task 2):
// Navigiere durch alle Sidebar-Knoten und pruefe, dass kein Klick einen
// React-Crash erzeugt. Phase-1-Acceptance: 12 Viewer renderbar.
//
// Wir prufen das pragmatisch: Klick auf jeden treeitem -> ViewerHost
// rendert irgendetwas (kein Error-Boundary, kein "Etwas ist schiefgelaufen").

import { test, expect } from "@playwright/test";
import { skipIfNoStack } from "./fixtures/skip-if-no-backend";
import { makeTestUser, signUpViaUi } from "./fixtures/auth-helper";
import { findSmallOtxFixture } from "./fixtures/test-otx-files";

test.beforeEach(async () => {
  await skipIfNoStack();
});

test("clicking through sidebar nodes does not crash any viewer", async ({
  page,
}) => {
  const fixture = findSmallOtxFixture();
  test.skip(fixture === null, "Keine OTX-Fixture verfuegbar.");
  const otx = fixture!;

  // 1) Register + upload.
  const user = makeTestUser("e2e-nav");
  await signUpViaUi(page, user);
  await page.goto("/models/upload");
  await page.locator('input[type="file"]').first().setInputFiles(otx.path);
  await page.getByRole("button", { name: /Hoch?laden|Upload/i }).first().click();
  await page.waitForURL(/\/models\/\d+$/, { timeout: 60_000 });

  // 2) Track JS-Errors (vor allem unhandled Errors aus dem React-Tree).
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => {
    jsErrors.push(err.message);
  });

  // 3) Iteriere ueber bis zu 30 sichtbare Sidebar-Knoten.
  // Expand alle Tree-Folders zuerst.
  await page.locator('[role="treeitem"]').first().waitFor({ timeout: 30_000 });
  // Klicke einmal alle Aufklapp-Pfeile (falls sichtbar als Buttons mit aria-expanded).
  const expandableCount = await page.locator('[aria-expanded="false"]').count();
  for (let i = 0; i < Math.min(expandableCount, 20); i++) {
    try {
      const btn = page.locator('[aria-expanded="false"]').first();
      await btn.click({ timeout: 2000 });
      await page.waitForTimeout(150);
    } catch {
      break;
    }
  }

  // 4) Sammle ALLE jetzt sichtbaren treeitems und klicke nacheinander
  //    auf bis zu 25 davon.
  const nodes = page.locator('[role="treeitem"]');
  const count = Math.min(await nodes.count(), 25);
  for (let i = 0; i < count; i++) {
    try {
      await nodes.nth(i).click({ timeout: 3000 });
    } catch {
      // Node ggf. weggescrollt o.ae. -- weiterklicken.
      continue;
    }
    // Kurz warten, damit der ViewerHost reagieren kann.
    await page.waitForTimeout(120);
    // Pruefe, dass kein Error-Boundary getriggert wurde.
    const errorBanner = page.getByText(/Etwas ist schiefgelaufen|Error/i);
    const errorCount = await errorBanner.count();
    expect(errorCount).toBeLessThanOrEqual(0);
  }

  // 5) Keine JS-Errors gesammelt.
  expect(jsErrors, "Page-Errors waehrend Viewer-Navigation").toEqual([]);
});
