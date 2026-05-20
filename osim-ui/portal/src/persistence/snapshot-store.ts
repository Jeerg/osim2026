// Plan 01-09 Task 1: Snapshot-Store-API (Crash-Recovery-Schicht).
//
// Duenne Wrapper-Funktionen um die Dexie-`snapshots`-Tabelle. Eine API
// pro Use-Case:
//   - writeSnapshot: pro Edit (debounced, von use-snapshot-subscriber).
//   - readLatestSnapshot: beim Re-Open eines Modells.
//   - clearSnapshot: nach erfolgreichem Server-Save.
//
// Tests muessen alle Funktionen IDB-only treffen (kein React-Stack noetig).

import { db, type Snapshot } from "./indexeddb";
import type { Oid, OtxJsonNode } from "@/viewers/core/types";

/**
 * Schreibt (oder ersetzt) den Snapshot fuer ein Modell.
 *
 * @param modelId  Modell-ID.
 * @param version  LETZTE vom Server bekannte Version, auf der dieser
 *                 Edit-Stand aufbaut. Nicht die zukuenftige Save-Version.
 * @param tree     Der aktuelle In-Memory-Tree (deep snapshot, wird per
 *                 IDB-structured-clone gespeichert).
 * @param dirty   Set der OIDs, die seit dem letzten Save modifiziert sind.
 */
export async function writeSnapshot(
  modelId: number,
  version: number,
  tree: OtxJsonNode,
  dirty: Set<Oid>,
): Promise<void> {
  const snap: Snapshot = {
    modelId,
    version,
    // structured-clone fertigt eine eigene Kopie an; wir geben den Tree
    // 1:1 weiter (Dexie/IDB clont selbst beim put).
    tree,
    dirty: Array.from(dirty),
    savedAt: Date.now(),
  };
  await db.snapshots.put(snap);
}

/**
 * Liefert den (einzigen) Snapshot fuer ein Modell, falls vorhanden.
 */
export async function readLatestSnapshot(
  modelId: number,
): Promise<Snapshot | undefined> {
  return db.snapshots.get(modelId);
}

/**
 * Loescht den Snapshot fuer ein Modell. Wird nach erfolgreichem Server-
 * Save aufgerufen — alles ist durch, lokaler Recovery-Puffer ist
 * redundant.
 */
export async function clearSnapshot(modelId: number): Promise<void> {
  await db.snapshots.delete(modelId);
}
