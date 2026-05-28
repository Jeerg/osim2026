/**
 * Dexie-Setup für den IndexedDB-Snapshot-Layer (Plan 01-11 Task 1).
 *
 * Architektur (siehe RESEARCH §Example 5 Z.1187-1236 + PATTERNS §`portal/src/snapshot/*`):
 *  - Eine Tabelle `snapshots` mit compound primary key `[modelId+timestamp]`
 *    plus sekundären Indizes auf `modelId` und `sequence`.
 *  - `wire` wird als ganzer Objekt-Graph (Record-of-OBaseObj) gespeichert.
 *    Dexie serialisiert das via structured-clone — keine JSON-Stringify-Kosten.
 *  - Sequence-Counter ist Modul-State im snapshot-service (Pitfall #6
 *    RESEARCH: IndexedDB-Race; siehe dortige Doc).
 *
 * Phase-1-Datenmodell ist bewusst simpel: ein Snapshot pro Edit-Sequenz, kein
 * Diff-Format. Bei Bedarf (Bosch2_wechseln, 18 MB) deckelt der
 * Cleanup-Mechanismus die maximale Anzahl pro modelId.
 *
 * Versionierung: `version(1)` ist die initiale Schema-Version. Migrations in
 * spaeteren Phasen via `db.version(2).stores({...}).upgrade(...)`.
 */

import Dexie, { type Table } from "dexie";

import type { ModelTreeWire } from "@/api/models";

/**
 * Ein einzelner Snapshot — der vollstaendige Wire eines Modells zu einem
 * Zeitpunkt. Sequence ist ein monotoner Counter, der Concurrency-Conflicts
 * disambiguiert (siehe snapshot-service.saveSnapshot fuer Pitfall #6 Details).
 */
export interface SnapshotRow {
  modelId: string;
  /** Unix-Millisekunden (Date.now()). Teil des compound primary key. */
  timestamp: number;
  /** Monotoner Counter aus snapshot-service. */
  sequence: number;
  wire: ModelTreeWire;
}

/**
 * IndexedDB-Connection-Singleton.
 *
 * Dexie-Pattern: eine Klasse pro Datenbank; Tables sind als public-Fields
 * deklariert (mit `!:` damit TypeScript den Compile-Time-Check nicht ablehnt —
 * Dexie initialisiert sie zur Laufzeit ueber `this.version(...).stores(...)`).
 */
export class OsimDB extends Dexie {
  snapshots!: Table<SnapshotRow, [string, number]>;

  constructor() {
    super("OsimUiDB");
    this.version(1).stores({
      // Compound primary key `[modelId+timestamp]`; sekundaere Indizes auf
      // `modelId` (fuer where("modelId").equals(...)) und `sequence` (fuer
      // potenzielle Diagnose-Queries).
      snapshots: "[modelId+timestamp], modelId, sequence",
    });
  }
}

/**
 * Geteilte DB-Instanz. Wird vom snapshot-service konsumiert und ist in Tests
 * via `import "fake-indexeddb/auto"` in-memory simuliert.
 */
export const db = new OsimDB();
