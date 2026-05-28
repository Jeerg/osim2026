/**
 * Welle-E-Tests für ogGridToReactFlow.
 */

import { describe, it, expect } from "vitest";

import {
  GObjLink,
  GObjSub,
  GLink,
  GLinkPoint,
  GLinkSquare,
  OGraphGrid,
  GOStateSub,
} from "@osim/graphobject";
import { ogGridToReactFlow } from "../view-adapter";

function mkNode(id: string): GObjLink {
  const o = new GObjLink();
  o.SetViewedObject(id);
  o.SetText(id);
  return o;
}

describe("ogGridToReactFlow — flache Topologie", () => {
  it("liefert React-Flow-Nodes für alle Grid-Zellen", () => {
    const grid = new OGraphGrid();
    grid.GOIns(mkNode("A"), 0, 0, false);
    grid.GOIns(mkNode("B"), 1, 0, false);
    grid.GOIns(mkNode("C"), 2, 1, false);

    const { nodes } = ogGridToReactFlow(grid);
    expect(nodes.length).toBe(3);
    expect(nodes.map((n) => n.id).sort()).toEqual(["oid:A", "oid:B", "oid:C"]);
    // Standard-Knoten haben type='osim'
    for (const n of nodes) {
      expect(n.type).toBe("osim");
    }
  });

  it("liefert Edges für verbundene GLink-Instanzen", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    const b = mkNode("B");
    grid.GOIns(a, 0, 0, false);
    grid.GOIns(b, 1, 0, false);
    new GLink(a, b); // registriert sich automatisch in a.m_OutList

    const { edges } = ogGridToReactFlow(grid);
    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe("oid:A");
    expect(edges[0].target).toBe("oid:B");
  });
});

describe("ogGridToReactFlow — nested Sub-Grids (D_OPEN)", () => {
  it("D_OPEN-GObjSub bekommt type='osimGroup' und Kinder haben parentId", () => {
    const root = new OGraphGrid();
    const sub = new GObjSub();
    sub.SetViewedObject("SUB");
    sub.SetText("Sub-Plan");
    const subColl = new OGraphGrid();
    sub.AddSubCollection(subColl);
    sub.SetSubState(GOStateSub.D_OPEN);

    root.GOIns(sub, 0, 0, false);
    subColl.GOIns(mkNode("inner1"), 0, 0, false);
    subColl.GOIns(mkNode("inner2"), 1, 0, false);

    const { nodes } = ogGridToReactFlow(root);
    expect(nodes.length).toBe(3); // sub + 2 inner

    const subNode = nodes.find((n) => n.id === "oid:SUB");
    const inner1 = nodes.find((n) => n.id === "oid:inner1");
    const inner2 = nodes.find((n) => n.id === "oid:inner2");

    expect(subNode?.type).toBe("osimGroup");
    expect(inner1?.parentId).toBe("oid:SUB");
    expect(inner2?.parentId).toBe("oid:SUB");
    expect(inner1?.extent).toBe("parent");
  });

  it("D_CLOSED-GObjSub rendert NICHT seine Sub-Kinder", () => {
    const root = new OGraphGrid();
    const sub = new GObjSub();
    sub.SetViewedObject("SUB");
    const subColl = new OGraphGrid();
    sub.AddSubCollection(subColl);
    sub.SetSubState(GOStateSub.D_CLOSED);

    root.GOIns(sub, 0, 0, false);
    subColl.GOIns(mkNode("hidden"), 0, 0, false);

    const { nodes } = ogGridToReactFlow(root);
    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe("oid:SUB");
    expect(nodes[0].type).toBe("osim"); // nicht 'osimGroup' im D_CLOSED
    expect(nodes[0].data.subState).toBe("closed");
  });

  it("3-Ebenen-Nesting (root → mid → deep) mit allen D_OPEN", () => {
    const root = new OGraphGrid();
    const mid = new GObjSub();
    mid.SetViewedObject("MID");
    const midColl = new OGraphGrid();
    mid.AddSubCollection(midColl);
    mid.SetSubState(GOStateSub.D_OPEN);

    const deep = new GObjSub();
    deep.SetViewedObject("DEEP");
    const deepColl = new OGraphGrid();
    deep.AddSubCollection(deepColl);
    deep.SetSubState(GOStateSub.D_OPEN);

    const leaf = mkNode("LEAF");

    root.GOIns(mid, 0, 0, false);
    midColl.GOIns(deep, 0, 0, false);
    deepColl.GOIns(leaf, 0, 0, false);

    const { nodes } = ogGridToReactFlow(root);
    expect(nodes.length).toBe(3); // mid + deep + leaf

    const midNode = nodes.find((n) => n.id === "oid:MID");
    const deepNode = nodes.find((n) => n.id === "oid:DEEP");
    const leafNode = nodes.find((n) => n.id === "oid:LEAF");

    expect(midNode?.type).toBe("osimGroup");
    expect(deepNode?.type).toBe("osimGroup");
    expect(deepNode?.parentId).toBe("oid:MID");
    expect(leafNode?.parentId).toBe("oid:DEEP");
  });

  it("Welle G9: Sub-Knoten-Position ist RELATIV zum Parent (React-Flow Konvention)", () => {
    // Foundation-Layout: applyPositions setzt m_GOrg absolut.
    // View-adapter muss bei nested Knoten die parent-Origin subtrahieren,
    // sonst landen Sub-Knoten visuell außerhalb des Containers.
    const root = new OGraphGrid();
    const sub = new GObjSub();
    sub.SetViewedObject("SUB");
    const subColl = new OGraphGrid();
    sub.AddSubCollection(subColl);
    sub.SetSubState(GOStateSub.D_OPEN);

    const inner = mkNode("inner");

    root.GOIns(sub, 0, 0, false);
    subColl.GOIns(inner, 0, 0, false);

    // Foundation finalizeLayout setzt absolute Pixel-Positionen
    root.finalizeLayout({ x: 1000, y: 500 }); // bewusst exotischer Origin
    // sub.m_GOrg = ~(1000+padding, 500+padding); inner.m_GOrg = (sub-Origin + sub-padding)

    const { nodes } = ogGridToReactFlow(root);
    const subNode = nodes.find((n) => n.id === "oid:SUB");
    const innerNode = nodes.find((n) => n.id === "oid:inner");
    expect(subNode).toBeDefined();
    expect(innerNode).toBeDefined();

    // sub ist Top-Level → Position absolut
    expect(subNode!.position.x).toBeGreaterThanOrEqual(1000);

    // inner hat parentId → Position relativ (Foundation-Absolute MINUS sub-Origin)
    // Erwartet: kleine Werte (innerhalb der Sub-View), NICHT ~1000+padding
    expect(innerNode!.parentId).toBe("oid:SUB");
    expect(innerNode!.position.x).toBeLessThan(500);
    expect(innerNode!.position.y).toBeLessThan(500);
    // Aber positiv (innen, nicht außerhalb)
    expect(innerNode!.position.x).toBeGreaterThanOrEqual(0);
    expect(innerNode!.position.y).toBeGreaterThanOrEqual(0);
  });
});

describe("ogGridToReactFlow — Daten-Übertragung", () => {
  it("kopiert label/klass/backColor in node.data", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    a.SetText("Mein A-Knoten");
    a.m_BackColor = "#ff00ff";
    a.m_TextColor = "#ffffff";
    grid.GOIns(a, 0, 0, false);

    const { nodes } = ogGridToReactFlow(grid);
    expect(nodes[0].data.label).toBe("Mein A-Knoten");
    expect(nodes[0].data.klass).toBe("GObjLink");
    expect(nodes[0].data.backColor).toBe("#ff00ff");
    expect(nodes[0].data.textColor).toBe("#ffffff");
    expect(nodes[0].data.viewedObjectId).toBe("A");
  });

  it("MARKED-State propagiert auf node.data.marked", () => {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    a.SetFocus(); // setzt MARKED
    grid.GOIns(a, 0, 0, false);

    const { nodes } = ogGridToReactFlow(grid);
    expect(nodes[0].data.marked).toBe(true);
  });
});

describe("ogGridToReactFlow — Welle G4 Edge-Type-Mapping", () => {
  function mkConnected(LinkCtor: typeof GLink) {
    const grid = new OGraphGrid();
    const a = mkNode("A");
    const b = mkNode("B");
    grid.GOIns(a, 0, 0, false);
    grid.GOIns(b, 1, 0, false);
    new LinkCtor(a, b);
    return grid;
  }

  it("plain GLink → React-Flow type='smoothstep'", () => {
    const { edges } = ogGridToReactFlow(mkConnected(GLink));
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("smoothstep");
  });

  it("GLinkSquare → React-Flow type='step' (rechtwinklig)", () => {
    const { edges } = ogGridToReactFlow(mkConnected(GLinkSquare));
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("step");
  });

  it("GLinkPoint (ohne Square-Subklasse) → React-Flow type='step'", () => {
    const { edges } = ogGridToReactFlow(mkConnected(GLinkPoint));
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("step");
  });
});
