// Plan 01-05 Task 3: model-store Add/Remove/Undo-Tests.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useModelStore } from "../model-store";
import type { OtxJsonNode } from "@/viewers/core/types";

function resetStore() {
  useModelStore.setState({
    modelId: null,
    version: null,
    tree: null,
    selectedOid: null,
    dirty: new Set(),
    undoStack: [],
    redoStack: [],
    _oidIndex: new Map(),
  });
}

const seed: OtxJsonNode = {
  oid: 0,
  klass: "ASimulator",
  name: "Root",
  properties: {},
  children: [
    {
      oid: 10,
      klass: "PDurchlaufplan",
      name: "P1",
      properties: { m_sName: "P1" },
      children: [],
    },
  ],
};

beforeEach(() => {
  resetStore();
  useModelStore.getState().setTree(structuredClone(seed), 1, 1);
});

afterEach(resetStore);

describe("model-store.addChildSkeleton", () => {
  it("erzeugt einen Skeleton-Knoten mit TEMP-OID (negativ) und fuegt ihn ein", () => {
    const oid = useModelStore
      .getState()
      .addChildSkeleton(10, "PDpKnKonstant", (k) =>
        k === "PDpKnKonstant"
          ? { m_sName: "Neu", m_iDurchfuehrungszeit: 60 }
          : {},
      );
    expect(oid).not.toBeNull();
    expect(oid! < 0).toBe(true);
    const tree = useModelStore.getState().tree!;
    expect(tree.children[0].children).toHaveLength(1);
    const child = tree.children[0].children[0];
    expect(child.klass).toBe("PDpKnKonstant");
    expect(child.properties.m_sName).toBe("Neu");
    // selectedOid wird auf neuen Knoten gesetzt:
    expect(useModelStore.getState().selectedOid).toBe(oid);
    // dirty enthaelt Parent + neuen Knoten:
    expect(useModelStore.getState().dirty.has(10)).toBe(true);
    expect(useModelStore.getState().dirty.has(oid!)).toBe(true);
    // undoStack hat einen Eintrag:
    expect(useModelStore.getState().undoStack).toHaveLength(1);
  });

  it("zwei aufeinander folgende addChildSkeleton-Calls vergeben unterschiedliche TEMP-OIDs", () => {
    const a = useModelStore
      .getState()
      .addChildSkeleton(10, "PDpKnKonstant", () => ({}));
    const b = useModelStore
      .getState()
      .addChildSkeleton(10, "PDpKnKonstant", () => ({}));
    expect(a).not.toBe(b);
    expect(b! < a!).toBe(true);
  });
});

describe("model-store.removeNode", () => {
  it("entfernt einen vorhandenen Knoten und legt einen undo-Snapshot ab", () => {
    useModelStore.getState().removeNode(10);
    expect(useModelStore.getState().tree!.children).toHaveLength(0);
    expect(useModelStore.getState().undoStack).toHaveLength(1);
  });

  it("undo() macht remove rueckgaengig", () => {
    useModelStore.getState().removeNode(10);
    useModelStore.getState().undo();
    expect(useModelStore.getState().tree!.children).toHaveLength(1);
    expect(useModelStore.getState().tree!.children[0].oid).toBe(10);
  });

  it("undo() macht addChildSkeleton rueckgaengig", () => {
    useModelStore
      .getState()
      .addChildSkeleton(10, "PDpKnKonstant", () => ({}));
    expect(useModelStore.getState().tree!.children[0].children).toHaveLength(1);
    useModelStore.getState().undo();
    expect(useModelStore.getState().tree!.children[0].children).toHaveLength(0);
  });
});
