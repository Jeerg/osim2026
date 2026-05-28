/**
 * Tests fuer den Snapshot-Service (Plan 01-11 Task 1).
 *
 * Setup: `fake-indexeddb/auto` ersetzt das globale IndexedDB durch eine
 * in-memory-Implementierung. Damit laufen die Tests in jsdom (kein echtes
 * IndexedDB) und sind vollstaendig isoliert (kein Disk-Persist).
 *
 * Test-Cases (siehe Plan-Vorgabe):
 *  1. test_save_load_roundtrip: saveSnapshot -> loadLatestSnapshot -> deep-equal.
 *  2. test_concurrent_saves_dont_lose_data: Promise.all([save(w1), save(w2)])
 *     soll nicht crashen und mindestens einen der beiden Snapshots persistieren.
 *  3. test_cleanup_keeps_only_20: 25 saves -> count == 20.
 *  4. test_clear_removes_all: 3 saves -> clearSnapshots -> count == 0.
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/snapshot/db";
import {
  _resetSequenceForTests,
  clearSnapshots,
  getSnapshotCount,
  loadLatestSnapshot,
  saveSnapshot,
} from "@/snapshot/snapshot-service";

import type { ModelTreeWire } from "@/api/models";

/**
 * Minimaler Wire-Fixture-Faktor. Liefert einen Wire mit einem einzigen
 * Simulator-Objekt + einem optional benannten Marker-Attribut, damit der
 * Roundtrip-Test verifizieren kann, dass tatsaechlich der richtige Wire
 * gespeichert wurde.
 */
function makeWire(marker = "default"): ModelTreeWire {
  return {
    version: 1,
    simulator_oid: 0,
    objects: {
      0: {
        oid: 0,
        klass: "ASimulator",
        attrs: { m_sName: marker },
        sub_refs: [],
      },
    },
    coverage: { loaded: 1, skipped: 0, unsupported: [] },
    schemas_url: "/api/v1/schemas/v1",
  };
}

describe("snapshot-service", () => {
  beforeEach(async () => {
    // Vor jedem Test komplett leeren — Reihenfolge der Tests darf irrelevant
    // sein (Vitest parallelisiert per default nicht innerhalb einer Datei,
    // aber das Pattern ist konsistent mit den anderen __tests__/-Files).
    await db.snapshots.clear();
    _resetSequenceForTests();
  });

  it("test_save_load_roundtrip: saveSnapshot persistiert wire, loadLatestSnapshot liefert ihn zurueck", async () => {
    const wire = makeWire("roundtrip-marker");
    await saveSnapshot("model-A", wire);

    const loaded = await loadLatestSnapshot("model-A");
    expect(loaded).not.toBeNull();
    // Deep-Equal: structuredClone darf den Inhalt nicht mutieren.
    expect(loaded).toEqual(wire);
    // Sanity: andere modelId hat keinen Snapshot.
    expect(await loadLatestSnapshot("model-B")).toBeNull();
  });

  it("test_concurrent_saves_dont_lose_data: Promise.all crasht nicht und persistiert mindestens einen Snapshot", async () => {
    const w1 = makeWire("w1");
    const w2 = makeWire("w2");

    // Pitfall #6: zwei saves in derselben Millisekunde wuerden ohne
    // sequence-Counter den compound primary key kollidieren lassen. Mit
    // sequence ist der zweite put() ein Overwrite, kein Crash.
    await expect(
      Promise.all([saveSnapshot("model-X", w1), saveSnapshot("model-X", w2)]),
    ).resolves.not.toThrow();

    // Mindestens einer der beiden muss persistiert sein. Welcher genau ist
    // egal — die Race-Resolution wird von der DB-Engine bestimmt.
    const loaded = await loadLatestSnapshot("model-X");
    expect(loaded).not.toBeNull();
    expect([w1, w2]).toContainEqual(loaded);

    // Der Count darf nicht 0 sein (wenn Race uns dazu fuehrt dass alles weg
    // ist, ist Pitfall #6 nicht gemitigated).
    const count = await getSnapshotCount("model-X");
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("test_cleanup_keeps_only_20: 25 saves resultieren in genau 20 persistierten Snapshots", async () => {
    // 25 saves mit jeweils 2ms Pause, damit Date.now() monoton waechst und
    // die Cleanup-Sortierung deterministisch ist.
    for (let i = 0; i < 25; i++) {
      await saveSnapshot("model-cleanup", makeWire(`marker-${i}`));
      // Mini-Wait fuer monotone timestamps. fake-indexeddb arbeitet
      // synchron in derselben Microtask-Schleife, aber Date.now() koennte
      // gleichbleiben.
      await new Promise((r) => setTimeout(r, 2));
    }
    const count = await getSnapshotCount("model-cleanup");
    expect(count).toBe(20);

    // Sanity: der juengste persistierte Snapshot ist `marker-24` (der letzte).
    const latest = await loadLatestSnapshot("model-cleanup");
    expect(latest?.objects[0]?.attrs.m_sName).toBe("marker-24");
  });

  it("test_clear_removes_all: 3 saves, clearSnapshots, count == 0", async () => {
    // 2ms-Pausen zwischen saves: compound primary key [modelId+timestamp]
    // wuerde sonst kollidieren (siehe Pitfall #6 + test_concurrent_saves_*);
    // hier wollen wir DREI distinct Rows, nicht den Race-Schutz testen.
    await saveSnapshot("model-clear", makeWire("a"));
    await new Promise((r) => setTimeout(r, 2));
    await saveSnapshot("model-clear", makeWire("b"));
    await new Promise((r) => setTimeout(r, 2));
    await saveSnapshot("model-clear", makeWire("c"));
    expect(await getSnapshotCount("model-clear")).toBe(3);

    await clearSnapshots("model-clear");
    expect(await getSnapshotCount("model-clear")).toBe(0);
    expect(await loadLatestSnapshot("model-clear")).toBeNull();
  });
});
