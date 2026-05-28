/**
 * LNULL — Sentinel-Pointer für Listenkopf-Markierung.
 *
 * 1:1-Pendant zu C++ `#define LNULL ((GObject*) 0xffffffff)` aus
 * GraphObj.h Z. 39.
 *
 * **WICHTIG:** LNULL ist KEIN echtes Objekt. Es markiert nur die Position eines
 * Listen-Headers in der zirkulären Doppelliste von OGPositionGrid. Iteration:
 *
 *   let pos = grid.getColHeadPos(x);
 *   while (pos.pObj !== LNULL) {
 *     // pos zeigt auf echtes Objekt
 *     pos = pos.pColNext!;
 *   }
 *
 * NIE Properties auf LNULL zugreifen (keine `.pColNext`, kein `.pGridPos` —
 * das würde im Original auf 0xffffffff dereferenzieren und crashen, in TS gibt
 * es weniger spektakuläre aber genauso falsche Werte).
 *
 * Identitätsvergleich (`===`) ist O(1) und garantiert exakt das C++-Verhalten
 * (`pObj == LNULL`).
 */

import type { LNullSentinel } from "@/graph/foundation/types";

/** Der LNULL-Sentinel selbst. Frozen, damit niemand Properties anfügt. */
export const LNULL: LNullSentinel = Object.freeze({ __sentinel: "LNULL" as const });

/** Type-Guard: ist dieser Wert das LNULL-Sentinel? */
export function isLNull(value: unknown): value is LNullSentinel {
  return value === LNULL;
}
