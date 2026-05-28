/**
 * useInlineCellEdit.spec.tsx — Foundation-Welle 1.2-B.
 *
 * Specs für den Inline-Cell-Edit-Hook. Testet die reine Pure-Function
 * `parseRaw` direkt (Tests 5-9, 11) sowie die Hook-State-Machine via
 * `renderHook` (Tests 1-4, 10) und das gerenderte `EditorElement` via
 * `<TestComponent>` + `fireEvent` (Tests 12-14).
 *
 * KEIN Wire-Schema, KEIN Konsumenten-Wissen — der Hook ist foundation-
 * agnostisch (CONTEXT D-4).
 *
 * Pattern-Quelle:
 *   - Render-Test-Pattern: `MatrixCell.spec.tsx` (gleiche Welle).
 *   - Hook-Test-Pattern: `@testing-library/react` `renderHook` + `act`.
 *   - Parser-Lift: `portal/src/viewers/PRess/matrix-common.tsx` Z.174-186.
 */

import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook } from "@testing-library/react";

import {
  parseRaw,
  useInlineCellEdit,
  type UseInlineCellEditOptions,
} from "../useInlineCellEdit";

// ---------- Helper: minimal Test-Wrapper für Render-Tests --------------

/**
 * Test-Component, die `useInlineCellEdit` aufruft und das `EditorElement`
 * rendert. Optional wird beim Mount `startEdit()` ausgeführt (default true),
 * damit das Editor-Element sofort sichtbar ist und per `fireEvent` traktiert
 * werden kann.
 */
function TestComponent<TVal>(props: {
  opts: UseInlineCellEditOptions<TVal>;
  autoStart?: boolean;
}): React.ReactElement {
  const { editing, startEdit, EditorElement } = useInlineCellEdit<TVal>(props.opts);
  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if ((props.autoStart ?? true) && !startedRef.current) {
      startedRef.current = true;
      startEdit();
    }
  }, [props.autoStart, startEdit]);
  return (
    <div data-testid="wrap" data-editing={editing ? "1" : "0"}>
      {EditorElement}
    </div>
  );
}

describe("useInlineCellEdit Welle 1.2-B", () => {
  // ----------------------- State-Machine-Tests -------------------------

  it("Test 1: Initial state — editing=false, EditorElement=null, callable functions", () => {
    const { result } = renderHook(() =>
      useInlineCellEdit<number>({
        cellId: "r1:c1",
        value: 0,
        onCommit: vi.fn(),
        octrlType: "Variable",
        valueType: "int",
      }),
    );
    expect(result.current.editing).toBe(false);
    expect(result.current.EditorElement).toBeNull();
    expect(typeof result.current.startEdit).toBe("function");
    expect(typeof result.current.commit).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
  });

  it("Test 2: startEdit() → editing=true, EditorElement ist ein ReactElement", () => {
    const { result } = renderHook(() =>
      useInlineCellEdit<number>({
        cellId: "r1:c1",
        value: 0,
        onCommit: vi.fn(),
        octrlType: "Variable",
        valueType: "int",
      }),
    );
    act(() => {
      result.current.startEdit();
    });
    expect(result.current.editing).toBe(true);
    expect(result.current.EditorElement).not.toBeNull();
    expect(React.isValidElement(result.current.EditorElement)).toBe(true);
  });

  it("Test 3: readOnly=true → startEdit() ist no-op, editing bleibt false", () => {
    const { result } = renderHook(() =>
      useInlineCellEdit<number>({
        cellId: "r1:c1",
        value: 0,
        onCommit: vi.fn(),
        readOnly: true,
        octrlType: "Variable",
        valueType: "int",
      }),
    );
    act(() => {
      result.current.startEdit();
    });
    expect(result.current.editing).toBe(false);
    expect(result.current.EditorElement).toBeNull();
  });

  it("Test 4: commit('42') Variable+int → onCommit(42) + editing=false", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useInlineCellEdit<number>({
        cellId: "r1:c1",
        value: 0,
        onCommit,
        octrlType: "Variable",
        valueType: "int",
      }),
    );
    act(() => {
      result.current.startEdit();
    });
    act(() => {
      result.current.commit("42");
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(42);
    expect(result.current.editing).toBe(false);
  });

  it("Test 5: commit('abc') Variable+int → onCommit(0) (NaN-Fallback)", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useInlineCellEdit<number>({
        cellId: "r1:c1",
        value: 0,
        onCommit,
        octrlType: "Variable",
        valueType: "int",
      }),
    );
    act(() => {
      result.current.commit("abc");
    });
    expect(onCommit).toHaveBeenCalledWith(0);
  });

  it("Test 6: commit('3.14') Variable+float → onCommit(3.14)", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useInlineCellEdit<number>({
        cellId: "r1:c1",
        value: 0,
        onCommit,
        octrlType: "Variable",
        valueType: "float",
      }),
    );
    act(() => {
      result.current.commit("3.14");
    });
    expect(onCommit).toHaveBeenCalledWith(3.14);
  });

  it("Test 7: commit('hi') Variable+string → onCommit('hi')", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useInlineCellEdit<string>({
        cellId: "r1:c1",
        value: "",
        onCommit,
        octrlType: "Variable",
        valueType: "string",
      }),
    );
    act(() => {
      result.current.commit("hi");
    });
    expect(onCommit).toHaveBeenCalledWith("hi");
  });

  it("Test 8: commit('2') Enum → onCommit(2) (Number cast)", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useInlineCellEdit<number>({
        cellId: "r1:c1",
        value: 0,
        onCommit,
        octrlType: "Enum",
        enumValues: [
          { value: 1, label_de: "Eins" },
          { value: 2, label_de: "Zwei" },
        ],
      }),
    );
    act(() => {
      result.current.commit("2");
    });
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it("Test 9: commit(true) Bool → onCommit(true)", () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useInlineCellEdit<boolean>({
        cellId: "r1:c1",
        value: false,
        onCommit,
        octrlType: "Bool",
      }),
    );
    act(() => {
      result.current.commit(true);
    });
    expect(onCommit).toHaveBeenCalledWith(true);
  });

  it("Test 10: cancel() → onCancel aufgerufen + editing=false", () => {
    const onCancel = vi.fn();
    const { result } = renderHook(() =>
      useInlineCellEdit<number>({
        cellId: "r1:c1",
        value: 0,
        onCommit: vi.fn(),
        onCancel,
        octrlType: "Variable",
        valueType: "int",
      }),
    );
    act(() => {
      result.current.startEdit();
    });
    act(() => {
      result.current.cancel();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(result.current.editing).toBe(false);
  });

  // ----------------------- parseRaw-Pure-Function ----------------------

  it("Test 11: parseRaw direkt — alle Branches abgedeckt", () => {
    // Variable + int
    expect(parseRaw("", "Variable", "int")).toBe(0);
    expect(parseRaw(null, "Variable", "int")).toBe(0);
    expect(parseRaw("42", "Variable", "int")).toBe(42);
    expect(parseRaw("abc", "Variable", "int")).toBe(0);
    // Variable + float
    expect(parseRaw("", "Variable", "float")).toBe(0);
    expect(parseRaw(null, "Variable", "float")).toBe(0);
    expect(parseRaw("3.14", "Variable", "float")).toBeCloseTo(3.14);
    expect(parseRaw("xyz", "Variable", "float")).toBe(0);
    // Variable + string (default valueType)
    expect(parseRaw("hello", "Variable")).toBe("hello");
    expect(parseRaw("hello", "Variable", "string")).toBe("hello");
    // Enum
    expect(parseRaw("7", "Enum")).toBe(7);
    expect(parseRaw(3, "Enum")).toBe(3);
    // Bool
    expect(parseRaw(true, "Bool")).toBe(true);
    expect(parseRaw(false, "Bool")).toBe(false);
    expect(parseRaw("", "Bool")).toBe(false);
    expect(parseRaw("x", "Bool")).toBe(true);
  });

  // ----------------------- Render-Interaktions-Tests -------------------

  it("Test 12: Variable-Editor — Enter, ESC, Blur Verhalten", () => {
    // 12a: Enter triggert commit
    {
      const onCommit = vi.fn();
      const onCancel = vi.fn();
      const { container, unmount } = render(
        <TestComponent
          opts={{
            cellId: "r1:c1",
            value: 0,
            onCommit,
            onCancel,
            octrlType: "Variable",
            valueType: "int",
          }}
        />,
      );
      const input = container.querySelector("input") as HTMLInputElement;
      expect(input).not.toBeNull();
      fireEvent.change(input, { target: { value: "17" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onCommit).toHaveBeenCalledWith(17);
      expect(onCancel).not.toHaveBeenCalled();
      unmount();
    }
    // 12b: ESC triggert cancel
    {
      const onCommit = vi.fn();
      const onCancel = vi.fn();
      const { container, unmount } = render(
        <TestComponent
          opts={{
            cellId: "r1:c1",
            value: 0,
            onCommit,
            onCancel,
            octrlType: "Variable",
            valueType: "int",
          }}
        />,
      );
      const input = container.querySelector("input") as HTMLInputElement;
      fireEvent.keyDown(input, { key: "Escape" });
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onCommit).not.toHaveBeenCalled();
      unmount();
    }
    // 12c: Blur triggert commit
    {
      const onCommit = vi.fn();
      const { container, unmount } = render(
        <TestComponent
          opts={{
            cellId: "r1:c1",
            value: 0,
            onCommit,
            octrlType: "Variable",
            valueType: "int",
          }}
        />,
      );
      const input = container.querySelector("input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "9" } });
      fireEvent.blur(input);
      expect(onCommit).toHaveBeenCalledWith(9);
      unmount();
    }
  });

  it("Test 13: Enum-Editor (select) onChange → commit mit Number(value)", () => {
    // 13a: onChange triggert commit. Nach commit ist der Editor weg
    // (editing=false), daher in eigenem Render-Block isoliert (analog Test 12).
    {
      const onCommit = vi.fn();
      const { container, unmount } = render(
        <TestComponent
          opts={{
            cellId: "r1:c1",
            value: 1,
            onCommit,
            octrlType: "Enum",
            enumValues: [
              { value: 1, label_de: "Eins" },
              { value: 2, label_de: "Zwei" },
              { value: 3, label_de: "Drei" },
            ],
          }}
        />,
      );
      const select = container.querySelector("select") as HTMLSelectElement;
      expect(select).not.toBeNull();
      fireEvent.change(select, { target: { value: "3" } });
      expect(onCommit).toHaveBeenCalledWith(3);
      unmount();
    }
    // 13b: ESC im select triggert cancel (eigener Render-Block — sonst ist der
    // Editor nach dem commit schon aus dem DOM).
    {
      const onCancel = vi.fn();
      const { container, unmount } = render(
        <TestComponent
          opts={{
            cellId: "r1:c1",
            value: 1,
            onCommit: vi.fn(),
            onCancel,
            octrlType: "Enum",
            enumValues: [
              { value: 1, label_de: "Eins" },
              { value: 2, label_de: "Zwei" },
            ],
          }}
        />,
      );
      const select = container.querySelector("select") as HTMLSelectElement;
      fireEvent.keyDown(select, { key: "Escape" });
      expect(onCancel).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("Test 14: Bool-Editor (checkbox) onChange → commit(Boolean(checked))", () => {
    const onCommit = vi.fn();
    const { container } = render(
      <TestComponent
        opts={{
          cellId: "r1:c1",
          value: false,
          onCommit,
          octrlType: "Bool",
        }}
      />,
    );
    const checkbox = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox);
    expect(onCommit).toHaveBeenCalledWith(true);
  });
});
