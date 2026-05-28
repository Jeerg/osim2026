/**
 * GOGridCol — Header-Descriptor einer Rasterspalte.
 *
 * 1:1-Portierung aus GraphObj.h Z. 238.
 *
 * Jede Spalte des OGraphGrid hat einen GOGridCol-Header mit:
 * - logischer Position in der Spaltenfolge (m_GColPos, 0/1/2/…)
 * - Spaltenbreite in Pixel (m_GColWidth, Default STD_GRID_WIDTH=20)
 * - Pixel-Bereich (m_StartPos, m_EndPos) auf der x-Achse
 * - Listenkopf-Sentinel (m_OGPositionGrid) — eine OGPositionGrid mit
 *   pObj=LNULL, die als zirkulärer Anfang/Ende der Spalten-Doppelliste dient
 *
 * Die m_GColList in OGraphGrid hält alle GOGridCols sortiert nach m_GColPos
 * aufsteigend.
 */

import { STD_GRID_WIDTH } from "./constants";
import type { OGPositionGrid } from "./OGPositionGrid";

export class GOGridCol {
  /** Position in der Spaltenfolge (0-basiert). */
  m_GColPos: number = 0;

  /** Breite der Rasterspalte (Pixel). */
  m_GColWidth: number = STD_GRID_WIDTH;

  /** Pixel-Startposition (x-Koordinate, relativ zum Grid-Origin). */
  m_StartPos: number = 0;

  /** Pixel-Endposition. */
  m_EndPos: number = 0;

  /** Listenkopf-Sentinel dieser Spalte. pObj=LNULL, zirkulär auf sich selbst. */
  m_OGPositionGrid: OGPositionGrid | null = null;

  constructor(pos: number = 0, width: number = STD_GRID_WIDTH) {
    this.m_GColPos = pos;
    this.m_GColWidth = width;
  }
}
