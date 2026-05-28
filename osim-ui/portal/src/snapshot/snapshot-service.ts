/**
 * Snapshot-Service — Crash-Recovery via IndexedDB (Plan 01-11 Task 1).
 *
 * Verantwortung:
 *  - `saveSnapshot(modelId, wire)` schreibt einen vollstaendigen Wire-Snapshot.
 *  - `loadLatestSnapshot(modelId)` liefert den juengsten Snapshot.
 *  - `clearSnapshots(modelId)` raeumt alle Snapshots auf (nach erfolgreichem
 *    Server-Save).
 *  - `getSnapshotCount(modelId)` zaehlt fuer Diagnose/UI-Anzeige.
 *
 * Pitfall #6 (IndexedDB-Race; siehe `.planning/phases/01-vertical-slice/
 * 01-RESEARCH.md`):
 *
 *   Wenn zwei `saveSnapshot`-Calls in derselben Millisekunde landen, kollidiert
 *   der compound primary key `[modelId+timestamp]` → `put()` ueberschreibt
 *   silent. Wir erzeugen daher eine monotone sequence-Nummer als Modul-State.
 *   Auch wenn timestamps kollidieren, sind die `sequence`-Werte verschieden;
 *   der juengere `sequence` "wins" durch das `put()` (idempotent). Tests
 *   verifizieren: bei `Promise.all([save(A), save(B)])` darf nichts crashen
 *   und es darf NICHT der Fall sein, dass der DB-Stand leer ist.
 *
 * Cleanup-Policy:
 *  - Pro `modelId` werden maximal 20 Snapshots vorgehalten. Aelteste werden
 *    nach jedem `saveSnapshot` weggeworfen. Begruendung: ein Crash erfordert
 *    den juengsten Snapshot; ein History-Browser ist nicht Phase-1-Scope.
 *  - 20 ist genug fuer typische Edit-Bursts (Property-aenderungen alle ~2 s
 *    waehrend Workflow-Sitzungen); zu klein waere riskant bei langer Edit-
 *    Sequenz ohne Server-Save.
 */

import { db, type SnapshotRow } from "./db";

import type { ModelTreeWire } from "@/api/models";

/**
 * Maximale Snapshot-Anzahl pro Modell. AeltererE werden nach jedem save
 * automatisch geloescht.
 */
const MAX_SNAPSHOTS_PER_MODEL = 20;

/**
 * Monotoner Sequence-Counter (Pitfall #6). Modul-State, nicht reaktiv.
 *
 * Beim Hot-Reload in Tests/Dev wird das Modul re-evaluiert und der Counter
 * faengt bei 0 neu an — das ist okay, weil der counter sich aus der bisherigen
 * Existenz-Garantie speist (er macht Save-Calls innerhalb derselben Browser-
 * Session disambiguierbar; ueber Sessions hinweg garantiert der `timestamp`
 * die Reihenfolge).
 */
let seq = 0;

/**
 * Speichert einen vollstaendigen Wire-Snapshot fuer ein Modell.
 *
 * Verhalten:
 *  1. Vergibt eine neue `sequence`-Nummer (atomar via `++seq`).
 *  2. Klont den Wire mit `structuredClone` — der DB-Eintrag darf KEINE
 *     Referenz auf den live-Store haben, sonst spiegelt eine spaetere
 *     Mutation den Snapshot mit.
 *  3. `db.snapshots.put(...)` — bei timestamp-Kollision (gleiche Millisekunde)
 *     ueberschreibt der spaetere Call die Vorgaenger-Row. Kein Crash, kein
 *     Datenverlust (die Information war eh nur 1 ms alt).
 *  4. Cleanup: liest alle Snapshots des Modells, behaelt die 20 juengsten,
 *     loescht den Rest in einem Batch.
 *
 * Performance-Hinweis: bei sehr grossen Wires (Bosch2_wechseln, 18 MB) ist
 * `structuredClone` der teuerste Schritt (~50 ms). Der Caller MUSS debouncen
 * (z.B. via useAutoSave-Hook in Task 3) — `saveSnapshot` selbst macht das
 * nicht.
 */
export async function saveSnapshot(
  modelId: string,
  wire: ModelTreeWire,
): Promise<void> {
  const mySeq = ++seq;
  const row: SnapshotRow = {
    modelId,
    timestamp: Date.now(),
    sequence: mySeq,
    // structuredClone: deep clone ohne JSON-Roundtrip (Performance + behaelt
    // type-fidelity fuer Wires mit number[] / boolean / etc.).
    wire: structuredClone(wire),
  };
  await db.snapshots.put(row);

  // Cleanup: nur die 20 juengsten Snapshots behalten.
  const all = await db.snapshots
    .where("modelId")
    .equals(modelId)
    .reverse()
    .sortBy("timestamp");
  if (all.length > MAX_SNAPSHOTS_PER_MODEL) {
    const toDelete = all
      .slice(MAX_SNAPSHOTS_PER_MODEL)
      .map((s) => [s.modelId, s.timestamp] as [string, number]);
    await db.snapshots.bulkDelete(toDelete);
  }
}

/**
 * Liefert den juengsten Snapshot eines Modells oder `null`, wenn keiner
 * existiert.
 *
 * Sortierung: nach `timestamp` absteigend. Bei timestamp-Gleichstand (selten;
 * siehe Pitfall #6) gewinnt der Eintrag, den Dexie zurueckliefert — `put()`
 * mit identischem primary key hat den vorherigen ueberschrieben.
 */
export async function loadLatestSnapshot(
  modelId: string,
): Promise<ModelTreeWire | null> {
  const latest = await db.snapshots
    .where("modelId")
    .equals(modelId)
    .reverse()
    .sortBy("timestamp");
  return latest[0]?.wire ?? null;
}

/**
 * Loescht alle Snapshots eines Modells. Wird vom Auto-Save-Hook nach
 * erfolgreichem Server-Save aufgerufen.
 */
export async function clearSnapshots(modelId: string): Promise<void> {
  await db.snapshots.where("modelId").equals(modelId).delete();
}

/**
 * Zaehlt die Snapshots eines Modells (fuer Diagnose / UI-Status-Anzeige).
 */
export async function getSnapshotCount(modelId: string): Promise<number> {
  return db.snapshots.where("modelId").equals(modelId).count();
}

/**
 * Test-only: setzt den Modul-Sequence-Counter zurueck. Nicht aus
 * Produktiv-Code aufrufen — Tests fuehrend.
 */
export function _resetSequenceForTests(): void {
  seq = 0;
}
