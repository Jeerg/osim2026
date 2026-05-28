import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OCtrlVariable } from "@/viewers/core/octrl/OCtrlVariable";
import type { PropertyMeta } from "@/viewers/core/types";

const intSchema: PropertyMeta = {
  name: "m_iDurchfuehrungszeit",
  label_de: "Durchführungszeit",
  octrl_type: "Variable",
  value_type: "int",
};

const stringSchema: PropertyMeta = {
  name: "m_sName",
  label_de: "Name",
  octrl_type: "Variable",
  value_type: "string",
};

const floatSchema: PropertyMeta = {
  name: "m_fFaktor",
  label_de: "Faktor",
  octrl_type: "Variable",
  value_type: "float",
};

describe("OCtrlVariable", () => {
  it("rendert int-Variable mit value als number-Input", () => {
    const onChange = vi.fn();
    render(
      <OCtrlVariable value={42} onChange={onChange} schema={intSchema} />,
    );

    const input = screen.getByLabelText("Durchführungszeit");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveValue(42);
    expect(input).toHaveAttribute("data-octrl-id", "m_iDurchfuehrungszeit");
  });

  it("rendert string-Variable mit type=text", () => {
    const onChange = vi.fn();
    render(
      <OCtrlVariable
        value="Maschine A"
        onChange={onChange}
        schema={stringSchema}
      />,
    );

    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("Maschine A");
  });

  it("ruft onChange mit Integer (number-Typ) bei int-Eingabe", () => {
    // Direkter change-Event statt user.type: vermeidet das Re-Render-Issue
    // bei controlled <input type="number">, ohne Test-State zu mocken.
    const onChange = vi.fn();
    render(<OCtrlVariable value={0} onChange={onChange} schema={intSchema} />);

    const input = screen.getByLabelText("Durchführungszeit");
    fireEvent.change(input, { target: { value: "123" } });

    expect(onChange).toHaveBeenCalledWith(123);
    expect(typeof onChange.mock.calls[0][0]).toBe("number");
  });

  it("ruft onChange mit Float bei float-Eingabe", () => {
    const onChange = vi.fn();
    render(
      <OCtrlVariable value={0} onChange={onChange} schema={floatSchema} />,
    );

    const input = screen.getByLabelText("Faktor");
    fireEvent.change(input, { target: { value: "1.5" } });

    expect(onChange).toHaveBeenCalledWith(1.5);
  });

  it("setzt disabled-Attribut wenn readonly im Schema", () => {
    const readonlySchema: PropertyMeta = { ...intSchema, readonly: true };
    render(
      <OCtrlVariable value={1} onChange={() => {}} schema={readonlySchema} />,
    );

    expect(screen.getByLabelText("Durchführungszeit")).toBeDisabled();
  });

  it("liefert null bei leerer Eingabe wenn nullable", () => {
    const nullableSchema: PropertyMeta = {
      ...intSchema,
      nullable: true,
    };
    const onChange = vi.fn();
    render(
      <OCtrlVariable value={5} onChange={onChange} schema={nullableSchema} />,
    );

    const input = screen.getByLabelText("Durchführungszeit");
    fireEvent.change(input, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("liefert 0 statt null bei leerer Eingabe wenn nicht nullable", () => {
    const onChange = vi.fn();
    render(<OCtrlVariable value={5} onChange={onChange} schema={intSchema} />);
    fireEvent.change(screen.getByLabelText("Durchführungszeit"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});

// userEvent ist im aktuellen File-Stand ungenutzt — Reservation für eine
// spätere Stateful-Test-Variante (z.B. mit useState-Wrapper).
void userEvent;
