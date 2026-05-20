// Plan 01-05 Task 3: Tests fuer AGruppeViewer.

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
import "../AGruppeViewer";
import { AGruppeViewer } from "../AGruppeViewer";

afterEach(cleanup);

const sample: OtxJsonNode = {
  oid: 100,
  klass: "AGruppe",
  name: "Schicht-A",
  properties: { m_sName: "Schicht-A", m_sBeschreibung: "Frueh" },
  children: [
    {
      oid: 200,
      klass: "PPerson",
      name: "Anna",
      properties: { m_sName: "Anna" },
      children: [],
    },
    {
      oid: 201,
      klass: "PPerson",
      name: "Bert",
      properties: { m_sName: "Bert" },
      children: [],
    },
  ],
};

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
      <AGruppeViewer
        obj={obj}
        onPropertyChange={(o, k, v) => cap.prop.push({ oid: o, key: k, value: v })}
        onMethodCall={(o, m, a) => cap.method.push({ oid: o, method: m, args: a })}
      />
    </ChildDialog>,
  );
  return cap;
}

describe("AGruppeViewer", () => {
  it("rendert Header + Property-Inputs + Mitglieder-Tabelle", () => {
    harness(sample);
    expect(screen.getByTestId("agruppe-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("octrl-variable-m_sName")).toBeInTheDocument();
    expect(
      screen.getByTestId("octrl-variable-m_sBeschreibung"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("agruppe-member-200")).toBeInTheDocument();
    expect(screen.getByTestId("agruppe-member-201")).toBeInTheDocument();
  });

  it("Add-Member-Button ruft onMethodCall(addChild, [PPerson])", () => {
    const cap = harness(sample);
    fireEvent.click(screen.getByTestId("agruppe-add-member"));
    expect(cap.method).toEqual([
      { oid: 100, method: "addChild", args: ["PPerson"] },
    ]);
  });

  it("Remove-Member-Button ruft onMethodCall(removeChild, [oid])", () => {
    const cap = harness(sample);
    fireEvent.click(screen.getByTestId("agruppe-remove-200"));
    expect(cap.method).toEqual([
      { oid: 100, method: "removeChild", args: [200] },
    ]);
  });

  it("ist als 'AGruppe'-Viewer in der registry registriert", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer("AGruppe")).toBe(AGruppeViewer);
  });
});

import React from "react";
void React;
