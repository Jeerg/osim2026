import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OCtrlColorRef } from "@/viewers/core/octrl/OCtrlColorRef";
import type { PropertyMeta } from "@/viewers/core/types";

const schema: PropertyMeta = {
  name: "m_clrFarbe",
  label_de: "Farbe",
  octrl_type: "COLORREF",
};

describe("OCtrlColorRef", () => {
  it("rendert Trigger-Button mit data-octrl-id", () => {
    render(
      <OCtrlColorRef value={0xff8800} onChange={() => {}} schema={schema} />,
    );

    const trigger = screen.getByRole("button", { name: /Farbe/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-octrl-id", "m_clrFarbe");
  });

  it("zeigt aktuellen Farb-Hexcode im Trigger-Button", () => {
    render(
      <OCtrlColorRef value={0xff8800} onChange={() => {}} schema={schema} />,
    );

    // Hexcode wird uppercase angezeigt
    expect(screen.getByText(/#FF8800/i)).toBeInTheDocument();
  });

  it("zeigt Default-Farbe wenn value=null", () => {
    render(
      <OCtrlColorRef value={null} onChange={() => {}} schema={schema} />,
    );

    expect(screen.getByText(/#000000/i)).toBeInTheDocument();
  });

  it("öffnet Color-Picker beim Click auf Trigger", async () => {
    const user = userEvent.setup();
    render(
      <OCtrlColorRef value={0xff8800} onChange={() => {}} schema={schema} />,
    );

    await user.click(screen.getByRole("button", { name: /Farbe/i }));

    // Dialog rendert (Farbpicker liegt im Dialog-Body)
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("ist disabled wenn schema.readonly", () => {
    const ro: PropertyMeta = { ...schema, readonly: true };
    render(<OCtrlColorRef value={0} onChange={() => {}} schema={ro} />);

    expect(screen.getByRole("button", { name: /Farbe/i })).toBeDisabled();
  });

  // Sanity-check: parseInt-/toString-Roundtrip durch die Helper macht keinen
  // Unfug. Wir testen die Helper indirekt über die Darstellung; explizit
  // einen sehr-niedrigen-Wert (0x000ABC) der oft Hex-Padding-Bugs triggert.
  it("padded niedrige Farbwerte korrekt mit Nullen", () => {
    render(
      <OCtrlColorRef value={0x000abc} onChange={() => {}} schema={schema} />,
    );

    expect(screen.getByText(/#000ABC/i)).toBeInTheDocument();
  });
});

void vi; // unused-Workaround falls vi-Imports später wegfallen
