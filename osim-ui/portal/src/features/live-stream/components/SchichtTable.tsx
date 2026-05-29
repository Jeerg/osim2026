/**
 * SchichtTable — Schicht-Auswertung des gantt_schicht-Streams (Plan 01-12
 * Task 1, O-2 / O-3).
 *
 * Rendert die 4 OSim-Spalten Person/Schichten/Überstunden/Einheiten (1:1 aus
 * ISimulatorViewerSchicht.cpp FillList, an die 01-11-Felder gebunden:
 * person/schichten/ueberstunden/einheiten). Eine Zeile je gantt_schicht-Frame
 * (period-aggregiert je Person). Im P5-M-Skelett-Pfad sind die Felder null +
 * v.missing_slice gesetzt → "(Slice offen)" (NIE 0/erfundene Zahl, A11y über
 * Token + aria-Label, nicht nur Farbe).
 *
 * Styling strikt über Design-Tokens (3FLS-Guide), keine ad-hoc Hex-Werte.
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
import type { Frame } from "../types";
import { SCHICHT_COLUMNS, SLICE_OPEN_LABEL } from "../viewer-config";

export interface SchichtTableProps {
  /** gantt_schicht-Frames (eine Zeile je Frame, period-aggregiert je Person). */
  frames: Frame[];
}

function isGated(v: Record<string, unknown>): boolean {
  return typeof v.missing_slice === "string" && v.missing_slice.length > 0;
}

function ValueCell({
  value,
  gated,
}: {
  value: unknown;
  gated: boolean;
}): React.ReactElement {
  if ((value === null || value === undefined) && gated) {
    return (
      <span
        className="text-muted-foreground italic"
        data-testid="ausw-cell-gated"
        aria-label={`${SLICE_OPEN_LABEL} — dieser Wert liegt im aktuellen Slice nicht vor`}
      >
        {SLICE_OPEN_LABEL}
      </span>
    );
  }
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="tabular-nums">{String(value)}</span>;
}

export function SchichtTable({ frames }: SchichtTableProps): React.ReactElement {
  if (frames.length === 0) {
    return (
      <p
        className="p-4 text-sm text-muted-foreground"
        data-testid="schicht-empty"
      >
        Noch keine Schicht-Daten.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="schicht-table">
      <div className="max-h-[480px] overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {SCHICHT_COLUMNS.map((c) => (
                <TableHead key={c.key} data-testid={`schicht-header-${c.key}`}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {frames.map((f) => {
              const v = f.v;
              const gated = isGated(v);
              return (
                <TableRow key={f.seq} data-testid="schicht-row">
                  {SCHICHT_COLUMNS.map((c) => (
                    <TableCell key={c.key}>
                      <ValueCell value={v[c.key]} gated={gated} />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
