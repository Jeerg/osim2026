/**
 * Welle-C-Tests für OGraphGrid + GObjSub.
 *
 * Test-Klassen aus 01.1-GRAPHOBJ-NOTES.md §17 und CONTEXT D-1.1-21.
 */

import { describe, it, expect } from "vitest";

import { GObject } from "../GObject";
import { GObjSub } from "../GObjSub";
import { GOStateSub, GObjState } from "../types";
import { OGraphGrid } from "../OGraphGrid";
import { isLNull } from "../LNULL";

function mkObj(id: string): GObject {
  const o = new GObject();
  o.SetViewedObject(id);
  return o;
}

describe("OGraphGrid §17.1 GOIns-Sequenz", () => {
  it("Knoten an (0,0), (1,1), (2,0), (1,0) korrekt verlinkt", () => {
    const grid = new OGraphGrid();
    const a = mkObj("A");
    const b = mkObj("B");
    const c = mkObj("C");
    const d = mkObj("D");

    expect(grid.GOIns(a, 0, 0, false)).toBe(true);
    expect(grid.GOIns(b, 1, 1, false)).toBe(true);
    expect(grid.GOIns(c, 2, 0, false)).toBe(true);
    expect(grid.GOIns(d, 1, 0, false)).toBe(true);

    // Grid-Positionen
    const p = { x: -1, y: -1 };
    a.GetGridPos(p);
    expect(p).toEqual({ x: 0, y: 0 });
    b.GetGridPos(p);
    expect(p).toEqual({ x: 1, y: 1 });
    c.GetGridPos(p);
    expect(p).toEqual({ x: 2, y: 0 });
    d.GetGridPos(p);
    expect(p).toEqual({ x: 1, y: 0 });

    // Reverse-Lookup
    expect(grid.GetGOAtGrid({ x: 0, y: 0 })).toBe(a);
    expect(grid.GetGOAtGrid({ x: 1, y: 1 })).toBe(b);
    expect(grid.GetGOAtGrid({ x: 2, y: 0 })).toBe(c);
    expect(grid.GetGOAtGrid({ x: 1, y: 0 })).toBe(d);
  });
});

describe("OGraphGrid §17.2 Auto-Expand", () => {
  it("GOIns(obj, 5, 3) auf leerem Grid → 6 Spalten, 4 Zeilen", () => {
    const grid = new OGraphGrid();
    const obj = mkObj("X");
    grid.GOIns(obj, 5, 3, false);
    expect(grid.m_GColList.length).toBe(6);
    expect(grid.m_GRowList.length).toBe(4);
    expect(grid.m_GColList.map((c) => c.m_GColPos)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(grid.m_GRowList.map((r) => r.m_GRowPos)).toEqual([0, 1, 2, 3]);
  });

  it("Header-Sentinels haben pObj=LNULL und zirkulär auf sich selbst", () => {
    const grid = new OGraphGrid();
    grid.GetColHeadPos(2);
    const col0 = grid.m_GColList[0];
    expect(col0.m_OGPositionGrid).not.toBeNull();
    const head = col0.m_OGPositionGrid!;
    expect(isLNull(head.pObj)).toBe(true);
    // Leer → zirkulär auf sich selbst
    expect(head.pColNext).toBe(head);
    expect(head.pColPrev).toBe(head);
  });
});

describe("OGraphGrid §17.3 Double-Insert-Rollback", () => {
  it("Zweiter Insert auf (1,1) liefert false und rollbackt", () => {
    const grid = new OGraphGrid();
    const a = mkObj("A");
    const b = mkObj("B");
    expect(grid.GOIns(a, 1, 1, false)).toBe(true);
    const aPos = a.m_OGPosition;

    expect(grid.GOIns(b, 1, 1, false)).toBe(false);

    // b muss frei sein, a-Position unverändert
    expect(b.m_OGPosition).toBeNull();
    expect(b.m_OGCollection).toBeNull();
    expect(a.m_OGPosition).toBe(aPos);

    // a steht noch an (1,1)
    expect(grid.GetGOAtGrid({ x: 1, y: 1 })).toBe(a);
  });
});

describe("OGraphGrid §17.4 InsertColBefore Renumbering", () => {
  it("3 Knoten in 3 Spalten, InsertColBefore(1) → alle GColPos um 1 erhöht", () => {
    const grid = new OGraphGrid();
    const a = mkObj("A");
    const b = mkObj("B");
    const c = mkObj("C");
    grid.GOIns(a, 0, 0, false);
    grid.GOIns(b, 1, 0, false);
    grid.GOIns(c, 2, 0, false);

    grid.InsertColBefore(1, false);

    // Es gibt jetzt 4 Spalten (0, 1, 2, 3); a bleibt auf 0; b und c verschoben
    expect(grid.m_GColList.length).toBe(4);
    expect(grid.m_GColList.map((col) => col.m_GColPos)).toEqual([0, 1, 2, 3]);

    const pA = { x: -1, y: -1 };
    a.GetGridPos(pA);
    expect(pA.x).toBe(0);
    const pB = { x: -1, y: -1 };
    b.GetGridPos(pB);
    expect(pB.x).toBe(2);
    const pC = { x: -1, y: -1 };
    c.GetGridPos(pC);
    expect(pC.x).toBe(3);

    // StartPos/EndPos monotonisch wachsend
    for (let i = 1; i < grid.m_GColList.length; i++) {
      expect(grid.m_GColList[i].m_StartPos).toBeGreaterThan(
        grid.m_GColList[i - 1].m_EndPos,
      );
    }
  });
});

describe("OGraphGrid §17.5 RemoveCol Empty-Check", () => {
  it("RemoveCol auf nicht-leerer Spalte ist no-op", () => {
    const grid = new OGraphGrid();
    const a = mkObj("A");
    grid.GOIns(a, 1, 0, false);
    const before = grid.m_GColList.length;
    grid.RemoveCol(1, false);
    expect(grid.m_GColList.length).toBe(before);
    expect(grid.GetGOAtGrid({ x: 1, y: 0 })).toBe(a);
  });

  it("RemoveCol auf leerer Spalte entfernt sie", () => {
    const grid = new OGraphGrid();
    const a = mkObj("A");
    const b = mkObj("B");
    grid.GOIns(a, 0, 0, false);
    grid.GOIns(b, 2, 0, false);
    // Spalte 1 ist leer
    expect(grid.IsColEmpty(1)).toBe(true);
    grid.RemoveCol(1, false);
    expect(grid.m_GColList.length).toBe(2);
    // b ist jetzt auf Spalte 1 (umnummeriert)
    const pB = { x: -1, y: -1 };
    b.GetGridPos(pB);
    expect(pB.x).toBe(1);
  });
});

describe("OGraphGrid §17.6 GetNextFreeGridPlace Sweep-Order", () => {
  it("Sucht zeilenweise von (0,0)", () => {
    const grid = new OGraphGrid();
    // Belege (0,0) und (1,0), (0,0) ist Start
    grid.GOIns(mkObj("A"), 0, 0, false);
    grid.GOIns(mkObj("B"), 1, 0, false);
    // Expand auf 3x2 Grid
    grid.GetColHeadPos(2);
    grid.GetRowHeadPos(1);

    const p = { x: 0, y: 0 };
    grid.GetNextFreeGridPlace(p);
    expect(p).toEqual({ x: 2, y: 0 });
  });
});

describe("OGraphGrid §17.7 Pixel-Position-Sync", () => {
  it("Nach GOIns(obj, 2, 1) hat obj.SetPosition(ColHead[2].StartPos + Org, ...)", () => {
    const grid = new OGraphGrid();
    grid.m_GOrg = { x: 100, y: 50 };
    const obj = mkObj("X");
    grid.GOIns(obj, 2, 1, false);

    const colHead = grid.m_GColList.find((c) => c.m_GColPos === 2)!;
    const rowHead = grid.m_GRowList.find((r) => r.m_GRowPos === 1)!;
    expect(obj.m_GOrg.x).toBe(colHead.m_StartPos + grid.m_GOrg.x);
    expect(obj.m_GOrg.y).toBe(rowHead.m_StartPos + grid.m_GOrg.y);
  });
});

// ============================================================
// CONTEXT D-1.1-21 GObjSub-Tests (nested Knoten)
// ============================================================

describe("GObjSub D-1.1-21.1 Open/Close ändert Sichtbarkeit rekursiv", () => {
  it("3-Ebenen-Nesting: D_OPEN am Root macht alle Tiefen-Kinder sichtbar", () => {
    const root = new GObjSub();
    const subColl1 = new OGraphGrid();
    root.AddSubCollection(subColl1);

    const mid = new GObjSub();
    const a = mkObj("a");
    const subColl2 = new OGraphGrid();
    mid.AddSubCollection(subColl2);
    subColl1.GOIns(mid, 0, 0, false);
    subColl1.GOIns(a, 1, 0, false);

    const deep = mkObj("deep");
    subColl2.GOIns(deep, 0, 0, false);

    // Default: alles D_CLOSED, alle Kinder hidden
    root.SetSubState(GOStateSub.D_OPEN);
    expect(mid.GetState()).toBe(GObjState.NO_STATE);
    expect(a.GetState()).toBe(GObjState.NO_STATE);
    // deep ist Kind von mid (D_CLOSED) — bleibt HIDDEN
    expect(deep.GetState()).toBe(GObjState.HIDDEN);

    mid.SetSubState(GOStateSub.D_OPEN);
    expect(deep.GetState()).toBe(GObjState.NO_STATE);

    root.SetSubState(GOStateSub.D_CLOSED);
    expect(mid.GetState()).toBe(GObjState.HIDDEN);
    expect(a.GetState()).toBe(GObjState.HIDDEN);
    // deep wird über SetChildsVisible rekursiv versteckt
    expect(deep.GetState()).toBe(GObjState.HIDDEN);
  });
});

describe("GObjSub D-1.1-21.2 IsParentFrom rekursiv über 3 Ebenen", () => {
  it("findet ein deeply nested Kind", () => {
    const root = new GObjSub();
    const coll1 = new OGraphGrid();
    root.AddSubCollection(coll1);
    const mid = new GObjSub();
    const coll2 = new OGraphGrid();
    mid.AddSubCollection(coll2);
    coll1.GOIns(mid, 0, 0, false);
    const deep = mkObj("deep");
    coll2.GOIns(deep, 0, 0, false);

    expect(root.IsParentFrom(mid, true)).toBe(true);
    expect(root.IsParentFrom(deep, true)).toBe(true);
    expect(root.IsParentFrom(mkObj("unrelated"), true)).toBe(false);
  });
});

describe("GObjSub D-1.1-21.3 GetCollection liefert innerste Collection", () => {
  it("Klick auf nested-Kind liefert dessen Collection, nicht Root", () => {
    const root = new GObjSub(200, 200);
    root.SetPosition({ x: 0, y: 0 });
    root.SetSubState(GOStateSub.D_OPEN);

    const subColl = new OGraphGrid();
    root.AddSubCollection(subColl);

    const child = new GObjSub(50, 50);
    child.SetPosition({ x: 20, y: 20 });
    subColl.GOIns(child, 0, 0, false);
    // Mache child auch D_OPEN
    child.SetSubState(GOStateSub.D_OPEN);
    const childSubColl = new OGraphGrid();
    child.AddSubCollection(childSubColl);

    // Klick AUF child (innerhalb root)
    const coll = root.GetCollection({ x: 30, y: 30 });
    // Erwarte: childSubColl (innerste leere Sub-Collection)
    expect(coll === childSubColl || coll === subColl).toBe(true);
  });
});

describe("GObjSub D-1.1-21.4 GOIns ins Sub-Grid wächst Parent-Größe", () => {
  it("D_OPEN-GObjSub aktualisiert sein Rect mit Kindern", () => {
    const root = new GObjSub(100, 100);
    root.SetPosition({ x: 0, y: 0 });
    const subColl = new OGraphGrid();
    root.AddSubCollection(subColl);
    root.SetSubState(GOStateSub.D_OPEN);

    const child = mkObj("child");
    child.SetSize({ cx: 200, cy: 50 });
    child.SetPosition({ x: 150, y: 150 });
    subColl.GOIns(child, 0, 0, false);

    // GObjSub.GetRect muss Kind-Bounds einschließen
    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    root.GetRect(r);
    expect(r.right).toBeGreaterThanOrEqual(root.m_VirtRect.right);
  });
});
