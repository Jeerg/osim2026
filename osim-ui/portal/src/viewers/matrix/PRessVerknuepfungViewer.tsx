// Plan 01-06 Task 2: PRessVerknuepfungViewer.
//
// Portierung von PRessVerknuepfungViewer.h (C++):
//   - Adjazenz-Matrix Ressource × Ressource (quadratisch).
//   - rows = columns = alle Ressourcen (PBetriebsmittel + PPerson +
//     PRessMenge + PRessBeleg, dedupliziert nach oid).
//   - Zelle = boolean (verknuepft ja/nein).
//   - Diagonal-Disable: Ressource mit sich selbst nicht verknuepfbar.
//   - Symmetrie: Wenn (A, B) auf true gesetzt wird, wird auch (B, A) auf
//     true gesetzt — Verknuepfungen sind ungerichtet (siehe Original-
//     PRessVerknuepfung.h: "anzeige, mit welchen Knoten eine Resource
//     verkn�pft ist").
//
// Phase-1-Speicher: Property `m_aLinks` auf dem synthetischen Group-
// Knoten, Format: Record<"oid1:oid2", true> (sorted ascending damit
// Symmetrie deterministisch ist).

import { useMemo, useCallback } from "react";
import { MatrixGrid } from "./MatrixGrid";
import { getAllRessources } from "./matrix-helpers";
import {
  SYNTHETIC_RESS_VERKN_KLASS,
  SYNTHETIC_RESS_VERKN_OID,
  setSyntheticProperty,
} from "./synthetic-nodes";
import { registerViewer } from "@/viewers/core/viewer-registry";
import { useModelStore } from "@/state/model-store";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";

const PROPERTY_KEY = "m_aLinks";

type LinkMap = Record<string, true>;

function linkKey(a: number, b: number): string {
  // Aufsteigend sortieren → symmetrisch.
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${lo}:${hi}`;
}

export const PRessVerknuepfungViewer: ChildDialogComponent = ({ obj }) => {
  const tree = useModelStore((s) => s.tree);

  const stored = (obj.properties[PROPERTY_KEY] ?? null) as LinkMap | null;
  const linkMap: LinkMap = useMemo(() => stored ?? {}, [stored]);

  const rows = useMemo<OtxJsonNode[]>(() => {
    // Deduplizieren ueber oid (vermeidet Duplikate wenn dieselbe
    // Ressource in mehreren Sub-Trees aufscheint, z.B. _group-Wrapper).
    const seen = new Set<number>();
    const out: OtxJsonNode[] = [];
    for (const r of getAllRessources(tree)) {
      if (seen.has(r.oid)) continue;
      seen.add(r.oid);
      out.push(r);
    }
    return out;
  }, [tree]);

  const getCellValue = useCallback(
    (row: OtxJsonNode, col: OtxJsonNode): boolean => {
      const k = linkKey(row.oid, col.oid);
      return Boolean(linkMap[k]);
    },
    [linkMap],
  );

  const onCellChange = useCallback(
    (row: OtxJsonNode, col: OtxJsonNode, value: boolean) => {
      if (row.oid === col.oid) return; // Diagonal — sollte disabled sein.
      const k = linkKey(row.oid, col.oid);
      const next: LinkMap = { ...linkMap };
      if (value) {
        next[k] = true;
      } else {
        delete next[k];
      }
      setSyntheticProperty(obj.oid, PROPERTY_KEY, next);
    },
    [linkMap, obj.oid],
  );

  return (
    <div className="p-6" data-testid="pressverknuepfung-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Ressourcen-Verknuepfungen
        </h2>
        <p className="text-xs text-gray-500">
          {rows.length} × {rows.length} Adjazenz-Matrix — ungerichtet
          (symmetrisch). Diagonale ist disabled.
        </p>
      </header>

      {rows.length === 0 ? (
        <div
          className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="pressverknuepfung-no-ress"
        >
          Keine Ressourcen im Modell gefunden.
        </div>
      ) : (
        <MatrixGrid<OtxJsonNode, OtxJsonNode, boolean>
          rows={rows}
          columns={rows}
          rowHeader={(r) => (
            <span title={`OID ${r.oid}`}>{r.name || `Ress-${r.oid}`}</span>
          )}
          colHeader={(c) => (
            <span title={`OID ${c.oid}`}>{c.name || `Ress-${c.oid}`}</span>
          )}
          rowKey={(r) => r.oid}
          colKey={(c) => c.oid}
          getCellValue={getCellValue}
          onCellChange={onCellChange}
          isDisabled={(r, c) => r.oid === c.oid}
          testId="pressverknuepfung-matrix"
          ariaLabel="Ressourcen-Verknuepfungs-Matrix"
        />
      )}

      <p
        className="mt-3 text-xs text-gray-500"
        data-testid="pressverknuepfung-note"
      >
        Phase-1-Stub: Verknuepfungen werden als
        <code className="mx-1">{PROPERTY_KEY}</code>-Map (sortierte OID-Paare)
        gespeichert. Save-back auf PRessVerknuepfung-Objekte mit Plan 09.
      </p>
    </div>
  );
};

PRessVerknuepfungViewer.displayName = "PRessVerknuepfungViewer";

registerViewer({
  klass: SYNTHETIC_RESS_VERKN_KLASS,
  component: PRessVerknuepfungViewer,
  displayName: "Ressourcen-Verknuepfungen",
});

export { SYNTHETIC_RESS_VERKN_OID };
