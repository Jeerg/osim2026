// Plan 01-08 Task 1: PDlplPersonalViewer.
//
// Verknuepfungs-Editor Knoten × Personal-Ressource. Analog zum
// PDlplBetriebsmittelViewer (siehe dortige Header-Doku), aber Spalten =
// Personen (PPerson) + Personal-Gruppen (AGruppe). Cross-Tree-Sicht.
//
// Portierung von PDlplPersonalViewer.h (C++). Wie der Betriebsmittel-
// Viewer ist auch dieser in Phase 1 READ-ONLY — Edit-Funktion wartet auf
// Engine-Schema-Erweiterung (Phase 2 backlog).
//
// Reuse MatrixGrid aus Plan 01-06.
//
// Registriert auf der synthetischen Klasse `DLPL_PERSONAL_GROUP`.

import { useMemo } from "react";
import { MatrixGrid } from "@/viewers/matrix/MatrixGrid";
import { getAllOfKlass } from "@/viewers/matrix/matrix-helpers";
import {
  SYNTHETIC_DLPL_PERSONAL_KLASS,
  SYNTHETIC_DLPL_PERSONAL_OID,
} from "@/viewers/matrix/synthetic-nodes";
import { registerViewer } from "@/viewers/core/viewer-registry";
import { useModelStore } from "@/state/model-store";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";

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

function collectPersonal(tree: OtxJsonNode | null): OtxJsonNode[] {
  // Personal-Ressourcen: Einzel-Personen (PPerson) + Gruppen (AGruppe).
  return [
    ...getAllOfKlass(tree, "PPerson"),
    ...getAllOfKlass(tree, "AGruppe"),
  ];
}

export const PDlplPersonalViewer: ChildDialogComponent = ({ obj }) => {
  const tree = useModelStore((s) => s.tree);

  const rows = useMemo<OtxJsonNode[]>(() => collectKnoten(tree), [tree]);
  const cols = useMemo<OtxJsonNode[]>(() => collectPersonal(tree), [tree]);

  // Phase-1 Read-only.
  const getCellValue = (): boolean => false;

  const onCellChange = (
    row: OtxJsonNode,
    col: OtxJsonNode,
    value: boolean,
  ) => {
    console.warn(
      `[PDlplPersonalViewer] Edit-Operation in Phase 1 nicht ` +
        `unterstuetzt — Engine-Schema-Erweiterung erforderlich. ` +
        `obj=${obj.oid} row=${row.oid} col=${col.oid} value=${value}`,
    );
  };

  return (
    <div className="p-6" data-testid="pdlpl-personal-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Knoten ↔ Personal-Verknuepfungen
        </h2>
        <p className="text-xs text-gray-500">
          {rows.length} Knoten × {cols.length} Personal-Ressource
          {cols.length === 1 ? "" : "n"} — read-only Sicht
        </p>
      </header>

      <div
        className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
        data-testid="pdlpl-personal-readonly-banner"
      >
        <strong>Read-only in Phase 1.</strong> Die Verknuepfungs-Objekte
        (PAssoz-Links) werden vom OTX-Loader aktuell uebersprungen —
        Edit-Funktion kommt in Phase 2 nach Engine-Schema-Erweiterung.
      </div>

      {rows.length === 0 || cols.length === 0 ? (
        <div
          className="rounded border border-gray-200 bg-gray-50 p-4 text-sm italic text-gray-500"
          data-testid="pdlpl-personal-empty"
        >
          {rows.length === 0
            ? "Keine Durchlaufplan-Knoten (PDpKn*) im Modell."
            : "Keine Personal-Ressourcen (PPerson/AGruppe) im Modell."}
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
              {c.name || `Pers-${c.oid}`}
            </span>
          )}
          rowKey={(r) => r.oid}
          colKey={(c) => c.oid}
          getCellValue={getCellValue}
          onCellChange={onCellChange}
          readonly
          testId="pdlpl-personal-matrix"
          ariaLabel="Knoten-Personal-Verknuepfungs-Matrix"
        />
      )}

      <p
        className="mt-3 text-xs text-gray-500"
        data-testid="pdlpl-personal-note"
      >
        Phase-1-Stub: read-only Foundation-Sicht. Wenn das Backend in
        Phase 2 die Verknuepfungs-Objekte liefert, werden hier die echten
        Verknuepfungen mit editierbaren Checkboxen erscheinen.
      </p>
    </div>
  );
};

PDlplPersonalViewer.displayName = "PDlplPersonalViewer";

registerViewer({
  klass: SYNTHETIC_DLPL_PERSONAL_KLASS,
  component: PDlplPersonalViewer,
  displayName: "Knoten ↔ Personal",
});

export { SYNTHETIC_DLPL_PERSONAL_OID };
