/**
 * MatrixGrid.spec.tsx — Foundation-Welle 1.2-A.
 *
 * Specs für die renderer-agnostische `<MatrixGrid>`-Komponente. Sie testet
 * ausschließlich die Foundation-Mechanik (Empty-State, Sticky-Header-Klassen,
 * renderCell-Aufruf-Zählung, Revision-getriggerte Re-Builds, data-Attribute
 * für E2E-Selektoren). Konsumenten-Logik (Wire-Lookup, Cell-Edit-Dispatcher)
 * ist NICHT Teil dieser Tests — die kommen erst in Welle 1.2-E.
 *
 * Pattern-Quelle: `portal/src/graph/foundation/__tests__/GridBackground.spec.tsx`
 * (Tailwind-Class-Assertion-Pattern in jsdom). Sticky-CSS wird NICHT layoutet
 * (jsdom kann das nicht — RESEARCH §5.3); statt `getBoundingClientRect` prüft
 * der Spec ausschließlich CSS-Klassen-Presence.
 */

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { MatrixGrid } from "@/graph/foundation/matrix/MatrixGrid";

// Minimale Wire-ähnliche Test-Records — bewusst nicht `OBaseObj`, damit die
// Foundation-Spec frei von Wire-Knowledge bleibt (CONTEXT D-1).
type Row = { oid: number; attrs: { m_sName: string } };
type Col = { oid: number; attrs: { m_sName: string } };
type Val = { status: number };

const r1: Row = { oid: 1, attrs: { m_sName: "Ress A" } };
const r2: Row = { oid: 2, attrs: { m_sName: "Ress B" } };
const c1: Col = { oid: 10, attrs: { m_sName: "Knoten 1" } };
const c2: Col = { oid: 11, attrs: { m_sName: "Knoten 2" } };

const rowKey = (r: Row) => `oid:${r.oid}`;
const colKey = (c: Col) => `oid:${c.oid}`;

describe("MatrixGrid Welle 1.2-A", () => {
  it("Test 1: rendert Empty-State bei rows.length===0", () => {
    const { container } = render(
      <MatrixGrid<Row, Col, Val>
        rows={[]}
        cols={[c1, c2]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={() => null}
        renderCell={() => <span>X</span>}
        emptyMessage="Keine Daten"
      />,
    );
    const empty = container.querySelector('[data-slot="matrix-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toBe("Keine Daten");
    // Tabelle darf NICHT gerendert sein.
    expect(container.querySelector('[data-slot="table"]')).toBeNull();
  });

  it("Test 2: rendert Empty-State bei cols.length===0 (rows non-empty)", () => {
    const { container } = render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1, r2]}
        cols={[]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={() => null}
        renderCell={() => <span>X</span>}
      />,
    );
    expect(container.querySelector('[data-slot="matrix-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="table"]')).toBeNull();
  });

  it("Test 3: ruft renderCell pro (row, col)-Kombi auf — 2×2=4 Aufrufe", () => {
    const renderCell = vi.fn().mockReturnValue(<span>X</span>);
    render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1, r2]}
        cols={[c1, c2]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={() => null}
        renderCell={renderCell}
      />,
    );
    expect(renderCell).toHaveBeenCalledTimes(4);
    // Reihenfolge prüfen: row-major (r1 dann r2, je c1 dann c2).
    expect(renderCell.mock.calls[0]).toEqual([r1, c1, null]);
    expect(renderCell.mock.calls[1]).toEqual([r1, c2, null]);
    expect(renderCell.mock.calls[2]).toEqual([r2, c1, null]);
    expect(renderCell.mock.calls[3]).toEqual([r2, c2, null]);
  });

  it("Test 4: cellLookup wird pro (row, col) gefragt + Value an renderCell durchgereicht", () => {
    const cellLookup = vi.fn((r: Row, c: Col): Val | null => {
      if (r.oid === 1 && c.oid === 10) return { status: 42 };
      return null;
    });
    const renderCell = vi.fn().mockReturnValue(<span>X</span>);
    render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1, r2]}
        cols={[c1, c2]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={cellLookup}
        renderCell={renderCell}
      />,
    );
    expect(cellLookup).toHaveBeenCalledTimes(4);
    // renderCell hat für (r1,c1) das Value-Objekt durchgereicht
    expect(renderCell).toHaveBeenCalledWith(r1, c1, { status: 42 });
    // Für (r1,c2) → null
    expect(renderCell).toHaveBeenCalledWith(r1, c2, null);
  });

  it("Test 5: Sticky-Header-CSS — col-Header hat 'sticky' + 'top-0', row-Header hat 'sticky' + 'left-0'", () => {
    const { container } = render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1]}
        cols={[c1]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={() => null}
        renderCell={() => <span>X</span>}
      />,
    );
    // TableHeader-Row mit sticky top-0
    const thead = container.querySelector('[data-slot="table-header"]');
    expect(thead?.className).toMatch(/sticky/);
    expect(thead?.className).toMatch(/top-0/);

    // Row-Header-Cell mit sticky left-0
    const rowHeader = container.querySelector('[data-matrix-header="row"]');
    expect(rowHeader).not.toBeNull();
    expect(rowHeader?.className).toMatch(/sticky/);
    expect(rowHeader?.className).toMatch(/left-0/);
  });

  it("Test 6: Corner-Cell mit data-matrix-header='corner' und Default-Label 'DlplKnoten / Bel.ress.'", () => {
    const { container } = render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1]}
        cols={[c1]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={() => null}
        renderCell={() => <span>X</span>}
      />,
    );
    const corner = container.querySelector('[data-matrix-header="corner"]');
    expect(corner).not.toBeNull();
    expect(corner?.textContent).toContain("DlplKnoten / Bel.ress.");

    // Override via cornerLabel-Prop
    const { container: c2c } = render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1]}
        cols={[c1]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={() => null}
        renderCell={() => <span>X</span>}
        cornerLabel="Custom-Label"
      />,
    );
    expect(
      c2c.querySelector('[data-matrix-header="corner"]')?.textContent,
    ).toContain("Custom-Label");
  });

  it("Test 7: revision-Wechsel triggert cellLookup-Re-Aufruf (initial 4 + nach Rerender 4 = 8)", () => {
    const cellLookup = vi.fn(() => null);
    const renderCell = () => <span>X</span>;
    const { rerender } = render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1, r2]}
        cols={[c1, c2]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={cellLookup}
        renderCell={renderCell}
        revision={0}
      />,
    );
    expect(cellLookup).toHaveBeenCalledTimes(4);
    rerender(
      <MatrixGrid<Row, Col, Val>
        rows={[r1, r2]}
        cols={[c1, c2]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={cellLookup}
        renderCell={renderCell}
        revision={1}
      />,
    );
    expect(cellLookup).toHaveBeenCalledTimes(8);
  });

  it("Test 8: keine 'missing key'-Warning bei React (rowKey/colKey werden als React-Keys verwendet)", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1, r2]}
        cols={[c1, c2]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={() => null}
        renderCell={() => <span>X</span>}
      />,
    );
    // React würde bei fehlenden keys einen Warning ausgeben.
    const keyWarnings = consoleSpy.mock.calls.filter((c) =>
      String(c[0]).includes("unique \"key\" prop"),
    );
    expect(keyWarnings.length).toBe(0);
    consoleSpy.mockRestore();
  });

  it("Test 9: data-Attribute für E2E — data-matrix-grid + data-matrix-header (col/row/corner) + data-matrix-cell", () => {
    const { container } = render(
      <MatrixGrid<Row, Col, Val>
        rows={[r1]}
        cols={[c1, c2]}
        rowKey={rowKey}
        colKey={colKey}
        cellLookup={() => null}
        renderCell={() => <span>X</span>}
      />,
    );
    // data-matrix-grid auf einem Container vorhanden
    expect(container.querySelector("[data-matrix-grid]")).not.toBeNull();
    // 1 corner-Header
    expect(container.querySelectorAll('[data-matrix-header="corner"]')).toHaveLength(1);
    // 2 col-Header
    expect(container.querySelectorAll('[data-matrix-header="col"]')).toHaveLength(2);
    // 1 row-Header
    expect(container.querySelectorAll('[data-matrix-header="row"]')).toHaveLength(1);
    // 2 cells (1 row × 2 cols)
    expect(container.querySelectorAll("[data-matrix-cell]")).toHaveLength(2);
    // Cell-Format `${rowKey}:${colKey}` — die spezifische Cell muss existieren
    expect(
      container.querySelector('[data-matrix-cell="oid:1:oid:10"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-matrix-cell="oid:1:oid:11"]'),
    ).not.toBeNull();
  });
});
