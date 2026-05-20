// Plan 01-09 Task 1: Dexie-Setup fuer den Browser-lokalen Persistenz-Layer.
//
// Zwei Object-Stores:
//   - snapshots: Pro Modell genau EIN Eintrag (modelId = PK). Der Inhalt
//     ist der zuletzt im Browser modifizierte JSON-Tree plus Meta-Info
//     (server-known version, dirty-Oid-Set, Timestamp). Wird beim Reload
//     fuer Crash-Recovery genutzt (CONTEXT D-12).
//   - position_overrides: Pro (modelId, planOid, nodeOid) eine GFX-Position
//     fuer den PDurchlaufplan-Design-Viewer (Plan 01-07). Persistiert die
//     Session-Overrides, damit Drag-Positionen Page-Reloads ueberleben.
//
// Versionierung: Phase 1 startet bei version(1). Schema-Aenderungen ab
// Phase 2 muessen ein .upgrade(...) anlegen.

import Dexie, { type EntityTable } from "dexie";
import type { OtxJsonNode } from "@/viewers/core/types";

/**
 * Crash-Recovery-Snapshot fuer ein einzelnes Modell.
 *
 * Konventionen:
 *   - `modelId` ist Primary Key — pro Modell existiert maximal EIN Eintrag
 *     (jeder writeSnapshot ueberschreibt den vorherigen).
 *   - `version` ist die LETZTE vom Server bekannte Version (zur Zeit, als
 *     dieser Tree-Stand zu editieren begonnen wurde). Wenn beim Reload
 *     der Server eine hoehere Version hat, ist das ein potenzieller
 *     Konflikt (zwischenzeitlicher Save durch anderen User).
 *   - `dirty` ist die Liste der OIDs, die seit dem letzten Save als
 *     veraendert markiert sind. Wenn `dirty.length === 0`, ist der
 *     Snapshot semantisch identisch mit dem Server-Stand und Recovery
 *     ist nicht noetig (er wird beim naechsten erfolgreichen Save
 *     ohnehin geloescht).
 *   - `savedAt` ist der Browser-lokale Timestamp (Date.now()) des
 *     letzten writeSnapshot-Aufrufs.
 */
export interface Snapshot {
  modelId: number;
  version: number;
  tree: OtxJsonNode;
  dirty: number[];
  savedAt: number;
}

/**
 * Persistente GFX-Position-Overrides fuer den Design-Viewer.
 *
 * Composite Primary Key: `[modelId+planOid+nodeOid]`. Damit kann mehrere
 * verschiedene Plaene innerhalb desselben Modells eigene Position-Sets
 * haben. Plan 01-07 nutzt aktuell nur einen Session-lokalen In-Memory-
 * Store; Plan 01-09 verdrahtet die Persistenz hierhin.
 */
export interface PositionOverride {
  modelId: number;
  planOid: number;
  nodeOid: number;
  x: number;
  y: number;
  savedAt: number;
}

/**
 * Typed Dexie-Instance. Die `EntityTable<T, KeyProp>`-Annotation gibt
 * uns Type-Safety fuer alle Tabellen-Operationen (get/put/delete).
 */
export const db = new Dexie("osim-ui") as Dexie & {
  snapshots: EntityTable<Snapshot, "modelId">;
  position_overrides: EntityTable<PositionOverride, "modelId">;
};

db.version(1).stores({
  // PK = modelId (number, auto-set).
  snapshots: "modelId",
  // Compound-PK (modelId+planOid+nodeOid). Compound-Index erlaubt
  // Bereichs-Queries fuer alle Overrides eines Modells / Plans.
  position_overrides: "[modelId+planOid+nodeOid], modelId, [modelId+planOid]",
});

/**
 * Test-Helper: leere alle Tabellen. Wird in den fake-indexeddb-Tests
 * zwischen Cases benutzt, damit jeder Test mit leerer DB startet.
 */
export async function _clearAllForTests(): Promise<void> {
  await db.snapshots.clear();
  await db.position_overrides.clear();
}
