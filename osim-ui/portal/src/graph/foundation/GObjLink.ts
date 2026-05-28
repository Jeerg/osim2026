/**
 * GObjLink — Knoten mit ein- und ausgehenden Link-Listen.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 533-621.
 *
 * Erweitert GObject um:
 * - m_InList: Liste eingehender GLink-Referenzen
 * - m_OutList: Liste ausgehender GLink-Referenzen
 * - ShowFolger/ShowVorgaenger: Highlight-Nachfolger/Vorgänger im Graphen
 * - GetLinkStartPos: berechnet wo ein Link am Knoten andockt (in welche
 *   GLDirection er rausgeht/reingeht)
 *
 * Alle konkreten Knoten-Klassen (PDpKnKonstant, PDpKnAlternativ, GObjSub etc.)
 * erben von GObjLink.
 */

import { GObject } from "@/graph/foundation/GObject";
import {
  GLDirection,
  type CPoint,
  type CRect,
  type CSize,
  type GORegion,
} from "@/graph/foundation/types";
import { GO_DEFAULT } from "@/graph/foundation/constants";

import type { GLink } from "@/graph/foundation/GLink";

/**
 * Knoten mit Link-Listen.
 */
export class GObjLink extends GObject {
  // ============================================================
  // Highlight-Flags (C++ Z. 542-543)
  // ============================================================

  /** Werden Vorgänger gerade highlighted? */
  m_ShowVorgaenger: boolean = false;
  /** Werden Folger gerade highlighted? */
  m_ShowFolger: boolean = false;

  // ============================================================
  // Link-Listen (C++ Z. 547-548)
  // ============================================================

  /** Eingehende Links (GLink*-Pointer im Original). */
  m_InList: GLink[] = [];
  /** Ausgehende Links. */
  m_OutList: GLink[] = [];

  // ============================================================
  // Konstruktor (C++ Z. 616)
  // ============================================================

  constructor(width: number = GO_DEFAULT, height: number = GO_DEFAULT) {
    super(width, height);
  }

  override IsOnlyGObj(): boolean {
    return false; // GObjLink ist NICHT nur ein plain GObject
  }

  // ============================================================
  // Highlight-Funktionen (C++ Z. 552-553)
  // ============================================================

  /**
   * Zeichnet alle Folge-Knoten highlighted. Iteriert m_OutList und
   * propagiert rekursiv. In Welle D voll implementiert (braucht GLink).
   */
  ShowFolger(): void {
    this.m_ShowFolger = true;
    // TODO Welle D: für jeden Link in m_OutList den Ziel-Knoten markieren
    // und rekursiv dessen ShowFolger() rufen (mit Zyklus-Schutz).
  }

  /**
   * Zeichnet alle Vorgänger-Knoten highlighted.
   */
  ShowVorgaenger(): void {
    this.m_ShowVorgaenger = true;
    // TODO Welle D: analog ShowFolger().
  }

  // ============================================================
  // Link-Management (C++ Z. 554-557)
  // ============================================================

  /**
   * Fügt einen eingehenden Link hinzu. Wenn schon vorhanden: no-op true.
   */
  AddInLink(link: GLink): boolean {
    if (this.m_InList.includes(link)) return true;
    this.m_InList.push(link);
    return true;
  }

  /**
   * Fügt einen ausgehenden Link hinzu.
   */
  AddOutLink(link: GLink): boolean {
    if (this.m_OutList.includes(link)) return true;
    this.m_OutList.push(link);
    return true;
  }

  /**
   * Entfernt einen eingehenden Link aus der Liste.
   */
  RemoveInLink(link: GLink): boolean {
    const idx = this.m_InList.indexOf(link);
    if (idx < 0) return false;
    this.m_InList.splice(idx, 1);
    return true;
  }

  /**
   * Entfernt einen ausgehenden Link.
   */
  RemoveOutLink(link: GLink): boolean {
    const idx = this.m_OutList.indexOf(link);
    if (idx < 0) return false;
    this.m_OutList.splice(idx, 1);
    return true;
  }

  /**
   * Berechnet die Andock-Position eines Links am Knoten je nach Direction.
   * 1:1-Pendant zu GraphObj.h Z. 558.
   *
   * Default-Implementation: Mitte der jeweiligen Kante des m_VirtRect.
   * Sub-Klassen mit eigener Geometrie (z.B. runde Knoten) überschreiben.
   */
  GetLinkStartPos(p: CPoint, direction: GLDirection, _link: GLink | null = null): void {
    const r = this.m_VirtRect;
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;

    switch (direction) {
      case GLDirection.NORTH:
        p.x = cx;
        p.y = r.top;
        break;
      case GLDirection.SOUTH:
        p.x = cx;
        p.y = r.bottom;
        break;
      case GLDirection.EAST:
        p.x = r.right;
        p.y = cy;
        break;
      case GLDirection.WEST:
        p.x = r.left;
        p.y = cy;
        break;
      case GLDirection.NORTH_EAST:
        p.x = r.right;
        p.y = r.top;
        break;
      case GLDirection.NORTH_WEST:
        p.x = r.left;
        p.y = r.top;
        break;
      case GLDirection.SOUTH_EAST:
        p.x = r.right;
        p.y = r.bottom;
        break;
      case GLDirection.SOUTH_WEST:
        p.x = r.left;
        p.y = r.bottom;
        break;
      case GLDirection.MIDDLE:
      case GLDirection.DEFAULT:
      default:
        // Default = Mitte. Die 8 sub-octant-Werte (NORTH_NORTH_EAST etc.)
        // werden in Welle D voll behandelt — Welle B reicht 8-Punkt-Geometrie.
        p.x = cx;
        p.y = cy;
        break;
    }
  }

  // ============================================================
  // Listen-Accessoren (C++ Z. 571-580)
  // ============================================================

  GetInHeadPosition(): number {
    return this.m_InList.length > 0 ? 0 : -1;
  }

  GetOutHeadPosition(): number {
    return this.m_OutList.length > 0 ? 0 : -1;
  }

  GetInNext(pos: { index: number }): GLink | null {
    if (pos.index < 0 || pos.index >= this.m_InList.length) return null;
    const link = this.m_InList[pos.index];
    pos.index++;
    if (pos.index >= this.m_InList.length) pos.index = -1;
    return link;
  }

  GetOutNext(pos: { index: number }): GLink | null {
    if (pos.index < 0 || pos.index >= this.m_OutList.length) return null;
    const link = this.m_OutList[pos.index];
    pos.index++;
    if (pos.index >= this.m_OutList.length) pos.index = -1;
    return link;
  }

  GetInAt(pos: { index: number }): GLink | null {
    if (pos.index < 0 || pos.index >= this.m_InList.length) return null;
    return this.m_InList[pos.index];
  }

  GetOutAt(pos: { index: number }): GLink | null {
    if (pos.index < 0 || pos.index >= this.m_OutList.length) return null;
    return this.m_OutList[pos.index];
  }

  IsInEmpty(): boolean {
    return this.m_InList.length === 0;
  }

  IsOutEmpty(): boolean {
    return this.m_OutList.length === 0;
  }

  GetInCount(): number {
    return this.m_InList.length;
  }

  GetOutCount(): number {
    return this.m_OutList.length;
  }

  // ============================================================
  // SetDelta-Override (C++ Z. 559)
  // ============================================================

  override SetDelta(fvMousePos: CPoint): void {
    super.SetDelta(fvMousePos);
    // GObjLink-Variante propagiert Delta auch an angeschlossene Links.
    // Volle Implementierung in Welle D, wenn GLink-Verhalten klar ist.
  }

  // ============================================================
  // Notifications (C++ Z. 563-564)
  // ============================================================

  OnInLinkAtMousePointerAdded(_virpoint: CPoint, _link: GLink): boolean {
    return true;
  }

  OnOutLinkAtMousePointerAdded(_virpoint: CPoint, _link: GLink): boolean {
    return true;
  }

  OnRemoveInLink(_link: GLink): boolean {
    return true;
  }

  OnRemoveOutLink(_link: GLink): boolean {
    return true;
  }

  // ============================================================
  // Overrides (C++ Z. 595-610) — Stub-Forwarders auf Super
  // ============================================================

  override SetPosition(myorg: CPoint): boolean {
    const ok = super.SetPosition(myorg);
    // GObjLink-Variante: alle angeschlossenen Links benachrichtigen.
    // Welle D verdrahtet die Re-Routing-Logik.
    return ok;
  }

  override GetSize(mysize: CSize): boolean {
    return super.GetSize(mysize);
  }

  override CheckRegion(virtp: CPoint): GORegion {
    return super.CheckRegion(virtp);
  }

  override IsHit(virtp: CPoint, list: GObject[]): boolean {
    return super.IsHit(virtp, list);
  }

  override MoveGObj(newrect: CRect, virtpoint: CPoint): boolean {
    return super.MoveGObj(newrect, virtpoint);
  }
}
