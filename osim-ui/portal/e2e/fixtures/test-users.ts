/**
 * Test-User-Fixtures fuer die E2E-Specs (Plan 01-12).
 *
 * Die User werden vom Firebase-Emulator-Seed-Skript angelegt
 * (`scripts/seed_firebase_emulator.py`, siehe Plan 01-05). Beide haben beim
 * ersten /auth/me-Call automatisch ein Tenant-Schema (Lazy-Bootstrap, D-17).
 *
 * Custom Claims:
 *   - admin@osim-dev → role=admin, tenant_id=tenant_<uid>
 *   - user@osim-dev  → role=user,  tenant_id=tenant_<uid>
 *
 * NICHT in Production. Diese Credentials sind public-by-design fuer den
 * Dev-Firebase-Emulator. In Production gibt es keinen Emulator und damit
 * auch keine seedbaren Standard-User.
 */

export interface TestUser {
  email: string;
  password: string;
  role: "admin" | "user";
}

export const ADMIN: TestUser = {
  email: "admin@osim-dev",
  password: "admin123",
  role: "admin",
};

export const USER: TestUser = {
  email: "user@osim-dev",
  password: "user123",
  role: "user",
};

/**
 * Pfad zur kanonischen Test-OTX-Datei aus dem OSim2004-Referenz-Repo
 * (Dummy.otx, ~228 KB, 252 Objekte). Wird in allen drei Specs via
 * `setInputFiles()` an den Upload-Dialog uebergeben.
 *
 * Hinweis fuer Cross-Platform: Pfad ist absolut Windows. Auf Linux/macOS-CI
 * muesste das auf einen plattform-spezifischen Pfad gemappt werden oder die
 * Datei ins Repo unter `portal/e2e/fixtures/Dummy.otx` kopiert werden.
 * Phase-1-Pragma: lokales Windows-Dev-Setup.
 */
export const DUMMY_OTX_PATH =
  "C:\\Users\\JörgWFischer\\PycharmProjects\\OSim2004\\Vorstellung04\\Dummy.otx";

/**
 * Pfad zu Embb-AslFj.otx aus dem OSim2004-Referenz-Repo
 * (~271 KiB, deutlich groesseres Modell mit PDurchlaufplan + PDpKn*-Knoten +
 * PRessBeleg/PBetriebsmittel + PAssozBeleg). Wird in der Phase-1.2-E2E-Spec
 * `matrix-cell-edit-persistence.spec.ts` (Welle 1.2-H) verwendet, weil das
 * Modell die 2D-Matrix-Belegungen enthaelt, die Dummy.otx nicht hat.
 *
 * Hinweis Cross-Platform: Pfad ist Windows-absolut, wie bei DUMMY_OTX_PATH.
 */
export const EMBB_OTX_PATH =
  "C:\\Users\\JörgWFischer\\PycharmProjects\\OSim2004\\Vorstellung04\\Embb-AslFj.otx";

/**
 * Konfiguration fuer den Backend-API-Zugriff aus Tests (z.B. fuer Cleanup
 * via DELETE /api/v1/models/{id}). Spiegelt docker-compose-Default-Ports.
 */
export const API_BASE_URL = "http://localhost:8000";
export const PORTAL_BASE_URL = "http://localhost:3002";
export const FIREBASE_EMULATOR_HOST = "http://localhost:19099";
