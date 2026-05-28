/**
 * Tests fuer OGGridAlt (Track B2).
 *
 * Verifiziert: das Grid erbt von OGraphGrid + addiert Text-Reserve auf
 * der rechten Seite bei computeSizes(). Klassen-Identitaet zum C++-Original.
 */

import { describe, expect, it } from "vitest";
import {
  OGGridAlt,
  OGGRIDALT_DEFAULT_TEXT_SPACE,
} from "@/graph/foundation/OGGridAlt";
import { OGraphGrid } from "@/graph/foundation/OGraphGrid";

describe("OGGridAlt — Klassen-Identitaet", () => {
  it("erbt von OGraphGrid (instanceof-Check)", () => {
    const g = new OGGridAlt(0);
    expect(g instanceof OGraphGrid).toBe(true);
    expect(g instanceof OGGridAlt).toBe(true);
  });

  it("Konstruktor mit ID-Default 0", () => {
    const g = new OGGridAlt();
    expect(g).toBeDefined();
  });
});

describe("OGGridAlt — Text-API (C++ Z.1894-1897)", () => {
  it("Default-Werte: m_TextSpace=120, m_TextColor='#000000', m_string=''", () => {
    const g = new OGGridAlt(0);
    expect(g.GetTextSpace()).toBe(OGGRIDALT_DEFAULT_TEXT_SPACE);
    expect(g.GetTextColor()).toBe("#000000");
    expect(g.GetText()).toBe("");
  });

  it("SetText / GetText: Roundtrip", () => {
    const g = new OGGridAlt(0);
    g.SetText("Alternative-Bedingung A");
    expect(g.GetText()).toBe("Alternative-Bedingung A");
  });

  it("SetTextColor / GetTextColor: Roundtrip", () => {
    const g = new OGGridAlt(0);
    g.SetTextColor("#ff0000");
    expect(g.GetTextColor()).toBe("#ff0000");
  });

  it("SetTextSpace / GetTextSpace: Roundtrip", () => {
    const g = new OGGridAlt(0);
    g.SetTextSpace(80);
    expect(g.GetTextSpace()).toBe(80);
  });
});

describe("OGGridAlt — computeSizes addiert m_TextSpace", () => {
  it("leeres Grid: m_GSize.cx ist Standard-Grid-Mindestgroesse + m_TextSpace", () => {
    const g = new OGGridAlt(0);
    // Vergleichs-Grid (Vanilla OGraphGrid) — gleiche Initial-Bedingung.
    const baseline = new OGraphGrid(0);
    baseline.computeSizes();
    const baselineCx = baseline.m_GSize.cx;

    g.computeSizes();
    expect(g.m_GSize.cx).toBe(baselineCx + OGGRIDALT_DEFAULT_TEXT_SPACE);
    // Hoehe bleibt unveraendert ggue. Baseline (Text-Reserve ist rein horizontal).
    expect(g.m_GSize.cy).toBe(baseline.m_GSize.cy);
  });

  it("Custom-TextSpace wirkt auf computeSizes", () => {
    const g = new OGGridAlt(0);
    g.SetTextSpace(50);
    const baseline = new OGraphGrid(0);
    baseline.computeSizes();
    const baselineCx = baseline.m_GSize.cx;

    g.computeSizes();
    expect(g.m_GSize.cx).toBe(baselineCx + 50);
  });
});
