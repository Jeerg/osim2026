import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OCtrlBool } from "@/viewers/core/octrl/OCtrlBool";
import type { PropertyMeta } from "@/viewers/core/types";

const schema: PropertyMeta = {
  name: "m_bAktiv",
  label_de: "Aktiv",
  octrl_type: "Bool",
  value_type: "boolean",
};

describe("OCtrlBool", () => {
  it("rendert Label und Checkbox mit data-octrl-id", () => {
    render(<OCtrlBool value={true} onChange={() => {}} schema={schema} />);

    const checkbox = screen.getByRole("checkbox", { name: "Aktiv" });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute("data-octrl-id", "m_bAktiv");
    expect(checkbox).toHaveAttribute("data-state", "checked");
  });

  it("rendert unchecked wenn value=false", () => {
    render(<OCtrlBool value={false} onChange={() => {}} schema={schema} />);

    const checkbox = screen.getByRole("checkbox", { name: "Aktiv" });
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });

  it("rendert unchecked wenn value=null", () => {
    render(<OCtrlBool value={null} onChange={() => {}} schema={schema} />);

    const checkbox = screen.getByRole("checkbox", { name: "Aktiv" });
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });

  it("ruft onChange(true) bei click auf unchecked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OCtrlBool value={false} onChange={onChange} schema={schema} />);

    await user.click(screen.getByRole("checkbox", { name: "Aktiv" }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("ruft onChange(false) bei click auf checked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OCtrlBool value={true} onChange={onChange} schema={schema} />);

    await user.click(screen.getByRole("checkbox", { name: "Aktiv" }));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("ist disabled wenn schema.readonly", () => {
    const ro: PropertyMeta = { ...schema, readonly: true };
    render(<OCtrlBool value={true} onChange={() => {}} schema={ro} />);

    expect(screen.getByRole("checkbox", { name: "Aktiv" })).toBeDisabled();
  });
});
