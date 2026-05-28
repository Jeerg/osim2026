import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AGruppeViewer } from "@/viewers/AZeit/AGruppeViewer";
import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

const schema: ClassSchema = {
  klass: "AGruppe",
  label_de: "Personalgruppe",
  viewer_hints: ["std"],
  properties: [
    {
      name: "m_sName",
      label_de: "Name",
      octrl_type: "Variable",
      value_type: "string",
    },
    {
      name: "m_oids_personal",
      label_de: "Mitglieder",
      octrl_type: "List",
      list_item_klass: "PPerson",
    },
  ],
};

const gruppe: OBaseObj = {
  oid: 30,
  klass: "AGruppe",
  attrs: {
    m_sName: "Frühschicht",
    m_oids_personal: [1, 2, 3],
  },
  sub_refs: [],
};

const allObjects: Record<number, OBaseObj> = {
  30: gruppe,
  1: { oid: 1, klass: "PPerson", attrs: { m_sName: "Anna" }, sub_refs: [] },
  2: { oid: 2, klass: "PPerson", attrs: { m_sName: "Berta" }, sub_refs: [] },
  3: { oid: 3, klass: "PPerson", attrs: { m_sName: "Christa" }, sub_refs: [] },
};

describe("AGruppeViewer", () => {
  it("rendert Mitglieder-Liste mit allen 3 Personen", () => {
    render(
      <AGruppeViewer
        obj={gruppe}
        schema={schema}
        allObjects={allObjects}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Berta")).toBeInTheDocument();
    expect(screen.getByText("Christa")).toBeInTheDocument();
  });

  it("rendert den Gruppen-Name als Property", () => {
    render(
      <AGruppeViewer
        obj={gruppe}
        schema={schema}
        allObjects={allObjects}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Frühschicht");
  });
});
