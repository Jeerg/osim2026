// E2E-Hauptpfad (Plan 01-10 Task 2):
// Register -> Login -> Upload Dummy.otx -> Sidebar zeigt Hierarchie ->
// Klick auf Knoten -> PSimulatorViewer -> Edit Property -> Save -> Reload
// -> Wert bleibt.
//
// Dies ist der wichtigste E2E-Test der Phase 1. Wenn dieser Test gruen
// ist, hat das System seinen Kern-Use-Case erfuellt.

import { test, expect } from "@playwright/test";
import { skipIfNoStack } from "./fixtures/skip-if-no-backend";
import { makeTestUser, signUpViaUi } from "./fixtures/auth-helper";
import { findSmallOtxFixture } from "./fixtures/test-otx-files";

test.beforeEach(async () => {
  await skipIfNoStack();
});

test("full flow: upload otx, edit a property, save, reload, value persists", async ({
  page,
}) => {
  const fixture = findSmallOtxFixture();
  test.skip(
    fixture === null,
    "Keine OTX-Fixture (Dummy.otx/embb_pre_run.otx) verfuegbar -- " +
      "Test braucht OSim2004/Vorstellung04 oder engine/tests/fixtures/otx/."
  );
  const otx = fixture!;

  // 1) Register a fresh user.
  const user = makeTestUser("e2e-flow");
  await signUpViaUi(page, user);

  // 2) Navigate to upload page.
  await page.goto("/models/upload");

  // 3) Upload the OTX file via the file input.
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(otx.path);

  // 4) The upload-form has a submit button. Click it.
  // Common label: "Hochladen" or "Upload" -- try both.
  const uploadBtn = page.getByRole("button", { name: /Hoch?laden|Upload/i });
  await uploadBtn.first().click();

  // 5) Expect a redirect to /models/{id} after success.
  // Increase timeout: backend parses the entire OTX synchronously.
  await page.waitForURL(/\/models\/\d+$/, { timeout: 60_000 });

  // 6) Sidebar shows hierarchy (at least the root "Modell"/ASimulator node).
  // The sidebar is a tree -- we just check that *some* tree node is visible.
  // No strict text match: different model names produce different labels.
  // Wait for any element with role="treeitem" or a Sidebar-Aria-Label.
  const someNode = page.locator('[role="treeitem"]').first();
  await expect(someNode).toBeVisible({ timeout: 30_000 });

  // 7) Click the root node -- it should be the first treeitem.
  await someNode.click();

  // 8) The PSimulatorViewer is now mounted on the right side. Search for
  //    a text input or numeric input -- m_keim (random seed) is the
  //    canonical edit-target for ASimulator.
  // Defensive: just look for any input element inside the main viewer area.
  const anyInput = page.locator('input:not([type="file"]):not([type="checkbox"])').first();
  await expect(anyInput).toBeVisible({ timeout: 15_000 });

  // 9) Edit: replace the value with something distinctive.
  const newValue = "777777";
  await anyInput.click();
  await anyInput.fill(newValue);
  // Blur to commit the value.
  await anyInput.blur();

  // 10) Find the Save button. Label "Speichern" laut Plan 01-09.
  const saveBtn = page.getByRole("button", { name: /Speichern/i }).first();
  await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
  await saveBtn.click();

  // 11) Warte auf Save-Confirmation (Toast oder Save-Button-State zurueck zu
  //     "sauber" / Toast "Gespeichert" oder Save-Button disabled).
  // Pragmatisch: warte 3s -- Backend-Save mit OTX-Serialisierung dauert.
  await page.waitForTimeout(3000);

  // 12) Reload the page.
  await page.reload();

  // 13) Erneut warten, bis Sidebar + ViewerHost geladen sind.
  await expect(page.locator('[role="treeitem"]').first()).toBeVisible({
    timeout: 30_000,
  });
  // Klick auf Root erneut.
  await page.locator('[role="treeitem"]').first().click();

  // 14) Erwarte, dass der gepflegte Wert noch da ist.
  const reloadedInput = page.locator(
    'input:not([type="file"]):not([type="checkbox"])'
  ).first();
  await expect(reloadedInput).toBeVisible({ timeout: 15_000 });
  const reloadedValue = await reloadedInput.inputValue();
  expect(reloadedValue).toContain(newValue);
});
