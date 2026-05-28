/**
 * GOGridRow — Header-Descriptor einer Rasterzeile.
 *
 * 1:1-Portierung aus GraphObj.h Z. 263. Spiegelsymmetrisch zu GOGridCol.
 */

import { STD_GRID_HEIGHT } from "@/graph/foundation/constants";
import type { OGPositionGrid } from "@/graph/foundation/OGPositionGrid";

export class GOGridRow {
  /** Position in der Zeilenfolge (0-basiert). */
  m_GRowPos: number = 0;

  /** Höhe der Rasterzeile (Pixel). */
  m_GRowHeight: number = STD_GRID_HEIGHT;

  /** Pixel-Startposition (y-Koordinate, relativ zum Grid-Origin). */
  m_StartPos: number = 0;

  /** Pixel-Endposition. */
  m_EndPos: number = 0;

  /** Listenkopf-Sentinel dieser Zeile. pObj=LNULL, zirkulär auf sich selbst. */
  m_OGPositionGrid: OGPositionGrid | null = null;

  constructor(pos: number = 0, height: number = STD_GRID_HEIGHT) {
    this.m_GRowPos = pos;
    this.m_GRowHeight = height;
  }
}
