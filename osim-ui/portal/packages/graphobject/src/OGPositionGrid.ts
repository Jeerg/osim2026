/**
 * OGPositionGrid — Topologie-Knoten der zirkulär doppelt verlinkten
 * Spalten-/Zeilen-Listen von OGraphGrid.
 *
 * 1:1-Portierung aus GraphObj.h Z. 215 und Pool-Allokator aus
 * OGGrid.cpp Z. 487-538.
 *
 * **Topologie-Invariante** (NOTES §20):
 * - Jede Zelle (x,y) im Raster wird durch genau eine OGPositionGrid-Instanz
 *   repräsentiert.
 * - Diese Instanz ist gleichzeitig in zwei Listen verkettet:
 *   - Spalten-Doppelliste (sortiert nach pGridPos.y, zirkulär)
 *   - Zeilen-Doppelliste (sortiert nach pGridPos.x, zirkulär)
 * - Beide Listen sind zirkulär — der Header (eine OGPositionGrid mit
 *   pObj === LNULL) ist gleichzeitig Anfang und Ende.
 *
 * Iteration durch eine Spalte:
 *
 *   let pos = colHead.pColNext;
 *   while (pos.pObj !== LNULL) {
 *     // pos.pObj ist ein echtes GObject
 *     pos = pos.pColNext;
 *   }
 *
 * Der Pool-Allokator (C++ `s_setPosFree`, `s_setBlocks` mit 1000 pro Block)
 * entfällt in TypeScript — GC erledigt das. Die `NewPos`/`FreePos`-Semantik
 * bleibt in OGraphGrid erhalten, aber statt aus dem Pool zu holen, machen wir
 * `new OGPositionGrid()`.
 */

import type { CPoint, LNullSentinel } from "./types";
import type { GObject } from "./GObject";
import type { GOGridCol } from "./GOGridCol";
import type { GOGridRow } from "./GOGridRow";

/**
 * pObj kann sein:
 * - ein echtes GObject (normale Zellen-Belegung)
 * - LNULL (Header-Sentinel — markiert Listen-Anfang/Ende)
 * - null (frisch aus NewPos, noch nicht zugewiesen — temporärer Zustand
 *   während GOIns)
 */
export type PosObj = GObject | LNullSentinel | null;

/**
 * Topologie-Knoten. NICHT als Klasse mit Methoden — OGraphGrid manipuliert
 * die Pointer direkt (analog zum C++-Original, wo OGPositionGrid auch nur
 * eine Daten-Struktur ist und die Algorithmen in OGraphGrid leben).
 */
export class OGPositionGrid {
  /**
   * Das Objekt, das diese Zelle belegt. LNULL = Header-Sentinel.
   * null = frisch allokiert, noch nicht zugewiesen.
   */
  pObj: PosObj = null;

  /** Nächster Knoten in der Spalten-Doppelliste (zirkulär). */
  pColNext: OGPositionGrid | null = null;
  /** Vorheriger Knoten in der Spalten-Doppelliste (zirkulär). */
  pColPrev: OGPositionGrid | null = null;

  /** Nächster Knoten in der Zeilen-Doppelliste (zirkulär). */
  pRowNext: OGPositionGrid | null = null;
  /** Vorheriger Knoten in der Zeilen-Doppelliste (zirkulär). */
  pRowPrev: OGPositionGrid | null = null;

  /** Listenkopf-Pointer der Spalte, in der diese Zelle liegt. */
  pColHead: GOGridCol | null = null;
  /** Listenkopf-Pointer der Zeile, in der diese Zelle liegt. */
  pRowHead: GOGridRow | null = null;

  /** Position im Raster (Grid-Koordinaten, NICHT Pixel). */
  pGridPos: CPoint = { x: 0, y: 0 };

  /**
   * Konstruiert einen frischen Knoten. Standard-Konstruktor entspricht der
   * C++-Initialisierung in `NewPos` (alle Pointer auf null/NULL, pObj=null).
   *
   * Die zirkuläre Verkettung (pColPrev/Next, pRowPrev/Next) wird vom Aufrufer
   * (OGraphGrid.NewPos und OGraphGrid.GOIns) gesetzt.
   */
  constructor() {}
}
