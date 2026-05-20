// Helper fuer OTX-Test-Files (Plan 01-10 Task 2).
//
// OTX-Files liegen in OSim2004/Vorstellung04 (extern) und im
// engine/tests/fixtures/otx/ (Mono-Repo). Wir laden sie zur Test-Laufzeit
// aus den absoluten Pfaden -- KEIN Commit ins Repo (zu gross, Lizenz unklar).
//
// In CI laufen die Tests, falls die Fixtures nicht erreichbar sind,
// einfach mit `test.skip(...)` -- siehe Verwendung in den .spec.ts-Dateien.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo-Pfade ablaufen, bis wir die OTX-Datei finden.
const CANDIDATE_DIRS = [
  // 1) engine-Repo (eingecheckte Mini-Fixture)
  path.resolve(
    __dirname, "..", "..", "..", "..", "engine", "tests", "fixtures", "otx",
  ),
  // 2) OSim2004/Vorstellung04 (Windows-Dev-Maschine)
  "C:/Users/JörgWFischer/PycharmProjects/OSim2004/Vorstellung04",
];

export interface OtxFixture {
  filename: string;
  path: string;
  bytes: Buffer;
}

export function findOtxFixture(filename: string): OtxFixture | null {
  for (const dir of CANDIDATE_DIRS) {
    const full = path.join(dir, filename);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        return {
          filename,
          path: full,
          bytes: fs.readFileSync(full),
        };
      }
    } catch {
      // ignore, try next
    }
  }
  return null;
}

/** Versucht Dummy.otx, faellt zurueck auf embb_pre_run.otx. */
export function findSmallOtxFixture(): OtxFixture | null {
  return findOtxFixture("Dummy.otx") ?? findOtxFixture("embb_pre_run.otx");
}
