// Plan 01-08 Task 1: Smoke-Tests fuer PDlplBetriebsmittelViewer.
//
// - Registry-Check: Viewer registriert auf DLPL_BETRIEBSMITTEL_GROUP
// - Render mit Mock-Tree (2 Knoten × 3 Betriebsmittel) → 6 Zellen
// - Read-only-Banner sichtbar
// - Empty-State, wenn keine Knoten oder keine Ressourcen
// - Cells sind disabled (readonly-Mode)

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import { useModelStore } from "@/state/model-store";
import type {
  MethodArg,
  Oid,
  OtxJsonNode,
  PropertyValue,
} from "@/viewers/core/types";
import "@/viewers/property/type-maps";
import "../PDlplBetriebsmittelViewer";
import { PDlplBetriebsmittelViewer } from "../PDlplBetriebsmittelViewer";
import {
  SYNTHETIC_DLPL_BETRIEBSMITTEL_KLASS,
  SYNTHETIC_DLPL_BETRIEBSMITTEL_OID,
  _clearSyntheticPropsForTests,
  getSyntheticNode,
} from "@/viewers/matrix/synthetic-nodes";

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

function makeTreeWithKnotenAndBM(): OtxJsonNode {
  return {
    oid: 0,
    klass: "ASimulator",
    name: "Test-Modell",
    properties: {},
    children: [
      {
        oid: -1,
        klass: "_group",
        name: "Plaene",
        properties: {},
        children: [
          {
            oid: 50,
            klass: "PDurchlaufplan",
            name: "Plan-1",
            properties: {},
            children: [
              {
                oid: 60,
                klass: "PDpKnKonstant",
                name: "Saegen",
                properties: {},
                children: [],
              },
              {
                oid: 61,
                klass: "PDpKnMenge",
                name: "Schweissen",
                properties: {},
                children: [],
              },
            ],
          },
        ],
      },
      {
        oid: -1,
        klass: "_group",
        name: "Ressourcen",
        properties: {},
        children: [
          {
            oid: 100,
            klass: "PBetriebsmittel",
            name: "Saege",
            properties: {},
            children: [],
          },
          {
            oid: 101,
            klass: "PBetriebsmittel",
            name: "Schweissstand",
            properties: {},
            children: [],
          },
          {
            oid: 102,
            klass: "PBetriebsmittel",
            name: "Lackieranlage",
            properties: {},
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
      <PDlplBetriebsmittelViewer
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

describe("PDlplBetriebsmittelViewer", () => {
  it("ist unter DLPL_BETRIEBSMITTEL_GROUP in der viewer-registry registriert", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer(SYNTHETIC_DLPL_BETRIEBSMITTEL_KLASS)).toBe(
      PDlplBetriebsmittelViewer,
    );
  });

  it("rendert Read-only-Banner immer", () => {
    useModelStore.getState().setTree(makeTreeWithKnotenAndBM(), 1, 1);
    const synth = getSyntheticNode(SYNTHETIC_DLPL_BETRIEBSMITTEL_OID)!;
    harness(synth);
    expect(
      screen.getByTestId("pdlpl-betriebsmittel-readonly-banner"),
    ).toBeInTheDocument();
  });

  it("rendert Matrix 2x3 (2 Knoten × 3 Betriebsmittel)", () => {
    useModelStore.getState().setTree(makeTreeWithKnotenAndBM(), 1, 1);
    const synth = getSyntheticNode(SYNTHETIC_DLPL_BETRIEBSMITTEL_OID)!;
    harness(synth);

    expect(
      screen.getByTestId("pdlpl-betriebsmittel-matrix"),
    ).toBeInTheDocument();

    // Zeilen-Header (Knoten)
    expect(
      screen.getByTestId("pdlpl-betriebsmittel-matrix-row-header-60"),
    ).toHaveTextContent("Saegen");
    expect(
      screen.getByTestId("pdlpl-betriebsmittel-matrix-row-header-61"),
    ).toHaveTextContent("Schweissen");

    // Spalten-Header (Betriebsmittel)
    expect(
      screen.getByTestId("pdlpl-betriebsmittel-matrix-col-header-100"),
    ).toHaveTextContent("Saege");
    expect(
      screen.getByTestId("pdlpl-betriebsmittel-matrix-col-header-101"),
    ).toHaveTextContent("Schweissstand");
    expect(
      screen.getByTestId("pdlpl-betriebsmittel-matrix-col-header-102"),
    ).toHaveTextContent("Lackieranlage");

    // Cells sind boolean (checkbox) und disabled (readonly).
    const cell = screen.getByTestId(
      "pdlpl-betriebsmittel-matrix-cell-60-100",
    ) as HTMLInputElement;
    expect(cell.type).toBe("checkbox");
    expect(cell.disabled).toBe(true);
    expect(cell.checked).toBe(false);
  });

  it("zeigt Empty-State, wenn keine Knoten im Tree", () => {
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
            name: "Saege",
            properties: {},
            children: [],
          },
        ],
      },
      1,
      1,
    );
    const synth = getSyntheticNode(SYNTHETIC_DLPL_BETRIEBSMITTEL_OID)!;
    harness(synth);
    expect(
      screen.getByTestId("pdlpl-betriebsmittel-empty"),
    ).toHaveTextContent("Keine Durchlaufplan-Knoten");
  });

  it("zeigt Empty-State, wenn keine Belegungs-Ressourcen im Tree", () => {
    useModelStore.getState().setTree(
      {
        oid: 0,
        klass: "ASimulator",
        name: "Modell",
        properties: {},
        children: [
          {
            oid: 60,
            klass: "PDpKnKonstant",
            name: "Saegen",
            properties: {},
            children: [],
          },
        ],
      },
      1,
      1,
    );
    const synth = getSyntheticNode(SYNTHETIC_DLPL_BETRIEBSMITTEL_OID)!;
    harness(synth);
    expect(
      screen.getByTestId("pdlpl-betriebsmittel-empty"),
    ).toHaveTextContent("Keine Belegungs-Ressourcen");
  });
});

import React from "react";
void React;
