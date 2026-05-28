/**
 * wire-to-grid — Welle G2: Grid-aware Layout aus m_pntRaster.
 *
 * Vertrag (NOTES §20, OFFENE-PUNKTE Welle G2):
 * 1. m_pntRaster = [col, row] ist die kanonische Quelle der Position.
 * 2. m_iPosX/Y ist Fallback (grobe Pixel-zu-Grid-Schätzung) für Knoten,
 *    die noch kein Raster haben (frisch via Drag angelegt).
 * 3. Fehlt beides: linearer (idx, 0) Fallback.
 * 4. GOIns setzt m_GOrg automatisch — KEIN nachgelagertes SetPosition.
 */

import { describe, it, expect } from "vitest";

import { wireToGrid } from "@/graph/foundation/wire-to-grid";
import { GLinkSquare } from "@/graph/foundation/GLinkSquare";
import { GLink } from "@/graph/foundation/GLink";
import { GObjSub } from "@/graph/foundation/GObjSub";
import { GObjLink } from "@/graph/foundation/GObjLink";
import { GOStateSub } from "@/graph/foundation/types";
import type { AttrValue, OBaseObj } from "@/viewers/core/types";

function makeDurchlaufplan(knotenOids: number[]): OBaseObj {
  return {
    oid: 1,
    klass: "PDurchlaufplan",
    attrs: { m_sName: "Dlpl", m_lKnoten: knotenOids, m_lKanten: [] },
    sub_refs: [],
  };
}

function makeKnoten(
  oid: number,
  raster: [number, number] | null,
  posXY: [number, number] | null = null,
): OBaseObj {
  // Welle G14: AttrValue ist konkreter Union-Typ. Record<string, AttrValue>
  // statt Record<string, unknown>, damit der Return-Type direkt zuweisbar ist.
  const attrs: Record<string, AttrValue> = {
    m_sName: `Knoten ${oid}`,
  };
  if (raster) attrs.m_pntRaster = raster;
  if (posXY) {
    attrs.m_iPosX = posXY[0];
    attrs.m_iPosY = posXY[1];
  }
  return {
    oid,
    klass: "PDpKnMengeRuesten",
    attrs,
    sub_refs: [],
  };
}

describe("wire-to-grid Welle G2", () => {
  it("liest m_pntRaster=[col,row] und setzt Pixel-Position aus dem Grid", () => {
    // Dummy.otx-typisch: ungerade Spalten 1,3,5; Zeile 0
    const allObjects: Record<number, OBaseObj> = {
      1: makeDurchlaufplan([100, 200, 300]),
      100: makeKnoten(100, [1, 0]),
      200: makeKnoten(200, [3, 0]),
      300: makeKnoten(300, [5, 1]),
    };

    const { grid, oidToObj } = wireToGrid(1, allObjects);

    expect(oidToObj.size).toBe(3);

    // Grid-Positionen exakt aus m_pntRaster übernommen
    const k1 = { x: -1, y: -1 };
    oidToObj.get(100)!.GetGridPos(k1);
    expect(k1).toEqual({ x: 1, y: 0 });

    const k2 = { x: -1, y: -1 };
    oidToObj.get(200)!.GetGridPos(k2);
    expect(k2).toEqual({ x: 3, y: 0 });

    const k3 = { x: -1, y: -1 };
    oidToObj.get(300)!.GetGridPos(k3);
    expect(k3).toEqual({ x: 5, y: 1 });

    // Pixel-Position: m_GOrg muss aus pColHead.m_StartPos + m_GOrg.x kommen
    // (für Spalte 1 ist das != für Spalte 3). Knoten dürfen NICHT alle auf (0,0).
    const pos1 = oidToObj.get(100)!.m_GOrg;
    const pos2 = oidToObj.get(200)!.m_GOrg;
    const pos3 = oidToObj.get(300)!.m_GOrg;

    expect(pos1.x).toBeGreaterThan(0);
    expect(pos2.x).toBeGreaterThan(pos1.x);
    expect(pos3.x).toBeGreaterThan(pos2.x);
    expect(pos3.y).toBeGreaterThan(pos1.y); // Zeile 1 weiter unten als Zeile 0

    // m_csStdGridExtent ist auf STD_OBJ_WIDTH/HEIGHT gesetzt
    expect(grid.m_csStdGridExtent.cx).toBe(200);
    expect(grid.m_csStdGridExtent.cy).toBe(80);
  });

  it("fällt auf m_iPosX/Y zurück wenn m_pntRaster fehlt", () => {
    const allObjects: Record<number, OBaseObj> = {
      1: makeDurchlaufplan([100]),
      100: makeKnoten(100, null, [440, 0]), // ~Spalte 2 bei stride 220
    };

    const { oidToObj } = wireToGrid(1, allObjects);
    const p = { x: -1, y: -1 };
    oidToObj.get(100)!.GetGridPos(p);
    // 440 / 220 = 2 (gerundet)
    expect(p.x).toBe(2);
    expect(p.y).toBe(0);
  });

  it("nutzt lineares Fallback (idx, 0) wenn beides fehlt", () => {
    const allObjects: Record<number, OBaseObj> = {
      1: makeDurchlaufplan([100, 200]),
      100: makeKnoten(100, null),
      200: makeKnoten(200, null),
    };

    const { oidToObj } = wireToGrid(1, allObjects);
    const p1 = { x: -1, y: -1 };
    oidToObj.get(100)!.GetGridPos(p1);
    const p2 = { x: -1, y: -1 };
    oidToObj.get(200)!.GetGridPos(p2);

    expect(p1).toEqual({ x: 0, y: 0 });
    expect(p2).toEqual({ x: 1, y: 0 });
  });

  it("Welle G4: PDlplKante wird als GLinkSquare instanziiert (rechtwinkliges Routing)", () => {
    const allObjects: Record<number, OBaseObj> = {
      1: {
        oid: 1,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "Dlpl",
          m_lKnoten: [100, 200],
          m_lKanten: [300],
        },
        sub_refs: [],
      },
      100: makeKnoten(100, [0, 0]),
      200: makeKnoten(200, [1, 0]),
      300: {
        oid: 300,
        klass: "PDlplKante",
        attrs: {
          m_sName: "Kante",
          m_lVorgaenger: [100],
          m_lNachfolger: [200],
          // Welle G17-C: m_pntRaster ist required (sonst Skip).
          m_pntRaster: [0, 1],
        },
        sub_refs: [],
      },
    };

    const { oidToObj } = wireToGrid(1, allObjects);
    const source = oidToObj.get(100)!;
    expect(source.m_OutList.length).toBe(1);
    const link = source.m_OutList[0] as GLink;
    expect(link).toBeInstanceOf(GLinkSquare);
  });

  // -----------------------------------------------------------------------
  // Welle G6 — Sub-Plan-Hierarchie via m_lKnotenOber
  // (1:1 aus C++ elval1.cpp + OGOAlt.cpp:211)
  // -----------------------------------------------------------------------

  it("Welle G6: Knoten mit referenziertem Sub-Plan wird GObjSub mit innerem Grid", () => {
    // Layout aus elval1.cpp:
    //   Plan 19 enthält Knoten 27 + Alternativ-Knoten 36
    //   Sub-Plan 41 hat m_lKnotenOber=36 → Sub-Plan im Knoten 36
    //   Sub-Plan 41 enthält Knoten 49
    const allObjects: Record<number, OBaseObj> = {
      19: makeDurchlaufplan([27, 36]),
      27: makeKnoten(27, [0, 0]),
      36: {
        oid: 36,
        klass: "PDpKnAlternativVerteilung",
        attrs: { m_sName: "Alternativ 36", m_pntRaster: [1, 0] },
        sub_refs: [],
      },
      41: {
        oid: 41,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "Sub-Plan 41",
          m_lKnoten: [49],
          m_lKanten: [],
          m_lKnotenOber: 36, // Welle 9 löst LList auf int auf
        },
        sub_refs: [],
      },
      49: makeKnoten(49, [0, 0]),
    };

    const { oidToObj } = wireToGrid(19, allObjects);

    // Knoten 27 ist normal
    expect(oidToObj.get(27)).toBeInstanceOf(GObjLink);
    expect(oidToObj.get(27)).not.toBeInstanceOf(GObjSub);

    // Knoten 36 ist GObjSub (hat referenzierten Sub-Plan)
    const alt = oidToObj.get(36);
    expect(alt).toBeInstanceOf(GObjSub);
    const altSub = alt as GObjSub;
    expect(altSub.GetSubState()).toBe(GOStateSub.D_OPEN);

    // GObjSub hat genau 1 Sub-Collection (= das Grid des Sub-Plans 41)
    const subColls = altSub.GetSubCollections();
    expect(subColls.length).toBe(1);

    // Knoten 49 ist im oidToObj-Lookup (kommt aus rekursivem Build)
    expect(oidToObj.has(49)).toBe(true);
    expect(oidToObj.get(49)).toBeInstanceOf(GObjLink);
  });

  it("Welle G6: Sub-Plan mit m_lKnotenOber→Plan landet als zusätzlicher GObjSub im Parent-Grid", () => {
    // Parent-Plan 100 hat 2 Knoten + 1 direkten Child-Plan 200
    // (Child-Plan referenziert den Parent-Plan, nicht einen Knoten)
    const allObjects: Record<number, OBaseObj> = {
      100: makeDurchlaufplan([10, 20]),
      10: makeKnoten(10, [0, 0]),
      20: makeKnoten(20, [1, 0]),
      200: {
        oid: 200,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "Child Plan",
          m_lKnoten: [30],
          m_lKanten: [],
          m_lKnotenOber: 100, // referenziert Parent-Plan direkt
        },
        sub_refs: [],
      },
      30: makeKnoten(30, [0, 0]),
    };

    const { oidToObj } = wireToGrid(100, allObjects);

    // Reguläre Knoten 10, 20 sind drin
    expect(oidToObj.has(10)).toBe(true);
    expect(oidToObj.has(20)).toBe(true);

    // Child-Plan 200 wurde als GObjSub-Container ans Grid gehängt
    const childContainer = oidToObj.get(200);
    expect(childContainer).toBeInstanceOf(GObjSub);
    const childSub = childContainer as GObjSub;
    expect(childSub.GetSubState()).toBe(GOStateSub.D_OPEN);
    expect(childSub.GetSubCollections().length).toBe(1);

    // Der Container liegt UNTER den regulären Knoten (separate Zeile)
    const pos = { x: -1, y: -1 };
    childSub.GetGridPos(pos);
    expect(pos.y).toBeGreaterThan(0);

    // Sub-Plan-Knoten 30 ist via Rekursion im oidToObj-Map
    expect(oidToObj.has(30)).toBe(true);
  });

  it("Welle G6: 3-Level-Hierarchie (Plan → Alt-Knoten → Sub-Plan → Alt-Knoten → Sub-Sub-Plan)", () => {
    // Tiefe 3: Plan 1 → Knoten 11 (alt) → Sub-Plan 2 → Knoten 22 (alt) → Sub-Sub-Plan 3
    const allObjects: Record<number, OBaseObj> = {
      1: makeDurchlaufplan([11]),
      11: {
        oid: 11,
        klass: "PDpKnAlternativ",
        attrs: { m_sName: "Alt L1", m_pntRaster: [0, 0] },
        sub_refs: [],
      },
      2: {
        oid: 2,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "Sub-Plan L2",
          m_lKnoten: [22],
          m_lKanten: [],
          m_lKnotenOber: 11,
        },
        sub_refs: [],
      },
      22: {
        oid: 22,
        klass: "PDpKnAlternativ",
        attrs: { m_sName: "Alt L2", m_pntRaster: [0, 0] },
        sub_refs: [],
      },
      3: {
        oid: 3,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "Sub-Sub-Plan L3",
          m_lKnoten: [33],
          m_lKanten: [],
          m_lKnotenOber: 22,
        },
        sub_refs: [],
      },
      33: makeKnoten(33, [0, 0]),
    };

    const { oidToObj } = wireToGrid(1, allObjects);

    // Alle drei Hierarchieebenen sind aufgelöst
    expect(oidToObj.has(11)).toBe(true);
    expect(oidToObj.has(22)).toBe(true);
    expect(oidToObj.has(33)).toBe(true);

    // Beide Alt-Knoten sind GObjSub
    expect(oidToObj.get(11)).toBeInstanceOf(GObjSub);
    expect(oidToObj.get(22)).toBeInstanceOf(GObjSub);

    // L1-Knoten hat genau 1 Sub-Collection (Sub-Plan 2)
    expect((oidToObj.get(11) as GObjSub).GetSubCollections().length).toBe(1);
    // L2-Knoten hat ebenfalls 1 Sub-Collection (Sub-Sub-Plan 3)
    expect((oidToObj.get(22) as GObjSub).GetSubCollections().length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Welle G7 — Dynamisches Grid-Resize (1:1 aus OGGrid.cpp:2390 GetSize)
  // -----------------------------------------------------------------------

  it("Welle G7: Parent-Spalte wächst mit, wenn ein GObjSub mit Sub-Plan sie braucht", () => {
    // Plan A hat einen Alternativ-Knoten K (Spalte 0) der einen Sub-Plan mit
    // 3 Knoten enthält. Nach finalizeLayout muss die Spalte 0 breiter sein
    // als STD_OBJ_WIDTH (200), weil der Sub-Plan-Container 3 Knoten breit ist.
    const allObjects: Record<number, OBaseObj> = {
      1: makeDurchlaufplan([100]),
      100: {
        oid: 100,
        klass: "PDpKnAlternativ",
        attrs: { m_sName: "Alt-Container", m_pntRaster: [0, 0] },
        sub_refs: [],
      },
      2: {
        oid: 2,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "Sub-Plan",
          m_lKnoten: [10, 20, 30],
          m_lKanten: [],
          m_lKnotenOber: 100,
        },
        sub_refs: [],
      },
      10: makeKnoten(10, [0, 0]),
      20: makeKnoten(20, [1, 0]),
      30: makeKnoten(30, [2, 0]),
    };

    const { grid, oidToObj } = wireToGrid(1, allObjects);

    // Knoten 100 ist GObjSub mit D_OPEN
    const alt = oidToObj.get(100) as GObjSub;
    expect(alt).toBeInstanceOf(GObjSub);
    expect(alt.GetSubState()).toBe(GOStateSub.D_OPEN);

    // finalizeLayout muss aufgerufen worden sein → Spalte 0 ist breiter
    // als STD_OBJ_WIDTH (200), weil der GObjSub seinen 3-Knoten-Sub-Plan
    // hineingestreckt hat.
    const col0 = grid.m_GColList.find((c) => c.m_GColPos === 0);
    expect(col0).toBeDefined();
    expect(col0!.m_GColWidth).toBeGreaterThan(200);

    // Knoten-Pixel-Position: zentriert in der breiteren Spalte
    const altSize = { cx: 0, cy: 0 };
    alt.GetSize(altSize);
    expect(altSize.cx).toBeGreaterThan(200);
  });

  it("Welle G7: Mehrere Spalten — kumulative StartPos berücksichtigt vergrößerte Vorgänger", () => {
    // Plan mit 3 Knoten in Spalten 0, 1, 2. Knoten in Spalte 1 ist ein
    // GObjSub mit großer Sub-View → Spalte 1 wird breit. Spalte 2 muss
    // entsprechend weiter rechts beginnen.
    const allObjects: Record<number, OBaseObj> = {
      1: makeDurchlaufplan([10, 20, 30]),
      10: makeKnoten(10, [0, 0]),
      20: {
        oid: 20,
        klass: "PDpKnAlternativ",
        attrs: { m_sName: "Big-Alt", m_pntRaster: [1, 0] },
        sub_refs: [],
      },
      30: makeKnoten(30, [2, 0]),
      2: {
        oid: 2,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "Sub",
          m_lKnoten: [100, 200, 300, 400],
          m_lKanten: [],
          m_lKnotenOber: 20,
        },
        sub_refs: [],
      },
      100: makeKnoten(100, [0, 0]),
      200: makeKnoten(200, [1, 0]),
      300: makeKnoten(300, [2, 0]),
      400: makeKnoten(400, [3, 0]),
    };

    const { grid } = wireToGrid(1, allObjects);

    const col0 = grid.m_GColList.find((c) => c.m_GColPos === 0)!;
    const col1 = grid.m_GColList.find((c) => c.m_GColPos === 1)!;
    const col2 = grid.m_GColList.find((c) => c.m_GColPos === 2)!;

    // Spalte 0 hat Standard-Breite (kein Sub-Plan)
    expect(col0.m_GColWidth).toBe(200);
    // Spalte 1 ist deutlich breiter (4-Knoten-Sub-Plan)
    expect(col1.m_GColWidth).toBeGreaterThan(200);
    // Spalte 2 startet WEITER RECHTS als bei reiner Standard-Breite
    // (Beweis: kumulative StartPos berücksichtigt die breitere Spalte 1)
    expect(col2.m_StartPos).toBeGreaterThan(col1.m_EndPos);
    expect(col2.m_StartPos).toBeGreaterThan(2 * 200); // > 2 Standard-Spalten
  });

  it("Welle G6: Cycle-Protection bricht bei selbst-referenzierender Hierarchie ab", () => {
    // Daten-Fehler: Plan A → Knoten K → Plan B → Knoten L → Plan A (Zyklus)
    const allObjects: Record<number, OBaseObj> = {
      1: makeDurchlaufplan([10]),
      10: {
        oid: 10,
        klass: "PDpKnAlternativ",
        attrs: { m_sName: "K", m_pntRaster: [0, 0] },
        sub_refs: [],
      },
      2: {
        oid: 2,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "B",
          m_lKnoten: [20],
          m_lKanten: [],
          m_lKnotenOber: 10,
        },
        sub_refs: [],
      },
      20: {
        oid: 20,
        klass: "PDpKnAlternativ",
        attrs: { m_sName: "L", m_pntRaster: [0, 0] },
        sub_refs: [],
      },
      // Zyklus: weiterer Plan zeigt zurück auf Plan 1
      99: {
        oid: 99,
        klass: "PDurchlaufplan",
        attrs: {
          m_sName: "back-ref",
          m_lKnoten: [],
          m_lKanten: [],
          m_lKnotenOber: 20,
        },
        sub_refs: [],
      },
    };
    // Künstlicher Selbst-Zyklus: Plan 1 referenziert sich indirekt über 99→20→2→10→1
    // Wir testen nur dass der Aufruf nicht in eine Endlos-Rekursion läuft.
    const start = Date.now();
    const { oidToObj } = wireToGrid(1, allObjects);
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // muss in <1s zurückkehren
    // Mindestens die obersten Ebenen wurden aufgebaut
    expect(oidToObj.has(10)).toBe(true);
  });

  it("weicht bei Kollision (zwei Knoten auf gleiche Raster-Zelle) auf den nächsten freien Platz aus", () => {
    const allObjects: Record<number, OBaseObj> = {
      1: makeDurchlaufplan([100, 200]),
      100: makeKnoten(100, [3, 0]),
      200: makeKnoten(200, [3, 0]), // Kollision mit 100
    };

    const { oidToObj } = wireToGrid(1, allObjects);
    expect(oidToObj.size).toBe(2);

    const p1 = { x: -1, y: -1 };
    oidToObj.get(100)!.GetGridPos(p1);
    const p2 = { x: -1, y: -1 };
    oidToObj.get(200)!.GetGridPos(p2);

    // Erster Knoten landet auf (3,0), zweiter ausgewichen — auf jeden Fall
    // unterschiedliche Zellen.
    expect(p1).toEqual({ x: 3, y: 0 });
    expect(`${p2.x},${p2.y}`).not.toBe("3,0");
  });
});
