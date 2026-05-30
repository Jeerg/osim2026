/**
 * Tests für grafikfenster-coords.ts (GAP-CLOSURE Plan 01-15 Zoom).
 *
 * Neue intuitive Semantik (Browser-UAT "zoom geht nicht richtig"): jede Stufe
 * legt ~ ihre Dauer in die Viewport-Breite (woche/tag/stunde/15min); px/s wird
 * aus Container-Breite/Dauer berechnet und auf MAX_CONTENT_PX gedeckelt, damit
 * feine Stufen auf langen Perioden nicht zu einer Mega-Leinwand werden
 * ("Grafik nach Zoomen weg").
 */

import { describe, expect, it } from "vitest";
import {
  ZOOM_LEVEL_DURATION_SEC,
  SIM_ZOOM_LEVELS,
  MAX_CONTENT_PX,
  effectivePxPerSecond,
  makeSimTimeToX,
  makeSimXToTime,
  contentWidthPx,
  simTimeTicks,
} from "../components/grafikfenster-coords";

/** Nominaler Viewport-Fallback (= NOMINAL_VIEWPORT_PX), explizit übergeben. */
const VP = 1100;

describe("SIM_ZOOM_LEVELS + Stufen-Dauern", () => {
  it("Z1: enthält fit, woche, tag, stunde, viertelstunde", () => {
    expect(SIM_ZOOM_LEVELS).toContain("fit");
    expect(SIM_ZOOM_LEVELS).toContain("woche");
    expect(SIM_ZOOM_LEVELS).toContain("tag");
    expect(SIM_ZOOM_LEVELS).toContain("stunde");
    expect(SIM_ZOOM_LEVELS.length).toBeGreaterThanOrEqual(4);
  });

  it("Z1b: ZOOM_LEVEL_DURATION_SEC: woche=7d, tag=1d, stunde=1h, 15min=900s", () => {
    expect(ZOOM_LEVEL_DURATION_SEC.woche).toBe(7 * 86400);
    expect(ZOOM_LEVEL_DURATION_SEC.tag).toBe(86400);
    expect(ZOOM_LEVEL_DURATION_SEC.stunde).toBe(3600);
    expect(ZOOM_LEVEL_DURATION_SEC.viertelstunde).toBe(900);
  });

  it("Z1c: feinere Stufe = mehr px/s (stunde > tag > woche)", () => {
    const woche = effectivePxPerSecond("woche", 1, VP, 0);
    const tag = effectivePxPerSecond("tag", 1, VP, 0);
    const stunde = effectivePxPerSecond("stunde", 1, VP, 0);
    expect(tag).toBeGreaterThan(woche);
    expect(stunde).toBeGreaterThan(tag);
  });

  it("Z1d: 'tag' ~ ein Sim-Tag füllt den Viewport (vp/86400)", () => {
    expect(effectivePxPerSecond("tag", 1, VP, 0)).toBeCloseTo(VP / 86400);
  });
});

describe("makeSimTimeToX", () => {
  it("Z2a: x(begin) = 0", () => {
    expect(makeSimTimeToX(0, "tag", 1, VP, 0)(0)).toBe(0);
  });

  it("Z2b: x(begin + 1s) = effectivePxPerSecond('tag')", () => {
    const px = effectivePxPerSecond("tag", 1, VP, 0);
    expect(makeSimTimeToX(0, "tag", 1, VP, 0)(1)).toBeCloseTo(px);
  });

  it("Z2c: linearer Verlauf — x(86400) = px * 86400", () => {
    const px = effectivePxPerSecond("tag", 1, VP, 0);
    expect(makeSimTimeToX(0, "tag", 1, VP, 0)(86400)).toBeCloseTo(px * 86400);
  });

  it("Z2d: begin != 0 — begin mappt auf 0", () => {
    const begin = 10000;
    const px = effectivePxPerSecond("stunde", 1, VP, 0);
    const toX = makeSimTimeToX(begin, "stunde", 1, VP, 0);
    expect(toX(begin)).toBe(0);
    expect(toX(begin + 3600)).toBeCloseTo(px * 3600);
  });
});

describe("makeSimXToTime (Inverse)", () => {
  it("Z3a: x=0 → begin", () => {
    expect(makeSimXToTime(0, "tag", 1, VP, 0)(0)).toBe(0);
  });

  it("Z3b: Round-Trip — toX dann toT ergibt Ausgangswert", () => {
    const begin = 100;
    const toX = makeSimTimeToX(begin, "stunde", 1, VP, 0);
    const toT = makeSimXToTime(begin, "stunde", 1, VP, 0);
    const t0 = begin + 7200;
    expect(toT(toX(t0))).toBeCloseTo(t0, 0);
  });
});

describe("contentWidthPx", () => {
  it("Z4a: span * effectivePxPerSecond", () => {
    const span = 86400;
    const expected = span * effectivePxPerSecond("tag", 1, VP, span);
    expect(contentWidthPx(span, "tag", 1, VP)).toBeCloseTo(expected);
  });

  it("Z4b: zoomFactor verdoppelt die Breite (unterhalb des Deckels)", () => {
    const span = 3600; // kurze Spanne → kein Deckel
    const w1 = contentWidthPx(span, "stunde", 1, VP);
    const w2 = contentWidthPx(span, "stunde", 2, VP);
    expect(w2).toBeCloseTo(w1 * 2);
  });

  it("Z4c: Content-Breite ist gedeckelt (feine Stufe auf Monats-Periode)", () => {
    const span = 31 * 86400; // Monat
    const w = contentWidthPx(span, "viertelstunde", 1, VP);
    expect(w).toBeLessThanOrEqual(MAX_CONTENT_PX + 1);
  });
});

describe("simTimeTicks", () => {
  it("Z5a: liefert ein Array mit mindestens einem Tick", () => {
    expect(simTimeTicks(0, 86400, "tag", 1, VP).length).toBeGreaterThan(0);
  });

  it("Z5b: jeder Tick hat label (string) und x (number)", () => {
    for (const tick of simTimeTicks(0, 86400, "stunde", 1, VP)) {
      expect(typeof tick.label).toBe("string");
      expect(tick.label.length).toBeGreaterThan(0);
      expect(typeof tick.x).toBe("number");
    }
  });

  it("Z5c: Tick-Labels enthalten Zeiteinheit-Suffix (d, h, m oder s)", () => {
    const ticks = simTimeTicks(0, 86400, "stunde", 1, VP);
    expect(ticks.every((t) => /\d+[dhms]/.test(t.label))).toBe(true);
  });

  it("Z5d: Ticks sind aufsteigend nach x sortiert", () => {
    const ticks = simTimeTicks(0, 86400, "tag", 1, VP);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].x).toBeGreaterThanOrEqual(ticks[i - 1].x);
    }
  });
});

describe("zoomFactor-Multiplikation", () => {
  it("Z7: zoomFactor=2 verdoppelt px/Sekunde (ohne Deckel)", () => {
    const toX1 = makeSimTimeToX(0, "stunde", 1, VP, 0);
    const toX2 = makeSimTimeToX(0, "stunde", 2, VP, 0);
    expect(toX2(3600)).toBeCloseTo(toX1(3600) * 2);
  });
});
