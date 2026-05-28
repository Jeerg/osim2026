/**
 * Tests fuer GObjElements + GElement (Track B0).
 *
 * Decken die portierten Methoden aus C++ GraphObj.h Z.639-733 ab —
 * NICHT die MFC-Renderer-Methoden (Draw*, OnOpenPopUp, OnCommand etc.),
 * die im Port bewusst weggelassen sind.
 */

import { describe, expect, it } from "vitest";
import {
  GObjElements,
  GElement,
  GElementLinkinList,
  GObjElementKlickAction,
} from "../GObjElements";
import { GLink } from "../GLink";
import { GORegion, type CPoint } from "../types";

function makeElement(
  left: number,
  top: number,
  right: number,
  bottom: number,
  string = "",
): GElement {
  const el = new GElement();
  el.m_rect = { left, top, right, bottom };
  el.m_string = string;
  return el;
}

describe("GElement", () => {
  it("IsHit liefert true innerhalb m_rect, false außerhalb (halboffene Intervalle)", () => {
    const el = makeElement(10, 10, 50, 50);
    expect(el.IsHit({ x: 25, y: 25 })).toBe(true);
    expect(el.IsHit({ x: 10, y: 10 })).toBe(true); // linke obere Kante inklusiv
    expect(el.IsHit({ x: 49, y: 49 })).toBe(true);
    expect(el.IsHit({ x: 50, y: 25 })).toBe(false); // rechte Kante exklusiv
    expect(el.IsHit({ x: 25, y: 50 })).toBe(false); // untere Kante exklusiv
    expect(el.IsHit({ x: 5, y: 25 })).toBe(false);
  });

  it("CheckRegion liefert R_EDIT bei Treffer, R_NO sonst", () => {
    const el = makeElement(0, 0, 20, 20);
    expect(el.CheckRegion({ x: 10, y: 10 })).toBe(GORegion.R_EDIT);
    expect(el.CheckRegion({ x: 100, y: 100 })).toBe(GORegion.R_NO);
  });
});

describe("GObjElements — Element-Liste", () => {
  it("AddTail haengt Elements an + setzt m_pParent rueckwaerts", () => {
    const node = new GObjElements();
    const e1 = new GElement();
    const e2 = new GElement();
    expect(node.AddTail(e1)).toBe(true);
    expect(node.AddTail(e2)).toBe(true);
    expect(node.GetElementCount()).toBe(2);
    expect(e1.m_pParent).toBe(node);
    expect(e2.m_pParent).toBe(node);
  });

  it("RemoveElement(element) entfernt das richtige Element + nullt m_pParent", () => {
    const node = new GObjElements();
    const e1 = new GElement();
    const e2 = new GElement();
    const e3 = new GElement();
    node.AddTail(e1);
    node.AddTail(e2);
    node.AddTail(e3);
    expect(node.RemoveElement(e2)).toBe(e2);
    expect(node.GetElementCount()).toBe(2);
    expect(e2.m_pParent).toBeNull();
    expect(node.GetGElementAtIndex(0)).toBe(e1);
    expect(node.GetGElementAtIndex(1)).toBe(e3);
  });

  it("RemoveElement(index) entfernt am Index, gibt null bei Out-of-Bounds", () => {
    const node = new GObjElements();
    const e1 = new GElement();
    const e2 = new GElement();
    node.AddTail(e1);
    node.AddTail(e2);
    expect(node.RemoveElement(0)).toBe(e1);
    expect(node.RemoveElement(5)).toBeNull();
    expect(node.RemoveElement(-1)).toBeNull();
    expect(node.GetElementCount()).toBe(1);
  });

  it("GetGElementAtIndex liefert null bei Out-of-Bounds", () => {
    const node = new GObjElements();
    node.AddTail(new GElement());
    expect(node.GetGElementAtIndex(-1)).toBeNull();
    expect(node.GetGElementAtIndex(99)).toBeNull();
    expect(node.GetGElementAtIndex(0)).not.toBeNull();
  });

  it("GetGElementAtPoint liefert [element, index] beim Treffer, [null, -1] sonst", () => {
    const node = new GObjElements();
    const e1 = makeElement(0, 0, 50, 30);
    const e2 = makeElement(0, 30, 50, 60);
    node.AddTail(e1);
    node.AddTail(e2);
    const hit1 = node.GetGElementAtPoint({ x: 25, y: 10 });
    expect(hit1[0]).toBe(e1);
    expect(hit1[1]).toBe(0);
    const hit2 = node.GetGElementAtPoint({ x: 25, y: 45 });
    expect(hit2[0]).toBe(e2);
    expect(hit2[1]).toBe(1);
    const miss = node.GetGElementAtPoint({ x: 200, y: 200 });
    expect(miss[0]).toBeNull();
    expect(miss[1]).toBe(-1);
  });
});

describe("GObjElements — Link-Bindung", () => {
  it("IsLinkInElement findet Primary + Secondary, liefert -1 wenn nicht", () => {
    const node = new GObjElements();
    const el = new GElement();
    const linkA = new GLink();
    const linkB = new GLink();
    const linkC = new GLink();
    el.m_pPrimaryLink = linkA;
    el.m_pSecondaryLink = linkB;
    node.AddTail(el);

    const [hitA, idxA] = node.IsLinkInElement(linkA);
    expect(hitA).toBe(true);
    expect(idxA).toBe(0);

    const [hitB, idxB] = node.IsLinkInElement(linkB);
    expect(hitB).toBe(true);
    expect(idxB).toBe(0);

    const [hitC, idxC] = node.IsLinkInElement(linkC);
    expect(hitC).toBe(false);
    expect(idxC).toBe(-1);
  });

  it("RemoveInLink loescht Link aus Element-Slots", () => {
    const node = new GObjElements();
    const el = new GElement();
    const link = new GLink();
    el.m_pPrimaryLink = link;
    el.m_ePrimaryLocation = GElementLinkinList.GEL_IN_LIST;
    node.AddTail(el);
    node.m_InList.push(link);

    node.RemoveInLink(link);

    expect(el.m_pPrimaryLink).toBeNull();
    expect(el.m_ePrimaryLocation).toBe(GElementLinkinList.GEL_ERROR);
    expect(node.m_InList.includes(link)).toBe(false);
  });

  it("RemoveOutLink loescht Secondary-Link aus Element-Slots", () => {
    const node = new GObjElements();
    const el = new GElement();
    const link = new GLink();
    el.m_pSecondaryLink = link;
    el.m_eSecondaryLocation = GElementLinkinList.GEL_OUT_LIST;
    node.AddTail(el);
    node.m_OutList.push(link);

    node.RemoveOutLink(link);

    expect(el.m_pSecondaryLink).toBeNull();
    expect(el.m_eSecondaryLocation).toBe(GElementLinkinList.GEL_ERROR);
  });
});

describe("GObjElements — Pointer-Hooks", () => {
  it("OnInLinkAtMousePointerAdded weist Link dem Element unter dem Pointer als Primary zu", () => {
    const node = new GObjElements();
    const el = makeElement(0, 0, 50, 30);
    node.AddTail(el);
    const link = new GLink();

    const ok = node.OnInLinkAtMousePointerAdded({ x: 25, y: 15 }, link);

    expect(ok).toBe(true);
    expect(el.m_pPrimaryLink).toBe(link);
    expect(el.m_ePrimaryLocation).toBe(GElementLinkinList.GEL_IN_LIST);
  });

  it("OnInLinkAtMousePointerAdded liefert false wenn Pointer kein Element trifft", () => {
    const node = new GObjElements();
    node.AddTail(makeElement(0, 0, 50, 30));
    const link = new GLink();
    const ok = node.OnInLinkAtMousePointerAdded({ x: 999, y: 999 }, link);
    expect(ok).toBe(false);
  });

  it("OnOutLinkAtMousePointerAdded setzt GEL_OUT_LIST", () => {
    const node = new GObjElements();
    const el = makeElement(0, 0, 50, 30);
    node.AddTail(el);
    const link = new GLink();
    node.OnOutLinkAtMousePointerAdded({ x: 10, y: 10 }, link);
    expect(el.m_ePrimaryLocation).toBe(GElementLinkinList.GEL_OUT_LIST);
  });
});

describe("GObjElements — CheckRegion (Element-Hit ⇒ R_LINK_EDIT)", () => {
  it("liefert R_LINK_EDIT wenn der Punkt in einem Element ist", () => {
    const node = new GObjElements();
    node.AddTail(makeElement(10, 10, 40, 30));
    // Setze Knoten-VirtRect groß genug damit super.CheckRegion 'innen' liefert.
    node.m_VirtRect = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(node.CheckRegion({ x: 20, y: 20 })).toBe(GORegion.R_LINK_EDIT);
  });

  it("delegiert an super wenn der Punkt zwar im Knoten, aber in keinem Element ist", () => {
    const node = new GObjElements();
    node.AddTail(makeElement(10, 10, 40, 30));
    node.m_VirtRect = { left: 0, top: 0, right: 100, bottom: 100 };
    // Punkt im Knoten, aber nicht im Element.
    const r = node.CheckRegion({ x: 80, y: 80 });
    expect(r).not.toBe(GORegion.R_LINK_EDIT);
  });
});

describe("GObjElements — Statischer Editor-Mode (s_ActionMode)", () => {
  it("Default ist GEL_DO_NOTHING, ist global setzbar", () => {
    expect(GObjElements.s_ActionMode).toBe(
      GObjElementKlickAction.GEL_DO_NOTHING,
    );
    GObjElements.s_ActionMode = GObjElementKlickAction.GEL_INSERT_ELEMENT;
    expect(GObjElements.s_ActionMode).toBe(
      GObjElementKlickAction.GEL_INSERT_ELEMENT,
    );
    // Reset
    GObjElements.s_ActionMode = GObjElementKlickAction.GEL_DO_NOTHING;
  });
});

describe("GObjElements — GetLinkStartPos", () => {
  it("liefert Mitte des Element-Rects wenn der Link an einem Element haengt", () => {
    const node = new GObjElements();
    node.m_VirtRect = { left: 100, top: 100, right: 300, bottom: 300 };
    const el = new GElement();
    el.m_rect = { left: 10, top: 0, right: 50, bottom: 40 };
    const link = new GLink();
    el.m_pPrimaryLink = link;
    el.m_ePrimaryLocation = GElementLinkinList.GEL_OUT_LIST;
    node.AddTail(el);

    const p: CPoint = { x: 0, y: 0 };
    node.GetLinkStartPos(p, 0, link);
    // Mitte des Element-Rects: ((10+50)/2, (0+40)/2) = (30, 20), absolut
    // verschoben um VirtRect-Origin (100,100) → (130, 120).
    expect(p.x).toBe(130);
    expect(p.y).toBe(120);
  });

  it("faellt auf super-Implementation zurueck wenn kein Element den Link enthaelt", () => {
    const node = new GObjElements();
    node.m_VirtRect = { left: 100, top: 100, right: 300, bottom: 300 };
    const link = new GLink();
    const p: CPoint = { x: 0, y: 0 };
    node.GetLinkStartPos(p, 0, link);
    // super liefert irgendetwas nicht-(130,120) — super-spezifisch, hier nur
    // verifizieren dass NICHT die Element-Mitte zurueckgegeben wird.
    expect(p.x === 130 && p.y === 120).toBe(false);
  });
});
