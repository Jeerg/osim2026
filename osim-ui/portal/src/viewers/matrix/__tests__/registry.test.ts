// Plan 01-06 Task 2: Registry-Smoke-Test fuer die drei Matrix-Viewer.
//
// Stellt sicher, dass nach Import die viewer-registry die drei
// synthetischen Matrix-Klassen kennt und auf die korrekten Components
// zeigt.

import { describe, expect, it } from "vitest";
import "../"; // triggert alle Side-Effect-Registrierungen via matrix/index.ts
import { getViewer } from "@/viewers/core/viewer-registry";
import {
  SYNTHETIC_RESS_BELEG_KLASS,
  SYNTHETIC_RESS_MENGE_KLASS,
  SYNTHETIC_RESS_VERKN_KLASS,
} from "../synthetic-nodes";
import { PRessBelegMatrixViewer } from "../PRessBelegMatrixViewer";
import { PRessMengeMatrixViewer } from "../PRessMengeMatrixViewer";
import { PRessVerknuepfungViewer } from "../PRessVerknuepfungViewer";

describe("matrix viewer registry", () => {
  it("PRessBelegMatrixViewer ist unter RESS_BELEG_GROUP registriert", () => {
    expect(getViewer(SYNTHETIC_RESS_BELEG_KLASS)).toBe(
      PRessBelegMatrixViewer,
    );
  });

  it("PRessMengeMatrixViewer ist unter RESS_MENGE_GROUP registriert", () => {
    expect(getViewer(SYNTHETIC_RESS_MENGE_KLASS)).toBe(
      PRessMengeMatrixViewer,
    );
  });

  it("PRessVerknuepfungViewer ist unter RESS_VERKNUEPFUNG_GROUP registriert", () => {
    expect(getViewer(SYNTHETIC_RESS_VERKN_KLASS)).toBe(
      PRessVerknuepfungViewer,
    );
  });
});
