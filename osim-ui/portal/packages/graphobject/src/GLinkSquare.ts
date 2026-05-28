/**
 * GLinkSquare — rechtwinkliger Link mit genau zwei 90°-Knicken.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h (Sub-Klasse von GLinkPoint).
 *
 * Sonderfall von GLinkPoint mit fester Routing-Geometrie:
 * - Start aus m_Prev (Direction m_STDGLDirPrev)
 * - 90°-Knick #1
 * - Mittel-Segment
 * - 90°-Knick #2
 * - End an m_Next (Direction m_STDGLDirNext)
 *
 * Die Knick-Positionen werden automatisch berechnet basierend auf den
 * Start-/End-Directions (NORTH/SOUTH/EAST/WEST) — Welle E voll
 * implementiert. Hier reicht das Skelett.
 */

import { GLinkPoint } from "./GLinkPoint";
import { GObjLink } from "./GObjLink";
import {
  GLDirection,
  type CPoint,
} from "./types";

/**
 * Rechtwinkliger Link.
 */
export class GLinkSquare extends GLinkPoint {
  constructor(prev: GObjLink | null = null, next: GObjLink | null = null) {
    super(prev, next);
    // Default Square-Routing braucht 2 Stützpunkte.
    this.m_UsedPointNum = 2;
    this.m_PointList = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }

  /**
   * Berechnet die 2 Knick-Punkte basierend auf den Start-/End-Directions.
   *
   * Beispiele:
   * - EAST → WEST horizontal: Knick auf y=startY in der Mitte zwischen
   *   startX und endX → Knick zweiter Punkt: gleicher x, y=endY.
   * - SOUTH → NORTH vertikal: Knick auf x=startX in der Mitte zwischen
   *   startY und endY → zweiter Punkt: x=endX, gleiches y.
   *
   * Default-Implementation: L-Form (Knick auf der x-Mitte).
   */
  RecomputeKnicks(): void {
    if (!this.m_Prev || !this.m_Next) return;
    const start: CPoint = { x: 0, y: 0 };
    const end: CPoint = { x: 0, y: 0 };
    this.GetStartPosFromPrev(start, this.m_STDGLDirPrev);
    this.GetStartPosFromNext(end, this.m_STDGLDirNext);

    // Heuristik: horizontale Hauptrichtung → Knick zuerst horizontal.
    const isHorizontal =
      this.m_STDGLDirPrev === GLDirection.EAST ||
      this.m_STDGLDirPrev === GLDirection.WEST ||
      this.m_STDGLDirNext === GLDirection.EAST ||
      this.m_STDGLDirNext === GLDirection.WEST;

    if (isHorizontal) {
      const midX = (start.x + end.x) / 2;
      this.m_PointList[0] = { x: midX, y: start.y };
      this.m_PointList[1] = { x: midX, y: end.y };
    } else {
      const midY = (start.y + end.y) / 2;
      this.m_PointList[0] = { x: start.x, y: midY };
      this.m_PointList[1] = { x: end.x, y: midY };
    }
    this.m_UsedPointNum = 2;
  }
}
