/**
 * TDD RED — Tests für grafikfenster-coords.ts (GAP-CLOSURE Plan 01-15 Zoom).
 *
 * Analog zu 3fls scheduler-widget/coords.ts; Einheit ist Sim-Zeit (Sekunden)
 * statt Kalenderdaten.
 *
 * Prueft:
 *  Z1: PX_PER_SECOND_BY_ZOOM — sinnvolle px/s je Stufe, "fit" existiert
 *  Z2: makeSimTimeToX(begin, zoomLevel, zoomFactor)(t) → lineare Abbildung
 *      mit x(begin)=0, Skalierung = PX_PER_SECOND_BY_ZOOM[level]*factor
 *  Z3: makeSimXToTime(begin, zoomLevel, zoomFactor)(x) → Inverse (Rundung auf Sekunden)
 *  Z4: contentWidthPx(span, zoomLevel, factor) = span * effectivePxPerSecond
 *  Z5: simTimeTicks(begin, end, zoomLevel) → Array mit label, x, und runden Zeitwerten
 *  Z6: SIM_ZOOM_LEVELS enthält alle definierten Stufen incl. "fit"
 *  Z7: zoomFactor-Multiplikation: zoomFactor=2 verdoppelt px/Einheit
 */

import { describe, expect, it } from "vitest";
import {
  PX_PER_SECOND_BY_ZOOM,
  SIM_ZOOM_LEVELS,
  makeSimTimeToX,
  makeSimXToTime,
  contentWidthPx,
  simTimeTicks,
} from "../components/grafikfenster-coords";

describe("SIM_ZOOM_LEVELS und PX_PER_SECOND_BY_ZOOM", () => {
  it("Z1: SIM_ZOOM_LEVELS enthält alle definierten Stufen", () => {
    // Mindest-Stufen: fit, tag, stunde, viertelstunde (analog 3fls: quartal,monat,woche,tag)
    expect(SIM_ZOOM_LEVELS).toContain("fit");
    expect(SIM_ZOOM_LEVELS).toContain("tag");
    expect(SIM_ZOOM_LEVELS).toContain("stunde");
    expect(SIM_ZOOM_LEVELS.length).toBeGreaterThanOrEqual(3);
  });

  it("Z1b: PX_PER_SECOND_BY_ZOOM hat Einträge für alle Stufen außer 'fit'", () => {
    // 'fit' hat keinen festen px/s-Wert — er wird dynamisch berechnet
    for (const level of SIM_ZOOM_LEVELS) {
      if (level === "fit") continue;
      expect(typeof PX_PER_SECOND_BY_ZOOM[level]).toBe("number");
      expect(PX_PER_SECOND_BY_ZOOM[level]).toBeGreaterThan(0);
    }
  });

  it("Z1c: Zoom-Stufen sind geordnet: engste Stufe hat höchsten px/s-Wert", () => {
    // Feinste Stufe (z.B. viertelstunde/stunde) soll mehr px/s als gröbste (tag)
    const nonFit = SIM_ZOOM_LEVELS.filter((l) => l !== "fit");
    const pxValues = nonFit.map((l) => PX_PER_SECOND_BY_ZOOM[l]);
    // mindestens eine Stufe hat mehr px/s als eine andere (d.h. nicht alle gleich)
    const max = Math.max(...pxValues);
    const min = Math.min(...pxValues);
    expect(max).toBeGreaterThan(min);
  });
});

describe("makeSimTimeToX", () => {
  it("Z2a: x(begin) = 0", () => {
    const toX = makeSimTimeToX(0, "tag");
    expect(toX(0)).toBe(0);
  });

  it("Z2b: x(begin + 1s) = PX_PER_SECOND_BY_ZOOM['tag'] * 1", () => {
    const toX = makeSimTimeToX(0, "tag");
    expect(toX(1)).toBeCloseTo(PX_PER_SECOND_BY_ZOOM["tag"]);
  });

  it("Z2c: linearer Verlauf — x(begin + 86400) = PX_PER_SECOND_BY_ZOOM['tag'] * 86400", () => {
    const toX = makeSimTimeToX(0, "tag");
    const expected = PX_PER_SECOND_BY_ZOOM["tag"] * 86400;
    expect(toX(86400)).toBeCloseTo(expected);
  });

  it("Z2d: begin != 0 — begin mappt auf 0", () => {
    const begin = 10000;
    const toX = makeSimTimeToX(begin, "stunde");
    expect(toX(begin)).toBe(0);
    expect(toX(begin + 3600)).toBeCloseTo(PX_PER_SECOND_BY_ZOOM["stunde"] * 3600);
  });
});

describe("makeSimXToTime (Inverse)", () => {
  it("Z3a: x=0 → begin", () => {
    const toT = makeSimXToTime(0, "tag");
    expect(toT(0)).toBe(0);
  });

  it("Z3b: Round-Trip — toX dann toT ergibt Ausgangswert (ganzzahlige Sekunden)", () => {
    const begin = 100;
    const toX = makeSimTimeToX(begin, "stunde");
    const toT = makeSimXToTime(begin, "stunde");
    const t0 = begin + 7200; // +2h
    expect(toT(toX(t0))).toBeCloseTo(t0, 0);
  });
});

describe("contentWidthPx", () => {
  it("Z4a: span * pxPerSecond (ohne factor)", () => {
    const span = 86400;
    const expected = span * PX_PER_SECOND_BY_ZOOM["tag"];
    expect(contentWidthPx(span, "tag")).toBeCloseTo(expected);
  });

  it("Z4b: zoomFactor verdoppelt die Breite", () => {
    const span = 3600;
    const w1 = contentWidthPx(span, "stunde", 1);
    const w2 = contentWidthPx(span, "stunde", 2);
    expect(w2).toBeCloseTo(w1 * 2);
  });
});

describe("simTimeTicks", () => {
  it("Z5a: liefert ein Array mit mindestens einem Tick", () => {
    const ticks = simTimeTicks(0, 86400, "tag");
    expect(ticks.length).toBeGreaterThan(0);
  });

  it("Z5b: jeder Tick hat label (string) und x (number)", () => {
    const ticks = simTimeTicks(0, 86400, "stunde");
    for (const tick of ticks) {
      expect(typeof tick.label).toBe("string");
      expect(tick.label.length).toBeGreaterThan(0);
      expect(typeof tick.x).toBe("number");
    }
  });

  it("Z5c: Tick-Labels enthalten Zeiteinheit-Suffix (d, h, m oder s)", () => {
    const ticks = simTimeTicks(0, 86400, "stunde"); // 1 Tag → Stunden
    // Alle Labels sollen eine Einheit enthalten
    const hasUnit = ticks.every((t) => /\d+[dhms]/.test(t.label));
    expect(hasUnit).toBe(true);
  });

  it("Z5d: Ticks sind aufsteigend nach x sortiert", () => {
    const ticks = simTimeTicks(0, 86400, "tag");
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].x).toBeGreaterThanOrEqual(ticks[i - 1].x);
    }
  });
});

describe("zoomFactor-Multiplikation", () => {
  it("Z7: zoomFactor=2 verdoppelt px/Sekunde gegenüber factor=1", () => {
    const toX1 = makeSimTimeToX(0, "stunde", 1);
    const toX2 = makeSimTimeToX(0, "stunde", 2);
    const t = 3600;
    expect(toX2(t)).toBeCloseTo(toX1(t) * 2);
  });
});
