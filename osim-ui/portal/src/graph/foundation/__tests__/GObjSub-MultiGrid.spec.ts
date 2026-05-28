/**
 * Welle G27 — Multi-Grid-Knoten Layout-Tests.
 *
 * Hintergrund: C++-Original hat `GObjAlt extends GObjSub` mit N Sub-Grids
 * (vertikal stacked). Unsere TS-Foundation hat `GObjSub.m_subView.m_Collections`
 * als Array und kann strukturell N Sub-Collections halten — aber vor G27
 * legten GetSize/SetPosition/GetRect alle N Sub-Grids ÜBEREINANDER auf den
 * selben Origin.
 *
 * Diese Tests verifizieren:
 * 1. GetSize summiert Höhen + Separator, MAX über Breiten
 * 2. SetPosition propagiert kumulativ — jeder Sub-Grid auf eigenem y-Offset
 * 3. GetRect spannt die Bounding-Box über alle Sub-Grids
 */

import { describe, it, expect } from "vitest";

import { GObjLink } from "@/graph/foundation/GObjLink";
import { GObjSub } from "@/graph/foundation/GObjSub";
import { GOStateSub } from "@/graph/foundation/types";
import { OGraphGrid } from "@/graph/foundation/OGraphGrid";

function mkChild(id: string): GObjLink {
  const o = new GObjLink();
  o.SetViewedObject(id);
  o.SetText(id);
  return o;
}

function mkSubGrid(childIds: string[]): OGraphGrid {
  const grid = new OGraphGrid();
  childIds.forEach((id, i) => {
    grid.GOIns(mkChild(id), i, 0, false);
  });
  grid.finalizeLayout();
  return grid;
}

describe("GObjSub Welle G27 — Multi-Grid-Layout", () => {
  it("GetSize bei N=3 Sub-Grids summiert Höhen + Separator", () => {
    const parent = new GObjSub(100, 50);
    parent.AddSubCollection(mkSubGrid(["A1", "A2"]));
    parent.AddSubCollection(mkSubGrid(["B1"]));
    parent.AddSubCollection(mkSubGrid(["C1", "C2", "C3"]));
    parent.SetSubState(GOStateSub.D_OPEN);

    const size = { cx: 0, cy: 0 };
    parent.GetSize(size);

    // Sanity: width ist MAX über Sub-Grid-Widths plus Padding.
    expect(size.cx).toBeGreaterThan(0);
    // Höhe muss alle 3 Sub-Grids + 2 Separator + Header enthalten.
    // Mit STD_GRID_HEIGHT=10 + finalizeLayout-Padding sind die Sub-Heights
    // > 0. Wir prüfen nur dass cumulative > nur-max-of-one.
    const oneSubSize = { cx: 0, cy: 0 };
    const onlyOne = new GObjSub(100, 50);
    onlyOne.AddSubCollection(mkSubGrid(["A1", "A2"]));
    onlyOne.SetSubState(GOStateSub.D_OPEN);
    onlyOne.GetSize(oneSubSize);

    // 3 Sub-Grids müssen DEUTLICH größer sein als nur 1 Sub-Grid.
    // (Vor G27 waren sie GLEICH groß, weil Max statt Summe.)
    expect(size.cy).toBeGreaterThan(oneSubSize.cy);
  });

  it("SetPosition propagiert kumulativen y-Offset pro Sub-Grid", () => {
    const parent = new GObjSub(100, 50);
    const g1 = mkSubGrid(["A1"]);
    const g2 = mkSubGrid(["B1"]);
    const g3 = mkSubGrid(["C1"]);
    parent.AddSubCollection(g1);
    parent.AddSubCollection(g2);
    parent.AddSubCollection(g3);
    parent.SetSubState(GOStateSub.D_OPEN);

    // GetSize ruft intern finalizeLayout — danach haben Sub-Grids ihre
    // m_GSize-Werte. Position propagieren.
    const dummySize = { cx: 0, cy: 0 };
    parent.GetSize(dummySize);
    parent.SetPosition({ x: 0, y: 0 });

    // Jedes Sub-Grid hat sein eigenes m_GOrg (oder pColHead.m_StartPos).
    // Die y-Origins MÜSSEN aufsteigend sein (g1.y < g2.y < g3.y).
    // applyPositions speichert die übergebene Origin nicht direkt am Grid,
    // aber jedes Child im Grid bekommt eine pColHead.m_StartPos-basierte
    // Pixel-Position. Wir prüfen indirekt: der erste Child von g2 muss
    // weiter unten liegen als der erste Child von g1.
    const child1 = g1.iterate ? null : null;
    void child1;
    // Direkt-Approach: iterate über Children und prüfe y-Positionen.
    const yPositions: number[] = [];
    [g1, g2, g3].forEach((g) => {
      g.iterate((child) => {
        const r = { left: 0, top: 0, right: 0, bottom: 0 };
        child.GetRect(r);
        yPositions.push(r.top);
      });
    });
    expect(yPositions.length).toBe(3);
    // Aufsteigende y-Werte = stacked Layout
    expect(yPositions[1]).toBeGreaterThan(yPositions[0]);
    expect(yPositions[2]).toBeGreaterThan(yPositions[1]);
  });

  it("GetRect spannt Bounding-Box über alle Sub-Grids", () => {
    const parent = new GObjSub(100, 50);
    parent.AddSubCollection(mkSubGrid(["A1"]));
    parent.AddSubCollection(mkSubGrid(["B1"]));
    parent.SetSubState(GOStateSub.D_OPEN);

    const sizeProbe = { cx: 0, cy: 0 };
    parent.GetSize(sizeProbe);

    const rect = { left: 0, top: 0, right: 0, bottom: 0 };
    parent.GetRect(rect);

    const heightFromRect = rect.bottom - rect.top;

    // Vergleich mit 1-Sub-Grid-Variante
    const single = new GObjSub(100, 50);
    single.AddSubCollection(mkSubGrid(["A1"]));
    single.SetSubState(GOStateSub.D_OPEN);
    const singleSize = { cx: 0, cy: 0 };
    single.GetSize(singleSize);
    const singleRect = { left: 0, top: 0, right: 0, bottom: 0 };
    single.GetRect(singleRect);
    const singleHeight = singleRect.bottom - singleRect.top;

    // 2 Sub-Grids → höher als 1 Sub-Grid (vorher waren beide gleich).
    expect(heightFromRect).toBeGreaterThan(singleHeight);
  });

  it("1 Sub-Grid bleibt verhaltensgleich (Regression-Check)", () => {
    // Welle G27 darf den 1-Sub-Grid-Fall NICHT verändern — sonst bricht
    // jedes existierende PDurchlaufplan-Modell.
    const parent = new GObjSub(100, 50);
    parent.AddSubCollection(mkSubGrid(["X1", "X2", "X3"]));
    parent.SetSubState(GOStateSub.D_OPEN);

    const size = { cx: 0, cy: 0 };
    parent.GetSize(size);
    expect(size.cx).toBeGreaterThan(0);
    expect(size.cy).toBeGreaterThan(0);

    parent.SetPosition({ x: 0, y: 0 });
    const rect = { left: 0, top: 0, right: 0, bottom: 0 };
    parent.GetRect(rect);
    expect(rect.bottom).toBeGreaterThan(rect.top);
  });

  it("D_CLOSED ignoriert Sub-Grids komplett", () => {
    const parent = new GObjSub(100, 50);
    parent.AddSubCollection(mkSubGrid(["A1", "A2"]));
    parent.AddSubCollection(mkSubGrid(["B1"]));
    // Default ist D_CLOSED — kein SetSubState
    const size = { cx: 0, cy: 0 };
    parent.GetSize(size);
    // Im D_CLOSED kommt der GObjLink-Basiswert (100, 50).
    expect(size.cx).toBe(100);
    expect(size.cy).toBe(50);
  });
});
