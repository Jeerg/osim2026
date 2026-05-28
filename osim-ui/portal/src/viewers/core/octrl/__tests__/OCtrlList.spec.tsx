import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OCtrlList } from "@/viewers/core/octrl/OCtrlList";
import type { OBaseObj, PropertyMeta } from "@/viewers/core/types";

const schema: PropertyMeta = {
  name: "m_lstKnoten",
  label_de: "Knoten",
  octrl_type: "List",
  list_item_klass: "PDpKnKonstant",
};

function makeObjects(): Record<number, OBaseObj> {
  return {
    1: {
      oid: 1,
      klass: "PDpKnKonstant",
      attrs: { m_sName: "Knoten 1" },
      sub_refs: [],
    },
    2: {
      oid: 2,
      klass: "PDpKnKonstant",
      attrs: { m_sName: "Knoten 2" },
      sub_refs: [],
    },
  };
}

describe("OCtrlList", () => {
  it("rendert Header-Label und eine Row pro oid in value", () => {
    render(
      <OCtrlList
        value={[1, 2]}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
      />,
    );

    expect(screen.getByText("Knoten")).toBeInTheDocument();
    expect(screen.getByText("Knoten 1")).toBeInTheDocument();
    expect(screen.getByText("Knoten 2")).toBeInTheDocument();
  });

  it("rendert leere Tabelle bei value=null", () => {
    render(
      <OCtrlList
        value={null}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
      />,
    );

    // Hinzufügen-Button trotzdem sichtbar
    expect(screen.getByRole("button", { name: /Hinzufügen/i })).toBeInTheDocument();
  });

  it("Click auf Row dispatcht onOpenSubViewer", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <OCtrlList
        value={[1]}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
        onOpenSubViewer={onOpen}
      />,
    );

    await user.click(screen.getByText("Knoten 1"));

    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("Hinzufügen ruft onCreate-Callback wenn gegeben", async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(
      <OCtrlList
        value={[]}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
        onCreate={onCreate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Hinzufügen/i }));

    expect(onCreate).toHaveBeenCalledWith("PDpKnKonstant");
  });

  it("ist mit data-octrl-id auf Root-Container annotiert", () => {
    const { container } = render(
      <OCtrlList
        value={[]}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
      />,
    );

    expect(
      container.querySelector("[data-octrl-id='m_lstKnoten']"),
    ).not.toBeNull();
  });
});
