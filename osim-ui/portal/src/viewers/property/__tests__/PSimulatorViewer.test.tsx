// Plan 01-05 Task 2: Tests fuer PSimulatorViewer.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import type {
  MethodArg,
  Oid,
  OtxJsonNode,
  PropertyValue,
} from "@/viewers/core/types";
import "../type-maps"; // sorgt fuer registrierte Metadaten
import "../PSimulatorViewer";
import { PSimulatorViewer } from "../PSimulatorViewer";

afterEach(cleanup);

function makeSimNode(
  overrides?: Partial<OtxJsonNode>,
): OtxJsonNode {
  return {
    oid: 0,
    klass: "ASimulator",
    name: "Test-Modell",
    properties: {
      m_sName: "Test-Modell",
      m_keim: 12345,
      m_periodLen: 86400,
      m_periodNum: 30,
      m_periodBegin: 0,
      m_iProduktionBezugsPeriode: 0,
      m_iProduktionEnde: 0,
      m_bIsProduktionEnde: false,
      m_sStartDate: "",
      m_sEndDate: "",
    },
    children: [],
    ...overrides,
  };
}

interface Captured {
  prop: Array<{ oid: Oid; key: string; value: PropertyValue }>;
  method: Array<{ oid: Oid; method: string; args?: MethodArg[] }>;
}

function harness(obj: OtxJsonNode) {
  const captured: Captured = { prop: [], method: [] };
  render(
    <ChildDialog
      obj={obj}
      onPropertyChange={(oid, key, value) =>
        captured.prop.push({ oid, key, value })
      }
      onMethodCall={(oid, method, args) =>
        captured.method.push({ oid, method, args })
      }
    >
      <PSimulatorViewer
        obj={obj}
        onPropertyChange={(oid, key, value) =>
          captured.prop.push({ oid, key, value })
        }
        onMethodCall={(oid, method, args) =>
          captured.method.push({ oid, method, args })
        }
      />
    </ChildDialog>,
  );
  return captured;
}

describe("PSimulatorViewer", () => {
  it("rendert Header und Stammdaten-Felder", () => {
    harness(makeSimNode());
    expect(screen.getByTestId("psimulator-viewer")).toBeInTheDocument();
    expect(screen.getByText(/Test-Modell/)).toBeInTheDocument();
    // Pflicht-Felder
    expect(screen.getByTestId("octrl-variable-m_sName")).toBeInTheDocument();
    expect(screen.getByTestId("octrl-variable-m_keim")).toBeInTheDocument();
    expect(
      screen.getByTestId("octrl-variable-m_periodLen"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("octrl-bool-m_bIsProduktionEnde")).toBeInTheDocument();
  });

  it("dispatcht onPropertyChange beim Editieren von m_keim", () => {
    const cap = harness(makeSimNode());
    const input = screen.getByTestId(
      "octrl-variable-m_keim",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "54321" } });
    expect(cap.prop).toEqual([{ oid: 0, key: "m_keim", value: 54321 }]);
  });

  it("zaehlt Auslöser/Plaene/Ressourcen aus dem Sub-Tree (mit _group)", () => {
    const node = makeSimNode({
      children: [
        {
          oid: -1,
          klass: "_group",
          name: "Ausloeser",
          properties: {},
          children: [
            { oid: 10, klass: "PAslEinzel", name: "A1", properties: {}, children: [] },
            { oid: 11, klass: "PAslEinzel", name: "A2", properties: {}, children: [] },
          ],
        },
        {
          oid: -1,
          klass: "_group",
          name: "Durchlaufplaene",
          properties: {},
          children: [
            { oid: 20, klass: "PDurchlaufplan", name: "Plan-A", properties: {}, children: [] },
          ],
        },
      ],
    });
    harness(node);
    const summary = screen.getByTestId("psimulator-summary");
    // Auslöser: 2, Plaene: 1
    expect(summary.textContent).toMatch(/Ausloeser.*?2/s);
    expect(summary.textContent).toMatch(/Durchlaufplaene.*?1/s);
  });

  it("ist als 'ASimulator'-Viewer in der registry registriert", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer("ASimulator")).toBe(PSimulatorViewer);
  });
});

import React from "react";
void React;
void vi;
