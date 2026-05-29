/**
 * AuswertungTable — faithful OSim2004-Auswertungs-Renderer (Plan 01-12 Task 1,
 * O-2 / O-3).
 *
 * Rendert für ein gegebenes kpi_auswertung-kind die Tabelle mit den EXAKTEN
 * deutschen OSim-Spalten-Headern (aus viewer-config, 1:1 aus den
 * ISimulatorViewerAusw*.cpp). Drei Render-Modi (viewer-config):
 *
 *  - "records":  now-buildable (prod_auftrag/nbearbeit/wschlange) → eine Zeile
 *    je v.records[]-Eintrag, echte Werte. Leere records + missing_slice (z.B.
 *    best_auftrag) → eine "(Slice offen)"-Hinweiszeile.
 *  - "snapshot": slice-gated Einzel-Snapshot (pers/betr/kauf/eigen) → die echten
 *    Feldnamen werden direkt aus v gelesen; null + missing_slice → "(Slice
 *    offen)".
 *  - "sections": Block-/Kennzahlen-Layout (kalkulation/gesamt) → sektionierte
 *    Label-Wert-Tabelle; gesamt zusätzlich die Verkaufsergebnisse-Untertabelle.
 *
 * NIE erfundene Zahlen (Threat T-01-12A): wo ein Feld null ist UND der Frame ein
 * missing_slice trägt, rendert die Zelle "(Slice offen)" (muted-Token +
 * aria-Label, A11y — Information nicht nur über Farbe). Record-Listen werden
 * gefenstert (T-01-12B, analog RecordTable).
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
import {
  AUSWERTUNG_DEFS,
  SLICE_OPEN_LABEL,
  VERKAUFSERGEBNIS_COLUMNS,
  type AuswertungKind,
  type OsimColumn,
} from "../viewer-config";

/** Sichtbares Zeilen-Fenster für Record-Listen (Windowing-Cap, T-01-12B). */
const MAX_VISIBLE_ROWS = 200;

export interface AuswertungTableProps {
  /** kpi_auswertung-kind (wählt die Spalten/Sektionen aus der Registry). */
  kind: AuswertungKind;
  /** kpi_auswertung-Frames dieses kinds (jüngster Frame = aktuelle Periode). */
  frames: Frame[];
}

/** Liest den jüngsten Frame eines kinds (= aktuelle Periode). */
function latestV(frames: Frame[]): Record<string, unknown> | null {
  if (frames.length === 0) return null;
  return frames[frames.length - 1].v;
}

/** Ist dieser Frame slice-gated (trägt einen missing_slice-Marker)? */
function isGated(v: Record<string, unknown>): boolean {
  return typeof v.missing_slice === "string" && v.missing_slice.length > 0;
}

/**
 * Eine einzelne Wert-Zelle. Ein null/undefined-Wert in einem gated Frame wird
 * als "(Slice offen)" gerendert (muted + aria-Label) — NIE 0/erfundene Zahl.
 * Echte Werte (auch 0) werden als String dargestellt.
 */
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

function HeaderRow({ columns }: { columns: OsimColumn[] }): React.ReactElement {
  return (
    <TableRow>
      {columns.map((c) => (
        <TableHead key={c.key} data-testid={`ausw-header-${c.key}`}>
          {c.header}
        </TableHead>
      ))}
    </TableRow>
  );
}

/** Render-Modus "records": eine Zeile je v.records[]-Eintrag. */
function RecordsView({
  kind,
  v,
  columns,
}: {
  kind: AuswertungKind;
  v: Record<string, unknown>;
  columns: OsimColumn[];
}): React.ReactElement {
  const records = Array.isArray(v.records)
    ? (v.records as Record<string, unknown>[])
    : [];
  const gated = isGated(v);
  const windowed = records.slice(0, MAX_VISIBLE_ROWS);
  const hidden = records.length - windowed.length;

  return (
    <div className="flex flex-col gap-2" data-testid={`ausw-table-${kind}`}>
      <div className="max-h-[480px] overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <HeaderRow columns={columns} />
          </TableHeader>
          <TableBody>
            {windowed.length === 0 ? (
              <TableRow data-testid={`ausw-row-${kind}`}>
                <TableCell colSpan={columns.length}>
                  {gated ? (
                    <span
                      className="text-muted-foreground italic"
                      data-testid="ausw-cell-gated"
                      aria-label={`${SLICE_OPEN_LABEL} — ${String(v.missing_slice)}`}
                    >
                      {SLICE_OPEN_LABEL} — {String(v.missing_slice)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Noch keine Einträge.
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              windowed.map((rec, idx) => (
                <TableRow key={idx} data-testid={`ausw-row-${kind}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <ValueCell value={rec[c.key]} gated={gated} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {hidden} weitere Zeilen ausgeblendet (Fenster {MAX_VISIBLE_ROWS}).
        </p>
      )}
    </div>
  );
}

/** Render-Modus "snapshot": eine Zeile, die echten Feldwerte aus v. */
function SnapshotView({
  kind,
  v,
  columns,
}: {
  kind: AuswertungKind;
  v: Record<string, unknown>;
  columns: OsimColumn[];
}): React.ReactElement {
  const gated = isGated(v);
  return (
    <div className="flex flex-col gap-2" data-testid={`ausw-table-${kind}`}>
      <div className="overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <HeaderRow columns={columns} />
          </TableHeader>
          <TableBody>
            <TableRow data-testid={`ausw-row-${kind}`}>
              {columns.map((c) => (
                <TableCell key={c.key}>
                  <ValueCell value={v[c.key]} gated={gated} />
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Render-Modus "sections": Label-Wert-Blöcke (Kalkulation/Gesamt). */
function SectionsView({
  kind,
  v,
}: {
  kind: AuswertungKind;
  v: Record<string, unknown>;
}): React.ReactElement {
  const def = AUSWERTUNG_DEFS[kind];
  const gated = isGated(v);
  const sections = def.sections ?? [];

  return (
    <div className="flex flex-col gap-4" data-testid={`ausw-table-${kind}`}>
      {sections.map((section) => (
        <div key={section.title} className="rounded-md border border-border">
          <div className="border-b border-border bg-muted px-3 py-2 text-sm font-semibold text-foreground">
            {section.title}
          </div>
          <Table>
            <TableBody>
              {section.rows.map((row) => (
                <TableRow key={row.key} data-testid={`ausw-row-${kind}`}>
                  <TableCell className="w-1/2 font-medium text-muted-foreground">
                    {row.header}
                  </TableCell>
                  <TableCell className="text-right">
                    <ValueCell value={v[row.key]} gated={gated} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}

      {/* Gesamt: zusätzlich die Verkaufsergebnisse je Produkt (1-3). */}
      {kind === "gesamt" && Array.isArray(v.verkaufsergebnisse) && (
        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-muted px-3 py-2 text-sm font-semibold text-foreground">
            Verkaufsergebnisse
          </div>
          <Table>
            <TableHeader>
              <HeaderRow columns={VERKAUFSERGEBNIS_COLUMNS} />
            </TableHeader>
            <TableBody>
              {(v.verkaufsergebnisse as Record<string, unknown>[]).map(
                (rec, idx) => (
                  <TableRow key={idx} data-testid="ausw-verkaufsergebnis-row">
                    {VERKAUFSERGEBNIS_COLUMNS.map((c) => (
                      <TableCell key={c.key}>
                        <ValueCell value={rec[c.key]} gated={gated} />
                      </TableCell>
                    ))}
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function AuswertungTable({
  kind,
  frames,
}: AuswertungTableProps): React.ReactElement {
  const def = AUSWERTUNG_DEFS[kind];
  const v = latestV(frames);

  if (v === null) {
    return (
      <p
        className="p-4 text-sm text-muted-foreground"
        data-testid={`ausw-empty-${kind}`}
      >
        Noch keine Auswertungs-Daten.
      </p>
    );
  }

  switch (def.mode) {
    case "records":
      return <RecordsView kind={kind} v={v} columns={def.columns ?? []} />;
    case "snapshot":
      return <SnapshotView kind={kind} v={v} columns={def.columns ?? []} />;
    case "sections":
      return <SectionsView kind={kind} v={v} />;
  }
}
