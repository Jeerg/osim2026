// Plan 01-06 Task 1: Tests fuer MatrixGrid.
//
// Was getestet wird:
//   - 3x3-Smoke: alle Zellen + Header sichtbar
//   - Edit-Capture: onCellChange wird mit korrekten (row, col, value) gerufen
//   - readonly-Mode: inputs disabled
//   - Empty-State: rows=[] oder columns=[] zeigt Empty-Placeholder
//   - Diagonal-Disable via isDisabled
//   - Custom-Renderer: renderCell ueberschreibt Default
//   - Boolean-Zellen: Checkbox
//
// Virtualization-Test ist NICHT in Phase 1 implementiert — siehe Comment
// im MatrixGrid.tsx (Phase-1-Deviation, dokumentiert in SUMMARY.md).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MatrixGrid } from "../MatrixGrid";

afterEach(cleanup);

interface Row {
  id: number;
  name: string;
}
interface Col {
  id: string;
  label: string;
}

const rows: Row[] = [
  { id: 1, name: "Maschine-A" },
  { id: 2, name: "Maschine-B" },
  { id: 3, name: "Maschine-C" },
];
const cols: Col[] = [
  { id: "fr", label: "Frueh" },
  { id: "sp", label: "Spaet" },
  { id: "n", label: "Nacht" },
];

describe("MatrixGrid", () => {
  it("rendert alle Spalten-Header und Zeilen-Header", () => {
    render(
      <MatrixGrid<Row, Col, number>
        rows={rows}
        columns={cols}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => 0}
        onCellChange={() => {}}
      />,
    );
    // Spalten-Header
    expect(
      screen.getByTestId("matrix-grid-col-header-fr"),
    ).toHaveTextContent("Frueh");
    expect(
      screen.getByTestId("matrix-grid-col-header-sp"),
    ).toHaveTextContent("Spaet");
    expect(
      screen.getByTestId("matrix-grid-col-header-n"),
    ).toHaveTextContent("Nacht");
    // Zeilen-Header
    expect(
      screen.getByTestId("matrix-grid-row-header-1"),
    ).toHaveTextContent("Maschine-A");
    expect(
      screen.getByTestId("matrix-grid-row-header-3"),
    ).toHaveTextContent("Maschine-C");
  });

  it("rendert 3x3 = 9 Zellen mit number-Werten als <input type=number>", () => {
    const data: Record<string, number> = {
      "1-fr": 1,
      "1-sp": 2,
      "1-n": 3,
      "2-fr": 4,
      "2-sp": 5,
      "2-n": 6,
      "3-fr": 7,
      "3-sp": 8,
      "3-n": 9,
    };
    render(
      <MatrixGrid<Row, Col, number>
        rows={rows}
        columns={cols}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={(r, c) => data[`${r.id}-${c.id}`] ?? 0}
        onCellChange={() => {}}
      />,
    );
    for (const r of rows) {
      for (const c of cols) {
        const cell = screen.getByTestId(
          `matrix-grid-cell-${r.id}-${c.id}`,
        ) as HTMLInputElement;
        expect(cell).toBeInTheDocument();
        expect(cell.type).toBe("number");
        expect(cell.value).toBe(String(data[`${r.id}-${c.id}`]));
      }
    }
  });

  it("ruft onCellChange mit (row, col, numericValue) bei Edit", () => {
    const spy = vi.fn();
    render(
      <MatrixGrid<Row, Col, number>
        rows={rows}
        columns={cols}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => 0}
        onCellChange={spy}
      />,
    );
    const cell = screen.getByTestId(
      "matrix-grid-cell-2-sp",
    ) as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "42" } });
    expect(spy).toHaveBeenCalledTimes(1);
    const [row, col, value] = spy.mock.calls[0]!;
    expect(row).toEqual({ id: 2, name: "Maschine-B" });
    expect(col).toEqual({ id: "sp", label: "Spaet" });
    expect(value).toBe(42);
  });

  it("readonly-Mode: alle inputs disabled", () => {
    render(
      <MatrixGrid<Row, Col, number>
        rows={rows}
        columns={cols}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => 0}
        onCellChange={() => {}}
        readonly
      />,
    );
    const cell = screen.getByTestId(
      "matrix-grid-cell-1-fr",
    ) as HTMLInputElement;
    expect(cell.disabled).toBe(true);
  });

  it("isDisabled disabled nur die markierten Zellen", () => {
    render(
      <MatrixGrid<Row, Row, boolean>
        rows={rows}
        columns={rows} // quadratisch, Diagonal-Test
        rowHeader={(r) => r.name}
        colHeader={(c) => c.name}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => false}
        onCellChange={() => {}}
        isDisabled={(r, c) => r.id === c.id}
      />,
    );
    // Diagonal: 1-1, 2-2, 3-3 → disabled
    expect(
      (screen.getByTestId("matrix-grid-cell-1-1") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("matrix-grid-cell-2-2") as HTMLInputElement).disabled,
    ).toBe(true);
    // Off-Diagonal: 1-2 → enabled
    expect(
      (screen.getByTestId("matrix-grid-cell-1-2") as HTMLInputElement).disabled,
    ).toBe(false);
  });

  it("boolean-Werte werden als Checkbox gerendert", () => {
    render(
      <MatrixGrid<Row, Col, boolean>
        rows={rows.slice(0, 1)}
        columns={cols.slice(0, 1)}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => true}
        onCellChange={() => {}}
      />,
    );
    const cell = screen.getByTestId(
      "matrix-grid-cell-1-fr",
    ) as HTMLInputElement;
    expect(cell.type).toBe("checkbox");
    expect(cell.checked).toBe(true);
  });

  it("checkbox-Edit ruft onCellChange(value=true|false)", () => {
    const spy = vi.fn();
    render(
      <MatrixGrid<Row, Col, boolean>
        rows={rows.slice(0, 1)}
        columns={cols.slice(0, 1)}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => false}
        onCellChange={spy}
      />,
    );
    const cell = screen.getByTestId(
      "matrix-grid-cell-1-fr",
    ) as HTMLInputElement;
    fireEvent.click(cell);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![2]).toBe(true);
  });

  it("empty-State: rows=[] → Placeholder statt Tabelle", () => {
    render(
      <MatrixGrid<Row, Col, number>
        rows={[]}
        columns={cols}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => 0}
        onCellChange={() => {}}
      />,
    );
    expect(screen.getByTestId("matrix-grid-empty")).toBeInTheDocument();
  });

  it("empty-State: columns=[] → Placeholder statt Tabelle", () => {
    render(
      <MatrixGrid<Row, Col, number>
        rows={rows}
        columns={[]}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => 0}
        onCellChange={() => {}}
      />,
    );
    expect(screen.getByTestId("matrix-grid-empty")).toBeInTheDocument();
  });

  it("custom renderCell ueberschreibt Default", () => {
    render(
      <MatrixGrid<Row, Col, number>
        rows={rows.slice(0, 1)}
        columns={cols.slice(0, 1)}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => 99}
        onCellChange={() => {}}
        renderCell={(value) => (
          <span data-testid="custom-render">CUSTOM:{String(value)}</span>
        )}
      />,
    );
    expect(screen.getByTestId("custom-render")).toHaveTextContent(
      "CUSTOM:99",
    );
  });

  it("akzeptiert testId-Prefix", () => {
    render(
      <MatrixGrid<Row, Col, number>
        rows={rows.slice(0, 1)}
        columns={cols.slice(0, 1)}
        rowHeader={(r) => r.name}
        colHeader={(c) => c.label}
        rowKey={(r) => r.id}
        colKey={(c) => c.id}
        getCellValue={() => 0}
        onCellChange={() => {}}
        testId="kap-matrix"
      />,
    );
    expect(screen.getByTestId("kap-matrix")).toBeInTheDocument();
    expect(screen.getByTestId("kap-matrix-cell-1-fr")).toBeInTheDocument();
  });
});

import React from "react";
void React;
