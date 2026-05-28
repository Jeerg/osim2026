import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDurchlaufplanViewerStd } from "@/viewers/PDurchlaufplan/PDurchlaufplanViewerStd";
import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

const schema: ClassSchema = {
  klass: "PDurchlaufplan",
  label_de: "Durchlaufplan",
  viewer_hints: ["std", "design"],
  properties: [
    {
      name: "m_sName",
      label_de: "Name",
      octrl_type: "Variable",
      value_type: "string",
    },
  ],
};

const plan: OBaseObj = {
  oid: 5,
  klass: "PDurchlaufplan",
  attrs: { m_sName: "Plan-A" },
  // sub_refs[0] = Knoten-OIDs, sub_refs[1] = Kanten-OIDs
  sub_refs: [
    [10, 11],
    [20],
  ],
};

const allObjects: Record<number, OBaseObj> = {
  5: plan,
  10: { oid: 10, klass: "PDpKnKonstant", attrs: { m_sName: "K1" }, sub_refs: [] },
  11: { oid: 11, klass: "PDpKnKonstant", attrs: { m_sName: "K2" }, sub_refs: [] },
  20: { oid: 20, klass: "PDlplKante", attrs: { m_sName: "E1" }, sub_refs: [] },
};

describe("PDurchlaufplanViewerStd", () => {
  it("rendert 3 Tabs: Eigenschaften / Knoten / Kanten", () => {
    render(
      <PDurchlaufplanViewerStd
        obj={plan}
        schema={schema}
        allObjects={allObjects}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(
      screen.getByRole("tab", { name: /Eigenschaften/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Knoten/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Kanten/i }),
    ).toBeInTheDocument();
  });

  it("Knoten-Tab-Label zeigt korrekte Anzahl (Knoten (2))", () => {
    render(
      <PDurchlaufplanViewerStd
        obj={plan}
        schema={schema}
        allObjects={allObjects}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(
      screen.getByRole("tab", { name: /Knoten \(2\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Kanten \(1\)/i }),
    ).toBeInTheDocument();
  });

  it("Klick auf Knoten-Tab zeigt Knoten-Liste", async () => {
    const user = userEvent.setup();
    render(
      <PDurchlaufplanViewerStd
        obj={plan}
        schema={schema}
        allObjects={allObjects}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /Knoten \(2\)/i }));

    // Beide Knoten-Namen sollten in der aktiven Liste auftauchen
    expect(screen.getByText("K1")).toBeInTheDocument();
    expect(screen.getByText("K2")).toBeInTheDocument();
  });

  it("toleriert leere sub_refs (zeigt Knoten (0) / Kanten (0))", () => {
    const emptyPlan: OBaseObj = {
      ...plan,
      sub_refs: [],
    };
    render(
      <PDurchlaufplanViewerStd
        obj={emptyPlan}
        schema={schema}
        allObjects={{ 5: emptyPlan }}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(
      screen.getByRole("tab", { name: /Knoten \(0\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Kanten \(0\)/i }),
    ).toBeInTheDocument();
  });
});
