/**
 * PRessMengeMatrixViewer — Matrix-Tabellen-Viewer fuer alle Mengen-
 * Ressourcen (PRessMenge) eines Modells.
 *
 * Mengen-Pendant zur kommenden Belegungs-Matrix (Welle 1.2-E unter
 * portal/src/viewers/PRessBelegMatrix/). C++-Konzeptvorlage:
 * `OSim2004/inc/PRessMengeMatrixViewer.h`.
 *
 * Eine generische `<ResourceMatrix klass="..." columns={...} createDefaults={...} />`
 * waere denkbar — die Logik ist modulo Klassen-Filter und Spalten-Definition
 * identisch. Phase-1-Pragma: Wir lassen den Viewer eigenstaendig stehen weil:
 *   1. Mengen-Defaults fuer "+ Neu" (Anfangsbestand + Nachschub) divergieren
 *      strukturell von Belegungs-Defaults (Kapazitaet).
 *   2. Bei Phase-4-Erweiterung (z.B. Verbrauchs-Visualisierung pro
 *      Mengen-Zeile) divergiert der Code ohnehin.
 *   3. Code-Duplikation ≈ Sub-Linear-Cost; eine generische Abstraktion
 *      wuerde hier eher schaden (zu viele Optional-Props).
 *
 * Schema-Felder (siehe `app/static/schemas/v1/schemas.json` Z.185-198):
 *   m_sName, m_iMenge, m_sEinheit, m_iNachschubMenge, m_iNachschubIntervall,
 *   m_iMaxMenge, m_dKostensatz, m_sBemerkung
 */

import { Button } from "@/components/ui/button";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import { useModelStore } from "@/stores/model-store";
import type { OBaseObj, ViewerProps } from "@/viewers/core/types";
import { MatrixTable, type MatrixColumn } from "./matrix-common";

const COLUMNS: MatrixColumn<OBaseObj>[] = [
  {
    key: "m_sName",
    label: "Name",
    octrl_type: "Variable",
    value_type: "string",
    width: "220px",
    accessor: (row) => row.attrs.m_sName,
  },
  {
    key: "m_iMenge",
    label: "Menge (Anfangsbestand)",
    octrl_type: "Variable",
    value_type: "int",
    width: "160px",
    accessor: (row) => row.attrs.m_iMenge,
  },
  {
    key: "m_sEinheit",
    label: "Einheit",
    octrl_type: "Variable",
    value_type: "string",
    width: "100px",
    accessor: (row) => row.attrs.m_sEinheit,
  },
  {
    key: "m_iNachschubMenge",
    label: "Nachschub-Menge",
    octrl_type: "Variable",
    value_type: "int",
    width: "140px",
    accessor: (row) => row.attrs.m_iNachschubMenge,
  },
  {
    key: "m_iNachschubIntervall",
    label: "Nachschub-Intervall (s)",
    octrl_type: "Variable",
    value_type: "int",
    width: "160px",
    accessor: (row) => row.attrs.m_iNachschubIntervall,
  },
  {
    key: "m_iMaxMenge",
    label: "Max. Menge",
    octrl_type: "Variable",
    value_type: "int",
    width: "120px",
    accessor: (row) => row.attrs.m_iMaxMenge,
  },
  {
    key: "m_dKostensatz",
    label: "Kostensatz (€/Einheit)",
    octrl_type: "Variable",
    value_type: "float",
    width: "150px",
    accessor: (row) => row.attrs.m_dKostensatz,
  },
  {
    key: "m_sBemerkung",
    label: "Bemerkung",
    octrl_type: "Variable",
    value_type: "string",
    accessor: (row) => row.attrs.m_sBemerkung,
  },
];

export function PRessMengeMatrixViewer({
  allObjects,
  disabled,
}: ViewerProps) {
  const ressourcen = Object.values(allObjects)
    .filter((o) => o.klass === "PRessMenge")
    .sort((a, b) => a.oid - b.oid);

  const onCellEdit = (row: OBaseObj, columnKey: string, newValue: unknown) => {
    useModelStore.getState().patchObject(row.oid, { [columnKey]: newValue as never });
  };

  const onNeu = () => {
    useModelStore.getState().createObject("PRessMenge", {
      m_sName: "Neue Mengenressource",
      m_iMenge: 0,
      m_sEinheit: "Stk",
      m_iNachschubMenge: 0,
      m_iNachschubIntervall: 0,
      m_dKostensatz: 0,
    });
  };

  return (
    <ChildDialog
      title={`Mengenressourcen — ${ressourcen.length} Einträge`}
      description="Matrix-Ansicht aller PRessMenge-Objekte des Modells"
      footer={
        <Button type="button" onClick={onNeu} disabled={disabled}>
          + Neu
        </Button>
      }
    >
      <div data-viewer="PRessMengeMatrixViewer">
        <MatrixTable<OBaseObj>
          rows={ressourcen}
          columns={COLUMNS}
          rowKey={(r) => `oid:${r.oid}`}
          onCellEdit={onCellEdit}
          disabled={disabled}
          emptyMessage="Keine Mengenressourcen vorhanden"
        />
      </div>
    </ChildDialog>
  );
}
