/**
 * Auth-Helper fuer E2E-Specs (Plan 01-12 Task 1).
 *
 * `loginAs(page, email, password)` automatisiert den Login-Flow gegen den
 * Firebase-Emulator:
 *
 *   1. navigate /login
 *   2. fill E-Mail + Passwort
 *   3. click "Anmelden"
 *   4. waitForURL: Redirect weg von /login (zur ?redirect-Ziel-Route oder /)
 *   5. waitForLoadState networkidle — alle Auth-State-Subscribes haben gefired
 *      (insbesondere /api/v1/auth/me das den Lazy-Tenant-Bootstrap triggern
 *      kann).
 *
 * `getIdToken(page)` holt den aktuellen Firebase-ID-Token aus dem Browser-
 * Context — wird fuer Auth-headers in API-Cleanup-Calls genutzt (z.B.
 * DELETE /api/v1/models/{id} im finally-Block).
 *
 * `logout(page)` ist ein placeholder; sobald das UI einen "Abmelden"-Button
 * hat (heute nicht), wird das hier verdrahtet.
 */

import type { Page } from "@playwright/test";

/**
 * Login-Helper. Wirft, wenn der Redirect nach 10 s nicht passiert ist
 * (z.B. weil Firebase-Emulator nicht laeuft oder die Credentials falsch sind).
 *
 * @param page     Playwright-Page
 * @param email    E-Mail-Adresse (z.B. ADMIN.email)
 * @param password Passwort (z.B. ADMIN.password)
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  // Wait for the form to render. `data-testid="login-form"` ist im
  // LoginPage-Component gesetzt (portal/src/routes/login.tsx).
  await page.locator('[data-testid="login-form"]').waitFor({ state: "visible" });

  // shadcn-Input rendert ein <input id="email" type="email">; getByLabel
  // matcht das ueber das verbundene <label htmlFor="email">.
  await page.getByLabel(/E-?Mail/i).fill(email);
  await page.getByLabel(/Passwort/i).fill(password);

  await page.getByRole("button", { name: /^Anmelden$/ }).click();

  // Warte auf Redirect weg von /login. Die LoginPage navigiert nach
  // erfolgreichem signIn auf `search.redirect ?? "/"`.
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 15_000,
  });

  // Network-idle: alle Auth-State-Effekte (z.B. /auth/me-Call, der Lazy-
  // Tenant-Bootstrap triggern kann) sind abgeschlossen.
  await page.waitForLoadState("networkidle");
}

/**
 * Liefert den aktuellen Firebase-ID-Token aus dem Browser-Context.
 *
 * Implementation-Hinweis: Firebase-JS-SDK persistiert den Token im
 * localStorage unter Schluessel `firebase:authUser:<apiKey>:<authDomain>`.
 * Da wir auf den Emulator zeigen, ist der Token genau das, was unser Backend
 * via /auth/me verifizieren kann (Firebase-Admin-SDK akzeptiert
 * Emulator-Tokens, wenn FIREBASE_AUTH_EMULATOR_HOST gesetzt ist).
 *
 * Faellt zurueck auf einen leeren String, wenn der User nicht eingeloggt
 * ist; Caller muss das fuer "skip cleanup"-Pfade selber detecten.
 */
export async function getIdToken(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    // Suche den firebase:authUser-Eintrag im localStorage.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("firebase:authUser:")) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as {
            stsTokenManager?: { accessToken?: string };
          };
          return parsed.stsTokenManager?.accessToken ?? "";
        } catch {
          return "";
        }
      }
    }
    return "";
  });
}

/**
 * Logout-Helper. Heute (Phase 1) gibt es keinen "Abmelden"-Button im UI;
 * sobald der existiert (Phase 2+), wird hier `page.getByRole("button",
 * { name: /Abmelden/ }).click()` aufgerufen. Bis dahin loescht der Helper
 * den Auth-State direkt aus dem Browser-Storage — ausreichend fuer
 * Test-Isolation zwischen Sessions.
 */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("firebase:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  });
  // Nach localStorage-clear navigiert die naechste protected-Route auf
  // /login (durch den _authenticated-Route-Guard).
}
