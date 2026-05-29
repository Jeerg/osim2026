/**
 * Tests für AuftragColor.ts + grafikfenster-modes.ts (Plan 01-15 Task 1 — TDD RED).
 *
 * Prueft:
 *  1. auftragColor(oid) → CSS rgb()-String nach OSim-Formel
 *     RGB((oid%4)*64, ((oid/4)%4)*64, ((oid/16)%4)*64)
 *  2. Alle RGB-Komponenten sind aus {0,64,128,192}
 *  3. oid < 0 → Gap-Farbe weiß
 *  4. timeAxisScale(spanSeconds) → {intervals, unit} nach SPEC §2.4-Tabelle
 *  5. time2client(t, begin, end, widthPx) ist linear
 *  6. Modus-Registry enthält die drei echten OSim-Namen
 */

import { describe, expect, it } from "vitest";
import { auftragColor, GAP_COLOR } from "../components/AuftragColor";
import {
  timeAxisScale,
  time2client,
  GRAFIKFENSTER_MODES,
} from "../components/grafikfenster-modes";

describe("auftragColor", () => {
  it("Test 1: oid=0 → rgb(0,0,0); oid=-1 → Gap/weiß", () => {
    expect(auftragColor(0)).toBe("rgb(0,0,0)");
    expect(auftragColor(-1)).toBe(GAP_COLOR);
  });

  it("Test 1b: oid=1 hat G-Kanal 64 (R=64, G=0, B=0 wegen (1%4)*64=64 → R)", () => {
    // oid=1: R=(1%4)*64=64, G=((1/4)%4)*64=0, B=((1/16)%4)*64=0
    expect(auftragColor(1)).toBe("rgb(64,0,0)");
  });

  it("Test 1c: oid=4 hat G-Kanal 64 (R=0, G=64, B=0)", () => {
    // oid=4: R=(4%4)*64=0, G=((4/4)%4)*64=64, B=((4/16)%4)*64=0
    expect(auftragColor(4)).toBe("rgb(0,64,0)");
  });

  it("Test 2: jede RGB-Komponente ist aus {0,64,128,192}", () => {
    const valid = new Set([0, 64, 128, 192]);
    // Teste repräsentative OID-Werte 0..255
    for (let oid = 0; oid < 256; oid++) {
      const match = auftragColor(oid).match(
        /rgb\((\d+),(\d+),(\d+)\)/,
      );
      expect(match).not.toBeNull();
      if (match) {
        expect(valid.has(Number(match[1]))).toBe(true);
        expect(valid.has(Number(match[2]))).toBe(true);
        expect(valid.has(Number(match[3]))).toBe(true);
      }
    }
  });

  it("Test 3: negative oid → GAP_COLOR (weiß)", () => {
    expect(auftragColor(-1)).toBe(GAP_COLOR);
    expect(auftragColor(-100)).toBe(GAP_COLOR);
  });
});

describe("timeAxisScale", () => {
  it("Test 3a: 86400 → {intervals:24, unit:'h'}", () => {
    expect(timeAxisScale(86400)).toEqual({ intervals: 24, unit: "h" });
  });

  it("Test 3b: 604800 → {intervals:7, unit:'d'}", () => {
    expect(timeAxisScale(604800)).toEqual({ intervals: 7, unit: "d" });
  });

  it("Test 3c: 2592000 → {intervals:30, unit:'d'}", () => {
    expect(timeAxisScale(2592000)).toEqual({ intervals: 30, unit: "d" });
  });

  it("Test 3d: 2678400 → {intervals:31, unit:'d'}", () => {
    expect(timeAxisScale(2678400)).toEqual({ intervals: 31, unit: "d" });
  });

  it("Test 3e: freie Spanne → Einheit nach Größenordnung (lesbare Achse statt roher Sekunden)", () => {
    // Browser-UAT-Fix: ein dynamisches Mehr-Perioden-Fenster (z.B. ~59 Tage)
    // darf nicht in rohen Sekunden-Labels enden. Einheit wird nach Magnitude
    // gewählt; 8 Intervalle (OGfxRow-Default-Nähe).
    expect(timeAxisScale(0)).toEqual({ intervals: 8, unit: "s" });
    expect(timeAxisScale(90)).toEqual({ intervals: 8, unit: "s" }); // < 2min
    expect(timeAxisScale(3600)).toEqual({ intervals: 8, unit: "m" }); // 1h → Minuten
    expect(timeAxisScale(7200)).toEqual({ intervals: 8, unit: "h" }); // ≥ 2h → Stunden
    expect(timeAxisScale(1000000)).toEqual({ intervals: 8, unit: "d" }); // ~11.5d → Tage
    expect(timeAxisScale(5104785)).toEqual({ intervals: 8, unit: "d" }); // ~59d Bosch2-Lauf
  });
});

describe("time2client", () => {
  it("Test 4a: begin → 0, end → widthPx (lineare Abbildung)", () => {
    expect(time2client(0, 0, 86400, 800)).toBe(0);
    expect(time2client(86400, 0, 86400, 800)).toBe(800);
  });

  it("Test 4b: Mittelpunkt → widthPx/2", () => {
    expect(time2client(43200, 0, 86400, 800)).toBeCloseTo(400);
  });

  it("Test 4c: linear skaliert", () => {
    const w = 1000;
    const begin = 100;
    const end = 600;
    // t=350 liegt bei 50% → 500px
    expect(time2client(350, begin, end, w)).toBeCloseTo(500);
  });
});

describe("GRAFIKFENSTER_MODES", () => {
  it("enthält genau drei Modi", () => {
    expect(GRAFIKFENSTER_MODES).toHaveLength(3);
  });

  it("enthält die echten OSim-Modus-Namen (SPEC §3)", () => {
    const names = GRAFIKFENSTER_MODES.map((m) => m.name);
    expect(names).toContain("Auftragsdurchlauf Belegungsressourcen");
    expect(names).toContain("Warteschlangen");
    expect(names).toContain("Veränderung der Qualifikationselemente");
  });

  it("hat key-Felder belegung/warteschlangen/qualifikation", () => {
    const keys = GRAFIKFENSTER_MODES.map((m) => m.key);
    expect(keys).toContain("belegung");
    expect(keys).toContain("warteschlangen");
    expect(keys).toContain("qualifikation");
  });
});
