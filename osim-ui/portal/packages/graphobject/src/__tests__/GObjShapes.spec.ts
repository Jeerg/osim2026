/**
 * Tests fuer die Shape-Klassen GObjOSimDlp / GObjSquare / GObjRect (Track B3).
 */

import { describe, expect, it } from "vitest";
import {
  GObjOSimDlp,
  GObjSquare,
  GObjRect,
  GObjType,
  GSqrType,
  STD_PEAK_WIDTH,
} from "../GObjShapes";
import { GObjLink } from "../GObjLink";

describe("GObjType + GSqrType + STD_PEAK_WIDTH", () => {
  it("GObjType-Werte 1:1 zu C++ Z.741-763", () => {
    expect(GObjType.PDLPLKNOTEN).toBe(0);
    expect(GObjType.PDLPLKANTE).toBe(13);
    expect(GObjType.NO_TYPE).toBe(18);
  });

  it("GSqrType START/END/STD", () => {
    expect(GSqrType.START_NODE).toBe(0);
    expect(GSqrType.END_NODE).toBe(1);
    expect(GSqrType.START_AND_END).toBe(2);
    expect(GSqrType.STD_NODE).toBe(3);
  });

  it("STD_PEAK_WIDTH = 20 (C++ Z.765)", () => {
    expect(STD_PEAK_WIDTH).toBe(20);
  });
});

describe("GObjOSimDlp", () => {
  it("erbt von GObjLink, Default GObjType=NO_TYPE", () => {
    const n = new GObjOSimDlp();
    expect(n instanceof GObjLink).toBe(true);
    expect(n.GetGObjType()).toBe(GObjType.NO_TYPE);
  });

  it("SetGObjType / GetGObjType Roundtrip", () => {
    const n = new GObjOSimDlp();
    n.SetGObjType(GObjType.PDLPLKNOTEN);
    expect(n.GetGObjType()).toBe(GObjType.PDLPLKNOTEN);
    n.SetGObjType(GObjType.PDPKNALTERNATIV);
    expect(n.GetGObjType()).toBe(GObjType.PDPKNALTERNATIV);
  });
});

describe("GObjSquare", () => {
  it("Defaults: GObjType=NO_TYPE, SqrType=STD_NODE, delta=(0,0)", () => {
    const n = new GObjSquare();
    expect(n.GetGObjType()).toBe(GObjType.NO_TYPE);
    expect(n.GetSqrState()).toBe(GSqrType.STD_NODE);
    expect(n.GetDelta()).toEqual({ x: 0, y: 0 });
  });

  it("SetSqrState ändert m_SqrType", () => {
    const n = new GObjSquare();
    n.SetSqrState(GSqrType.START_NODE);
    expect(n.GetSqrState()).toBe(GSqrType.START_NODE);
    n.SetSqrState(GSqrType.END_NODE);
    expect(n.GetSqrState()).toBe(GSqrType.END_NODE);
  });

  it("SetDelta speichert den uebergebenen Punkt", () => {
    const n = new GObjSquare();
    n.SetDelta({ x: 13, y: 27 });
    expect(n.GetDelta()).toEqual({ x: 13, y: 27 });
  });
});

describe("GObjRect", () => {
  it("Default m_RoundCorner = (30, 30) — 1:1 STD_ROUND_CORNER", () => {
    const n = new GObjRect();
    expect(n.GetRoundCorner()).toEqual({ cx: 30, cy: 30 });
  });

  it("SetRoundCorner setzt cx + cy", () => {
    const n = new GObjRect();
    n.SetRoundCorner({ cx: 12, cy: 18 });
    expect(n.GetRoundCorner()).toEqual({ cx: 12, cy: 18 });
  });
});
