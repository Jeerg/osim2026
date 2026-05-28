import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OCtrlLink } from "@/viewers/core/octrl/OCtrlLink";
import type { OBaseObj, PropertyMeta } from "@/viewers/core/types";

const schema: PropertyMeta = {
  name: "m_pRessBeleg",
  label_de: "Betriebsmittel",
  octrl_type: "Link",
  link_target_klass: "PRessBeleg",
};

function makeObjects(): Record<number, OBaseObj> {
  return {
    1: {
      oid: 1,
      klass: "PRessBeleg",
      attrs: { m_sName: "Maschine A" },
      sub_refs: [],
    },
    2: {
      oid: 2,
      klass: "PRessBeleg",
      attrs: { m_sName: "Maschine B" },
      sub_refs: [],
    },
    3: {
      // andere Klasse — soll NICHT in der Liste auftauchen
      oid: 3,
      klass: "PDurchlaufplan",
      attrs: { m_sName: "Plan X" },
      sub_refs: [],
    },
  };
}

describe("OCtrlLink", () => {
  it("rendert Trigger mit aktuellem Objekt-Namen", () => {
    render(
      <OCtrlLink
        value={1}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: /Betriebsmittel/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-octrl-id", "m_pRessBeleg");
    expect(trigger).toHaveTextContent("Maschine A");
  });

  it("zeigt placeholder wenn value=null", () => {
    render(
      <OCtrlLink
        value={null}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: /Betriebsmittel/i }),
    ).toHaveTextContent(/Objekt wählen|Auswählen/i);
  });

  it('"Öffnen"-Button dispatcht onOpenSubViewer mit aktueller oid', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <OCtrlLink
        value={2}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
        onOpenSubViewer={onOpen}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Öffnen/i }));

    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('"Öffnen"-Button erscheint nicht wenn value=null', () => {
    render(
      <OCtrlLink
        value={null}
        onChange={() => {}}
        schema={schema}
        allObjects={makeObjects()}
        onOpenSubViewer={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: /Öffnen/i })).toBeNull();
  });

  it("ist disabled wenn schema.readonly", () => {
    const ro: PropertyMeta = { ...schema, readonly: true };
    render(
      <OCtrlLink
        value={1}
        onChange={() => {}}
        schema={ro}
        allObjects={makeObjects()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: /Betriebsmittel/i }),
    ).toBeDisabled();
  });
});
