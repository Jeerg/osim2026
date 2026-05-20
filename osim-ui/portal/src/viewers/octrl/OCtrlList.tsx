// Plan 01-04 Task 3: OCtrlList — Tabellen-Editor fuer Sub-Listen.
//
// Portierung von OCtrlList.h (C++): OCtrlLListListBoxBasic — Listbox
// mit Add/Remove/Order-Operationen. Phase 1: einfache <table> mit Spalten
// aus metadata.columns. Jede Zeile zeigt ein Sub-Objekt; pro Zelle wird
// der konfigurierte OCtrl-Typ (variable/bool/enum/link) gerendert.
//
// Die Edit-Events fliessen via ChildDialog-Context an den model-store —
// jede Zelle wird in einen eigenen Mini-ChildDialog-Kontext gepackt,
// damit useOCtrlBinding intern auf das ROW-Objekt zugreift.

import { ChildDialog } from "../core/ChildDialog";
import { useChildDialog } from "../core/ChildDialog";
import { useOCtrlBinding, type OCtrlProps } from "../core/OCtrl.types";
import { OCtrlBool } from "./OCtrlBool";
import { OCtrlEnum } from "./OCtrlEnum";
import { OCtrlLink } from "./OCtrlLink";
import { OCtrlVariable } from "./OCtrlVariable";
import type { OtxJsonNode } from "../core/types";

function CellOCtrl({
  octrl,
  property,
}: {
  octrl: "variable" | "bool" | "enum" | "link";
  property: string;
}) {
  switch (octrl) {
    case "bool":
      return <OCtrlBool property={property} />;
    case "enum":
      return <OCtrlEnum property={property} />;
    case "link":
      return <OCtrlLink property={property} />;
    case "variable":
    default:
      return <OCtrlVariable property={property} />;
  }
}

export function OCtrlList({ property, label, readonly }: OCtrlProps) {
  // useOCtrlBinding nur fuer das Label + Metadaten (columns); der "Wert"
  // ist hier nicht primaer — die Liste ergibt sich aus obj.children.
  const { metadata } = useOCtrlBinding<unknown>(property);
  const parent = useChildDialog();

  const columns = metadata.columns ?? [];
  const filter = metadata.childKlassFilter;
  const filterSet = filter
    ? new Set(Array.isArray(filter) ? filter : [filter])
    : null;

  const rows: OtxJsonNode[] = parent.obj.children.filter((c) =>
    filterSet ? filterSet.has(c.klass) : true,
  );

  return (
    <div className="text-sm" data-testid={`octrl-list-${property}`}>
      {(label ?? metadata.label) && (
        <div className="mb-2 font-medium text-gray-700">
          {label ?? metadata.label}
        </div>
      )}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.property}
                className="py-1 pr-3 text-xs font-medium text-gray-500"
              >
                {col.label}
              </th>
            ))}
            {!readonly && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.oid} className="border-b border-gray-100">
              {columns.map((col) => (
                <td key={col.property} className="py-1 pr-3 align-top">
                  <ChildDialog
                    obj={row}
                    onPropertyChange={parent.onPropertyChange}
                    onMethodCall={parent.onMethodCall}
                  >
                    <CellOCtrl octrl={col.octrl} property={col.property} />
                  </ChildDialog>
                </td>
              ))}
              {!readonly && (
                <td className="py-1">
                  <button
                    type="button"
                    onClick={() =>
                      parent.onMethodCall(parent.obj.oid, "removeChild", [
                        row.oid,
                      ])
                    }
                    className="text-xs text-red-700 hover:underline"
                    data-testid={`octrl-list-${property}-remove-${row.oid}`}
                  >
                    x
                  </button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (readonly ? 0 : 1)}
                className="py-2 text-xs italic text-gray-400"
              >
                Keine Eintraege.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!readonly && (
        <button
          type="button"
          onClick={() =>
            parent.onMethodCall(parent.obj.oid, "addChild", [property])
          }
          className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          data-testid={`octrl-list-${property}-add`}
        >
          + Hinzufuegen
        </button>
      )}
    </div>
  );
}
