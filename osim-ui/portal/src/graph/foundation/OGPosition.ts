/**
 * OGPosition — Basis-"Struct" der Positions-Hierarchie.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h. Basis von OGPositionList
 * (für OGraphList) und OGPositionGrid (für OGraphGrid). Hält einen pObj-Pointer
 * auf das verwaltete GObject.
 *
 * Im C++-Original ist OGPosition nur ein leeres CObject mit pObj-Feld;
 * die Spezialisierungen OGPositionList und OGPositionGrid fügen die jeweiligen
 * Listen-Verkettungs-Pointer hinzu.
 */

import type { LNullSentinel } from "@/graph/foundation/types";
import type { GObject } from "@/graph/foundation/GObject";

/**
 * pObj kann sein:
 * - ein echtes GObject
 * - LNULL (Header-Sentinel)
 * - null (frisch allokiert)
 */
export type PosObjValue = GObject | LNullSentinel | null;

/**
 * Basis-Klasse. OGPositionList und OGPositionGrid erben davon.
 */
export class OGPosition {
  pObj: PosObjValue = null;
}

/**
 * OGPositionList — Position-Knoten für lineare Doppellisten (OGraphList).
 */
export class OGPositionList extends OGPosition {
  pNext: OGPositionList | null = null;
  pPrev: OGPositionList | null = null;
}
