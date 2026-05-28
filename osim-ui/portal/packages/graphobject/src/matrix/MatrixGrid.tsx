/**
 * MatrixGrid — renderer-agnostische 2D-Tabellen-Foundation für Matrix-Viewer.
 *
 * Welle 1.2-A der Matrix-Foundation. Pendant zu `GraphFlowCanvas` für die
 * Graph-Foundation: ein generisches Component, das Sticky-Headers,
 * Corner-Cell und renderCell-Slot liefert; die konkrete Cell-Darstellung
 * (Status-Text, Click-Edit, Tooltip) verantwortet der Konsument via
 * `renderCell`-Prop.
 *
 * Architektur-Entscheidungen (siehe `01.2-CONTEXT.md` §decisions):
 *   D-1: Cells sind Wire-Daten-getrieben, nicht GObject-basiert — Foundation
 *        bleibt frei von Wire-Knowledge.
 *   D-2: `renderCell` ist ein React-Component-Slot, kein Canvas-Callback.
 *        Konsumenten geben Custom-Components.
 *   D-3: Header sind sticky via CSS `position: sticky` — Standard-Web-Pattern,
 *        funktioniert mit `overflow: auto` auf dem umschließenden Container.
 *
 * C++-Konzeptvorlage:
 *   - `OSim2004/OSimPro/PRessBelegMatrixViewer.cpp` OnDrawFrame Z.406-520:
 *     Col-Header oben + Row-Header links + Corner-Cell mit
 *     "DlplKnoten / Bel.ress."-Label (siehe `cornerLabel`-Default).
 *   - `OSim2004/ofc/OGGrid.cpp::DrawCells` — Cell-Render-Hook, hier als
 *     `renderCell`-Prop übersetzt.
 *
 * Pattern-Quellen (siehe `01.2-PATTERNS.md` §1):
 *   - `portal/src/viewers/PRess/matrix-common.tsx` (Sticky-Header-CSS,
 *     Empty-State, shadcn-Table-Komposition).
 *   - `portal/src/graph/foundation/GraphFlowCanvas.tsx` (Props-Konvention,
 *     `revision`-getriggertes useMemo, eslint-disable exhaustive-deps mit
 *     Begründung).
 *
 * Performance-Pattern:
 *   - `cellMap` wird in `React.useMemo` gebaut; Deps: `[rows, cols, revision]`.
 *     `revision` ist die explizite Re-Build-Quelle (1:1 GraphFlowCanvas Z.92-96).
 *     Konsument muss bei Wire-Mutation `revision++` setzen, damit
 *     `cellLookup` erneut konsultiert wird.
 *   - `MatrixCell` (separate Datei) ist `React.memo` — bei großen Matrizen
 *     re-rendern nur Cells mit geänderten Props.
 *
 * 3FLS-EAM-Token-Disziplin (siehe `docs/3FLS-EAM-STYLE-GUIDE.md`):
 *   - Keine ad-hoc Hex-Strings — ausschließlich Tailwind-Aliase (bg-card,
 *     bg-muted, border-border, text-primary, font-mono).
 *   - Geist Variable als Body-Font (über `font-sans` Default).
 *   - 4 px-Spacing-Grid (px-2 = 8 px, py-1 = 4 px).
 *
 * E2E-Selektoren (siehe `01.2-RESEARCH.md` §3.2):
 *   - `data-matrix-grid` auf Root.
 *   - `data-matrix-header="col" | "row" | "corner"` auf Header-Cells.
 *   - `data-matrix-cell="${rowKey}:${colKey}"` auf Body-Cells.
 *
 * NICHT in dieser Welle:
 *   - Inline-Cell-Edit (Welle 1.2-B als `useInlineCellEdit`-Hook).
 *   - Block-Select (Welle 1.2-C als `useBlockSelection`-Hook).
 *   - Copy/Paste (Welle 1.2-D als `matrix-clipboard.ts`).
 *   - Virtualisierung (RESEARCH §5.1: deferred bis User-Use-Case >500 Cells).
 */

import * as React from "react";
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
 * Props für `<MatrixGrid>`. Generisch über TRow, TCol, TVal damit Konsumenten
 * (PRessBelegMatrixViewer, PRessMengeMatrixViewer, …) typsicher bleiben — die
 * Foundation hat KEIN Wissen über `OBaseObj` oder andere Wire-Klassen.
 */
export interface MatrixGridProps<TRow, TCol, TVal> {
  /** Zeilen-Quelle (z.B. PRessBeleg[]). */
  rows: TRow[];
  /** Spalten-Quelle (z.B. PDlplKnoten[]). */
  cols: TCol[];
  /**
   * Cell-Wert-Lookup. Wird einmal pro (row, col)-Kombination aufgerufen und
   * memoized; `revision++` triggert Re-Build. Rückgabe `null` für "keine
   * Belegung / keine Daten".
   */
  cellLookup: (row: TRow, col: TCol) => TVal | null;
  /**
   * Renderer-Slot — analog zu GraphFlowCanvas-renderCustomNode. Konsument
   * entscheidet, wie die Cell visuell aussieht (Status-Text, Symbol,
   * Edit-Toggle, …).
   */
  renderCell: (row: TRow, col: TCol, value: TVal | null) => React.ReactNode;
  /**
   * Header-Renderer für Zeilen. Default: `(row as any).attrs?.m_sName` —
   * Konsument liefert nur dann eigene Renderer, wenn die Default-Konvention
   * nicht passt.
   */
  renderRowHeader?: (row: TRow) => React.ReactNode;
  /** Header-Renderer für Spalten. */
  renderColHeader?: (col: TCol) => React.ReactNode;
  /** Eindeutige Keys pro Zeile/Spalte (analog `rowKey` in matrix-common). */
  rowKey: (row: TRow) => string;
  colKey: (col: TCol) => string;
  /** Inkrementiert bei Wire-Mutation — triggert Re-Compute des cellLookup. */
  revision?: number;
  /** Read-only-Modus (Konsument durchreichen für Cell-Edit-Disable). */
  disabled?: boolean;
  /** Custom-Message bei rows.length===0 ODER cols.length===0. */
  emptyMessage?: string;
  /**
   * Label für die Corner-Cell (Zeile/Spalten-Header-Kreuzung).
   * Default 1:1 OSim2004 OnDrawFrame: "DlplKnoten / Bel.ress.".
   */
  cornerLabel?: string;
  /**
   * Feste Spaltenbreite (px) für die Daten-Spalten. Default 120.
   *
   * 1:1 zum Fixed-Cell-Modell von `OGraphGrid` (m_csStdGridExtent): Zellen
   * haben konstante Geometrie, Inhalt wird INNERHALB der Zelle gezeichnet
   * (DrawSymbol/DrawText clippen). `table-layout: fixed` + diese Breite
   * verhindern, dass ein Cell-Inhalt die Spalte aufzieht.
   */
  colWidth?: number;
  /** Feste Breite (px) der Zeilen-Header-Spalte (links). Default 192. */
  rowHeaderWidth?: number;
  /** Zusätzliches className auf der äußeren Tabelle. */
  className?: string;
}

/**
 * Default-Header-Renderer: liest `attrs.m_sName` aus dem Record, fällt zurück
 * auf den Key-String wenn kein Name vorhanden. Wir akzeptieren das `unknown`-
 * Sniffing bewusst — die Foundation darf keine harten Wire-Typ-Abhängigkeiten
 * haben (CONTEXT D-1), und das m_sName-Pattern ist die OSim-Standard-Konvention.
 */
function defaultHeaderText(record: unknown, fallback: string): string {
  const attrs = (record as { attrs?: { m_sName?: unknown } })?.attrs;
  const name = attrs?.m_sName;
  if (typeof name === "string" && name.length > 0) return name;
  return fallback;
}

export function MatrixGrid<TRow, TCol, TVal>(
  props: MatrixGridProps<TRow, TCol, TVal>,
): React.ReactElement {
  const {
    rows,
    cols,
    cellLookup,
    renderCell,
    renderRowHeader,
    renderColHeader,
    rowKey,
    colKey,
    // `revision` bleibt in der Props-API (Re-Render-Trigger über den Parent),
    // wird hier aber nicht mehr destrukturiert/ausgewertet — der Body-Loop
    // ruft `cellLookup` bei jedem Render frisch auf.
    // `disabled` wird in dieser Welle nicht direkt ausgewertet — die Foundation
    // gibt keinen Cell-Click-Handler aus (das ist Sache des Konsumenten via
    // `renderCell`). Welle 1.2-B wird `disabled` an `useInlineCellEdit`
    // durchreichen. Bewusst NICHT destrukturiert, um keinen Unused-Lint-Hit zu
    // produzieren — Konsumenten dürfen die Prop trotzdem setzen (sie ist Teil
    // der Typ-Signatur).
    emptyMessage,
    cornerLabel,
    colWidth = 120,
    rowHeaderWidth = 192,
    className,
  } = props;

  // `cellLookup` wird im Body-Render-Loop direkt aufgerufen (kein interner
  // Memo-Cache mehr). Begründung: ein interner `cellMap`-Memo mit Deps
  // `[rows, cols, revision]` ist gegen Wire-Daten-Updates blind, die NICHT
  // von einem `revision`-Bump begleitet werden (z.B. initialer Wire-Load,
  // der `allObjects` erst NACH dem ersten Render füllt) → die Belegungen
  // erscheinen erst nach einer Interaktion. Der Konsument liefert mit
  // `cellLookup` ohnehin schon eine O(1)-Map-Lookup-Closure; ein zweiter
  // Cache hier ist redundant und nur eine Stale-Quelle. `revision` bleibt
  // als Re-Render-Auslöser über den Parent erhalten (Prop bleibt in der API).

  // Empty-State analog matrix-common.tsx Z.243-255. Tabelle wird gar nicht
  // gerendert — sticky-Headers über leerem Body sehen schlechter aus als ein
  // zentrierter Hint.
  if (rows.length === 0 || cols.length === 0) {
    return (
      <div
        data-slot="matrix-empty"
        data-matrix-grid="empty"
        className={cn(
          "p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {emptyMessage ?? "Keine Daten"}
      </div>
    );
  }

  return (
    <Table
      data-matrix-grid="filled"
      // table-layout: fixed + explizite Spaltenbreiten = Fixed-Cell-Modell
      // wie OGraphGrid. width:auto → Tabelle = Summe der Spaltenbreiten
      // (überläuft den Scroll-Container bei vielen Spalten), KEINE
      // Inhalts-getriebene Spalten-Aufweitung mehr.
      style={{ tableLayout: "fixed", width: "auto" }}
      className={cn("border-separate border-spacing-0", className)}
    >
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow>
          {/* Corner-Cell — Zeile/Spalten-Header-Kreuzung. Sticky an beiden
              Achsen (top + left), z-Index höher als die übrigen Header damit
              sie beim Cross-Scroll oben-links bleibt. 1:1 OSim2004
              OnDrawFrame Default-Label "DlplKnoten / Bel.ress.". */}
          <TableHead
            data-matrix-header="corner"
            style={{ width: rowHeaderWidth }}
            className="sticky left-0 top-0 z-20 overflow-hidden border-b border-r border-border bg-muted"
          >
            <span className="font-mono text-[10px] text-muted-foreground">
              {cornerLabel ?? "DlplKnoten / Bel.ress."}
            </span>
          </TableHead>
          {cols.map((c) => {
            const ck = colKey(c);
            const headerText = renderColHeader ? undefined : defaultHeaderText(c, ck);
            return (
              <TableHead
                key={ck}
                data-matrix-header="col"
                style={{ width: colWidth }}
                className="overflow-hidden border-b border-r border-border bg-muted font-mono text-xs"
              >
                <div className="truncate" title={headerText}>
                  {renderColHeader ? renderColHeader(c) : headerText}
                </div>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const rk = rowKey(r);
          const rowText = renderRowHeader ? undefined : defaultHeaderText(r, rk);
          return (
            <TableRow key={rk}>
              {/* Row-Header-Cell — sticky links, bleibt beim horizontalen
                  Scroll sichtbar. z-Index niedriger als Corner-Cell. */}
              <TableCell
                data-matrix-header="row"
                style={{ width: rowHeaderWidth }}
                className="sticky left-0 z-10 overflow-hidden border-b border-r border-border bg-muted font-mono text-xs"
              >
                <div className="truncate" title={rowText}>
                  {renderRowHeader ? renderRowHeader(r) : rowText}
                </div>
              </TableCell>
              {cols.map((c) => {
                const ck = colKey(c);
                const val = cellLookup(r, c);
                return (
                  <TableCell
                    key={ck}
                    data-matrix-cell={`${rk}:${ck}`}
                    className="overflow-hidden border-b border-r border-border p-0"
                  >
                    {renderCell(r, c, val)}
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
