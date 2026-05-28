import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OCtrlEnum } from "@/viewers/core/octrl/OCtrlEnum";
import type { PropertyMeta } from "@/viewers/core/types";

const schema: PropertyMeta = {
  name: "m_eStatus",
  label_de: "Status",
  octrl_type: "Enum",
  enum_values: [
    { value: 0, label_de: "Aus" },
    { value: 1, label_de: "Ein" },
    { value: 2, label_de: "Pause" },
  ],
};

describe("OCtrlEnum", () => {
  it("rendert Label und Trigger mit aktueller Auswahl", () => {
    render(<OCtrlEnum value={1} onChange={() => {}} schema={schema} />);

    // Trigger trägt data-octrl-id und zeigt aktuelles Label
    const trigger = screen.getByRole("combobox", { name: "Status" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-octrl-id", "m_eStatus");
    expect(trigger).toHaveTextContent("Ein");
  });

  it("rendert placeholder wenn value=null", () => {
    render(<OCtrlEnum value={null} onChange={() => {}} schema={schema} />);

    const trigger = screen.getByRole("combobox", { name: "Status" });
    expect(trigger).toHaveTextContent("Bitte wählen");
  });

  it("ruft onChange mit number bei Item-Auswahl", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OCtrlEnum value={0} onChange={onChange} schema={schema} />);

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    // Items werden in Radix-Portal gerendert; auf Item klicken
    const pauseOption = await screen.findByRole("option", { name: "Pause" });
    await user.click(pauseOption);

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("ist disabled wenn schema.readonly", () => {
    const ro: PropertyMeta = { ...schema, readonly: true };
    render(<OCtrlEnum value={0} onChange={() => {}} schema={ro} />);

    expect(screen.getByRole("combobox", { name: "Status" })).toBeDisabled();
  });

  it("warned auf fehlende enum_values und rendert leeren Trigger", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: PropertyMeta = {
      name: "x",
      label_de: "X",
      octrl_type: "Enum",
    };

    render(<OCtrlEnum value={null} onChange={() => {}} schema={broken} />);

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
