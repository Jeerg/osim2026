// Plan 01-08 Task 1: PDlplBetriebsmittelViewer.
//
// Verknuepfungs-Editor Knoten × Belegungs-Ressource. Cross-Tree-Sicht:
// zeigt fuer ALLE Durchlaufplan-Knoten (PDpKn*) eine Matrix gegen alle
// Belegungs-Ressourcen (PBetriebsmittel, PPerson).
//
// Portierung von PDlplBetriebsmittelViewer.h (C++):
//   Das Original ist ein OViewerChildDialog mit einer eigenen OEFunktionCtrl-
//   Anzeige (siehe OEFunktionCtrl-Helper). Phase 1 macht eine einfache
//   Matrix-Sicht: Zeilen = Knoten, Spalten = Belegungs-Ressourcen,
//   Cells = boolean (Knoten ist mit Ressource verknuepft ja/nein).
//
// Phase-1-DISCRETION (Read-only, siehe Plan 01-08 PLAN + SUMMARY):
//   Die echten Verknuepfungs-Objekte (PAssozBelegLink) sind im _SKIP-Set
//   des otx_loaders (engine/src/osim_engine/io/otx_loader.py). Damit
//   kommen sie weder ueber den Roundtrip in den Tree, noch koennen wir
//   sie ohne Engine-Schema-Erweiterung schreiben. Phase 1 liefert deshalb
//   einen Read-only-Viewer mit Hinweis-Banner; der Edit-Pfad bleibt
//   Phase-2-Backlog (siehe Roadmap-Resync Plan 02-XX).
//
// Reuse MatrixGrid aus Plan 01-06 (Plan-Constraint key_links).
//
// Registriert auf der synthetischen Klasse `DLPL_BETRIEBSMITTEL_GROUP`
// (synthetic-nodes.ts). Falls das Backend in Phase 2 echte PDlplBetriebsmittel-
// Container-Knoten liefert, kann zusaetzlich auf der echten Klasse
// registriert werden.

import { useMemo } from "react";
import { MatrixGrid } from "@/viewers/matrix/MatrixGrid";
import { getAllOfKlass } from "@/viewers/matrix/matrix-helpers";
import {
  SYNTHETIC_DLPL_BETRIEBSMITTEL_KLASS,
  SYNTHETIC_DLPL_BETRIEBSMITTEL_OID,
} from "@/viewers/matrix/synthetic-nodes";
import { registerViewer } from "@/viewers/core/viewer-registry";
import { useModelStore } from "@/state/model-store";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";

/**
 * Klass-Prefix-Detektor: alle PDpKn*-Knoten gelten als Durchlaufplan-Knoten.
 * Plan 01-05's TYPE_MAP definiert: PDpKnKonstant, PDpKnMenge, PDpKnMengeRuesten,
 * PDpKnVerteilung, PDpKnRueckKonstant.
 */
function isDpKn(klass: string): boolean {
  return klass.startsWith("PDpKn");
}

function collectKnoten(tree: OtxJsonNode | null): OtxJsonNode[] {
  if (!tree) return [];
  const out: OtxJsonNode[] = [];
  const stack: OtxJsonNode[] = [tree];
  while (stack.length > 0) {
    const node = stack.shift()!;
    if (isDpKn(node.klass)) out.push(node);
    for (const c of node.children) stack.push(c);
  }
  return out;
}

function collectBetriebsmittel(tree: OtxJsonNode | null): OtxJsonNode[] {
  // Phase 1: PBetriebsmittel ist der Standard-Belegungs-Ressourcen-Typ.
  // (PRessBeleg + PPerson koennten ebenfalls relevant sein — wir halten
  // den Filter eng auf "Betriebsmittel" passend zum Viewer-Namen.)
  return [
    ...getAllOfKlass(tree, "PBetriebsmittel"),
    ...getAllOfKlass(tree, "PRessBeleg"),
  ];
}

export const PDlplBetriebsmittelViewer: ChildDialogComponent = ({ obj }) => {
  const tree = useModelStore((s) => s.tree);

  const rows = useMemo<OtxJsonNode[]>(() => collectKnoten(tree), [tree]);
  const cols = useMemo<OtxJsonNode[]>(
    () => collectBetriebsmittel(tree),
    [tree],
  );

  // Phase-1 Read-only: getCellValue liefert IMMER false (keine echten
  // Verknuepfungs-Objekte im Tree). onCellChange ist No-Op + Warning.
  const getCellValue = (): boolean => false;

  const onCellChange = (
    row: OtxJsonNode,
    col: OtxJsonNode,
    value: boolean,
  ) => {
    // Read-only in Phase 1 — Edit-Funktion in Phase 2 (Engine-Schema-
    // Erweiterung erforderlich). MatrixGrid hat readonly={true}, das
    // sollte den onChange ohnehin verhindern.
    console.warn(
      `[PDlplBetriebsmittelViewer] Edit-Operation in Phase 1 nicht ` +
        `unterstuetzt — Engine-Schema-Erweiterung erforderlich. ` +
        `obj=${obj.oid} row=${row.oid} col=${col.oid} value=${value}`,
    );
  };

  return (
    <div className="p-6" data-testid="pdlpl-betriebsmittel-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Knoten ↔ Betriebsmittel-Verknuepfungen
        </h2>
        <p className="text-xs text-gray-500">
          {rows.length} Knoten × {cols.length} Belegungs-Ressource
          {cols.length === 1 ? "" : "n"} — read-only Sicht
        </p>
      </header>

      <div
        className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
        data-testid="pdlpl-betriebsmittel-readonly-banner"
      >
        <strong>Read-only in Phase 1.</strong> Die Verknuepfungs-Objekte
        (PAssozBelegLink) werden vom OTX-Loader aktuell uebersprungen —
        Edit-Funktion kommt in Phase 2 nach Engine-Schema-Erweiterung.
      </div>

      {rows.length === 0 || cols.length === 0 ? (
        <div
          className="rounded border border-gray-200 bg-gray-50 p-4 text-sm italic text-gray-500"
          data-testid="pdlpl-betriebsmittel-empty"
        >
          {rows.length === 0
            ? "Keine Durchlaufplan-Knoten (PDpKn*) im Modell."
            : "Keine Belegungs-Ressourcen (PBetriebsmittel/PRessBeleg) im Modell."}
        </div>
      ) : (
        <MatrixGrid<OtxJsonNode, OtxJsonNode, boolean>
          rows={rows}
          columns={cols}
          rowHeader={(r) => (
            <span title={`OID ${r.oid} (${r.klass})`}>
              {r.name || `Knoten-${r.oid}`}
            </span>
          )}
          colHeader={(c) => (
            <span title={`OID ${c.oid} (${c.klass})`}>
              {c.name || `Ress-${c.oid}`}
            </span>
          )}
          rowKey={(r) => r.oid}
          colKey={(c) => c.oid}
          getCellValue={getCellValue}
          onCellChange={onCellChange}
          readonly
          testId="pdlpl-betriebsmittel-matrix"
          ariaLabel="Knoten-Betriebsmittel-Verknuepfungs-Matrix"
        />
      )}

      <p
        className="mt-3 text-xs text-gray-500"
        data-testid="pdlpl-betriebsmittel-note"
      >
        Phase-1-Stub: read-only Foundation-Sicht. Wenn das Backend in
        Phase 2 PAssozBelegLink-Objekte liefert, werden hier die echten
        Verknuepfungen mit editierbaren Checkboxen erscheinen.
      </p>
    </div>
  );
};

PDlplBetriebsmittelViewer.displayName = "PDlplBetriebsmittelViewer";

registerViewer({
  klass: SYNTHETIC_DLPL_BETRIEBSMITTEL_KLASS,
  component: PDlplBetriebsmittelViewer,
  displayName: "Knoten ↔ Betriebsmittel",
});

export { SYNTHETIC_DLPL_BETRIEBSMITTEL_OID };
