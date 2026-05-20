// Plan 01-05 Task 1: SidebarTree-Tests.
//
// - rendert leeren Placeholder, wenn kein Tree geladen.
// - rendert echten Tree mit Gruppen-Knoten + selektierbaren Leafs.
// - Klick auf einen echten Knoten setzt selectedOid.
// - Klick auf einen _group-Knoten setzt KEINEN selectedOid.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SidebarTree } from "../sidebar-tree";
import { useModelStore } from "@/state/model-store";
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

const sampleTree: OtxJsonNode = {
  oid: 0,
  klass: "ASimulator",
  name: "Test-Modell",
  properties: {},
  children: [
    {
      oid: -1,
      klass: "_group",
      name: "Durchlaufplaene",
      properties: {},
      children: [
        {
          oid: 10,
          klass: "PDurchlaufplan",
          name: "Plan-A",
          properties: {},
          children: [],
        },
        {
          oid: 11,
          klass: "PDurchlaufplan",
          name: "Plan-B",
          properties: {},
          children: [],
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  resetStore();
});

describe("SidebarTree", () => {
  it("rendert empty-Placeholder wenn kein Tree geladen", () => {
    render(<SidebarTree />);
    expect(screen.getByTestId("sidebar-tree-empty")).toBeInTheDocument();
  });

  it("rendert den Modell-Wurzelknoten + Gruppen + Leafs", () => {
    useModelStore.getState().setTree(sampleTree, 1, 1);
    render(<SidebarTree height={500} width={300} />);
    // Wurzel
    expect(screen.getByText("Test-Modell")).toBeInTheDocument();
    // Gruppen-Header (mit Count "(2)")
    expect(screen.getByText("Durchlaufplaene")).toBeInTheDocument();
    // Leafs
    expect(screen.getByText("Plan-A")).toBeInTheDocument();
    expect(screen.getByText("Plan-B")).toBeInTheDocument();
  });

  it("Klick auf Leaf setzt selectedOid im store", () => {
    useModelStore.getState().setTree(sampleTree, 1, 1);
    render(<SidebarTree height={500} width={300} />);
    fireEvent.click(screen.getByText("Plan-A"));
    expect(useModelStore.getState().selectedOid).toBe(10);
  });

  it("Klick auf Gruppe setzt KEINEN selectedOid (nur Toggle)", () => {
    useModelStore.getState().setTree(sampleTree, 1, 1);
    render(<SidebarTree height={500} width={300} />);
    // Vorbedingung: keine Selektion
    expect(useModelStore.getState().selectedOid).toBeNull();
    fireEvent.click(screen.getByText("Durchlaufplaene"));
    // Gruppe selektiert nicht.
    expect(useModelStore.getState().selectedOid).toBeNull();
  });
});
