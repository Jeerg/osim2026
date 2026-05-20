// Plan 01-09 Task 2: Tests fuer model-store.patchOids und
// _patchOidsInTree.
//
// Setup-frei: keine fetch-Mocks, keine Components — reiner Store-Test.

import { describe, expect, it, beforeEach } from "vitest";
import {
  _patchOidsInTree,
  useModelStore,
} from "@/state/model-store";
import type { OtxJsonNode } from "@/viewers/core/types";

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

beforeEach(() => {
  resetStore();
});

describe("_patchOidsInTree", () => {
  it("ohne Mapping: Tree bleibt unveraendert", () => {
    const tree: OtxJsonNode = {
      oid: 0,
      klass: "ASimulator",
      name: "x",
      properties: {},
      children: [
        {
          oid: 1,
          klass: "PDurchlaufplan",
          name: "y",
          properties: {},
          children: [],
        },
      ],
    };
    const out = _patchOidsInTree(tree, new Map());
    expect(out.oid).toBe(0);
    expect(out.children[0].oid).toBe(1);
  });

  it("patches OID-Schluessel und scalar-OID-Properties", () => {
    const tree: OtxJsonNode = {
      oid: 0,
      klass: "Root",
      name: "r",
      properties: {},
      children: [
        {
          oid: -1,
          klass: "PDpKaUebergang",
          name: "k",
          properties: { m_lVon: -1, m_lNach: 5, m_sName: "Edge" },
          children: [],
        },
      ],
    };
    const mapping = new Map([
      [-1, 100],
    ]);
    const out = _patchOidsInTree(tree, mapping);
    expect(out.children[0].oid).toBe(100);
    expect(out.children[0].properties.m_lVon).toBe(100);
    // Nicht im Mapping → bleibt.
    expect(out.children[0].properties.m_lNach).toBe(5);
    // String bleibt.
    expect(out.children[0].properties.m_sName).toBe("Edge");
  });

  it("patches array-valued OID-Listen", () => {
    const tree: OtxJsonNode = {
      oid: 0,
      klass: "R",
      name: "r",
      properties: { m_lKnoten: [-1, -2, 7] },
      children: [],
    };
    const mapping = new Map([
      [-1, 11],
      [-2, 12],
    ]);
    const out = _patchOidsInTree(tree, mapping);
    expect(out.properties.m_lKnoten).toEqual([11, 12, 7]);
  });

  it("ignoriert nicht-numerische Property-Werte", () => {
    const tree: OtxJsonNode = {
      oid: 0,
      klass: "R",
      name: "r",
      properties: { m_sName: "Test", m_bFlag: true, m_dWert: 3.14 },
      children: [],
    };
    const out = _patchOidsInTree(tree, new Map([[3, 99]]));
    // m_dWert war 3.14 — kein OID, sollte NICHT zu 99 werden... aber
    // unsere Implementierung patcht jedes number-Property, das im
    // Mapping ist. 3.14 ist NICHT 3 → bleibt.
    expect(out.properties.m_dWert).toBe(3.14);
    expect(out.properties.m_bFlag).toBe(true);
    expect(out.properties.m_sName).toBe("Test");
  });
});

describe("useModelStore.patchOids", () => {
  it("ohne Tree: no-op", () => {
    useModelStore.getState().patchOids({ "-1": 5 });
    expect(useModelStore.getState().tree).toBeNull();
  });

  it("mit Tree + Mapping: oid + dirty/undo/redo werden geleert", () => {
    const tree: OtxJsonNode = {
      oid: 0,
      klass: "R",
      name: "r",
      properties: {},
      children: [
        {
          oid: -1,
          klass: "K",
          name: "k",
          properties: { m_lVon: -1 },
          children: [],
        },
      ],
    };
    useModelStore.setState({
      modelId: 1,
      version: 1,
      tree,
      dirty: new Set([-1, 0]),
      undoStack: [{ tree, selectedOid: null }],
      redoStack: [],
      _oidIndex: new Map([
        [0, tree],
        [-1, tree.children[0]],
      ]),
    });
    useModelStore.getState().patchOids({ "-1": 999 });
    const state = useModelStore.getState();
    expect(state.tree!.children[0].oid).toBe(999);
    expect(state.tree!.children[0].properties.m_lVon).toBe(999);
    expect(state.dirty.size).toBe(0);
    expect(state.undoStack.length).toBe(0);
    expect(state.redoStack.length).toBe(0);
    // _oidIndex muss aktualisiert sein.
    expect(state._oidIndex.has(999)).toBe(true);
    expect(state._oidIndex.has(-1)).toBe(false);
  });

  it("selectedOid wird mitgepatcht wenn im Mapping", () => {
    const tree: OtxJsonNode = {
      oid: 0,
      klass: "R",
      name: "r",
      properties: {},
      children: [
        {
          oid: -1,
          klass: "K",
          name: "k",
          properties: {},
          children: [],
        },
      ],
    };
    useModelStore.setState({
      modelId: 1,
      version: 1,
      tree,
      selectedOid: -1,
      _oidIndex: new Map([
        [0, tree],
        [-1, tree.children[0]],
      ]),
    });
    useModelStore.getState().patchOids({ "-1": 42 });
    expect(useModelStore.getState().selectedOid).toBe(42);
  });

  it("leeres Mapping: no-op", () => {
    const tree: OtxJsonNode = {
      oid: 0,
      klass: "R",
      name: "r",
      properties: {},
      children: [],
    };
    useModelStore.setState({
      modelId: 1,
      version: 1,
      tree,
      dirty: new Set([0]),
    });
    useModelStore.getState().patchOids({});
    // dirty bleibt erhalten (kein Patch fand statt).
    expect(useModelStore.getState().dirty.size).toBe(1);
  });
});
