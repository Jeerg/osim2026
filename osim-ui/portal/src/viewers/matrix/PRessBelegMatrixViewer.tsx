// Plan 01-06 Task 2: PRessBelegMatrixViewer.
//
// Portierung von PRessBelegMatrixViewer.h (C++):
//   - rows = Belegungs-Ressourcen (im Phase-1-Tree: PBetriebsmittel +
//     PPerson, weil das Backend PRessBeleg-Klassen aktuell als
//     PBetriebsmittel/PPerson serialisiert — sobald das Backend echte
//     PRessBeleg-Knoten liefert, werden sie automatisch aufgenommen).
//   - columns = Zeitintervall-Spalten (PEinsatzzeitTag oder Fallback
//     "Standard") via matrix-helpers.extractScheduleColumns.
//   - Zelle = Kapazitaet (m_iAnzahl der entsprechenden PAssozBeleg-
//     Verknuepfung); fehlende Verknuepfung = 0.
//   - onCellChange: Phase-1-Pragmatismus — wir updaten eine Property
//     `m_iKapMatrix_${ressOid}_${colId}` auf dem synthetischen Group-Knoten
//     IM model-store. Das ist ein Phase-1-Stub — Plan 09 oder Phase 2
//     verdrahtet das auf echte PAssozBeleg-Objekte im Tree, sobald das
//     Backend sie liefert.
//
// Registriert in der viewer-registry unter `klass: "RESS_BELEG_GROUP"`
// (siehe synthetic-nodes.ts).

import { useMemo, useCallback } from "react";
import { MatrixGrid } from "./MatrixGrid";
import {
  getAllOfKlass,
  extractScheduleColumns,
  type ScheduleColumn,
} from "./matrix-helpers";
import {
  SYNTHETIC_RESS_BELEG_KLASS,
  SYNTHETIC_RESS_BELEG_OID,
  setSyntheticProperty,
} from "./synthetic-nodes";
import { registerViewer } from "@/viewers/core/viewer-registry";
import { useModelStore } from "@/state/model-store";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";

/**
 * Eindeutige Cell-Key-Konvention: Wir packen alle Cell-Werte in eine
 * einzige Map, die auf dem synthetischen Group-Knoten als Property
 * `m_aKapazitaeten` lebt. Format: `${ressOid}:${colId}` → number.
 *
 * Vorteil: Der Edit-Pfad nutzt das normale updateProperty + dirty-Set +
 * Undo-Snapshot, ohne dass wir den Tree umstrukturieren muessen.
 *
 * Nachteil: Save-back muss diese Map auf echte PAssozBeleg-Objekte
 * umsetzen — Plan 09 / Phase 2.
 */
const PROPERTY_KEY = "m_aKapazitaeten";

type CellMap = Record<string, number>;

function cellKey(ressOid: number, colId: string): string {
  return `${ressOid}:${colId}`;
}

export const PRessBelegMatrixViewer: ChildDialogComponent = ({ obj }) => {
  const tree = useModelStore((s) => s.tree);

  // Aktuelle CellMap aus dem synthetischen obj. Property kommt aus dem
  // synthetischen Property-Store (siehe synthetic-nodes.ts). Bei erstem
  // Aufruf null → leeres Objekt.
  const stored = (obj.properties[PROPERTY_KEY] ?? null) as CellMap | null;
  const cellMap: CellMap = useMemo(() => stored ?? {}, [stored]);

  const rows = useMemo<OtxJsonNode[]>(() => {
    // Phase-1: Backend liefert Belegungs-Ressourcen als PBetriebsmittel
    // und PPerson; sobald PRessBeleg im Tree auftaucht, werden auch
    // diese aufgenommen.
    return [
      ...getAllOfKlass(tree, "PRessBeleg"),
      ...getAllOfKlass(tree, "PBetriebsmittel"),
      ...getAllOfKlass(tree, "PPerson"),
    ];
  }, [tree]);

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
    <div className="p-6" data-testid="pressbeleg-matrix-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Belegungsressourcen-Matrix
        </h2>
        <p className="text-xs text-gray-500">
          {rows.length} Ressourcen × {columns.length} Schicht
          {columns.length === 1 ? "" : "en"} — Zell-Wert: Kapazitaet
          (m_iAnzahl)
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="pressbeleg-matrix-no-ress"
        >
          Keine Belegungs-Ressourcen im Modell gefunden. Phase 1 erkennt
          PRessBeleg, PBetriebsmittel und PPerson.
        </div>
      ) : (
        <MatrixGrid<OtxJsonNode, ScheduleColumn, number>
          rows={rows}
          columns={columns}
          rowHeader={(r) => (
            <span title={`OID ${r.oid}`}>{r.name || `Ress-${r.oid}`}</span>
          )}
          colHeader={(c) => c.label}
          rowKey={(r) => r.oid}
          colKey={(c) => c.id}
          getCellValue={getCellValue}
          onCellChange={onCellChange}
          testId="pressbeleg-matrix"
          ariaLabel="Belegungsressourcen-Matrix"
        />
      )}

      <p className="mt-3 text-xs text-gray-500" data-testid="pressbeleg-matrix-note">
        Phase-1-Stub: Zellen werden auf dem Matrix-Knoten als
        <code className="mx-1">{PROPERTY_KEY}</code>-Map gespeichert.
        Save-back auf echte PAssozBeleg-Verknuepfungen kommt mit Plan 09.
      </p>
    </div>
  );
};

PRessBelegMatrixViewer.displayName = "PRessBelegMatrixViewer";

registerViewer({
  klass: SYNTHETIC_RESS_BELEG_KLASS,
  component: PRessBelegMatrixViewer,
  displayName: "Belegungsressourcen-Matrix",
});

// Re-Export der synthetischen OID als Bonus fuer Tests.
export { SYNTHETIC_RESS_BELEG_OID };
