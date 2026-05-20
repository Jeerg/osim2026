// Plan 01-06 Task 1: MatrixGrid — generisches 2D-Tabellen-Component.
//
// Reusable Foundation fuer die 3 Matrix-Viewer in Plan 06
// (PRessBeleg/PRessMenge/PRessVerknuepfung) und spaetere Matrix-Sichten
// (Gantt-Plan, AKapBed-Sicht).
//
// Layout: HTML <table> mit sticky <thead> + sticky erstem <th> pro Zeile.
//   - border-collapse + alternierende Zeilen-Bg
//   - sticky-Header: top-0 z-10; Row-Header: left-0 z-10
//
// Cell-Render:
//   - Default basierend auf typeof cellValue:
//     * number  -> <input type="number"> (blur-to-commit, sofort-revert bei NaN)
//     * string  -> <input type="text"> (change-to-commit)
//     * boolean -> <input type="checkbox"> (change-to-commit)
//   - Caller kann via `renderCell(value, onChange, ctx)` ueberschreiben.
//
// Virtualisierung:
//   - Phase-1-Pragmatismus: KEINE built-in Virtualisierung. Die Matrix-
//     Groessen in OSim-Modellen (Dummy.otx: 252 Objekte, Fertigungsstruktur1:
//     ~500 Objekte) ergeben typischerweise <30x30 = <900 Zellen, was der
//     DOM-Renderer locker meistert. Plan 10 (Verification) misst mit
//     Bosch2_wechseln (18 MB); wenn dort eine Belegungs-Matrix >100x100
//     auftritt, kann diese Komponente leicht auf @tanstack/react-virtual
//     umgestellt werden (Interface bleibt stabil).
//   - Der `virtualized`-Prop ist bereits im Interface, aber aktuell ein
//     No-Op (Plan-06-Deviation; siehe SUMMARY.md).

import { memo, useCallback, type ReactNode } from "react";

export type CellKind = "number" | "string" | "boolean";

export interface MatrixGridProps<RowT, ColT, CellValueT> {
  rows: RowT[];
  columns: ColT[];
  getCellValue: (row: RowT, col: ColT) => CellValueT;
  onCellChange: (row: RowT, col: ColT, value: CellValueT) => void;
  rowHeader: (row: RowT) => ReactNode;
  colHeader: (col: ColT) => ReactNode;
  rowKey: (row: RowT) => string | number;
  colKey: (col: ColT) => string | number;
  /**
   * Optionaler eigener Cell-Renderer. Erhaelt zusaetzlich einen
   * onChange-Callback, mit dem die OCtrl-aehnliche Cell ihren Wert
   * zurueck-melden kann. Wenn nicht gesetzt, entscheidet das Grid
   * anhand typeof value selbst (number/string/boolean → input/checkbox).
   */
  renderCell?: (
    value: CellValueT,
    onChange: (v: CellValueT) => void,
    ctx: { row: RowT; col: ColT; readonly: boolean },
  ) => ReactNode;
  readonly?: boolean;
  /**
   * Aktuell No-Op (siehe Comment oben). Bleibt im Interface, damit Plan 10
   * die Virtualisierung ohne Caller-Aenderung nachruesten kann.
   */
  virtualized?: boolean;
  /**
   * Optionaler Test-ID-Praefix; default "matrix-grid".
   */
  testId?: string;
  /**
   * Optionale Disabled-Condition pro (row, col) — z.B. fuer
   * Diagonal-Disable beim PRessVerknuepfungViewer (Ressource mit sich
   * selbst).
   */
  isDisabled?: (row: RowT, col: ColT) => boolean;
  /**
   * Tooltip / aria-label fuer das ganze Grid.
   */
  ariaLabel?: string;
}

// -------------------------------------------------------------------------
// Default-Renderer: pro typeof value eine sinnvolle OCtrl-Variante.
// -------------------------------------------------------------------------

function NumberCell({
  value,
  onChange,
  disabled,
  testId,
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  disabled: boolean;
  testId: string;
}) {
  // Kontrollierter Input: zeigt den Store-Wert.
  // Validierung wie OCtrlVariable (NaN -> kein setValue, Input-Display
  // bleibt kurz inkonsistent bis Store re-rendert).
  return (
    <input
      type="number"
      value={value == null ? "" : String(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw.trim() === "") return;
        const parsed = parseFloat(raw);
        if (Number.isNaN(parsed)) return;
        onChange(parsed);
      }}
      data-testid={testId}
      className="w-full border-none bg-transparent px-1 py-0.5 text-right text-xs focus:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:text-gray-400"
    />
  );
}

function StringCell({
  value,
  onChange,
  disabled,
  testId,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <input
      type="text"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testId}
      className="w-full border-none bg-transparent px-1 py-0.5 text-xs focus:bg-blue-50 focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:text-gray-400"
    />
  );
}

function BoolCell({
  value,
  onChange,
  disabled,
  testId,
}: {
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <input
      type="checkbox"
      checked={Boolean(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      data-testid={testId}
      className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500 disabled:bg-gray-100"
    />
  );
}

function detectKind(v: unknown): CellKind {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  return "string";
}

// -------------------------------------------------------------------------
// Memoized Cell-Wrapper. Verhindert unnoetige Re-Renders, wenn der Store
// nur EINE Zelle aktualisiert.
// -------------------------------------------------------------------------

interface CellComponentProps {
  testId: string;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
  /** Falls gesetzt: custom-Renderer aus dem Caller. */
  customRender?: ReactNode;
}

const CellComponent = memo(function CellComponentInner({
  testId,
  value,
  disabled,
  onChange,
  customRender,
}: CellComponentProps) {
  if (customRender !== undefined) return <>{customRender}</>;
  const kind = detectKind(value);
  if (kind === "boolean") {
    return (
      <BoolCell
        value={value as boolean | null | undefined}
        onChange={onChange as (v: boolean) => void}
        disabled={disabled}
        testId={testId}
      />
    );
  }
  if (kind === "number") {
    return (
      <NumberCell
        value={value as number | null | undefined}
        onChange={onChange as (v: number) => void}
        disabled={disabled}
        testId={testId}
      />
    );
  }
  return (
    <StringCell
      value={value as string | null | undefined}
      onChange={onChange as (v: string) => void}
      disabled={disabled}
      testId={testId}
    />
  );
});

// -------------------------------------------------------------------------
// MatrixGrid — Hauptkomponente.
// -------------------------------------------------------------------------

export function MatrixGrid<RowT, ColT, CellValueT>(
  props: MatrixGridProps<RowT, ColT, CellValueT>,
) {
  const {
    rows,
    columns,
    getCellValue,
    onCellChange,
    rowHeader,
    colHeader,
    rowKey,
    colKey,
    renderCell,
    readonly = false,
    testId = "matrix-grid",
    isDisabled,
    ariaLabel,
  } = props;

  // Stabile onChange-Closure pro (row, col). Memoized im Cell-Render-Pfad,
  // damit identische Identitaet → CellComponent.memo greift.
  const makeOnChange = useCallback(
    (row: RowT, col: ColT) => (v: CellValueT) => onCellChange(row, col, v),
    [onCellChange],
  );

  if (rows.length === 0 || columns.length === 0) {
    return (
      <div
        className="rounded border border-gray-200 bg-gray-50 p-4 text-sm italic text-gray-500"
        data-testid={`${testId}-empty`}
      >
        Keine Daten zum Anzeigen.
      </div>
    );
  }

  return (
    <div
      className="overflow-auto rounded border border-gray-200"
      data-testid={testId}
      aria-label={ariaLabel}
    >
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-white shadow-sm">
          <tr>
            <th
              className="sticky left-0 z-20 border-b border-r border-gray-200 bg-white px-2 py-1 text-left font-medium text-gray-700"
              scope="col"
            >
              {/* leerer Eck-Header */}
            </th>
            {columns.map((c) => (
              <th
                key={colKey(c)}
                scope="col"
                className="border-b border-r border-gray-200 bg-white px-2 py-1 text-left font-medium text-gray-700 last:border-r-0"
                data-testid={`${testId}-col-header-${colKey(c)}`}
              >
                {colHeader(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, rowIdx) => {
            const rk = rowKey(r);
            return (
              <tr
                key={rk}
                className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                data-testid={`${testId}-row-${rk}`}
              >
                <th
                  scope="row"
                  className={`sticky left-0 z-10 border-b border-r border-gray-200 px-2 py-1 text-left font-medium text-gray-700 ${
                    rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                  }`}
                  data-testid={`${testId}-row-header-${rk}`}
                >
                  {rowHeader(r)}
                </th>
                {columns.map((c) => {
                  const ck = colKey(c);
                  const value = getCellValue(r, c);
                  const cellDisabled =
                    readonly || (isDisabled ? isDisabled(r, c) : false);
                  const cellTestId = `${testId}-cell-${rk}-${ck}`;
                  const onChange = makeOnChange(r, c);

                  const custom =
                    renderCell !== undefined
                      ? renderCell(value, onChange, {
                          row: r,
                          col: c,
                          readonly: cellDisabled,
                        })
                      : undefined;

                  return (
                    <td
                      key={ck}
                      className="border-b border-r border-gray-200 p-0 last:border-r-0"
                    >
                      <CellComponent
                        testId={cellTestId}
                        value={value as unknown}
                        disabled={cellDisabled}
                        onChange={onChange as (v: unknown) => void}
                        customRender={custom}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

MatrixGrid.displayName = "MatrixGrid";
