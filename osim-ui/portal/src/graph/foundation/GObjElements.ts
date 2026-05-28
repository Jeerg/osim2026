/**
 * GObjElements + GElement — Knoten mit Element-Slots (Link-Andock-Stellen).
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 631-733
 * (`class GElement : public CObject`,
 *  `class GObjElements : public GObjLink`).
 *
 * **Konzept (Anmerkung im C++-Header Z.681):** ein GObjElements ist ein
 * Knoten, der eine Liste von positionierten Elementen hält. Jedes Element
 * trägt bis zu zwei GLink-Referenzen (Primary + Secondary) und einen Text;
 * Drag-Drop von Links endet nicht am Knoten-Rand, sondern an einem
 * spezifischen Element. Use-Cases im Original: PDpKnAlternativ-Splits mit
 * mehreren Alternativen, In/Out-Listen-Knoten mit mehreren Slots.
 *
 * **Abgrenzung zu GObjSub:** GObjSub hält ein Sub-Grid mit eigener Geometrie
 * (rekursive Hierarchie). GObjElements hält eine flache, geordnete Liste
 * positionierter Slots IM eigenen Rect des Knotens. Beides sind eigene
 * C++-Klassen; nicht synonym.
 *
 * **Nicht portiert (MFC-Renderer + Win-Events):** Draw / DrawBackground /
 * DrawForeground / DrawHelpers / DrawElements / OnOpenPopUp / OnCommand /
 * OnLMButtonDown. React Flow rendert; Foundation hält nur das Modell.
 */

import { GObjLink } from "@/graph/foundation/GObjLink";
import {
  GORegion,
  type CPoint,
  type CRect,
  type CSize,
} from "@/graph/foundation/types";
import { GO_DEFAULT } from "@/graph/foundation/constants";
import type { GObject } from "@/graph/foundation/GObject";
import type { GLink } from "@/graph/foundation/GLink";

/**
 * Welcher der beiden Link-Slots eines GElement ist gemeint?
 * 1:1 aus C++ Z.631-636 `enum GElementLinkinList`.
 */
export enum GElementLinkinList {
  GEL_IN_LIST = 0,
  GEL_OUT_LIST = 1,
  GEL_ERROR = 2,
}

/**
 * Klick-Modus für GObjElements (Element einfügen vs entfernen vs nichts).
 * 1:1 aus C++ Z.659-664 `enum GObjElementKlickAction`. Statisch gehalten,
 * weil der C++-Original es als `static GObjElementKlickAction s_ActionMode`
 * deklariert (Z.674) — globaler Editor-Modus.
 */
export enum GObjElementKlickAction {
  GEL_DO_NOTHING = 0,
  GEL_INSERT_ELEMENT = 1,
  GEL_REMOVE_ELEMENT = 2,
}

/**
 * Ein positioniertes Element innerhalb eines GObjElements-Knotens.
 * 1:1 aus C++ Z.639-658 `class GElement : public CObject`.
 *
 * Hält bis zu zwei GLink-Referenzen (Primary + Secondary) — z.B. bei
 * Alternativ-Knoten ist Primary die "haupt"-Ausgangs-Kante und Secondary
 * die "Rücksprung"-Kante.
 */
export class GElement {
  /** Eltern-Knoten, der dieses Element enthält. */
  m_pParent: GObjElements | null = null;

  /** Lokales Rectangle innerhalb des Eltern-Knotens. */
  m_rect: CRect = { left: 0, top: 0, right: 0, bottom: 0 };

  /** Primärer Link (z.B. der "richtige" Ausgang einer Alternative). */
  m_pPrimaryLink: GLink | null = null;
  /** Auf welcher Link-Liste (In/Out) des Knotens liegt m_pPrimaryLink? */
  m_ePrimaryLocation: GElementLinkinList = GElementLinkinList.GEL_ERROR;

  /** Sekundärer Link (z.B. Rücksprung-Kante). */
  m_pSecondaryLink: GLink | null = null;
  /** Auf welcher Link-Liste (In/Out) liegt m_pSecondaryLink? */
  m_eSecondaryLocation: GElementLinkinList = GElementLinkinList.GEL_ERROR;

  /** Beschriftung des Elements (z.B. Bedingung der Alternative). */
  m_string: string = "";

  /**
   * Hit-Test: liegt `virtpoint` innerhalb `m_rect`?
   * 1:1 aus C++ Z.650 `virtual BOOL IsHit(CPoint virtpoint)`.
   */
  IsHit(virtpoint: CPoint): boolean {
    return (
      virtpoint.x >= this.m_rect.left &&
      virtpoint.x < this.m_rect.right &&
      virtpoint.y >= this.m_rect.top &&
      virtpoint.y < this.m_rect.bottom
    );
  }

  /**
   * Welche Region (Edit/Link-Edit/Move) liegt unter dem Punkt?
   * 1:1 aus C++ Z.651. Phase-1-Default: R_EDIT, wenn überhaupt getroffen.
   */
  CheckRegion(virtp: CPoint): GORegion {
    return this.IsHit(virtp) ? GORegion.R_EDIT : GORegion.R_NO;
  }
}

/**
 * Knoten mit positionierter Element-Liste.
 * 1:1 aus C++ Z.666-733 `class GObjElements : public GObjLink`.
 */
export class GObjElements extends GObjLink {
  // ============================================================
  // Statischer Editor-Modus (C++ Z.674 `static s_ActionMode`)
  // ============================================================
  static s_ActionMode: GObjElementKlickAction =
    GObjElementKlickAction.GEL_DO_NOTHING;

  // ============================================================
  // Eigenes Rect für die Element-Region (C++ Z.677)
  // ============================================================
  m_rElementRect: CRect = { left: 0, top: 0, right: 0, bottom: 0 };

  // ============================================================
  // Element-Liste (C++ Z.681 `m_Elements`)
  // ============================================================
  protected m_Elements: GElement[] = [];

  constructor(width: number = GO_DEFAULT, height: number = GO_DEFAULT) {
    super(width, height);
  }

  override IsOnlyGObj(): boolean {
    return false;
  }

  // ============================================================
  // Element-API (C++ Z.690-696)
  // ============================================================

  /**
   * Hängt ein Element an die Liste an. 1:1 aus C++ Z.690.
   * Setzt `m_pParent` rückwärts, damit Element seinen Parent kennt.
   */
  AddTail(elem: GElement): boolean {
    elem.m_pParent = this;
    this.m_Elements.push(elem);
    return true;
  }

  /**
   * Entfernt das übergebene Element ODER das Element am Index. 1:1 aus
   * C++ Z.691-692 (zwei Overloads). In TS unifiziert über Discriminator-
   * Param-Typ.
   */
  RemoveElement(target: GElement | number): GElement | null {
    let index: number;
    if (typeof target === "number") {
      index = target;
    } else {
      index = this.m_Elements.indexOf(target);
    }
    if (index < 0 || index >= this.m_Elements.length) return null;
    const [removed] = this.m_Elements.splice(index, 1);
    removed.m_pParent = null;
    return removed;
  }

  /** 1:1 aus C++ Z.693. Out-of-Bounds → null. */
  GetGElementAtIndex(index: number): GElement | null {
    if (index < 0 || index >= this.m_Elements.length) return null;
    return this.m_Elements[index];
  }

  /**
   * Sucht das Element unter dem Punkt. 1:1 aus C++ Z.694.
   * Liefert `[element, index]` ODER `[null, -1]`. Der C++-Original-Out-Param
   * `int &index` wird hier als Tuple zurückgegeben.
   */
  GetGElementAtPoint(p: CPoint): [GElement | null, number] {
    for (let i = 0; i < this.m_Elements.length; i++) {
      if (this.m_Elements[i].IsHit(p)) {
        return [this.m_Elements[i], i];
      }
    }
    return [null, -1];
  }

  /** 1:1 aus C++ Z.695 `m_Elements.GetCount()`. */
  GetElementCount(): number {
    return this.m_Elements.length;
  }

  /**
   * Prüft, ob ein Link in irgendeinem Element steckt (Primary ODER
   * Secondary). 1:1 aus C++ Z.696 `IsLinkInElement(GLink*, int&)`.
   * Out-Param `index` wird als Tuple zurückgegeben.
   */
  IsLinkInElement(link: GLink): [boolean, number] {
    for (let i = 0; i < this.m_Elements.length; i++) {
      const el = this.m_Elements[i];
      if (el.m_pPrimaryLink === link || el.m_pSecondaryLink === link) {
        return [true, i];
      }
    }
    return [false, -1];
  }

  // ============================================================
  // Element-Insert (C++ Z.685 `InsertElement(int index)`)
  // ============================================================

  /**
   * Fügt ein leeres Element an Position `index` ein. Nutzt `CreateElement()`
   * (Template-Method) damit Sub-Klassen ihre eigenen Element-Typen
   * instanziieren können (1:1 C++ Z.686 `virtual GElement *CreateElement()`).
   */
  protected InsertElement(index: number): GElement {
    const newEl = this.CreateElement();
    newEl.m_pParent = this;
    const clamped = Math.max(0, Math.min(index, this.m_Elements.length));
    this.m_Elements.splice(clamped, 0, newEl);
    return newEl;
  }

  /**
   * Factory für neue Elemente. Default: plain GElement. Sub-Klassen
   * (z.B. GObjAltElements) überschreiben dies um spezialisierte
   * Element-Typen zu erzeugen.
   */
  protected CreateElement(): GElement {
    return new GElement();
  }

  // ============================================================
  // Link-Entfernung — überschreibt GObjLink (C++ Z.699-700)
  // ============================================================

  /**
   * Entfernt eingehenden Link aus der globalen Liste UND löscht ihn aus
   * jedem Element, das ihn referenziert.
   */
  override RemoveInLink(link: GLink): boolean {
    const removedFromBase = super.RemoveInLink(link);
    for (const el of this.m_Elements) {
      if (el.m_pPrimaryLink === link) {
        el.m_pPrimaryLink = null;
        el.m_ePrimaryLocation = GElementLinkinList.GEL_ERROR;
      }
      if (el.m_pSecondaryLink === link) {
        el.m_pSecondaryLink = null;
        el.m_eSecondaryLocation = GElementLinkinList.GEL_ERROR;
      }
    }
    return removedFromBase;
  }

  /** Analog für ausgehende Links. */
  override RemoveOutLink(link: GLink): boolean {
    const removedFromBase = super.RemoveOutLink(link);
    for (const el of this.m_Elements) {
      if (el.m_pPrimaryLink === link) {
        el.m_pPrimaryLink = null;
        el.m_ePrimaryLocation = GElementLinkinList.GEL_ERROR;
      }
      if (el.m_pSecondaryLink === link) {
        el.m_pSecondaryLink = null;
        el.m_eSecondaryLocation = GElementLinkinList.GEL_ERROR;
      }
    }
    return removedFromBase;
  }

  // ============================================================
  // Geometrie (C++ Z.704-705)
  // ============================================================

  /**
   * `m_rElementRect` wird beim Setzen der Position des Knotens mit
   * verschoben. Default-Verhalten erbt von GObjLink (Knoten-Origin setzen);
   * Element-Rect bleibt relativ zum Knoten-Rect.
   */
  override SetPosition(myorg: CPoint): boolean {
    return super.SetPosition(myorg);
  }

  override GetSize(mysize: CSize): boolean {
    return super.GetSize(mysize);
  }

  // ============================================================
  // Hit-Test (C++ Z.720)
  // ============================================================

  /**
   * Erst eigenes Rect prüfen, dann Element-Liste durchgehen. Treffer auf
   * Element wird über CheckRegion gemeldet (Caller fragt anschließend).
   * Die List-Mechanik (`list` aus C++ `CTypedPtrList<CPtrList,GObject*>`)
   * wird hier als TS-Array gefüllt.
   */
  override IsHit(virtp: CPoint, list: GObject[]): boolean {
    const ownHit = super.IsHit(virtp, list);
    if (!ownHit) return false;
    // Treffer wurde bereits durch super.IsHit in list eingetragen.
    return true;
  }

  /**
   * CheckRegion: liegt der Punkt in einem Element → R_LINK_EDIT (Caller
   * weiß, dass am Element ein Link angedockt werden kann); sonst Default.
   * 1:1 aus C++ Z.719.
   */
  override CheckRegion(virtp: CPoint): GORegion {
    const [el] = this.GetGElementAtPoint(virtp);
    if (el) return GORegion.R_LINK_EDIT;
    return super.CheckRegion(virtp);
  }

  // ============================================================
  // GetLinkStartPos — Link dockt an einem Element an
  // ============================================================

  /**
   * Liefert die Anfangs-Position eines Links. Wenn der `link` an ein
   * Element gebunden ist (Primary oder Secondary), wird die Mitte dieses
   * Elements zurückgegeben — sonst Default-Verhalten von GObjLink
   * (Mitte der entsprechenden Knoten-Kante).
   *
   * 1:1 aus C++ Z.698 `virtual void GetLinkStartPos(CPoint&, GLDirection, GLink*=NULL)`.
   * (Die `dir`-Param-Bedeutung erbt aus GObjLink; wir leiten an `super` weiter.)
   */
  override GetLinkStartPos(
    p: CPoint,
    dir: number,
    link: GLink | null = null,
  ): void {
    if (link) {
      const [el] = this.IsLinkInElement(link);
      if (el) {
        // Mitte des Element-Rects (lokal → absolute Koordinaten via VirtRect).
        const r = this.m_Elements.find(
          (e) =>
            e.m_pPrimaryLink === link || e.m_pSecondaryLink === link,
        )?.m_rect;
        if (r) {
          p.x = this.m_VirtRect.left + (r.left + r.right) / 2;
          p.y = this.m_VirtRect.top + (r.top + r.bottom) / 2;
          return;
        }
      }
    }
    super.GetLinkStartPos(p, dir, link);
  }

  // ============================================================
  // Notifikationen — wenn ein Link am Mauspointer eingefügt wird
  // ============================================================

  /**
   * Hook: ein eingehender Link wird gerade per Drag am Element-Slot
   * angedockt. Default-Verhalten: das Element unter dem Mauspointer
   * bekommt den Link als Primary zugewiesen.
   * 1:1 aus C++ Z.709 `virtual BOOL OnInLinkAtMousePointerAdded`.
   */
  OnInLinkAtMousePointerAdded(virtpoint: CPoint, link: GLink): boolean {
    const [el] = this.GetGElementAtPoint(virtpoint);
    if (!el) return false;
    el.m_pPrimaryLink = link;
    el.m_ePrimaryLocation = GElementLinkinList.GEL_IN_LIST;
    return true;
  }

  /** Analog für ausgehenden Link. */
  OnOutLinkAtMousePointerAdded(virtpoint: CPoint, link: GLink): boolean {
    const [el] = this.GetGElementAtPoint(virtpoint);
    if (!el) return false;
    el.m_pPrimaryLink = link;
    el.m_ePrimaryLocation = GElementLinkinList.GEL_OUT_LIST;
    return true;
  }

  /**
   * Lese-Zugriff auf die Element-Liste (Read-Only-Snapshot für Renderer
   * und Tests; Mutation läuft über AddTail/RemoveElement/InsertElement).
   */
  GetElements(): readonly GElement[] {
    return this.m_Elements;
  }
}
