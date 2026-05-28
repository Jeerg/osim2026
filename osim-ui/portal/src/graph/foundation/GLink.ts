/**
 * GLink — Kante zwischen zwei GObjLink-Knoten.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 1004-1085.
 *
 * Im C++-Original ist GLink ein vollwertiges GObject (keine reine Edge-
 * Annotation), das selbst gerendert wird und Hit-Test/Region-Check/Click-
 * Handler hat. Die Kante hält m_Prev/m_Next-Pointer auf zwei GObjLink-Knoten
 * und Default-Routing-Directions (m_STDGLDirPrev/Next).
 *
 * Sub-Klassen:
 * - GLinkPoint: Multi-Punkt-Polyline mit max. MAX_POINT_NUM=6 Stützpunkten
 * - GLinkSquare: rechtwinkliges Routing (zwei 90°-Knicke)
 */

import { GObject } from "@/graph/foundation/GObject";
import { GObjLink } from "@/graph/foundation/GObjLink";
import {
  GLDirection,
  type CPoint,
  type CRect,
  type CSize,
  type GORegion,
} from "@/graph/foundation/types";

/**
 * Kante zwischen zwei Knoten. Erbt von GObject (eigenes Rendering).
 */
export class GLink extends GObject {
  // ============================================================
  // Endpunkte (C++ Z. 1014-1015)
  // ============================================================

  /** Ziel-Knoten ("zu diesem Knoten geht der Link"). */
  m_Next: GObjLink | null = null;
  /** Quell-Knoten ("von diesem Knoten geht der Link"). */
  m_Prev: GObjLink | null = null;

  // ============================================================
  // Standard-Richtungen (C++ Z. 1017-1018)
  // ============================================================

  /** Default-Direction, in die der Link aus m_Prev rausgeht. */
  m_STDGLDirPrev: GLDirection = GLDirection.EAST;
  /** Default-Direction, in der der Link bei m_Next andockt. */
  m_STDGLDirNext: GLDirection = GLDirection.WEST;

  // ============================================================
  // Farbe (C++ Z. 1019)
  // ============================================================

  /** Link-Farbe (CSS-String). */
  m_crLinkColor: string = "#374151";

  // ============================================================
  // Konstruktor (C++ Z. 1081)
  // ============================================================

  constructor(prev: GObjLink | null = null, next: GObjLink | null = null) {
    super();
    this.m_Prev = prev;
    this.m_Next = next;
    if (prev) prev.AddOutLink(this);
    if (next) next.AddInLink(this);
  }

  override IsOnlyGObj(): boolean {
    return false;
  }

  // ============================================================
  // Accessors (C++ Z. 1023-1024)
  // ============================================================

  GetNext(): GObjLink | null {
    return this.m_Next;
  }

  GetPrev(): GObjLink | null {
    return this.m_Prev;
  }

  /** Paint-Reihenfolge — Default = GetNext. Sub-Klassen können routen. */
  GetPaintNext(): GObjLink | null {
    return this.m_Next;
  }

  GetPaintPrev(): GObjLink | null {
    return this.m_Prev;
  }

  // ============================================================
  // Geometrie (C++ Z. 1027-1028)
  // ============================================================

  /**
   * Berechnet das umschließende Rectangle des Links (auf Basis der
   * Endpunkt-Positionen).
   */
  GetLinkRect(lrect: CRect): boolean {
    if (!this.m_Prev || !this.m_Next) return false;
    const pStart: CPoint = { x: 0, y: 0 };
    const pEnd: CPoint = { x: 0, y: 0 };
    this.GetStartPosFromPrev(pStart, this.m_STDGLDirPrev);
    this.GetStartPosFromNext(pEnd, this.m_STDGLDirNext);
    lrect.left = Math.min(pStart.x, pEnd.x);
    lrect.top = Math.min(pStart.y, pEnd.y);
    lrect.right = Math.max(pStart.x, pEnd.x);
    lrect.bottom = Math.max(pStart.y, pEnd.y);
    return true;
  }

  /**
   * Test ob ein Punkt nahe dem Link liegt (für Click-Routing).
   * Default-Implementation: Punkt liegt in einem Toleranz-Schlauch um die
   * gerade Verbindung Prev→Next.
   */
  PtInLinkRect(virtpoint: CPoint, _ctx: unknown = null): boolean {
    if (!this.m_Prev || !this.m_Next) return false;
    const tolerance = 5;
    const a: CPoint = { x: 0, y: 0 };
    const b: CPoint = { x: 0, y: 0 };
    this.GetStartPosFromPrev(a, this.m_STDGLDirPrev);
    this.GetStartPosFromNext(b, this.m_STDGLDirNext);
    return distancePointToSegment(virtpoint, a, b) <= tolerance;
  }

  // ============================================================
  // Direction-Setter (C++ Z. 1031-1034)
  // ============================================================

  SetStdGLDirPrev(d: GLDirection): void {
    this.m_STDGLDirPrev = d;
  }

  SetStdGLDirNext(d: GLDirection): void {
    this.m_STDGLDirNext = d;
  }

  GetStdGLDirPrev(): GLDirection {
    return this.m_STDGLDirPrev;
  }

  GetStdGLDirNext(): GLDirection {
    return this.m_STDGLDirNext;
  }

  // ============================================================
  // Start-Position berechnen (C++ Z. 1036-1037)
  // Delegate an GObjLink.GetLinkStartPos
  // ============================================================

  GetStartPosFromPrev(p: CPoint, d: GLDirection): void {
    if (this.m_Prev) {
      this.m_Prev.GetLinkStartPos(p, d, this);
    }
  }

  GetStartPosFromNext(p: CPoint, d: GLDirection): void {
    if (this.m_Next) {
      this.m_Next.GetLinkStartPos(p, d, this);
    }
  }

  // ============================================================
  // Reset-Helpers (C++ Z. 1042-1043) — privat
  // ============================================================

  protected ResetMyPrev(): void {
    if (this.m_Prev) {
      this.m_Prev.RemoveOutLink(this);
    }
    this.m_Prev = null;
  }

  protected ResetMyNext(): void {
    if (this.m_Next) {
      this.m_Next.RemoveInLink(this);
    }
    this.m_Next = null;
  }

  // ============================================================
  // Overrides (C++ Z. 1056-1075)
  // ============================================================

  override SetPosition(myorg: CPoint): boolean {
    return super.SetPosition(myorg);
  }

  override GetSize(mysize: CSize): boolean {
    return super.GetSize(mysize);
  }

  override CheckRegion(virtp: CPoint): GORegion {
    return this.PtInLinkRect(virtp) ? 3 /* R_LINK_EDIT */ : 0 /* R_NO */;
  }

  override IsHit(virtp: CPoint, list: GObject[]): boolean {
    if (this.PtInLinkRect(virtp)) {
      list.push(this);
      return true;
    }
    return false;
  }

  // Knoten-Event-Notifications (C++ Z. 1069-1073)
  OnNodePrevAdded(_node: GObjLink): boolean {
    return true;
  }

  OnNodeNextAdded(_node: GObjLink): boolean {
    return true;
  }

  OnNodePrevRemoved(_node: GObjLink): boolean {
    this.ResetMyPrev();
    return true;
  }

  OnNodeNextRemoved(_node: GObjLink): boolean {
    this.ResetMyNext();
    return true;
  }

  OnNodeMoved(_node: GObjLink): boolean {
    // Wenn ein Endpunkt verschoben wurde, Link-Geometrie neu berechnen.
    // In Welle E/F: Re-Render triggern.
    return true;
  }
}

// ============================================================
// Geometrie-Helpers
// ============================================================

/** Euklidischer Abstand Punkt → Segment a-b. */
function distancePointToSegment(p: CPoint, a: CPoint, b: CPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}
