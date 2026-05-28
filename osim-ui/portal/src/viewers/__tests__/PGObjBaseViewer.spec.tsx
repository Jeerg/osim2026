import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import type {
  ClassSchema,
  OBaseObj,
  PropertyMeta,
} from "@/viewers/core/types";

const baseSchema: ClassSchema = {
  klass: "PSimulator",
  label_de: "Simulator",
  viewer_hints: ["std"],
  properties: [
    {
      name: "m_sName",
      label_de: "Name",
      octrl_type: "Variable",
      value_type: "string",
    } as PropertyMeta,
    {
      name: "m_iSeed",
      label_de: "Seed",
      octrl_type: "Variable",
      value_type: "int",
    } as PropertyMeta,
    {
      name: "m_bAktiv",
      label_de: "Aktiv",
      octrl_type: "Bool",
      value_type: "boolean",
    } as PropertyMeta,
  ],
};

const baseObj: OBaseObj = {
  oid: 1,
  klass: "PSimulator",
  attrs: { m_sName: "Modell-A", m_iSeed: 42, m_bAktiv: true },
  sub_refs: [],
};

describe("PGObjBaseViewer", () => {
  it("rendert alle properties als OCtrls mit korrekten data-octrl-ids", () => {
    const { container } = render(
      <PGObjBaseViewer
        obj={baseObj}
        schema={baseSchema}
        allObjects={{ 1: baseObj }}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(
      container.querySelector("[data-octrl-id='m_sName']"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-octrl-id='m_iSeed']"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-octrl-id='m_bAktiv']"),
    ).not.toBeNull();
  });

  it("zeigt Fallback-Message wenn schema null ist", () => {
    render(
      <PGObjBaseViewer
        obj={baseObj}
        schema={null as unknown as ClassSchema}
        allObjects={{ 1: baseObj }}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(
      screen.getByText(/Keine Properties verfügbar/i),
    ).toBeInTheDocument();
  });

  it("zeigt Fallback-Message wenn properties leer", () => {
    const emptySchema: ClassSchema = {
      ...baseSchema,
      properties: [],
    };
    render(
      <PGObjBaseViewer
        obj={baseObj}
        schema={emptySchema}
        allObjects={{ 1: baseObj }}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(
      screen.getByText(/Keine Properties verfügbar/i),
    ).toBeInTheDocument();
  });

  it("dispatcht onChange mit korrektem patch bei OCtrlVariable-Edit", () => {
    const onChange = vi.fn();
    render(
      <PGObjBaseViewer
        obj={baseObj}
        schema={baseSchema}
        allObjects={{ 1: baseObj }}
        onChange={onChange}
        onCommand={() => {}}
      />,
    );

    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Neu" } });

    expect(onChange).toHaveBeenCalledWith({ m_sName: "Neu" });
  });

  it("rendert Schema-Label_de + Object-Name im Titel", () => {
    render(
      <PGObjBaseViewer
        obj={baseObj}
        schema={baseSchema}
        allObjects={{ 1: baseObj }}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(
      screen.getByText(/Simulator.*Modell-A/i),
    ).toBeInTheDocument();
  });
});
