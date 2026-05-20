// Plan 01-06 Task 2: Smoke-Tests fuer PRessBelegMatrixViewer.
//
// - Render mit Mock-Tree (3 PBetriebsmittel × 2 PEinsatzzeitTag) → Matrix
//   korrekt ausgegeben.
// - Empty-State (keine Belegungs-Ressourcen) → Hinweis-Banner.
// - Edit einer Zelle → setSyntheticProperty wird gerufen, Zellen-Wert
//   reflektiert beim naechsten Render.
// - Registry-Check: Viewer ist unter SYNTHETIC_RESS_BELEG_KLASS registriert.
// - Sidebar-Tree: synthetische Matrix-Folder werden gerendert + klickbar.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import { useModelStore } from "@/state/model-store";
import type {
  MethodArg,
  Oid,
  OtxJsonNode,
  PropertyValue,
} from "@/viewers/core/types";
import "@/viewers/property/type-maps";
import "../PRessBelegMatrixViewer";
import {
  PRessBelegMatrixViewer,
  SYNTHETIC_RESS_BELEG_OID,
} from "../PRessBelegMatrixViewer";
import {
  SYNTHETIC_RESS_BELEG_KLASS,
  _clearSyntheticPropsForTests,
  getSyntheticNode,
  getSyntheticProps,
} from "../synthetic-nodes";

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

function makeTreeWithMaschinenAndSchichten(): OtxJsonNode {
  return {
    oid: 0,
    klass: "ASimulator",
    name: "Test-Modell",
    properties: {},
    children: [
      {
        oid: -1,
        klass: "_group",
        name: "Ressourcen",
        properties: {},
        children: [
          { oid: 100, klass: "PBetriebsmittel", name: "Maschine-A", properties: {}, children: [] },
          { oid: 101, klass: "PBetriebsmittel", name: "Maschine-B", properties: {}, children: [] },
          { oid: 102, klass: "PPerson", name: "Anna", properties: {}, children: [] },
        ],
      },
      {
        oid: -1,
        klass: "_group",
        name: "Einsatzzeiten",
        properties: {},
        children: [
          {
            oid: 200,
            klass: "PEinsatzzeitTag",
            name: "Frueh",
            properties: { m_iBeginn: 21600 },
            children: [],
          },
          {
            oid: 201,
            klass: "PEinsatzzeitTag",
            name: "Spaet",
            properties: { m_iBeginn: 50400 },
            children: [],
          },
        ],
      },
    ],
  };
}

interface Captured {
  prop: Array<{ oid: Oid; key: string; value: PropertyValue }>;
  method: Array<{ oid: Oid; method: string; args?: MethodArg[] }>;
}

function harness(syntheticObj: OtxJsonNode) {
  const cap: Captured = { prop: [], method: [] };
  render(
    <ChildDialog
      obj={syntheticObj}
      onPropertyChange={(o, k, v) =>
        cap.prop.push({ oid: o, key: k, value: v })
      }
      onMethodCall={(o, m, a) =>
        cap.method.push({ oid: o, method: m, args: a })
      }
    >
      <PRessBelegMatrixViewer
        obj={syntheticObj}
        onPropertyChange={(o, k, v) =>
          cap.prop.push({ oid: o, key: k, value: v })
        }
        onMethodCall={(o, m, a) =>
          cap.method.push({ oid: o, method: m, args: a })
        }
      />
    </ChildDialog>,
  );
  return cap;
}

afterEach(() => {
  cleanup();
  resetStore();
  _clearSyntheticPropsForTests();
});

describe("PRessBelegMatrixViewer", () => {
  it("ist unter RESS_BELEG_GROUP in der viewer-registry registriert", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer(SYNTHETIC_RESS_BELEG_KLASS)).toBe(PRessBelegMatrixViewer);
  });

  it("zeigt empty-State, wenn keine Belegungs-Ressourcen im Tree sind", () => {
    useModelStore.getState().setTree(
      {
        oid: 0,
        klass: "ASimulator",
        name: "Leer",
        properties: {},
        children: [],
      },
      1,
      1,
    );
    const synth = getSyntheticNode(SYNTHETIC_RESS_BELEG_OID)!;
    harness(synth);
    expect(
      screen.getByTestId("pressbeleg-matrix-no-ress"),
    ).toBeInTheDocument();
  });

  it("rendert Matrix 3x2 (3 Ressourcen × 2 Schichten)", () => {
    useModelStore.getState().setTree(
      makeTreeWithMaschinenAndSchichten(),
      1,
      1,
    );
    const synth = getSyntheticNode(SYNTHETIC_RESS_BELEG_OID)!;
    harness(synth);
    expect(screen.getByTestId("pressbeleg-matrix")).toBeInTheDocument();
    // Row-Headers
    expect(
      screen.getByTestId("pressbeleg-matrix-row-header-100"),
    ).toHaveTextContent("Maschine-A");
    expect(
      screen.getByTestId("pressbeleg-matrix-row-header-101"),
    ).toHaveTextContent("Maschine-B");
    expect(
      screen.getByTestId("pressbeleg-matrix-row-header-102"),
    ).toHaveTextContent("Anna");
    // Col-Headers (oid:200 = Frueh kommt vor Spaet wegen Sortierung
    // nach m_iBeginn)
    expect(
      screen.getByTestId("pressbeleg-matrix-col-header-oid:200"),
    ).toHaveTextContent("Frueh");
    expect(
      screen.getByTestId("pressbeleg-matrix-col-header-oid:201"),
    ).toHaveTextContent("Spaet");
    // Cell-Default-Value = 0
    const cell = screen.getByTestId(
      "pressbeleg-matrix-cell-100-oid:200",
    ) as HTMLInputElement;
    expect(cell.value).toBe("0");
  });

  it("Edit einer Zelle schreibt in den synthetic-property-store", () => {
    useModelStore.getState().setTree(
      makeTreeWithMaschinenAndSchichten(),
      1,
      1,
    );
    const synth = getSyntheticNode(SYNTHETIC_RESS_BELEG_OID)!;
    harness(synth);
    const cell = screen.getByTestId(
      "pressbeleg-matrix-cell-101-oid:201",
    ) as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "7" } });
    const props = getSyntheticProps(SYNTHETIC_RESS_BELEG_OID);
    expect(props.m_aKapazitaeten).toEqual({ "101:oid:201": 7 });
  });

  it("fallback Standard-Spalte wenn keine PEinsatzzeitTag im Tree", () => {
    useModelStore.getState().setTree(
      {
        oid: 0,
        klass: "ASimulator",
        name: "Modell",
        properties: {},
        children: [
          {
            oid: 100,
            klass: "PBetriebsmittel",
            name: "Maschine-A",
            properties: {},
            children: [],
          },
        ],
      },
      1,
      1,
    );
    const synth = getSyntheticNode(SYNTHETIC_RESS_BELEG_OID)!;
    harness(synth);
    expect(
      screen.getByTestId("pressbeleg-matrix-col-header-default"),
    ).toHaveTextContent("Standard");
  });
});

import React from "react";
void React;
