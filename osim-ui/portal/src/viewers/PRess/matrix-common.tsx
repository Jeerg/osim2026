/**
 * matrix-common.tsx — Wiederverwendbarer `<MatrixTable>`-Component fuer
 * die Ressourcen-Matrix-Viewer-Familie (Phase 1: PRessMenge; ab Welle
 * 1.2-E auch die echten Belegungs- und Verknuepfungs-Matrizen aus
 * portal/src/viewers/PRessBelegMatrix/).
 *
 * Hinweis 2026-05-25 (Pre-Cleanup 01.2-01): die Phase-1-Stubs unter
 * portal/src/viewers/PRess/PRess*Viewer.tsx wurden entfernt, weil sie
 * konzeptionell von der OSim2004-Vorlage abwichen. Diese Foundation-Datei
 * wird in Welle 1.2-B als Hook in die neue MatrixGrid-Foundation gelift;
 * bis dahin bleibt PRessMengeMatrixViewer ihr einziger Konsument.
 *
 * C++-Konzeptvorlage:
 *   - PRessMengeMatrixOGCtrl in `OSim2004/inc/PRessMengeMatrixViewer.h`
 *     (Pendant fuer die Mengen-Matrix). Die Belegungs-Matrix-Vorlage liegt
 *     in `OSim2004/inc/PRessBelegMatrixViewer.h` und wird in Welle 1.2-E
 *     direkt referenziert.
 *   - Das Original nutzt MFC-`OGraphGrid` als Cell-Renderer. Wir bauen die
 *     Tabelle in der Web-Variante mit der shadcn-`<Table>`-Foundation (siehe
 *     `portal/src/components/ui/table.tsx`) und Click-to-Edit pro Zelle.
 *
 * Design-Entscheidungen:
 *  - Generic ueber `TRow` damit Belegungs-, Mengen- und Verknuepfungs-Reihen
 *    typsicher bleiben (keine `any`-Cells in Konsumenten).
 *  - Edit-State ist intern (`useState<{rowKey, columnKey} | null>`), nicht
 *    propagiert: nur der commit-Wert geht via `onCellEdit` raus. Damit ist
 *    der Cell-Editor stateless aus Sicht des Konsumenten.
 *  - Helper `renderEditCell` switched ueber `column.octrl_type`:
 *      Variable → `<Input>`     (Auto-Focus, Enter/Blur → commit, Esc → cancel)
 *      Enum     → `<select>`    (Schema-driven options, Change → commit)
 *      Bool     → Checkbox      (Change → commit sofort, kein Cancel-Pfad)
 *  - Sticky-Header via CSS-only (`sticky top-0`); funktioniert in jedem
 *    scrollbaren Parent-Container (Workspace-Hauptbereich, ChildDialog-Body).
 *  - Empty-State (rows.length === 0): zentrierter Hint statt Tabellenrahmen.
 *
 * Phase-1-Scope: lesen + edit-on-click. Sortierung, Filterung,
 * Spalten-Resize, Virtualisierung sind Phase-4-Backlog (T-09-01 in der
 * Plan-09-Threat-Tabelle).
 */

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Spalten-Definition fuer `<MatrixTable>`.
 *
 *  - `key`        — Pflicht. Eindeutiger String pro Spalte. Wird auch als
 *                   columnKey in `onCellEdit(row, columnKey, value)` gemeldet.
 *  - `label`      — Header-Text (deutsch).
 *  - `octrl_type` — entscheidet welcher Editor in der Cell gerendert wird.
 *  - `value_type` — fuer `octrl_type==="Variable"` (string|int|float).
 *  - `enum_values` — fuer `octrl_type==="Enum"`.
 *  - `readonly`   — Cell zeigt nur Wert, kein Click-to-Edit.
 *  - `width`      — CSS-width-String (z.B. `"200px"` oder `"15%"`).
 *  - `accessor`   — wenn gesetzt, liefert er den Wert aus row; sonst wird
 *                   `(row as any)[key]` benutzt. Pflicht fuer Verschachtelte
 *                   Werte (`row.attrs[m_sName]`).
 */
export interface MatrixColumn<TRow> {
  key: string;
  label: string;
  octrl_type: "Variable" | "Enum" | "Bool";
  value_type?: "string" | "int" | "float";
  enum_values?: { value: number; label_de: string }[];
  readonly?: boolean;
  width?: string;
  accessor?: (row: TRow) => unknown;
  /**
   * Optional: Tooltip-Text fuer den Header (z.B. fuer Verknuepfungs-Spalten
   * die OID + klass des Ziel-Knotens zeigen sollen).
   */
  headerTitle?: string;
}

export interface MatrixTableProps<TRow> {
  rows: TRow[];
  columns: MatrixColumn<TRow>[];
  /**
   * Eindeutiger String pro Zeile. In Phase 1 typischerweise `oid:${row.oid}`.
   */
  rowKey: (row: TRow) => string;
  /**
   * Wird bei Commit einer editierten Zelle gefeuert (Enter/Blur fuer Variable,
   * Change fuer Enum/Bool). `newValue` ist bereits parst (Number bei int/float,
   * String bei string, Number bei Enum, Boolean bei Bool, `null` wenn Eingabe
   * leer und Spalte als nullable kommuniziert via value_type-Check).
   */
  onCellEdit?: (row: TRow, columnKey: string, newValue: unknown) => void;
  disabled?: boolean;
  emptyMessage?: string;
  className?: string;
  /**
   * Optionaler React-Knoten links der ersten Spalte (z.B. fuer eine
   * Sticky-Column in zweidimensionalen Belegungs-Matrizen, ab Welle 1.2-E).
   * Nicht in Phase 1 benutzt — bestehende Matrizen realisieren die
   * Sticky-Column als normale Spalte.
   */
}

/**
 * Formatiert einen Cell-Wert fuer die Read-Only-Anzeige.
 *  - Enum  → label_de aus enum_values; Fallback auf Roh-Wert.
 *  - Bool  → "✓" / "✗" / "—" (null).
 *  - sonst → String(val) bzw. "—" bei null/undefined.
 */
function formatCell<TRow>(val: unknown, col: MatrixColumn<TRow>): string {
  if (val === null || val === undefined || val === "") return "—";
  if (col.octrl_type === "Enum" && col.enum_values) {
    const hit = col.enum_values.find((e) => e.value === val);
    if (hit) return hit.label_de;
  }
  if (col.octrl_type === "Bool") {
    return val ? "✓" : "✗";
  }
  return String(val);
}

/**
 * Edit-Cell: rendert basierend auf `col.octrl_type` das passende Editor-
 * Element. `onCommit(newValue)` schliesst den Edit-Mode und meldet den
 * neuen Wert; `onCancel()` schliesst ohne Commit.
 *
 * Parsing-Regeln (analog OCtrlVariable aus Plan 06):
 *   - value_type "int"   → parseInt(raw, 10), NaN→0
 *   - value_type "float" → parseFloat(raw),   NaN→0
 *   - value_type "string" → raw
 */
function renderEditCell<TRow>(
  initial: unknown,
  col: MatrixColumn<TRow>,
  onCommit: (newValue: unknown) => void,
  onCancel: () => void,
): React.ReactElement {
  if (col.octrl_type === "Enum" && col.enum_values) {
    return (
      <select
        autoFocus
        defaultValue={initial == null ? "" : String(initial)}
        onChange={(e) => onCommit(Number(e.target.value))}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
      >
        {col.enum_values.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label_de}
          </option>
        ))}
      </select>
    );
  }

  if (col.octrl_type === "Bool") {
    return (
      <input
        type="checkbox"
        autoFocus
        defaultChecked={Boolean(initial)}
        onChange={(e) => onCommit(e.target.checked)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        className="h-4 w-4"
      />
    );
  }

  // octrl_type === "Variable"
  const valueType = col.value_type ?? "string";
  const inputType = valueType === "string" ? "text" : "number";
  const step = valueType === "float" ? "any" : valueType === "int" ? "1" : undefined;

  const commit = (raw: string) => {
    if (valueType === "int") {
      if (raw === "") return onCommit(0);
      const parsed = parseInt(raw, 10);
      return onCommit(Number.isNaN(parsed) ? 0 : parsed);
    }
    if (valueType === "float") {
      if (raw === "") return onCommit(0);
      const parsed = parseFloat(raw);
      return onCommit(Number.isNaN(parsed) ? 0 : parsed);
    }
    onCommit(raw);
  };

  return (
    <Input
      autoFocus
      type={inputType}
      step={step}
      defaultValue={initial == null ? "" : String(initial)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit((e.currentTarget as HTMLInputElement).value);
        } else if (e.key === "Escape") {
          onCancel();
        }
      }}
      className="h-8"
    />
  );
}

/**
 * `<MatrixTable>` — die wiederverwendbare Matrix-Layout-Komponente.
 *
 * Render-Pipeline pro Zelle:
 *  1. accessor (oder fallback `(row as any)[key]`) liefert raw value.
 *  2. ist diese Zelle aktuell im Edit-Mode? → renderEditCell (Input/Select/Checkbox)
 *  3. sonst: formatCell + Click-Handler (sofern weder readonly noch disabled)
 *
 * `data-matrix-cell`-Attribut auf jeder Cell macht E2E-Selektoren stabil
 * (Format: `${rowKey}:${columnKey}`).
 */
export function MatrixTable<TRow>({
  rows,
  columns,
  rowKey,
  onCellEdit,
  disabled,
  emptyMessage = "Keine Einträge",
  className,
}: MatrixTableProps<TRow>) {
  const [editing, setEditing] = React.useState<{
    rowKey: string;
    columnKey: string;
  } | null>(null);

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "p-8 text-center text-sm text-muted-foreground",
          className,
        )}
        data-slot="matrix-empty"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <Table
      className={cn("border-separate border-spacing-0", className)}
      data-slot="matrix-table"
    >
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          {columns.map((c) => (
            <TableHead
              key={c.key}
              style={c.width ? { width: c.width } : undefined}
              title={c.headerTitle}
              className="border-b bg-background"
            >
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const rk = rowKey(row);
          return (
            <TableRow key={rk}>
              {columns.map((c) => {
                const val = c.accessor
                  ? c.accessor(row)
                  : (row as unknown as Record<string, unknown>)[c.key];
                const isEditing =
                  editing?.rowKey === rk && editing?.columnKey === c.key;
                const editable = !c.readonly && !disabled;

                if (isEditing && editable) {
                  return (
                    <TableCell
                      key={c.key}
                      data-matrix-cell={`${rk}:${c.key}`}
                      data-matrix-cell-editing="true"
                    >
                      {renderEditCell(
                        val,
                        c,
                        (newValue) => {
                          onCellEdit?.(row, c.key, newValue);
                          setEditing(null);
                        },
                        () => setEditing(null),
                      )}
                    </TableCell>
                  );
                }

                return (
                  <TableCell
                    key={c.key}
                    data-matrix-cell={`${rk}:${c.key}`}
                    onClick={() => {
                      if (editable) setEditing({ rowKey: rk, columnKey: c.key });
                    }}
                    className={cn(
                      editable && "cursor-pointer hover:bg-accent",
                      c.readonly && "text-muted-foreground",
                    )}
                  >
                    {formatCell(val, c)}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
