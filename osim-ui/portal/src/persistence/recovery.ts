// Plan 01-09 Task 1: Recovery-Entscheidungs-Logik.
//
// Wird im Read-Path (use-tree-loader, Plan 05) konsultiert, BEVOR der
// Server-Tree in den model-store geschrieben wird. Liefert eine
// RecoveryCheck-Struktur, mit der die UI entscheidet, ob ein Recovery-
// Prompt erscheint.
//
// Drei moegliche Zustaende:
//
//   1. Kein Snapshot vorhanden          → kein Prompt, direkt Server-Tree.
//   2. Snapshot vorhanden + dirty leer  → kein Prompt, Snapshot wird
//                                          gel oescht (war ein cleaner
//                                          Stand).
//   3. Snapshot vorhanden + dirty != 0  → PROMPT zeigen, User entscheidet:
//                                          - "Wiederherstellen" → Tree aus
//                                            Snapshot laden + dirty
//                                            beibehalten.
//                                          - "Verwerfen" → Snapshot
//                                            loeschen, Server-Tree laden.
//
// Zusaetzlich: serverIsNewer-Flag — der Server hat zwischenzeitlich eine
// hoehere Version (anderer User hat gespeichert). Phase-1-UX: nur Warnung
// im Prompt-Text, kein Conflict-Merge.

import type { Snapshot } from "./indexeddb";
import { readLatestSnapshot } from "./snapshot-store";

export interface RecoveryCheck {
  /** True wenn ueberhaupt ein Snapshot existiert. */
  hasSnapshot: boolean;
  /**
   * True wenn der Snapshot dirty-Markierungen enthaelt (ungesicherte
   * Aenderungen vorhanden) ODER seine Version aelter ist als die Server-
   * Version (klassischer Konflikt-Indikator).
   */
  snapshotIsNewer: boolean;
  /** True wenn der Server zwischenzeitlich eine hoehere Version hat. */
  serverIsNewer: boolean;
  /** Komplette Snapshot-Daten (falls vorhanden), zur Verwendung im UI. */
  snapshot: Snapshot | null;
  /** Aktuelle Server-Version (Eingabe). */
  serverVersion: number;
}

/**
 * Prueft, ob fuer das gegebene Modell ein Recovery-Prompt noetig ist.
 *
 * @param modelId         Modell-ID.
 * @param serverVersion   Aktuelle vom Server gelieferte Version
 *                        (aus useModelTreeQuery).
 */
export async function checkForRecovery(
  modelId: number,
  serverVersion: number,
): Promise<RecoveryCheck> {
  const snap = await readLatestSnapshot(modelId);
  if (!snap) {
    return {
      hasSnapshot: false,
      snapshotIsNewer: false,
      serverIsNewer: false,
      snapshot: null,
      serverVersion,
    };
  }
  const hasDirty = snap.dirty.length > 0;
  const versionStale = snap.version < serverVersion;
  return {
    hasSnapshot: true,
    snapshotIsNewer: hasDirty,
    // Server hat zwischenzeitlich eine spaetere Version als die Basis
    // des Snapshots — potenzieller Konflikt (anderer User hat editiert).
    serverIsNewer: versionStale,
    snapshot: snap,
    serverVersion,
  };
}
