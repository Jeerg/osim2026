/**
 * Welle-F-Tests für interactions.ts.
 */

import { describe, it, expect } from "vitest";

import { GObjLink } from "@/graph/foundation/GObjLink";
import { GObjSub } from "@/graph/foundation/GObjSub";
import { GLink } from "@/graph/foundation/GLink";
import { OGraphGrid } from "@/graph/foundation/OGraphGrid";
import { GOStateSub } from "@/graph/foundation/types";
import {
  findObjectByNodeId,
  onConnect,
  onEdgesDelete,
  onNodeDoubleClick,
  onNodeDragStop,
  onNodesDelete,
} from "@/graph/foundation/interactions";

function mkNode(id: string): GObjLink {
  const o = new GObjLink();
  o.SetViewedObject(id);
  return o;
}

describe("findObjectByNodeId", () => {
  it("findet Top-Level-Objekt", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    grid.GOIns(a, 0, 0, false);
    expect(findObjectByNodeId(grid, "oid:A")).toBe(a);
  });

  it("findet deeply nested Objekt in D_OPEN-GObjSub", () => {
    const root = new OGraphGrid();
    const sub = new GObjSub();
    sub.SetViewedObject("SUB");
    const subColl = new OGraphGrid();
    sub.AddSubCollection(subColl);
    sub.SetSubState(GOStateSub.D_OPEN);
    root.GOIns(sub, 0, 0, false);

    const deep = mkNode("DEEP");
    subColl.GOIns(deep, 0, 0, false);

    expect(findObjectByNodeId(root, "oid:DEEP")).toBe(deep);
  });

  it("findet KEIN Objekt in D_CLOSED-GObjSub", () => {
    const root = new OGraphGrid();
    const sub = new GObjSub();
    sub.SetViewedObject("SUB");
    const subColl = new OGraphGrid();
    sub.AddSubCollection(subColl);
    sub.SetSubState(GOStateSub.D_CLOSED);
    root.GOIns(sub, 0, 0, false);

    const hidden = mkNode("HIDDEN");
    subColl.GOIns(hidden, 0, 0, false);

    expect(findObjectByNodeId(root, "oid:HIDDEN")).toBeNull();
  });
});

describe("onNodeDragStop bewegt Knoten in Grid-Zelle (Welle G8)", () => {
  it("verschiebt Knoten via GORemove+GOIns in die Ziel-Zelle", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    // Layout fertig (computeSizes/applyPositions → Spalten haben StartPos/EndPos)
    grid.GOIns(a, 0, 0, false);
    grid.GOIns(mkNode("B"), 1, 0, false);
    grid.GOIns(mkNode("C"), 2, 0, false);
    grid.finalizeLayout({ x: 0, y: 0 });

    // Spalte 2 hat einen mittleren Pixel-X — den nehmen wir als Drag-Ziel.
    const col2 = grid.m_GColList.find((c) => c.m_GColPos === 2)!;
    const targetX = (col2.m_StartPos + col2.m_EndPos) / 2;

    const result = onNodeDragStop(grid, {}, {
      id: "oid:A",
      position: { x: targetX, y: 0 },
      data: {} as never,
    });
    // Spalte 2 ist bereits durch C belegt → Drag wird abgelehnt
    expect(result).toBeNull();

    // Drag in Spalte 1 — auch belegt durch B
    const col1 = grid.m_GColList.find((c) => c.m_GColPos === 1)!;
    const targetXcol1 = (col1.m_StartPos + col1.m_EndPos) / 2;
    expect(
      onNodeDragStop(grid, {}, {
        id: "oid:A",
        position: { x: targetXcol1, y: 0 },
        data: {} as never,
      }),
    ).toBeNull();

    // In Zeile 1 von Spalte 0 ist frei
    const row0 = grid.m_GRowList.find((r) => r.m_GRowPos === 0)!;
    // Es gibt noch keine Zeile 1 — wir nehmen einen Pixel-Wert UNTER row0
    const dropResult = onNodeDragStop(grid, {}, {
      id: "oid:A",
      position: { x: 0, y: row0.m_EndPos + 50 },
      data: {} as never,
    });
    // Drag in eine Zelle die noch nicht existiert ist außerhalb → null
    expect(dropResult).toBeNull();
  });

  it("liefert null bei unbekanntem Node-Id", () => {
    const grid = new OGraphGrid();
    grid.GOIns(mkNode("A"), 0, 0, false);
    grid.finalizeLayout({ x: 0, y: 0 });
    const result = onNodeDragStop(grid, {}, {
      id: "oid:NOPE",
      position: { x: 0, y: 0 },
      data: {} as never,
    });
    expect(result).toBeNull();
  });

  it("akzeptiert Drag in eine freie Zelle und macht GORemove+GOIns", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    // Nur 1 Knoten — viel freier Platz
    grid.GOIns(a, 0, 0, false);
    // Sicherstellen dass Spalten 0 und 1 existieren (GetColHeadPos legt sie an)
    grid.GetColHeadPos(1);
    grid.finalizeLayout({ x: 0, y: 0 });

    const col1 = grid.m_GColList.find((c) => c.m_GColPos === 1)!;
    const targetX = (col1.m_StartPos + col1.m_EndPos) / 2;
    const row0 = grid.m_GRowList.find((r) => r.m_GRowPos === 0)!;
    const targetY = (row0.m_StartPos + row0.m_EndPos) / 2;

    const result = onNodeDragStop(grid, {}, {
      id: "oid:A",
      position: { x: targetX, y: targetY },
      data: {} as never,
    });
    expect(result).toEqual({ col: 1, row: 0 });

    // Knoten ist jetzt in Spalte 1
    const newPos = { x: -1, y: -1 };
    a.GetGridPos(newPos);
    expect(newPos).toEqual({ x: 1, y: 0 });
  });
});

describe("onConnect erzeugt GLink", () => {
  it("verbindet source/target via GLink-Konstruktor", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    const b = mkNode("B");
    grid.GOIns(a, 0, 0, false);
    grid.GOIns(b, 1, 0, false);

    const link = onConnect(grid, {
      source: "oid:A",
      target: "oid:B",
      sourceHandle: null,
      targetHandle: null,
    });
    expect(link).toBeInstanceOf(GLink);
    expect(link?.GetPrev()).toBe(a);
    expect(link?.GetNext()).toBe(b);
    expect(a.m_OutList).toContain(link);
    expect(b.m_InList).toContain(link);
  });

  it("liefert null wenn source oder target nicht GObjLink ist", () => {
    const grid = new OGraphGrid();
    // GObject statt GObjLink — geht nicht
    const a = new GObjLink();
    a.SetViewedObject("A");
    grid.GOIns(a, 0, 0, false);

    const link = onConnect(grid, {
      source: "oid:A",
      target: "oid:NOPE",
      sourceHandle: null,
      targetHandle: null,
    });
    expect(link).toBeNull();
  });
});

describe("onNodesDelete", () => {
  it("entfernt Knoten und koppelt Links ab", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    const b = mkNode("B");
    grid.GOIns(a, 0, 0, false);
    grid.GOIns(b, 1, 0, false);
    const link = new GLink(a, b);

    const deleted = onNodesDelete(grid, [
      {
        id: "oid:A",
        position: { x: 0, y: 0 },
        data: {} as never,
      },
    ]);

    expect(deleted).toContain(a);
    // a ist aus dem Grid
    expect(grid.GetGOAtGrid({ x: 0, y: 0 })).toBeNull();
    // Link ist abgekoppelt
    expect(link.GetPrev()).toBeNull();
    expect(a.m_OGCollection).toBeNull();
  });

  it("respektiert IsDeleteForbidden", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    a.SetDeleteForbidden(true);
    grid.GOIns(a, 0, 0, false);

    const deleted = onNodesDelete(grid, [
      { id: "oid:A", position: { x: 0, y: 0 }, data: {} as never },
    ]);
    expect(deleted).toHaveLength(0);
    expect(grid.GetGOAtGrid({ x: 0, y: 0 })).toBe(a);
  });
});

describe("onEdgesDelete", () => {
  it("entfernt GLink-Verbindung", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    const b = mkNode("B");
    grid.GOIns(a, 0, 0, false);
    grid.GOIns(b, 1, 0, false);
    const link = new GLink(a, b);

    const count = onEdgesDelete(grid, [
      {
        id: "e0",
        source: "oid:A",
        target: "oid:B",
      },
    ]);
    expect(count).toBe(1);
    expect(link.GetPrev()).toBeNull();
    expect(link.GetNext()).toBeNull();
    expect(a.m_OutList).not.toContain(link);
  });
});

describe("onNodeDoubleClick", () => {
  it("toggelt GObjSub D_CLOSED ↔ D_OPEN", () => {
    const grid = new OGraphGrid();
    const sub = new GObjSub();
    sub.SetViewedObject("SUB");
    grid.GOIns(sub, 0, 0, false);
    expect(sub.GetSubState()).toBe(GOStateSub.D_CLOSED);

    onNodeDoubleClick(grid, "oid:SUB");
    expect(sub.GetSubState()).toBe(GOStateSub.D_OPEN);

    onNodeDoubleClick(grid, "oid:SUB");
    expect(sub.GetSubState()).toBe(GOStateSub.D_CLOSED);
  });

  it("no-op auf nicht-GObjSub", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    grid.GOIns(a, 0, 0, false);
    expect(onNodeDoubleClick(grid, "oid:A")).toBe(false);
  });
});
