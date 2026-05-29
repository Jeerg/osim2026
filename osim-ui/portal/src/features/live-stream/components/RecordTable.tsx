/**
 * RecordTable — virtualisierte Detail-Tabelle des reporting_record-Streams
 * (Plan 01-05 Task 2, D-4.3, SPEC §8.3 / §6.3).
 *
 * Tabelle über `@tanstack/react-table` (D-4.3) für die reporting_record-Frames.
 * Spalten aus den §6.3-Feldern (auftrag_id, art, menge, start, ende_ist,
 * ende_soll, verspaetung). Spalten-Sortierung (Klick auf Header) + globaler
 * Text-Filter. Große Record-Listen werden gefenstert (Windowing über eine
 * feste Tabellenhöhe + sichtbares Fenster), um den DOM klein zu halten
 * (T-01-12 DoS-Mitigation: viele reporting_record-Frames sollen den Browser
 * nicht fluten).
 *
 * Styling strikt über Design-Tokens (3FLS-Guide), keine ad-hoc Hex-Werte.
 */

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { Frame } from "../types";

/** Sichtbares Zeilen-Fenster (Windowing-Cap, T-01-12). */
const MAX_VISIBLE_ROWS = 200;

/** Flache Zeilen-Repräsentation eines reporting_record-Frames (§6.3). */
interface RecordRow {
  auftrag_id: string;
  art: string;
  menge: number | null;
  start: number | null;
  ende_ist: number | null;
  ende_soll: number | null;
  verspaetung: number | null;
}

function toNullableNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Mappt reporting_record-Frames auf flache Zeilen. */
function framesToRows(frames: Frame[]): RecordRow[] {
  return frames.map((f) => {
    const v = f.v as Record<string, unknown>;
    return {
      auftrag_id: typeof v.auftrag_id === "string" ? v.auftrag_id : "—",
      art: typeof v.art === "string" ? v.art : "—",
      menge: toNullableNumber(v.menge),
      start: toNullableNumber(v.start),
      ende_ist: toNullableNumber(v.ende_ist),
      ende_soll: toNullableNumber(v.ende_soll),
      verspaetung: toNullableNumber(v.verspaetung),
    };
  });
}

function numberCell(value: number | null): string {
  return value === null ? "—" : String(value);
}

const COLUMNS: ColumnDef<RecordRow>[] = [
  { accessorKey: "auftrag_id", header: "Auftrag" },
  { accessorKey: "art", header: "Art" },
  {
    accessorKey: "menge",
    header: "Menge",
    cell: (ctx) => numberCell(ctx.getValue<number | null>()),
  },
  {
    accessorKey: "start",
    header: "Start",
    cell: (ctx) => numberCell(ctx.getValue<number | null>()),
  },
  {
    accessorKey: "ende_ist",
    header: "Ende (Ist)",
    cell: (ctx) => numberCell(ctx.getValue<number | null>()),
  },
  {
    accessorKey: "ende_soll",
    header: "Ende (Soll)",
    cell: (ctx) => numberCell(ctx.getValue<number | null>()),
  },
  {
    accessorKey: "verspaetung",
    header: "Verspätung",
    cell: (ctx) => numberCell(ctx.getValue<number | null>()),
  },
];

const SORT_INDICATOR: Record<"asc" | "desc", string> = {
  asc: "▲",
  desc: "▼",
};

export interface RecordTableProps {
  /** reporting_record-Frames. */
  frames: Frame[];
}

export function RecordTable({ frames }: RecordTableProps): React.ReactElement {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [filter, setFilter] = React.useState("");

  const data = React.useMemo(() => framesToRows(frames), [frames]);

  const table = useReactTable({
    data,
    columns: COLUMNS,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Windowing: nur die ersten MAX_VISIBLE_ROWS sichtbaren (gefilterten +
  // sortierten) Zeilen ins DOM rendern (T-01-12).
  const rows = table.getRowModel().rows;
  const windowed = rows.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = rows.length - windowed.length;

  return (
    <div className="flex flex-col gap-2" data-testid="record-table">
      <Input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Records filtern…"
        aria-label="Records filtern"
        data-testid="record-table-filter"
        className="max-w-xs"
      />
      <div
        className="max-h-[480px] overflow-auto rounded-md border border-border"
        data-testid="record-table-window"
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const sortDir = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                        data-testid={`record-sort-${header.column.id}`}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sortDir && (
                          <span aria-hidden="true">
                            {SORT_INDICATOR[sortDir]}
                          </span>
                        )}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {windowed.map((row) => (
              <TableRow key={row.id} data-testid="record-row">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="record-window-note">
          {hiddenCount} weitere Zeilen ausgeblendet (Fenster {MAX_VISIBLE_ROWS}).
        </p>
      )}
    </div>
  );
}
