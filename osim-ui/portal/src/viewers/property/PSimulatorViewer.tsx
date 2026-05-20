// Plan 01-05 Task 2: PSimulatorViewer — Top-Level-Modell-Uebersicht.
//
// Portierung von PSimulatorViewer.h (C++): Zentraler Property-Editor fuer
// den Modell-Root. Zeigt die ASimulator-Properties (Seed, Sim-Dauer,
// Perioden-Konfiguration, Start-/End-Datum) editierbar an + eine
// Zusammenfassung der enthaltenen Strukturen (Auslöser-Count,
// Durchlaufplan-Count, Ressourcen-Count) als Read-Only-Footer.
//
// Registriert in der viewer-registry unter `klass: "ASimulator"` (das ist
// die Top-Level-Klasse im OTX-Format, siehe Backend
// json_tree_service.py — `klass_of[0]` wird auf `"ASimulator"` gesetzt,
// wenn der otx_loader das original_otx mit-liefert).

import { OCtrlBool, OCtrlVariable } from "@/viewers/octrl";
import { registerViewer } from "@/viewers/core/viewer-registry";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";

const GROUP_KLASS = "_group";

/**
 * Liefert die Kinder einer bestimmten Klasse aus dem (potenziell
 * geschachtelten) Sub-Tree des Sim-Knotens. Beruecksichtigt die
 * synthetischen `_group`-Wrapper, die das Backend einfuegt.
 */
function countDescendantsByKlass(
  root: OtxJsonNode,
  klass: string,
): number {
  let count = 0;
  for (const c of root.children) {
    if (c.klass === klass) count += 1;
    if (c.klass === GROUP_KLASS || c.children.length > 0) {
      count += countDescendantsByKlass(c, klass);
    }
  }
  return count;
}

export const PSimulatorViewer: ChildDialogComponent = ({ obj }) => {
  const ausloeserCount =
    countDescendantsByKlass(obj, "PAslEinzel") +
    countDescendantsByKlass(obj, "EPAslEntAufExtern") +
    countDescendantsByKlass(obj, "ACOAnt");
  const planCount = countDescendantsByKlass(obj, "PDurchlaufplan");
  const ressBmCount = countDescendantsByKlass(obj, "PBetriebsmittel");
  const ressPersCount = countDescendantsByKlass(obj, "PPerson");
  const einsatzCount = countDescendantsByKlass(obj, "PEinsatzzeitTag");

  return (
    <div className="p-6" data-testid="psimulator-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Modell-Uebersicht: {obj.name}
        </h2>
        <p className="text-xs text-gray-500">
          ASimulator (Root-Knoten) · OID <code>{obj.oid}</code>
        </p>
      </header>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Stammdaten
        </h3>
        <div className="grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
          <OCtrlVariable property="m_sName" />
          <OCtrlVariable property="m_keim" />
          <OCtrlVariable property="m_periodLen" />
          <OCtrlVariable property="m_periodNum" />
          <OCtrlVariable property="m_periodBegin" />
          <OCtrlVariable property="m_iProduktionBezugsPeriode" />
          <OCtrlVariable property="m_iProduktionEnde" />
          <OCtrlBool property="m_bIsProduktionEnde" />
          <OCtrlVariable property="m_sStartDate" />
          <OCtrlVariable property="m_sEndDate" />
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Modell-Inhalt
        </h3>
        <dl
          className="grid grid-cols-[12rem_1fr] gap-y-1 text-sm"
          data-testid="psimulator-summary"
        >
          <dt className="text-gray-600">Ausloeser</dt>
          <dd className="font-mono">{ausloeserCount}</dd>
          <dt className="text-gray-600">Durchlaufplaene</dt>
          <dd className="font-mono">{planCount}</dd>
          <dt className="text-gray-600">Belegungsressourcen (Maschinen)</dt>
          <dd className="font-mono">{ressBmCount}</dd>
          <dt className="text-gray-600">Personal-Ressourcen</dt>
          <dd className="font-mono">{ressPersCount}</dd>
          <dt className="text-gray-600">Einsatzzeit-Tage</dt>
          <dd className="font-mono">{einsatzCount}</dd>
        </dl>
      </section>
    </div>
  );
};

PSimulatorViewer.displayName = "PSimulatorViewer";

registerViewer({
  klass: "ASimulator",
  component: PSimulatorViewer,
  displayName: "Modell-Uebersicht",
});
