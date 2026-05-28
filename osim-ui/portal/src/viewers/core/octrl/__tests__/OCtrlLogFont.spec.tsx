import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OCtrlLogFont } from "@/viewers/core/octrl/OCtrlLogFont";
import type { PropertyMeta } from "@/viewers/core/types";

const schema: PropertyMeta = {
  name: "m_lfSchrift",
  label_de: "Schrift",
  octrl_type: "LOGFONT",
};

describe("OCtrlLogFont", () => {
  it("rendert mit data-octrl-id auf Root-Container", () => {
    const { container } = render(
      <OCtrlLogFont
        value={{ family: "Arial", size: 10 }}
        onChange={() => {}}
        schema={schema}
      />,
    );

    expect(
      container.querySelector("[data-octrl-id='m_lfSchrift']"),
    ).not.toBeNull();
  });

  it("rendert Size-Input mit aktuellem Wert", () => {
    render(
      <OCtrlLogFont
        value={{ family: "Arial", size: 12 }}
        onChange={() => {}}
        schema={schema}
      />,
    );

    expect(screen.getByLabelText(/Größe/i)).toHaveValue(12);
  });

  it("ruft onChange mit gemergedem Object bei Size-Aenderung", () => {
    const onChange = vi.fn();
    render(
      <OCtrlLogFont
        value={{ family: "Arial", size: 10 }}
        onChange={onChange}
        schema={schema}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Größe/i), {
      target: { value: "14" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ family: "Arial", size: 14 }),
    );
  });

  it("rendert Bold + Italic Checkboxes mit aktuellem State", () => {
    render(
      <OCtrlLogFont
        value={{ family: "Arial", size: 10, bold: true, italic: false }}
        onChange={() => {}}
        schema={schema}
      />,
    );

    expect(screen.getByRole("checkbox", { name: /Fett/i })).toHaveAttribute(
      "data-state",
      "checked",
    );
    expect(
      screen.getByRole("checkbox", { name: /Kursiv/i }),
    ).toHaveAttribute("data-state", "unchecked");
  });

  it("liefert Default-Werte wenn value=null", () => {
    render(<OCtrlLogFont value={null} onChange={() => {}} schema={schema} />);

    expect(screen.getByLabelText(/Größe/i)).toHaveValue(10);
  });
});
