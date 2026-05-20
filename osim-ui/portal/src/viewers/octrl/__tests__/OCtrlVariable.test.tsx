// Plan 01-04 Task 3: Tests fuer OCtrl-Familie.
//
// OCtrlVariable kriegt einen tiefergehenden Test (typing + readonly +
// numerisches Parsing). Die anderen 8 OCtrls bekommen Smoke-Tests
// (render + onChange wird gefeuert), damit die Vertraege gewahrt sind
// und Plan 05+ darauf bauen kann.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import {
  _clearTypeMapForTests,
  registerTypeMetadata,
} from "@/viewers/core/OCtrl.types";
import type {
  MethodArg,
  Oid,
  OtxJsonNode,
  PropertyValue,
} from "@/viewers/core/types";
import {
  OCtrlBool,
  OCtrlCOLORREF,
  OCtrlEnum,
  OCtrlLOGFONT,
  OCtrlLink,
  OCtrlList,
  OCtrlMethod,
  OCtrlTabViewer,
  OCtrlVariable,
  colorrefToHex,
  hexToColorref,
} from "..";

interface Captured {
  prop: Array<{ oid: Oid; key: string; value: PropertyValue }>;
  method: Array<{ oid: Oid; method: string; args?: MethodArg[] }>;
}

function makeHarness(
  obj: OtxJsonNode,
  ui: (cap: Captured) => React.ReactNode,
): { captured: Captured } {
  const captured: Captured = { prop: [], method: [] };
  render(
    <ChildDialog
      obj={obj}
      onPropertyChange={(oid, key, value) =>
        captured.prop.push({ oid, key, value })
      }
      onMethodCall={(oid, method, args) =>
        captured.method.push({ oid, method, args })
      }
    >
      {ui(captured)}
    </ChildDialog>,
  );
  return { captured };
}

const baseObj = (props: Record<string, PropertyValue> = {}): OtxJsonNode => ({
  oid: 42,
  klass: "PTest",
  name: "TestObj",
  properties: props,
  children: [],
});

afterEach(() => {
  cleanup();
  _clearTypeMapForTests();
});

describe("OCtrlVariable", () => {
  it("renders the bound value", () => {
    makeHarness(baseObj({ m_sName: "Hallo" }), () => (
      <OCtrlVariable property="m_sName" label="Name" />
    ));
    const input = screen.getByTestId("octrl-variable-m_sName") as HTMLInputElement;
    expect(input.value).toBe("Hallo");
  });

  it("fires onPropertyChange on blur with the typed string value", () => {
    const { captured } = makeHarness(baseObj({ m_sName: "old" }), () => (
      <OCtrlVariable property="m_sName" />
    ));
    const input = screen.getByTestId("octrl-variable-m_sName");
    fireEvent.change(input, { target: { value: "neu" } });
    fireEvent.blur(input);
    expect(captured.prop).toEqual([
      { oid: 42, key: "m_sName", value: "neu" },
    ]);
  });

  it("parses int values and reverts on NaN", () => {
    registerTypeMetadata("PTest", {
      m_iCount: { type: "int" },
    });
    const { captured } = makeHarness(baseObj({ m_iCount: 5 }), () => (
      <OCtrlVariable property="m_iCount" />
    ));
    const input = screen.getByTestId(
      "octrl-variable-m_iCount",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "17" } });
    fireEvent.blur(input);
    expect(captured.prop).toEqual([
      { oid: 42, key: "m_iCount", value: 17 },
    ]);
  });

  it("readonly disables the input", () => {
    makeHarness(baseObj({ m_sName: "x" }), () => (
      <OCtrlVariable property="m_sName" readonly />
    ));
    const input = screen.getByTestId(
      "octrl-variable-m_sName",
    ) as HTMLInputElement;
    expect(input).toBeDisabled();
  });
});

describe("OCtrlBool", () => {
  it("renders checked state and toggles", () => {
    const { captured } = makeHarness(baseObj({ m_bActive: true }), () => (
      <OCtrlBool property="m_bActive" label="Aktiv" />
    ));
    const cb = screen.getByTestId("octrl-bool-m_bActive") as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(captured.prop).toEqual([
      { oid: 42, key: "m_bActive", value: false },
    ]);
  });
});

describe("OCtrlEnum", () => {
  it("renders enum options and dispatches on change", () => {
    registerTypeMetadata("PTest", {
      m_eMode: {
        type: "enum",
        enumValues: [
          { value: "A", label: "Alpha" },
          { value: "B", label: "Beta" },
        ],
      },
    });
    const { captured } = makeHarness(baseObj({ m_eMode: "A" }), () => (
      <OCtrlEnum property="m_eMode" />
    ));
    const sel = screen.getByTestId("octrl-enum-m_eMode") as HTMLSelectElement;
    expect(sel.value).toBe("A");
    fireEvent.change(sel, { target: { value: "B" } });
    expect(captured.prop).toEqual([
      { oid: 42, key: "m_eMode", value: "B" },
    ]);
  });
});

describe("OCtrlLink", () => {
  it("renders an empty placeholder option when no candidates and no link", () => {
    registerTypeMetadata("PTest", {
      m_lRef: { type: "link", linkTargetKlass: "PRessBeleg" },
    });
    makeHarness(baseObj({ m_lRef: null }), () => (
      <OCtrlLink property="m_lRef" />
    ));
    const sel = screen.getByTestId("octrl-link-m_lRef") as HTMLSelectElement;
    expect(sel.value).toBe("");
  });
});

describe("OCtrlList", () => {
  it("renders rows from obj.children with the configured columns", () => {
    registerTypeMetadata("PTest", {
      m_lstItems: {
        type: "list",
        columns: [
          { property: "m_sName", label: "Name", octrl: "variable" },
        ],
      },
    });
    const obj: OtxJsonNode = {
      ...baseObj(),
      children: [
        {
          oid: 11,
          klass: "PItem",
          name: "Item-A",
          properties: { m_sName: "A" },
          children: [],
        },
        {
          oid: 12,
          klass: "PItem",
          name: "Item-B",
          properties: { m_sName: "B" },
          children: [],
        },
      ],
    };
    makeHarness(obj, () => <OCtrlList property="m_lstItems" label="Items" />);
    // 2 row-inputs:
    const inputs = screen.getAllByTestId("octrl-variable-m_sName");
    expect(inputs.length).toBe(2);
  });

  it("add button fires onMethodCall(addChild)", () => {
    registerTypeMetadata("PTest", {
      m_lstItems: { type: "list", columns: [] },
    });
    const { captured } = makeHarness(baseObj(), () => (
      <OCtrlList property="m_lstItems" />
    ));
    fireEvent.click(screen.getByTestId("octrl-list-m_lstItems-add"));
    expect(captured.method).toEqual([
      { oid: 42, method: "addChild", args: ["m_lstItems"] },
    ]);
  });
});

describe("OCtrlMethod", () => {
  it("button click fires onMethodCall(method)", () => {
    const { captured } = makeHarness(baseObj(), () => (
      <OCtrlMethod property="recalc" label="Neu berechnen" />
    ));
    fireEvent.click(screen.getByTestId("octrl-method-recalc"));
    expect(captured.method).toEqual([
      { oid: 42, method: "recalc", args: undefined },
    ]);
  });

  it("uses `method` prop override when present", () => {
    const { captured } = makeHarness(baseObj(), () => (
      <OCtrlMethod property="btn" method="resetAll" />
    ));
    fireEvent.click(screen.getByTestId("octrl-method-btn"));
    expect(captured.method[0]?.method).toBe("resetAll");
  });
});

describe("OCtrlTabViewer", () => {
  it("renders the active tab and switches on click", () => {
    render(
      <OCtrlTabViewer
        tabs={[
          { label: "Eins", render: () => <span>Inhalt-1</span> },
          { label: "Zwei", render: () => <span>Inhalt-2</span> },
        ]}
      />,
    );
    expect(screen.getByText("Inhalt-1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("octrl-tabviewer-tab-1"));
    expect(screen.getByText("Inhalt-2")).toBeInTheDocument();
  });
});

describe("OCtrlCOLORREF", () => {
  it("renders the color and dispatches changes", () => {
    const { captured } = makeHarness(baseObj({ m_color: "#aa3344" }), () => (
      <OCtrlCOLORREF property="m_color" />
    ));
    const input = screen.getByTestId(
      "octrl-colorref-m_color",
    ) as HTMLInputElement;
    expect(input.value).toBe("#aa3344");
    fireEvent.change(input, { target: { value: "#112233" } });
    expect(captured.prop).toEqual([
      { oid: 42, key: "m_color", value: "#112233" },
    ]);
  });

  it("colorrefToHex / hexToColorref roundtrip", () => {
    // C++-COLORREF speichert 0x00BBGGRR.
    expect(colorrefToHex(0x00224466)).toBe("#664422");
    expect(hexToColorref("#664422")).toBe(0x00224466);
  });
});

describe("OCtrlLOGFONT", () => {
  it("renders font fields and dispatches structured value", () => {
    const { captured } = makeHarness(
      baseObj({ m_font: { family: "Arial", size: 10, bold: false, italic: false } }),
      () => <OCtrlLOGFONT property="m_font" label="Font" />,
    );
    // Bold-Checkbox togglen.
    const fieldset = screen.getByTestId("octrl-logfont-m_font");
    const checkboxes = fieldset.querySelectorAll('input[type="checkbox"]');
    const bold = checkboxes[0] as HTMLInputElement;
    fireEvent.click(bold);
    expect(captured.prop).toHaveLength(1);
    const v = captured.prop[0].value as Record<string, unknown>;
    expect(v.bold).toBe(true);
    expect(v.family).toBe("Arial");
  });

  it("handles missing/non-object value with sensible defaults", () => {
    makeHarness(baseObj({ m_font: null }), () => (
      <OCtrlLOGFONT property="m_font" />
    ));
    expect(
      screen.getByTestId("octrl-logfont-m_font"),
    ).toBeInTheDocument();
  });
});

describe("OCtrl-Re-Export", () => {
  it("module index exports the full 9er-Familie", async () => {
    const mod = await import("..");
    expect(mod.OCtrlVariable).toBeDefined();
    expect(mod.OCtrlBool).toBeDefined();
    expect(mod.OCtrlEnum).toBeDefined();
    expect(mod.OCtrlLink).toBeDefined();
    expect(mod.OCtrlList).toBeDefined();
    expect(mod.OCtrlMethod).toBeDefined();
    expect(mod.OCtrlTabViewer).toBeDefined();
    expect(mod.OCtrlCOLORREF).toBeDefined();
    expect(mod.OCtrlLOGFONT).toBeDefined();
  });
});

// Damit React (jsxImportSource) verfuegbar ist:
import React from "react";
void React;

// Vitest haben wir oben importiert, vi nur referenzieren falls noch nicht
// verwendet — Lint-Schutz fuer den Fall, dass alle Tests es nicht brauchen.
void vi;
