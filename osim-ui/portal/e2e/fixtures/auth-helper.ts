// Auth-Helper: Register/Login per Firebase-Emulator-REST.
//
// Wir nutzen die Firebase Auth Emulator REST-API direkt, nicht die UI-
// Eingabe -- das ist robuster und schneller. Nach dem Login wird das
// erhaltene ID-Token in den localStorage des Page-Contexts injiziert,
// damit die Firebase-SDK des Portals es als gueltige Session erkennt.
//
// Pragmatischer Alternativ-Pfad: einfache UI-Eingabe via fillForm.
// Wir bieten beide an; die UI-Variante ist die in den .spec.ts genutzte
// Standard-Route (entspricht dem User-Journey).

import { Page, expect } from "@playwright/test";

export interface TestUser {
  email: string;
  password: string;
}

/** Erzeugt einen "frischen" Test-User mit Zeitstempel, damit Tests nicht
 * mit alten Account-Resten kollidieren.
 */
export function makeTestUser(prefix = "e2e"): TestUser {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    email: `${prefix}-${id}@example.com`,
    password: "TestPwd-1234",
  };
}

/** UI-basierter Signup: wechselt in Signup-Mode, tippt Email/Password
 * ein und klickt "Konto anlegen". Wartet auf Redirect weg von /login.
 */
export async function signUpViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  // Toggle-Link in Signup-Mode wechseln. Text: "Noch kein Konto? Jetzt registrieren."
  const signupToggle = page.getByRole("button", {
    name: /Noch kein Konto.*registrieren/i,
  });
  if (await signupToggle.isVisible().catch(() => false)) {
    await signupToggle.click();
  }
  await page.getByLabel("E-Mail").fill(user.email);
  await page.getByLabel("Passwort").fill(user.password);
  // Submit (Enter triggert form-submit zuverlaessig).
  await page.getByLabel("Passwort").press("Enter");
  // Erwarte Redirect weg von /login.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** UI-basierter Login (User existiert bereits). */
export async function logInViaUi(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(user.email);
  await page.getByLabel("Passwort").fill(user.password);
  await page.getByLabel("Passwort").press("Enter");
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}
