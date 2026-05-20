// Plan 01-09 Task 1: Tests fuer den Snapshot-Store.
//
// Nutzt fake-indexeddb (via test-setup.ts global-import) — kein
// expliziter Import noetig.

import { describe, expect, it, beforeEach } from "vitest";
import { _clearAllForTests } from "@/persistence/indexeddb";
import {
  clearSnapshot,
  readLatestSnapshot,
  writeSnapshot,
} from "@/persistence/snapshot-store";
import { checkForRecovery } from "@/persistence/recovery";
import type { OtxJsonNode } from "@/viewers/core/types";

function makeTree(oid: number, name: string): OtxJsonNode {
  return {
    oid,
    klass: "ASimulator",
    name,
    properties: { m_sName: name },
    children: [],
  };
}

describe("snapshot-store", () => {
  beforeEach(async () => {
    await _clearAllForTests();
  });

  it("write + read roundtrip", async () => {
    const tree = makeTree(0, "Modell A");
    await writeSnapshot(42, 7, tree, new Set([1, 2, 3]));
    const got = await readLatestSnapshot(42);
    expect(got).toBeDefined();
    expect(got?.modelId).toBe(42);
    expect(got?.version).toBe(7);
    expect(got?.tree.name).toBe("Modell A");
    expect(got?.dirty).toEqual([1, 2, 3]);
    expect(typeof got?.savedAt).toBe("number");
    expect(got!.savedAt).toBeGreaterThan(0);
  });

  it("write overwrites previous snapshot fuer dieselbe modelId", async () => {
    await writeSnapshot(1, 1, makeTree(0, "alt"), new Set([10]));
    await writeSnapshot(1, 2, makeTree(0, "neu"), new Set([20, 30]));
    const got = await readLatestSnapshot(1);
    expect(got?.version).toBe(2);
    expect(got?.tree.name).toBe("neu");
    expect(got?.dirty).toEqual([20, 30]);
  });

  it("readLatestSnapshot liefert undefined wenn kein Eintrag", async () => {
    const got = await readLatestSnapshot(999);
    expect(got).toBeUndefined();
  });

  it("clearSnapshot entfernt den Eintrag", async () => {
    await writeSnapshot(5, 1, makeTree(0, "x"), new Set());
    await clearSnapshot(5);
    const got = await readLatestSnapshot(5);
    expect(got).toBeUndefined();
  });

  it("clearSnapshot auf nicht-existentes Modell ist no-op", async () => {
    // Sollte nicht throwen.
    await expect(clearSnapshot(12345)).resolves.toBeUndefined();
  });

  it("dirty-Set wird als Array gespeichert und korrekt rehydriert", async () => {
    const dirty = new Set([5, 10, 15]);
    await writeSnapshot(7, 1, makeTree(0, "n"), dirty);
    const got = await readLatestSnapshot(7);
    expect(new Set(got?.dirty)).toEqual(dirty);
  });

  it("isolation zwischen verschiedenen modelIds", async () => {
    await writeSnapshot(1, 1, makeTree(0, "A"), new Set([1]));
    await writeSnapshot(2, 1, makeTree(0, "B"), new Set([2]));
    const a = await readLatestSnapshot(1);
    const b = await readLatestSnapshot(2);
    expect(a?.tree.name).toBe("A");
    expect(b?.tree.name).toBe("B");
  });
});

describe("checkForRecovery", () => {
  beforeEach(async () => {
    await _clearAllForTests();
  });

  it("ohne Snapshot: hasSnapshot=false, snapshotIsNewer=false", async () => {
    const r = await checkForRecovery(100, 3);
    expect(r.hasSnapshot).toBe(false);
    expect(r.snapshotIsNewer).toBe(false);
    expect(r.serverIsNewer).toBe(false);
    expect(r.snapshot).toBeNull();
  });

  it("mit dirty Snapshot: snapshotIsNewer=true", async () => {
    await writeSnapshot(100, 3, makeTree(0, "x"), new Set([42]));
    const r = await checkForRecovery(100, 3);
    expect(r.hasSnapshot).toBe(true);
    expect(r.snapshotIsNewer).toBe(true);
    expect(r.serverIsNewer).toBe(false);
    expect(r.snapshot?.dirty).toEqual([42]);
  });

  it("mit cleanem Snapshot (dirty=[]) und gleicher Server-Version: snapshotIsNewer=false", async () => {
    await writeSnapshot(100, 3, makeTree(0, "x"), new Set());
    const r = await checkForRecovery(100, 3);
    expect(r.hasSnapshot).toBe(true);
    expect(r.snapshotIsNewer).toBe(false);
    expect(r.serverIsNewer).toBe(false);
  });

  it("Server-Version hoeher als Snapshot-Basis: serverIsNewer=true", async () => {
    await writeSnapshot(100, 3, makeTree(0, "x"), new Set([1]));
    const r = await checkForRecovery(100, 5);
    expect(r.hasSnapshot).toBe(true);
    expect(r.snapshotIsNewer).toBe(true);
    expect(r.serverIsNewer).toBe(true);
  });
});
