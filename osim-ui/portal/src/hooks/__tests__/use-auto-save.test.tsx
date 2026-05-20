// Plan 01-09 Task 2: Tests fuer useAutoSave + saveModel.
//
// Strategie:
//   - Mock globales fetch (apiClient nutzt es ueber apiFetch).
//   - vi.useFakeTimers fuer Interval-Tests.
//   - useModelStore.setState mit Test-Tree, dirty, version.
//   - Render einen Test-Komponenten, der useAutoSave mounted.
//   - Tick + waitFor fuer Side-Effects.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useModelStore } from "@/state/model-store";
import { useAutoSave } from "../use-auto-save";
import { saveModel } from "../use-save-model";
import {
  _clearAllForTests,
  db,
} from "@/persistence/indexeddb";
import { writeSnapshot } from "@/persistence/snapshot-store";
import type { OtxJsonNode } from "@/viewers/core/types";
import React from "react";
void React;

const originalFetch = globalThis.fetch;

function makeTestTree(): OtxJsonNode {
  return {
    oid: 0,
    klass: "ASimulator",
    name: "Test",
    properties: { m_sName: "Test", m_keim: 42 },
    children: [],
  };
}

function resetStore() {
  useModelStore.setState({
    modelId: null,
    version: null,
    tree: null,
    selectedOid: null,
    dirty: new Set<number>(),
    undoStack: [],
    redoStack: [],
    saving: false,
    _oidIndex: new Map(),
  });
}

beforeEach(async () => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
  resetStore();
  await _clearAllForTests();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// saveModel-Direkttests
// ---------------------------------------------------------------------------

describe("saveModel", () => {
  it("PUT mit korrektem Body, dirty wird geleert, version gestempelt", async () => {
    const tree = makeTestTree();
    useModelStore.setState({
      modelId: 7,
      version: 1,
      tree,
      dirty: new Set([0, 1]),
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          model_id: 7,
          version: 2,
          storage_key: "tenants/.../v2-...otx",
          bytes_size: 1024,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await saveModel({
      modelId: 7,
      tree,
      expectedVersion: 1,
    });
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    // dirty geleert.
    expect(useModelStore.getState().dirty.size).toBe(0);
    // version aktualisiert.
    expect(useModelStore.getState().version).toBe(2);
    // saving-Flag wieder false.
    expect(useModelStore.getState().saving).toBe(false);
    // fetch wurde mit PUT + JSON-Body aufgerufen.
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain("/api/v1/models/7/tree");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body.tree.schema_version).toBe("1.0");
    expect(body.tree.root.oid).toBe(0);
    expect(body.expected_version).toBe(1);
  });

  it("oid_mapping aus Response wird auf den Tree gepatcht", async () => {
    // Tree mit TEMP-OID -1 als Child + m_lVon-Referenz auf -1.
    const tree: OtxJsonNode = {
      oid: 0,
      klass: "ASimulator",
      name: "Root",
      properties: {},
      children: [
        {
          oid: -1,
          klass: "PDpKnKonstant",
          name: "Neu",
          properties: { m_sName: "Neu", m_lVon: -1 },
          children: [],
        },
      ],
    };
    useModelStore.setState({
      modelId: 1,
      version: 1,
      tree,
      dirty: new Set([-1, 0]),
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          model_id: 1,
          version: 2,
          storage_key: "k",
          bytes_size: 0,
          oid_mapping: { "-1": 4711 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await saveModel({ modelId: 1, tree, expectedVersion: 1 });
    const newTree = useModelStore.getState().tree!;
    expect(newTree.children[0].oid).toBe(4711);
    // Property m_lVon wurde mitgepatcht (number-Value).
    expect(newTree.children[0].properties.m_lVon).toBe(4711);
  });

  it("Server-Fehler 500: wirft, dirty bleibt erhalten, saving wird false", async () => {
    const tree = makeTestTree();
    useModelStore.setState({
      modelId: 1,
      version: 1,
      tree,
      dirty: new Set([0]),
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("server error", { status: 500, statusText: "Internal" }),
    );
    await expect(
      saveModel({ modelId: 1, tree, expectedVersion: 1 }),
    ).rejects.toThrow();
    expect(useModelStore.getState().dirty.size).toBe(1);
    expect(useModelStore.getState().saving).toBe(false);
  });

  it("saving=true im Store blockiert parallelen Save", async () => {
    useModelStore.setState({ saving: true });
    const result = await saveModel({
      modelId: 1,
      tree: makeTestTree(),
      expectedVersion: 1,
    });
    expect(result).toBeNull();
    // fetch wurde nicht aufgerufen.
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);
  });

  it("clearSnapshot wird nach erfolgreichem Save aufgerufen", async () => {
    const tree = makeTestTree();
    useModelStore.setState({
      modelId: 99,
      version: 1,
      tree,
      dirty: new Set([0]),
    });
    // Vorher einen Snapshot in IDB anlegen.
    await writeSnapshot(99, 1, tree, new Set([0]));
    expect(await db.snapshots.get(99)).toBeDefined();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          model_id: 99,
          version: 2,
          storage_key: "k",
          bytes_size: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await saveModel({ modelId: 99, tree, expectedVersion: 1 });
    // Snapshot ist geloescht.
    expect(await db.snapshots.get(99)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// useAutoSave-Tests
// ---------------------------------------------------------------------------

function TestHarness({
  modelId,
  hasLock,
  intervalMs,
}: {
  modelId: number;
  hasLock: boolean;
  intervalMs: number;
}) {
  useAutoSave({ modelId, hasLock, intervalMs });
  return <div>harness</div>;
}

describe("useAutoSave", () => {
  it("ohne Lock: kein Save selbst bei dirty>0", async () => {
    useModelStore.setState({
      modelId: 1,
      version: 1,
      tree: makeTestTree(),
      dirty: new Set([0]),
    });
    render(<TestHarness modelId={1} hasLock={false} intervalMs={50} />);
    await new Promise((r) => setTimeout(r, 200));
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);
  });

  it("mit Lock + dirty>0: triggert Save nach intervalMs", async () => {
    useModelStore.setState({
      modelId: 1,
      version: 1,
      tree: makeTestTree(),
      dirty: new Set([0]),
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          model_id: 1,
          version: 2,
          storage_key: "k",
          bytes_size: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    // Sehr kurzes Real-Time-Intervall (50ms), kein Fake-Timer
    // (Fake-Timers blocken happy-dom-Microtasks und timeouten den Test).
    render(<TestHarness modelId={1} hasLock={true} intervalMs={50} />);
    await waitFor(
      () => {
        expect(
          (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length,
        ).toBeGreaterThanOrEqual(1);
      },
      { timeout: 2000 },
    );
  });

  it("mit Lock + dirty=0: kein Save trotz Tick", async () => {
    useModelStore.setState({
      modelId: 1,
      version: 1,
      tree: makeTestTree(),
      dirty: new Set<number>(),
    });
    render(<TestHarness modelId={1} hasLock={true} intervalMs={50} />);
    // 250ms warten → mindestens 4 Ticks. Wenn kein Save: pass.
    await new Promise((r) => setTimeout(r, 250));
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);
  });
});
