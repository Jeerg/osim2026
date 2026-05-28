/**
 * Welle-D-Tests für GLink, GLinkPoint, GLinkSquare.
 */

import { describe, it, expect } from "vitest";

import { GObjLink } from "@/graph/foundation/GObjLink";
import { GLink } from "@/graph/foundation/GLink";
import {
  GLinkPoint,
  LinkSetState,
  MAX_POINT_NUM,
  STD_LINK_EDIT_DISTANCE,
} from "@/graph/foundation/GLinkPoint";
import { GLinkSquare } from "@/graph/foundation/GLinkSquare";
import { GLDirection, GORegion } from "@/graph/foundation/types";

describe("GLink Konstruktor + Endpunkt-Registrierung", () => {
  it("Konstruktor mit prev/next registriert In-/Out-Listen automatisch", () => {
    const prev = new GObjLink(100, 50);
    const next = new GObjLink(100, 50);
    prev.SetPosition({ x: 0, y: 0 });
    next.SetPosition({ x: 300, y: 0 });
    const link = new GLink(prev, next);
    expect(prev.m_OutList).toContain(link);
    expect(next.m_InList).toContain(link);
    expect(link.GetPrev()).toBe(prev);
    expect(link.GetNext()).toBe(next);
  });

  it("ResetMyPrev/Next räumt die jeweilige Liste auf", () => {
    const prev = new GObjLink(100, 50);
    const next = new GObjLink(100, 50);
    const link = new GLink(prev, next);
    link.OnNodePrevRemoved(prev);
    expect(prev.m_OutList).not.toContain(link);
    expect(link.GetPrev()).toBeNull();
    link.OnNodeNextRemoved(next);
    expect(next.m_InList).not.toContain(link);
    expect(link.GetNext()).toBeNull();
  });
});

describe("GLink Hit-Test", () => {
  it("CheckRegion liefert R_LINK_EDIT bei Punkt auf Linie", () => {
    const prev = new GObjLink(100, 50);
    const next = new GObjLink(100, 50);
    prev.SetPosition({ x: 0, y: 0 });
    next.SetPosition({ x: 200, y: 0 });
    const link = new GLink(prev, next);
    link.SetStdGLDirPrev(GLDirection.EAST);
    link.SetStdGLDirNext(GLDirection.WEST);

    // Punkt nahe der gerade Verbindung
    expect(link.CheckRegion({ x: 150, y: 25 })).toBe(GORegion.R_LINK_EDIT);
    // Punkt weit weg
    expect(link.CheckRegion({ x: 150, y: 200 })).toBe(GORegion.R_NO);
  });

  it("IsHit fügt sich in Liste ein bei Treffer", () => {
    const prev = new GObjLink(100, 50);
    const next = new GObjLink(100, 50);
    prev.SetPosition({ x: 0, y: 0 });
    next.SetPosition({ x: 200, y: 0 });
    const link = new GLink(prev, next);
    const list: GLink[] = [];
    expect(link.IsHit({ x: 100, y: 25 }, list)).toBe(true);
    expect(list).toContain(link);
  });
});

describe("GLink GetLinkRect", () => {
  it("Bounding-Box umfasst Start und End", () => {
    const prev = new GObjLink(100, 50);
    const next = new GObjLink(100, 50);
    prev.SetPosition({ x: 0, y: 0 });
    next.SetPosition({ x: 400, y: 100 });
    const link = new GLink(prev, next);
    link.SetStdGLDirPrev(GLDirection.EAST);
    link.SetStdGLDirNext(GLDirection.WEST);

    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(link.GetLinkRect(r)).toBe(true);
    expect(r.left).toBe(100); // Right-Edge des Prev
    expect(r.right).toBe(400); // Left-Edge des Next
  });
});

describe("GLinkPoint Stützpunkte", () => {
  it("AppendPoint fügt bis MAX_POINT_NUM an, dann throws", () => {
    const link = new GLinkPoint();
    for (let i = 0; i < MAX_POINT_NUM; i++) {
      link.AppendPoint({ x: i, y: i });
    }
    expect(link.m_PointList.length).toBe(MAX_POINT_NUM);
    expect(link.m_UsedPointNum).toBe(MAX_POINT_NUM);
    expect(() => link.AppendPoint({ x: 99, y: 99 })).toThrow();
  });

  it("CheckRegion erkennt Stützpunkt mit STD_LINK_EDIT_DISTANCE", () => {
    const prev = new GObjLink(100, 50);
    const next = new GObjLink(100, 50);
    prev.SetPosition({ x: 0, y: 0 });
    next.SetPosition({ x: 400, y: 0 });
    const link = new GLinkPoint(prev, next);
    link.AppendPoint({ x: 200, y: 50 });

    // Direkt auf dem Stützpunkt
    expect(link.CheckRegion({ x: 200, y: 50 })).toBe(GORegion.R_LINK_EDIT);
    // Innerhalb Toleranz
    expect(
      link.CheckRegion({ x: 200 + STD_LINK_EDIT_DISTANCE, y: 50 }),
    ).toBe(GORegion.R_LINK_EDIT);
    // Außerhalb Toleranz, aber nahe an Linie → trotzdem R_LINK_EDIT durch
    // den Distance-To-Segment-Check der Basisklasse
    // (volle Toleranz-Logik kommt in Welle F)
  });

  it("GetPolyline liefert Start + Stützpunkte + End", () => {
    const prev = new GObjLink(100, 50);
    const next = new GObjLink(100, 50);
    prev.SetPosition({ x: 0, y: 0 });
    next.SetPosition({ x: 400, y: 100 });
    const link = new GLinkPoint(prev, next);
    link.SetStdGLDirPrev(GLDirection.EAST);
    link.SetStdGLDirNext(GLDirection.WEST);
    link.AppendPoint({ x: 200, y: 50 });
    link.AppendPoint({ x: 300, y: 75 });

    const polyline = link.GetPolyline();
    expect(polyline.length).toBe(4); // start + 2 stützpunkte + end
    expect(polyline[1]).toEqual({ x: 200, y: 50 });
    expect(polyline[2]).toEqual({ x: 300, y: 75 });
  });

  it("LinkSetState wechsel speichert old-State", () => {
    const link = new GLinkPoint();
    expect(link.GetLinkState()).toBe(LinkSetState.SET_AUTO);
    link.SetLinkState(LinkSetState.SET_HELP);
    expect(link.GetLinkState()).toBe(LinkSetState.SET_HELP);
    expect(link.m_OldSetState).toBe(LinkSetState.SET_AUTO);
  });
});

describe("GLinkSquare 90-Grad-Routing", () => {
  it("Konstruktor initialisiert 2 Knick-Punkte", () => {
    const link = new GLinkSquare();
    expect(link.m_UsedPointNum).toBe(2);
    expect(link.m_PointList.length).toBe(2);
  });

  it("RecomputeKnicks bei horizontaler Hauptrichtung liefert vertikal-mittigen Knick", () => {
    const prev = new GObjLink(100, 50);
    const next = new GObjLink(100, 50);
    prev.SetPosition({ x: 0, y: 0 });
    next.SetPosition({ x: 400, y: 200 });
    const link = new GLinkSquare(prev, next);
    link.SetStdGLDirPrev(GLDirection.EAST);
    link.SetStdGLDirNext(GLDirection.WEST);

    link.RecomputeKnicks();

    // Start = (100, 25), End = (400, 225)
    // midX = (100 + 400) / 2 = 250
    // Knick #1 = (250, 25), Knick #2 = (250, 225)
    expect(link.m_PointList[0].x).toBe(250);
    expect(link.m_PointList[0].y).toBe(25);
    expect(link.m_PointList[1].x).toBe(250);
    expect(link.m_PointList[1].y).toBe(225);
  });
});

describe("GObjLink GetLinkStartPos 8-Richtungen", () => {
  it("liefert korrekte Andock-Punkte für NORTH/SOUTH/EAST/WEST", () => {
    const node = new GObjLink(100, 50);
    node.SetPosition({ x: 100, y: 200 });
    // Rect = (100, 200) - (200, 250). cx=150, cy=225.
    const p = { x: 0, y: 0 };

    node.GetLinkStartPos(p, GLDirection.NORTH);
    expect(p).toEqual({ x: 150, y: 200 });

    node.GetLinkStartPos(p, GLDirection.SOUTH);
    expect(p).toEqual({ x: 150, y: 250 });

    node.GetLinkStartPos(p, GLDirection.EAST);
    expect(p).toEqual({ x: 200, y: 225 });

    node.GetLinkStartPos(p, GLDirection.WEST);
    expect(p).toEqual({ x: 100, y: 225 });

    node.GetLinkStartPos(p, GLDirection.NORTH_EAST);
    expect(p).toEqual({ x: 200, y: 200 });

    node.GetLinkStartPos(p, GLDirection.SOUTH_WEST);
    expect(p).toEqual({ x: 100, y: 250 });
  });
});
