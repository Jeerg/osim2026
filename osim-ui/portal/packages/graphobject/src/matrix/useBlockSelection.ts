/**
 * useBlockSelection — Foundation-Hook für Block-Select-Mechanik (Welle 1.2-C).
 *
 * Pure-Functions + State-Hook für Drag-Rectangle-Selection + Shift-Click-
 * Range-Extension + Ctrl/Meta-Click-Multi-Cell-Toggle. Pattern-Lift aus:
 *
 *   - C++ `PMatrixBaseViewer::OnLButtonDown` Z.220 (MK_CONTROL-Flag-Trigger
 *     für `ShowBoundingRect`-Modus).
 *   - `portal/src/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign.tsx`
 *     Z.400-494 (Welle G25-B Ctrl+Drag mit globalen pointermove/pointerup/
 *     keyup-Listenern und Cleanup im useEffect-return).
 *
 * Architektur (CONTEXT D-5):
 *   - Pure-Functions sind direkt unit-testbar (kein Hook-Mount).
 *   - Hook hält ausschließlich State (`selection`, `dragStart`); globale
 *     Pointer-Listener nur aktiv während eines Drags und mit Cleanup auf
 *     Unmount oder Drag-Ende — Threat T-01.2-08 (hängende Listener).
 *   - Foundation-agnostisch: kennt KEIN Wire-Schema, KEINE Edit-Mode-
 *     Steuerung, KEIN Clipboard-Format. Konsument:
 *       1. ruft `handleCellPointerDown(e, {row, col})` auf jeder Cell.
 *       2. setzt `data-matrix-row` und `data-matrix-col` Integer-Attribute
 *          auf seinen Cell-Wrappern (NICHT das MatrixGrid-eigene
 *          `data-matrix-cell="${rowKey}:${colKey}"` — das kann selbst
 *          Doppelpunkte enthalten ("oid:400") und ist daher als
 *          Pointer-Move-Target-Parse ungeeignet).
 *       3. liest `isSelected({row, col})` für Cell-Highlight.
 *       4. ruft `clear()` bei Modell-Reload o.ä.
 *   - Konflikt mit Edit-Mode: Plain-Click ist hier Drag-Start. Konsument
 *     entscheidet, ob er Edit per Doppelklick (`onDoubleClick`) triggert
 *     oder Ctrl-Click als Block-Select-Trigger nimmt (C++-Treue) und
 *     Plain-Click als Edit. Threat T-01.2-09 (Edit-vs-Select-Konflikt).
 *
 * NICHT in diesem Hook:
 *   - Pfeiltasten-Cell-Navigation (Excel-Style) — deferred bis User-Wunsch.
 *   - Clipboard-Serialize/Deserialize — gehört in Welle 1.2-05
 *     (matrix-clipboard.ts).
 *   - Persistenz der Selection über Component-Unmount — bewusst lokal.
 */

import * as React from "react";

// ----------------------------- Types ----------------------------------

/** Eine einzelne Cell-Position als (row, col)-Integer-Tupel. */
export interface CellRef {
  row: number;
  col: number;
}

/** Rechteckiger Cell-Range, inklusiv an beiden Enden. */
export interface CellRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

/**
 * Block-Selection. Zwei sich gegenseitig ausschließende Repräsentationen:
 *   - `range`: zusammenhängender rechteckiger Bereich (Drag-Rectangle
 *     oder Shift-Click-Extension).
 *   - `cells`: Set einzelner Cell-Keys ("row:col"-Strings) für
 *     diskontinuierliche Multi-Cell-Selection (Ctrl/Meta-Click).
 *
 * In einer aktiven Selection ist genau eines der beiden Felder gesetzt.
 */
export interface BlockSelection {
  range?: CellRange;
  cells?: Set<string>;
}

export interface UseBlockSelectionResult {
  /** Aktuelle Block-Selection oder `null` wenn nichts selektiert. */
  selection: BlockSelection | null;
  /** Cell, auf der der aktive Drag gestartet wurde — `null` außerhalb. */
  dragStart: CellRef | null;
  /**
   * Pointer-Down-Handler — Konsument hängt ihn auf jede Cell. Liest
   * `shiftKey`/`ctrlKey`/`metaKey` aus dem Event und dispatcht entsprechend:
   *   - shift: extend bestehende Range.
   *   - ctrl/meta: toggle Cell in Multi-Cell-Set.
   *   - sonst: neuer Drag, 1-Cell-Range.
   */
  handleCellPointerDown: (e: React.PointerEvent, cell: CellRef) => void;
  /** Pure-Lookup, ob eine Cell aktuell selektiert ist. */
  isSelected: (cell: CellRef) => boolean;
  /** Selection + Drag-Start zurücksetzen. */
  clear: () => void;
}

// --------------------------- Pure Functions ---------------------------

/**
 * Standardisierter Cell-Key für Multi-Cell-Sets — `"${row}:${col}"`.
 * Bewusst nicht via `JSON.stringify` (langsamer + verbose).
 */
export function cellKey(c: CellRef): string {
  return `${c.row}:${c.col}`;
}

/**
 * Baut den minimalen Rechteck-Range, der Start- und End-Cell einschließt.
 * Normalisiert die Reihenfolge via `Math.min`/`Math.max` — egal welche
 * Cell zuerst geklickt wurde, das Resultat ist deterministisch.
 */
export function computeCellRange(start: CellRef, end: CellRef): CellRange {
  return {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endCol: Math.max(start.col, end.col),
  };
}

/** True wenn `cell` innerhalb (oder auf dem Rand) von `range` liegt. */
export function isInRange(cell: CellRef, range: CellRange): boolean {
  return (
    cell.row >= range.startRow &&
    cell.row <= range.endRow &&
    cell.col >= range.startCol &&
    cell.col <= range.endCol
  );
}

/**
 * Erweitert einen bestehenden Range um eine neue Cell (Shift-Click-Pattern).
 * Bei `current === null` liefert sie eine 1-Cell-Range — typischer
 * Erst-Klick-Pfad ohne vorherige Selection.
 *
 * Verankerung: Start des bestehenden Range bleibt der Anker (CONTEXT D-5
 * "Anchor + Focus"); die neue Cell wird zum Focus.
 */
export function extendSelection(
  current: CellRange | null,
  cell: CellRef,
): CellRange {
  if (!current) {
    return {
      startRow: cell.row,
      endRow: cell.row,
      startCol: cell.col,
      endCol: cell.col,
    };
  }
  return computeCellRange(
    { row: current.startRow, col: current.startCol },
    cell,
  );
}

/**
 * Ctrl/Meta-Click-Toggle: fügt Cell zur Selection hinzu, wenn nicht drin —
 * entfernt sie sonst. Pure-Function-Disziplin: das Original-Set wird nicht
 * mutiert; ein neues Set wird zurückgegeben (React-State-Update-Pattern).
 */
export function toggleCellInSelection(
  current: Set<string>,
  cell: CellRef,
): Set<string> {
  const next = new Set(current);
  const k = cellKey(cell);
  if (next.has(k)) {
    next.delete(k);
  } else {
    next.add(k);
  }
  return next;
}

// ---------------------- Helper: DOM-Target → CellRef ------------------

/**
 * Parst aus einem Pointer-Move-Target die Cell-Referenz. Sucht via
 * `closest` nach dem nächsten Vorfahren mit `data-matrix-row`- und
 * `data-matrix-col`-Attributen (beide Integer-strings).
 *
 * Bewusst NICHT `data-matrix-cell="${rowKey}:${colKey}"` parsen — der
 * MatrixGrid-Konsument kann `rowKey`/`colKey` als beliebige Strings setzen,
 * die selbst Doppelpunkte enthalten ("oid:400"). Splitting wäre mehrdeutig.
 *
 * Konsumenten-Vertrag (Welle 1.2-06 PRessBelegMatrixViewer):
 * ```tsx
 * <div data-matrix-row={rowIdx} data-matrix-col={colIdx}>...</div>
 * ```
 */
function cellFromEventTarget(target: EventTarget | null): CellRef | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-matrix-row][data-matrix-col]");
  if (!el) return null;
  const rowStr = el.getAttribute("data-matrix-row");
  const colStr = el.getAttribute("data-matrix-col");
  if (rowStr === null || colStr === null) return null;
  const row = Number(rowStr);
  const col = Number(colStr);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return { row, col };
}

// ------------------------------- Hook ---------------------------------

/**
 * `useBlockSelection()` — Foundation-Hook für Drag-Rectangle + Shift/Ctrl-
 * Click-Selection.
 *
 * Verwendung (skizziert für Welle 1.2-06 `PRessBelegMatrixViewer`):
 *
 * ```tsx
 * const { selection, handleCellPointerDown, isSelected, clear } = useBlockSelection();
 *
 * // In MatrixGrid renderCell:
 * return (
 *   <div
 *     data-matrix-row={rowIdx}
 *     data-matrix-col={colIdx}
 *     data-matrix-cell-selected={isSelected({ row: rowIdx, col: colIdx }) ? "true" : undefined}
 *     onPointerDown={(e) => handleCellPointerDown(e, { row: rowIdx, col: colIdx })}
 *   >...</div>
 * );
 * ```
 *
 * Cleanup-Disziplin (T-01.2-08): die globalen pointermove/pointerup/keyup-
 * Listener werden NUR während eines aktiven Drags registriert (when
 * `dragStart !== null`). Der useEffect-return entfernt sie zuverlässig
 * bei Drag-Ende ODER Component-Unmount.
 */
export function useBlockSelection(): UseBlockSelectionResult {
  const [dragStart, setDragStart] = React.useState<CellRef | null>(null);
  const [selection, setSelection] = React.useState<BlockSelection | null>(
    null,
  );

  const clear = React.useCallback(() => {
    setDragStart(null);
    setSelection(null);
  }, []);

  const handleCellPointerDown = React.useCallback(
    (e: React.PointerEvent, cell: CellRef) => {
      if (e.shiftKey) {
        // Shift-Click: extend bestehende Range. Falls keine Range existiert
        // (z.B. weil zuvor Ctrl-Click-Multi-Cell aktiv war), startet eine
        // frische 1-Cell-Range.
        setSelection((prev) => ({
          range: extendSelection(prev?.range ?? null, cell),
        }));
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        // Ctrl/Meta-Click: toggle Cell im Multi-Cell-Set. Wechselt
        // implizit von Range-Modus in Cells-Modus.
        setSelection((prev) => ({
          cells: toggleCellInSelection(
            prev?.cells ?? new Set<string>(),
            cell,
          ),
        }));
        return;
      }
      // Plain Click: startet einen neuen Drag. preventDefault unterdrückt
      // natives Browser-Text-Selecting (Pattern aus PDurchlaufplanViewer-
      // Design.tsx Z.484 `handleCanvasMouseDownCapture`).
      e.preventDefault();
      setDragStart(cell);
      setSelection({
        range: {
          startRow: cell.row,
          endRow: cell.row,
          startCol: cell.col,
          endCol: cell.col,
        },
      });
    },
    [],
  );

  // Globale Pointer-Listener nur aktiv während eines Drags. Pattern 1:1
  // aus PDurchlaufplanViewerDesign.tsx Z.418-469 (Welle G25-B).
  React.useEffect(() => {
    if (!dragStart) return;
    const onMove = (e: PointerEvent) => {
      const cell = cellFromEventTarget(e.target);
      if (!cell) return;
      setSelection({ range: computeCellRange(dragStart, cell) });
    };
    const onUp = () => {
      // Drag beendet — Selection-Range bleibt erhalten.
      setDragStart(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDragStart(null);
        setSelection(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keyup", onKey);
    };
  }, [dragStart]);

  const isSelected = React.useCallback(
    (cell: CellRef): boolean => {
      if (!selection) return false;
      if (selection.range) return isInRange(cell, selection.range);
      if (selection.cells) return selection.cells.has(cellKey(cell));
      return false;
    },
    [selection],
  );

  return {
    selection,
    dragStart,
    handleCellPointerDown,
    isSelected,
    clear,
  };
}
