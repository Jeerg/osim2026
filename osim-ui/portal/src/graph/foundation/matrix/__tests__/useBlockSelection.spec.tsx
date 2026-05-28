/**
 * useBlockSelection.spec.tsx — Foundation-Welle 1.2-C.
 *
 * Specs für die Block-Select-Mechanik:
 *   - Pure-Functions `computeCellRange`, `isInRange`, `extendSelection`,
 *     `toggleCellInSelection`, `cellKey` (Tests 1-9 — direkt unit-testbar
 *     ohne Hook-Mount).
 *   - Hook `useBlockSelection` via `renderHook` + `act` (Tests 10-15).
 *
 * KEIN Wire-Schema, KEIN Konsumenten-Wissen — der Hook ist foundation-
 * agnostisch (CONTEXT D-5).
 *
 * Pattern-Quelle:
 *   - Render-Test-Pattern: Vorgänger-Welle `useInlineCellEdit.spec.tsx`.
 *   - Ctrl+Drag-Listener-Pattern: `PDurchlaufplanViewerDesign.tsx` Z.400-494
 *     (Welle G25-B — globale pointer-Listener mit Cleanup).
 *
 * Achtung: Der Hook nutzt `data-matrix-row` und `data-matrix-col` Integer-
 * Attribute zur Cell-Identifikation aus Pointer-Events (NICHT das
 * `data-matrix-cell="${rowKey}:${colKey}"`-Attribut der MatrixGrid, weil
 * rowKey/colKey Strings sein können, die selbst Doppelpunkte enthalten —
 * "oid:400". Der Konsument in Welle 1.2-06 setzt zusätzlich die beiden
 * Integer-Indices als Data-Attribute.)
 */

import * as React from "react";
import { describe, expect, it } from "vitest";
import { act, fireEvent, renderHook } from "@testing-library/react";

import {
  cellKey,
  computeCellRange,
  extendSelection,
  isInRange,
  toggleCellInSelection,
  useBlockSelection,
  type CellRange,
} from "@/graph/foundation/matrix/useBlockSelection";

// ============== Pure-Function-Tests (Tests 1-9) ==============

describe("useBlockSelection §pure-functions", () => {
  it("Test 1: computeCellRange normalisiert Start/End-Reihenfolge (Math.min/max)", () => {
    expect(
      computeCellRange({ row: 5, col: 3 }, { row: 2, col: 8 }),
    ).toEqual({ startRow: 2, endRow: 5, startCol: 3, endCol: 8 });
  });

  it("Test 2: computeCellRange mit identischem Start/End → 1-Cell-Range", () => {
    expect(
      computeCellRange({ row: 1, col: 1 }, { row: 1, col: 1 }),
    ).toEqual({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 });
  });

  it("Test 3: isInRange true für Cell innerhalb der Range", () => {
    const r: CellRange = { startRow: 2, endRow: 5, startCol: 3, endCol: 8 };
    expect(isInRange({ row: 3, col: 5 }, r)).toBe(true);
  });

  it("Test 4: isInRange true für Cell auf Range-Border (inklusiver Rand)", () => {
    const r: CellRange = { startRow: 2, endRow: 5, startCol: 3, endCol: 8 };
    expect(isInRange({ row: 5, col: 8 }, r)).toBe(true); // unten-rechts
    expect(isInRange({ row: 2, col: 3 }, r)).toBe(true); // oben-links
  });

  it("Test 5: isInRange false für Cell außerhalb der Range", () => {
    const r: CellRange = { startRow: 2, endRow: 5, startCol: 3, endCol: 8 };
    expect(isInRange({ row: 6, col: 5 }, r)).toBe(false); // row out
    expect(isInRange({ row: 3, col: 2 }, r)).toBe(false); // col out
  });

  it("Test 6: extendSelection(null, cell) → 1-Cell-Range", () => {
    expect(extendSelection(null, { row: 2, col: 3 })).toEqual({
      startRow: 2,
      endRow: 2,
      startCol: 3,
      endCol: 3,
    });
  });

  it("Test 7: extendSelection(existingRange, cell) → erweiterte Range", () => {
    const r: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 };
    expect(extendSelection(r, { row: 5, col: 5 })).toEqual({
      startRow: 0,
      endRow: 5,
      startCol: 0,
      endCol: 5,
    });
  });

  it("Test 8: toggleCellInSelection fügt Cell hinzu wenn nicht drin (Ctrl-Click)", () => {
    const initial = new Set(["1:1"]);
    const result = toggleCellInSelection(initial, { row: 2, col: 2 });
    expect(result.has("1:1")).toBe(true);
    expect(result.has("2:2")).toBe(true);
    expect(result.size).toBe(2);
    // Pure-Function-Disziplin: Original nicht mutiert
    expect(initial.size).toBe(1);
  });

  it("Test 9: toggleCellInSelection entfernt Cell wenn schon drin (Ctrl-Click toggle)", () => {
    const initial = new Set(["1:1", "2:2"]);
    const result = toggleCellInSelection(initial, { row: 1, col: 1 });
    expect(result.has("1:1")).toBe(false);
    expect(result.has("2:2")).toBe(true);
    expect(result.size).toBe(1);
    // Pure-Function-Disziplin
    expect(initial.size).toBe(2);
  });

  it("cellKey baut den standardisierten 'row:col'-String", () => {
    expect(cellKey({ row: 5, col: 3 })).toBe("5:3");
  });
});

// ============== Hook-Tests (Tests 10-15) ==============

/**
 * Helper für pointer-Events: baut ein Cell-Element mit
 * `data-matrix-row` / `data-matrix-col` Integer-Attributen.
 *
 * Im echten Konsumenten (Welle 1.2-06 PRessBelegMatrixViewer) setzt der
 * Cell-Wrapper diese Attribute zusätzlich zu MatrixGrid's
 * `data-matrix-cell="${rowKey}:${colKey}"`.
 */
function makeCellElement(row: number, col: number): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-matrix-row", String(row));
  el.setAttribute("data-matrix-col", String(col));
  document.body.appendChild(el);
  return el;
}

function cleanupCellElements() {
  document.body
    .querySelectorAll("[data-matrix-row]")
    .forEach((el) => el.remove());
}

describe("useBlockSelection §hook", () => {
  it("Test 10: Initial — selection=null, dragStart=null, isSelected(any) false", () => {
    const { result } = renderHook(() => useBlockSelection());
    expect(result.current.selection).toBeNull();
    expect(result.current.dragStart).toBeNull();
    expect(result.current.isSelected({ row: 0, col: 0 })).toBe(false);
    expect(result.current.isSelected({ row: 99, col: 99 })).toBe(false);
  });

  it("Test 11: handleCellPointerDown ohne Modifier → dragStart gesetzt, selection.range = 1-Cell-Range, isSelected(cell) true", () => {
    const { result } = renderHook(() => useBlockSelection());
    act(() => {
      // Mock React.PointerEvent — wir brauchen nur shiftKey/ctrlKey/metaKey
      // + preventDefault (no-op). Cast über unknown ist hier akzeptabel,
      // weil der Hook NUR auf die genannten Felder zugreift.
      const ev = {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 4, col: 7 });
    });
    expect(result.current.dragStart).toEqual({ row: 4, col: 7 });
    expect(result.current.selection?.range).toEqual({
      startRow: 4,
      endRow: 4,
      startCol: 7,
      endCol: 7,
    });
    expect(result.current.isSelected({ row: 4, col: 7 })).toBe(true);
    expect(result.current.isSelected({ row: 5, col: 7 })).toBe(false);
  });

  it("Test 12: ESC-Keyup während Drag → selection=null, dragStart=null", () => {
    const { result } = renderHook(() => useBlockSelection());
    act(() => {
      const ev = {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 2, col: 2 });
    });
    expect(result.current.dragStart).not.toBeNull();

    act(() => {
      fireEvent.keyUp(window, { key: "Escape" });
    });
    expect(result.current.selection).toBeNull();
    expect(result.current.dragStart).toBeNull();
  });

  it("Test 13: Shift-Click extendet existierende Range", () => {
    const { result } = renderHook(() => useBlockSelection());
    // Plain Click → initial-Range
    act(() => {
      const ev = {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 0, col: 0 });
    });
    // Pointer-Up (Cleanup pointerup-Listener)
    act(() => {
      fireEvent.pointerUp(window);
    });
    // Shift-Click extendet die Range
    act(() => {
      const ev = {
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 3, col: 4 });
    });
    expect(result.current.selection?.range).toEqual({
      startRow: 0,
      endRow: 3,
      startCol: 0,
      endCol: 4,
    });
  });

  it("Test 14: Ctrl-Click wechselt in Multi-Cell-Modus, selection.cells enthält die Cell-Keys", () => {
    const { result } = renderHook(() => useBlockSelection());
    act(() => {
      const ev = {
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 1, col: 2 });
    });
    expect(result.current.selection?.cells?.has("1:2")).toBe(true);
    // Weitere Ctrl-Click → 2. Cell hinzu
    act(() => {
      const ev = {
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 3, col: 4 });
    });
    expect(result.current.selection?.cells?.has("3:4")).toBe(true);
    expect(result.current.selection?.cells?.size).toBe(2);
    expect(result.current.isSelected({ row: 1, col: 2 })).toBe(true);
    expect(result.current.isSelected({ row: 3, col: 4 })).toBe(true);
    expect(result.current.isSelected({ row: 9, col: 9 })).toBe(false);
  });

  it("Test 15: clear() resetted Selection + Drag", () => {
    const { result } = renderHook(() => useBlockSelection());
    act(() => {
      const ev = {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 1, col: 1 });
    });
    expect(result.current.selection).not.toBeNull();
    expect(result.current.dragStart).not.toBeNull();

    act(() => {
      result.current.clear();
    });
    expect(result.current.selection).toBeNull();
    expect(result.current.dragStart).toBeNull();
  });

  it("Test 16 (bonus): pointermove während Drag erweitert die Range via DOM-Target", () => {
    const { result } = renderHook(() => useBlockSelection());
    // Initial Drag-Start auf Cell (2,2)
    act(() => {
      const ev = {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 2, col: 2 });
    });

    // Pointer-Move auf eine Cell (5, 7) — Cell-Element mit
    // data-matrix-row/col-Attributen erzeugen.
    //
    // Wichtig: fireEvent.pointerMove auf window setzt e.target nicht
    // auf das Cell-Element (RTL überschreibt es mit window). Stattdessen
    // feuern wir das Event direkt am Cell-Element — der globale Window-
    // Listener fängt es via Bubble-Phase und e.target ist dann korrekt
    // das Cell-Element selbst.
    const targetCell = makeCellElement(5, 7);
    try {
      act(() => {
        fireEvent.pointerMove(targetCell);
      });
      expect(result.current.selection?.range).toEqual({
        startRow: 2,
        endRow: 5,
        startCol: 2,
        endCol: 7,
      });
    } finally {
      cleanupCellElements();
    }
  });

  it("Test 17 (bonus): pointerup während Drag schließt Drag ab, Selection-Range bleibt", () => {
    const { result } = renderHook(() => useBlockSelection());
    act(() => {
      const ev = {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => undefined,
      } as unknown as React.PointerEvent;
      result.current.handleCellPointerDown(ev, { row: 1, col: 1 });
    });
    act(() => {
      fireEvent.pointerUp(window);
    });
    expect(result.current.dragStart).toBeNull();
    // Selection-Range bleibt!
    expect(result.current.selection?.range).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 1,
      endCol: 1,
    });
  });
});
