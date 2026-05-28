/**
 * Tests fuer GObjCEdit (Track B1).
 *
 * Foundation-State + Edit-State-Maschine. Renderer-Anbindung (contentEditable
 * im RF-Adapter) ist nicht Teil dieses Tests.
 */

import { describe, expect, it } from "vitest";
import {
  GObjCEdit,
  STD_ROUND_CORNER,
} from "../GObjCEdit";
import { GORegion } from "../types";

describe("GObjCEdit — Edit-State-Maschine", () => {
  it("Default: IsEditing=false, m_string=''", () => {
    const n = new GObjCEdit();
    expect(n.IsEditing()).toBe(false);
    expect(n.m_string).toBe("");
  });

  it("BeginEditing setzt IsEditing=true und nimmt Snapshot", () => {
    const n = new GObjCEdit();
    n.m_string = "Vorher";
    n.BeginEditing();
    expect(n.IsEditing()).toBe(true);
    // Doppelter Aufruf ist No-Op (Snapshot bleibt der erste).
    n.m_string = "Zwischenstand";
    n.BeginEditing();
    expect(n.IsEditing()).toBe(true);
    // Snapshot ist intern, aber Cancel beweist ihn:
    n.CancelEditing();
    expect(n.m_string).toBe("Vorher");
  });

  it("EndEditing(newText) commitet den neuen Wert und beendet die Session", () => {
    const n = new GObjCEdit();
    n.m_string = "alt";
    n.BeginEditing();
    n.EndEditing("neu");
    expect(n.m_string).toBe("neu");
    expect(n.IsEditing()).toBe(false);
  });

  it("CancelEditing setzt m_string auf Snapshot zurueck", () => {
    const n = new GObjCEdit();
    n.m_string = "original";
    n.BeginEditing();
    n.m_string = "wurde wirklich getippt"; // simuliert Renderer-Update
    n.CancelEditing();
    expect(n.m_string).toBe("original");
    expect(n.IsEditing()).toBe(false);
  });

  it("EndEditing/CancelEditing sind No-Op wenn nicht im Edit-Modus", () => {
    const n = new GObjCEdit();
    n.m_string = "alt";
    n.EndEditing("neu");
    expect(n.m_string).toBe("alt"); // unveraendert
    n.CancelEditing();
    expect(n.m_string).toBe("alt");
  });
});

describe("GObjCEdit — OnEditGo", () => {
  it("erster Doppelklick: oeffnet Edit", () => {
    const n = new GObjCEdit();
    n.OnEditGo({ x: 0, y: 0 });
    expect(n.IsEditing()).toBe(true);
  });

  it("zweiter Doppelklick (waehrend Edit): commitet und beendet", () => {
    const n = new GObjCEdit();
    n.m_string = "initial";
    n.OnEditGo({ x: 0, y: 0 });
    n.m_string = "geaendert"; // Renderer hat den Text geupdatet
    n.OnEditGo({ x: 0, y: 0 });
    expect(n.IsEditing()).toBe(false);
    expect(n.m_string).toBe("geaendert");
  });
});

describe("GObjCEdit — CheckRegion", () => {
  it("liefert R_EDIT wenn innerhalb des Knotens", () => {
    const n = new GObjCEdit();
    n.m_VirtRect = { left: 0, top: 0, right: 100, bottom: 50 };
    expect(n.CheckRegion({ x: 50, y: 25 })).toBe(GORegion.R_EDIT);
  });

  it("liefert R_NO ausserhalb des Knotens", () => {
    const n = new GObjCEdit();
    n.m_VirtRect = { left: 0, top: 0, right: 100, bottom: 50 };
    expect(n.CheckRegion({ x: 999, y: 999 })).toBe(GORegion.R_NO);
  });
});

describe("STD_ROUND_CORNER", () => {
  it("ist 30 (1:1 zu C++ #define STD_ROUND_CORNER 30)", () => {
    expect(STD_ROUND_CORNER).toBe(30);
  });
});
