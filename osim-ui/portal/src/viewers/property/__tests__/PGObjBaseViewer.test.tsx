// Plan 01-05 Task 2: Tests fuer PGObjBaseViewer (Fallback).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import type { OtxJsonNode } from "@/viewers/core/types";
import "../PGObjBaseViewer";
import { PGObjBaseViewer } from "../PGObjBaseViewer";

afterEach(cleanup);

function harness(obj: OtxJsonNode) {
  return render(
    <ChildDialog obj={obj} onPropertyChange={() => undefined} onMethodCall={() => undefined}>
      <PGObjBaseViewer obj={obj} onPropertyChange={() => undefined} onMethodCall={() => undefined} />
    </ChildDialog>,
  );
}

describe("PGObjBaseViewer", () => {
  it("rendert Name, Klasse, OID und Properties als Inputs", () => {
    const obj: OtxJsonNode = {
      oid: 99,
      klass: "PUnknownKlasse",
      name: "Foo",
      properties: { m_sName: "x", m_iZahl: 42 },
      children: [],
    };
    harness(obj);
    expect(screen.getByTestId("pgobj-base-viewer")).toBeInTheDocument();
    expect(screen.getByText("Foo")).toBeInTheDocument();
    expect(screen.getByText("PUnknownKlasse")).toBeInTheDocument();
    expect(screen.getByTestId("octrl-variable-m_sName")).toBeInTheDocument();
    expect(screen.getByTestId("octrl-variable-m_iZahl")).toBeInTheDocument();
  });

  it("zeigt unsupported-Badge wenn obj.unsupported true ist und setzt readonly", () => {
    const obj: OtxJsonNode = {
      oid: 100,
      klass: "PUnknown",
      name: "U",
      properties: { m_x: "y" },
      children: [],
      unsupported: true,
    };
    harness(obj);
    expect(screen.getByText("unsupported")).toBeInTheDocument();
    const input = screen.getByTestId("octrl-variable-m_x") as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it("rendert Children als read-only Tabelle", () => {
    const obj: OtxJsonNode = {
      oid: 1,
      klass: "PParent",
      name: "Parent",
      properties: {},
      children: [
        { oid: 2, klass: "PChild", name: "Kind-A", properties: {}, children: [] },
        { oid: 3, klass: "PChild", name: "Kind-B", properties: {}, children: [] },
      ],
    };
    harness(obj);
    const table = screen.getByTestId("pgobj-children-table");
    expect(table).toBeInTheDocument();
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByText("Kind-A")).toBeInTheDocument();
    expect(screen.getByText("Kind-B")).toBeInTheDocument();
  });

  it("rendert empty-Message wenn keine Properties", () => {
    const obj: OtxJsonNode = {
      oid: 1,
      klass: "PEmpty",
      name: "Empty",
      properties: {},
      children: [],
    };
    harness(obj);
    expect(screen.getByText("Keine Properties verfuegbar.")).toBeInTheDocument();
  });

  it("ist als 'PGObjBase'-Viewer in der registry registriert (Fallback)", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer("PGObjBase")).toBe(PGObjBaseViewer);
  });
});

// React-Import fuer JSX (kein automatic-runtime in vitest config).
import React from "react";
void React;
