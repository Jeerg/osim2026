/**
 * GLinkPoint — Multi-Punkt-Polyline-Link.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 1087-1163.
 *
 * Erweitert GLink um eine Liste von Stützpunkten (max. MAX_POINT_NUM=6),
 * über die der Link geroutet wird. Mit Auto-Set-State-Maschine
 * (SET_AUTO/SET_HELP/SET_ALONE/PARENT_MOVED).
 *
 * In Welle 1.1 reichen die Datenfelder + grundlegendes Hit-Test. Die
 * Multi-Knick-Routing-Algorithmen (CheckNeighbourhood etc.) kommen in
 * Welle F (nach Lesen von OGLinkPo.cpp).
 */

import { GLink } from "@/graph/foundation/GLink";
import { GObjLink } from "@/graph/foundation/GObjLink";
import {
  GLDirection,
  type CPoint,
  type CSize,
  type GORegion,
} from "@/graph/foundation/types";

/** Maximale Anzahl Stützpunkte (C++ Z. 1092). */
export const MAX_POINT_NUM = 6;
/** Toleranz-Distanz für Link-Edit-Buttons (C++ Z. 1091). */
export const STD_LINK_EDIT_DISTANCE = 5;

/** Auto-Set-State-Maschine (C++ Z. 1094-1099). */
export enum LinkSetState {
  SET_AUTO = 0,
  SET_HELP = 1,
  SET_ALONE = 2,
  PARENT_MOVED = 3,
}

/**
 * Polyline-Link mit Stützpunkten.
 */
export class GLinkPoint extends GLink {
  // ============================================================
  // Stützpunkt-Liste (C++ Z. 1107)
  // ============================================================

  /** Bis zu MAX_POINT_NUM Stützpunkte. */
  m_PointList: CPoint[] = [];

  // ============================================================
  // Set-State (C++ Z. 1110-1111)
  // ============================================================

  m_SetState: LinkSetState = LinkSetState.SET_AUTO;
  m_OldSetState: LinkSetState = LinkSetState.SET_AUTO;
  m_OldCheckedMenu: number = 0;

  // ============================================================
  // Work-Point für interaktives Verschieben (C++ Z. 1113-1117)
  // ============================================================

  m_workPoint: CPoint = { x: 0, y: 0 };
  m_AktWorkPointInx: number = -1;
  m_UsedPointNum: number = 0;
  m_oldPhantomPoint: [CPoint, CPoint] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  m_BMousPos: CPoint = { x: 0, y: 0 };

  // ============================================================
  // Konstruktor
  // ============================================================

  constructor(prev: GObjLink | null = null, next: GObjLink | null = null) {
    super(prev, next);
  }

  // ============================================================
  // Stützpunkt-API
  // ============================================================

  /** Fügt einen Stützpunkt am Ende an. Wirft wenn MAX_POINT_NUM überschritten. */
  AppendPoint(p: CPoint): void {
    if (this.m_PointList.length >= MAX_POINT_NUM) {
      throw new Error(
        `GLinkPoint: max ${MAX_POINT_NUM} Stützpunkte überschritten`,
      );
    }
    this.m_PointList.push({ ...p });
    this.m_UsedPointNum = this.m_PointList.length;
  }

  /** Setzt einen Stützpunkt an einem bestimmten Index. */
  SetPoint(index: number, p: CPoint): void {
    if (index < 0 || index >= MAX_POINT_NUM) {
      throw new Error(`GLinkPoint: index ${index} außerhalb [0, ${MAX_POINT_NUM})`);
    }
    this.m_PointList[index] = { ...p };
    if (index >= this.m_UsedPointNum) this.m_UsedPointNum = index + 1;
  }

  /** Liefert einen Stützpunkt. */
  GetPoint(index: number): CPoint | null {
    if (index < 0 || index >= this.m_PointList.length) return null;
    return { ...this.m_PointList[index] };
  }

  /**
   * Berechnet die Vollständige Routing-Polyline: Start (von Prev) → alle
   * Stützpunkte → End (an Next). Liefert Array von CPoints.
   */
  GetPolyline(): CPoint[] {
    const result: CPoint[] = [];
    if (this.m_Prev) {
      const start = { x: 0, y: 0 };
      this.GetStartPosFromPrev(start, this.m_STDGLDirPrev);
      result.push(start);
    }
    for (let i = 0; i < this.m_UsedPointNum; i++) {
      result.push({ ...this.m_PointList[i] });
    }
    if (this.m_Next) {
      const end = { x: 0, y: 0 };
      this.GetStartPosFromNext(end, this.m_STDGLDirNext);
      result.push(end);
    }
    return result;
  }

  // ============================================================
  // ChangeWorkPoint (C++ Z. 1129)
  // ============================================================

  /** Verschiebt den aktuell aktiven Work-Punkt. */
  ChangeWorkPoint(p: CPoint): void {
    this.m_workPoint = { ...p };
    if (this.m_AktWorkPointInx >= 0 && this.m_AktWorkPointInx < MAX_POINT_NUM) {
      this.SetPoint(this.m_AktWorkPointInx, p);
    }
  }

  // ============================================================
  // Auto-Set-State (C++ Z. 1130-1131)
  // ============================================================

  SetLinkState(up: LinkSetState): void {
    this.m_OldSetState = this.m_SetState;
    this.m_SetState = up;
  }

  GetLinkState(): LinkSetState {
    return this.m_SetState;
  }

  // ============================================================
  // CheckNeighbourhood (C++ Z. 1125) — Stub für Welle F
  // ============================================================

  /**
   * Prüft Knoten-Umgebung abhängig von Start-Directions und liefert die
   * Anzahl benötigter Stützpunkte zurück. Volle Implementation in Welle F
   * nach Lesen von OGLinkPo.cpp.
   */
  CheckNeighbourhood(
    _prev: GLDirection,
    _next: GLDirection,
    _isprev: { value: number },
  ): number {
    // Default: 2 Stützpunkte (klassisches rechtwinkliges Routing).
    return 2;
  }

  // ============================================================
  // Override SetDelta (C++ Z. 1128) — Stub für Welle F
  // ============================================================

  override SetDelta(fvMousePos: CPoint): void {
    super.SetDelta(fvMousePos);
    // Phase 1.1: nur Standard-Delta; Polyline-spezifisches Update kommt Welle F.
  }

  // ============================================================
  // Overrides Position/Size
  // ============================================================

  override SetPosition(myorg: CPoint): boolean {
    const dx = myorg.x - this.m_GOrg.x;
    const dy = myorg.y - this.m_GOrg.y;
    const ok = super.SetPosition(myorg);
    // Stützpunkte mitverschieben.
    for (const p of this.m_PointList) {
      p.x += dx;
      p.y += dy;
    }
    return ok;
  }

  override GetSize(mysize: CSize): boolean {
    return super.GetSize(mysize);
  }

  override CheckRegion(virtp: CPoint): GORegion {
    // Stützpunkt-Hit (mit Toleranz STD_LINK_EDIT_DISTANCE)?
    for (let i = 0; i < this.m_UsedPointNum; i++) {
      const p = this.m_PointList[i];
      if (
        Math.abs(p.x - virtp.x) <= STD_LINK_EDIT_DISTANCE &&
        Math.abs(p.y - virtp.y) <= STD_LINK_EDIT_DISTANCE
      ) {
        return 3 /* R_LINK_EDIT */;
      }
    }
    return super.CheckRegion(virtp);
  }
}
