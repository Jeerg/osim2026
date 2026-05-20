// Plan 01-05 Task 3: Tests fuer PDurchlaufplanViewerStd.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import type {
  MethodArg,
  Oid,
  OtxJsonNode,
  PropertyValue,
} from "@/viewers/core/types";
import "../type-maps";
import "../PDurchlaufplanViewerStd";
import { PDurchlaufplanViewerStd } from "../PDurchlaufplanViewerStd";

afterEach(cleanup);

function planNode(): OtxJsonNode {
  return {
    oid: 20,
    klass: "PDurchlaufplan",
    name: "Plan-A",
    properties: { m_sName: "Plan-A" },
    children: [
      {
        oid: -1,
        klass: "_group",
        name: "Knoten",
        properties: {},
        children: [
          {
            oid: 30,
            klass: "PDpKnKonstant",
            name: "K1",
            properties: { m_sName: "K1", m_iDurchfuehrungszeit: 60 },
            children: [],
          },
          {
            oid: 31,
            klass: "PDpKnKonstant",
            name: "K2",
            properties: { m_sName: "K2", m_iDurchfuehrungszeit: 120 },
            children: [],
          },
        ],
      },
      {
        oid: -1,
        klass: "_group",
        name: "Kanten",
        properties: {},
        children: [
          {
            oid: 40,
            klass: "PDpKaUebergang",
            name: "E1",
            properties: { m_sName: "E1", m_iUebergangszeit: 5 },
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

function harness(obj: OtxJsonNode) {
  const cap: Captured = { prop: [], method: [] };
  render(
    <ChildDialog
      obj={obj}
      onPropertyChange={(o, k, v) => cap.prop.push({ oid: o, key: k, value: v })}
      onMethodCall={(o, m, a) => cap.method.push({ oid: o, method: m, args: a })}
    >
      <PDurchlaufplanViewerStd
        obj={obj}
        onPropertyChange={(o, k, v) => cap.prop.push({ oid: o, key: k, value: v })}
        onMethodCall={(o, m, a) => cap.method.push({ oid: o, method: m, args: a })}
      />
    </ChildDialog>,
  );
  return cap;
}

describe("PDurchlaufplanViewerStd", () => {
  it("rendert Plan-Properties und beide Sub-Gruppen", () => {
    harness(planNode());
    expect(screen.getByTestId("pdurchlaufplan-viewer-std")).toBeInTheDocument();
    expect(screen.getByTestId("octrl-variable-m_sName")).toBeInTheDocument();
    // Beide Sub-Tabellen sichtbar:
    expect(screen.getByTestId("dlpl-group-Knoten")).toBeInTheDocument();
    expect(screen.getByTestId("dlpl-group-Kanten")).toBeInTheDocument();
    // 2 Knoten + 1 Kante als Zeilen:
    expect(screen.getByTestId("dlpl-row-30")).toBeInTheDocument();
    expect(screen.getByTestId("dlpl-row-31")).toBeInTheDocument();
    expect(screen.getByTestId("dlpl-row-40")).toBeInTheDocument();
  });

  it("Add-Button fuer Knoten ruft onMethodCall(addChild, [PDpKnKonstant]) am Plan-OID", () => {
    const cap = harness(planNode());
    fireEvent.click(screen.getByTestId("dlpl-add-PDpKnKonstant"));
    expect(cap.method).toEqual([
      { oid: 20, method: "addChild", args: ["PDpKnKonstant"] },
    ]);
  });

  it("Add-Button fuer Kanten ruft onMethodCall(addChild, [PDpKaUebergang]) am Plan-OID", () => {
    const cap = harness(planNode());
    fireEvent.click(screen.getByTestId("dlpl-add-PDpKaUebergang"));
    expect(cap.method).toEqual([
      { oid: 20, method: "addChild", args: ["PDpKaUebergang"] },
    ]);
  });

  it("Remove-Button ruft onMethodCall(removeChild, [oid]) am Plan-OID", () => {
    const cap = harness(planNode());
    fireEvent.click(screen.getByTestId("dlpl-remove-30"));
    expect(cap.method).toEqual([
      { oid: 20, method: "removeChild", args: [30] },
    ]);
  });

  it("ist als 'PDurchlaufplan'-Viewer in der registry registriert", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer("PDurchlaufplan")).toBe(PDurchlaufplanViewerStd);
  });
});

import React from "react";
void React;
