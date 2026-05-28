import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PSimulatorViewer } from "@/viewers/PSimulator/PSimulatorViewer";
import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

const schema: ClassSchema = {
  klass: "PSimulator",
  label_de: "Simulator",
  viewer_hints: ["std"],
  properties: [
    {
      name: "m_sName",
      label_de: "Name",
      octrl_type: "Variable",
      value_type: "string",
    },
    {
      name: "m_iSeed",
      label_de: "Seed",
      octrl_type: "Variable",
      value_type: "int",
    },
  ],
};

const obj: OBaseObj = {
  oid: 0,
  klass: "PSimulator",
  attrs: { m_sName: "TestModell", m_iSeed: 12345 },
  sub_refs: [],
};

describe("PSimulatorViewer", () => {
  it("rendert Properties (Name, Seed) aus dem Schema", () => {
    render(
      <PSimulatorViewer
        obj={obj}
        schema={schema}
        allObjects={{ 0: obj }}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("TestModell");
    expect(screen.getByLabelText("Seed")).toHaveValue(12345);
  });

  it("rendert KEINEN Sim-Lauf-Button in Phase 1 (kommt erst in Phase 2)", () => {
    // Plan-1.1-Redesign: Der disabled "Sim-Lauf starten"-Footer-Button war
    // verwirrend und ist entfernt. Der Sim-Lauf-Flow wird in Phase 2 als
    // eigene UI-Aktion realisiert.
    render(
      <PSimulatorViewer
        obj={obj}
        schema={schema}
        allObjects={{ 0: obj }}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Sim-Lauf starten/i }),
    ).not.toBeInTheDocument();
  });
});
