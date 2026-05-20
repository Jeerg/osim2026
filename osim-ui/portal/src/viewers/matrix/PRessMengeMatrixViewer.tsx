// Plan 01-06 Task 2: PRessMengeMatrixViewer.
//
// Portierung von PRessMengeMatrixViewer.h (C++):
//   - rows = Mengen-Ressourcen (PRessMenge). Phase-1-Realitaet:
//     Backend liefert Mengen-Ressourcen aktuell NICHT (Backend-TYPE_MAP
//     enthaelt PRessMenge nicht). Foundation-Viewer: wenn der Tree
//     PRessMenge-Knoten enthaelt, werden sie hier gerendert.
//   - columns = Zeitintervall-Spalten (PEinsatzzeitTag-basiert,
//     analog zum Belegungs-Viewer).
//   - Zelle = numerischer Bestand (m_iMenge der entsprechenden
//     PAssozMenge — Phase-1-Stub speichert wieder als CellMap auf dem
//     synthetischen Group-Knoten).

import { useMemo, useCallback } from "react";
import { MatrixGrid } from "./MatrixGrid";
import {
  getAllOfKlass,
  extractScheduleColumns,
  type ScheduleColumn,
} from "./matrix-helpers";
import {
  SYNTHETIC_RESS_MENGE_KLASS,
  SYNTHETIC_RESS_MENGE_OID,
  setSyntheticProperty,
} from "./synthetic-nodes";
import { registerViewer } from "@/viewers/core/viewer-registry";
import { useModelStore } from "@/state/model-store";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";

const PROPERTY_KEY = "m_aMengen";

type CellMap = Record<string, number>;

function cellKey(ressOid: number, colId: string): string {
  return `${ressOid}:${colId}`;
}

export const PRessMengeMatrixViewer: ChildDialogComponent = ({ obj }) => {
  const tree = useModelStore((s) => s.tree);

  const stored = (obj.properties[PROPERTY_KEY] ?? null) as CellMap | null;
  const cellMap: CellMap = useMemo(() => stored ?? {}, [stored]);

  const rows = useMemo<OtxJsonNode[]>(
    () => getAllOfKlass(tree, "PRessMenge"),
    [tree],
  );

  const columns = useMemo<ScheduleColumn[]>(
    () => extractScheduleColumns(tree),
    [tree],
  );

  const getCellValue = useCallback(
    (row: OtxJsonNode, col: ScheduleColumn): number => {
      const k = cellKey(row.oid, col.id);
      return cellMap[k] ?? 0;
    },
    [cellMap],
  );

  const onCellChange = useCallback(
    (row: OtxJsonNode, col: ScheduleColumn, value: number) => {
      const k = cellKey(row.oid, col.id);
      const next: CellMap = { ...cellMap, [k]: value };
      setSyntheticProperty(obj.oid, PROPERTY_KEY, next);
    },
    [cellMap, obj.oid],
  );

  return (
    <div className="p-6" data-testid="pressmenge-matrix-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Mengenressourcen-Matrix
        </h2>
        <p className="text-xs text-gray-500">
          {rows.length} Mengenressourcen × {columns.length} Schicht
          {columns.length === 1 ? "" : "en"} — Zell-Wert: Bestand
          (m_iMenge)
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="pressmenge-matrix-no-ress"
        >
          Keine Mengen-Ressourcen im Modell gefunden. Backend-TYPE_MAP
          enthaelt PRessMenge aktuell nicht — Foundation-Viewer wartet
          auf Backend-Erweiterung (Phase 2).
        </div>
      ) : (
        <MatrixGrid<OtxJsonNode, ScheduleColumn, number>
          rows={rows}
          columns={columns}
          rowHeader={(r) => (
            <span title={`OID ${r.oid}`}>{r.name || `Menge-${r.oid}`}</span>
          )}
          colHeader={(c) => c.label}
          rowKey={(r) => r.oid}
          colKey={(c) => c.id}
          getCellValue={getCellValue}
          onCellChange={onCellChange}
          testId="pressmenge-matrix"
          ariaLabel="Mengenressourcen-Matrix"
        />
      )}

      <p className="mt-3 text-xs text-gray-500" data-testid="pressmenge-matrix-note">
        Phase-1-Stub: Zellen als <code className="mx-1">{PROPERTY_KEY}</code>-Map
        gespeichert; Save-back auf PAssozMenge mit Plan 09.
      </p>
    </div>
  );
};

PRessMengeMatrixViewer.displayName = "PRessMengeMatrixViewer";

registerViewer({
  klass: SYNTHETIC_RESS_MENGE_KLASS,
  component: PRessMengeMatrixViewer,
  displayName: "Mengenressourcen-Matrix",
});

export { SYNTHETIC_RESS_MENGE_OID };
