// Plan 01-05 Task 2: PGObjBaseViewer — Generischer Fallback-Viewer.
//
// Portierung von PGObjBaseViewer.h (C++): zeigt ALLE Properties eines
// Objektes als OCtrlVariable + ALLE Children als read-only-Tabelle.
//
// In der viewer-registry registriert unter `klass: "PGObjBase"` — das ist
// die Fallback-Klasse, auf die ClientCtrl/ChildCtrl bei unbekannten
// Klassen zurueckfaellt (siehe ClientCtrl.FALLBACK_KLASS).

import { OCtrlVariable } from "@/viewers/octrl";
import { registerViewer } from "@/viewers/core/viewer-registry";
import type { ChildDialogComponent } from "@/viewers/core/types";

export const PGObjBaseViewer: ChildDialogComponent = ({ obj }) => {
  const propertyKeys = Object.keys(obj.properties);
  const hasProperties = propertyKeys.length > 0;
  return (
    <div className="p-6" data-testid="pgobj-base-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">{obj.name}</h2>
        <p className="text-xs text-gray-500">
          Klasse: <code>{obj.klass}</code>
          {obj.unsupported && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
              unsupported
            </span>
          )}{" "}
          · OID: <code>{obj.oid}</code>
        </p>
      </header>

      {hasProperties ? (
        <div className="grid max-w-2xl grid-cols-1 gap-3 md:grid-cols-2">
          {propertyKeys.map((key) => (
            <OCtrlVariable
              key={key}
              property={key}
              label={key}
              readonly={obj.unsupported}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm italic text-gray-500">
          Keine Properties verfuegbar.
        </p>
      )}

      {obj.children.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Sub-Objekte ({obj.children.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="pgobj-children-table">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">OID</th>
                  <th className="px-2 py-1 text-left font-medium">Klasse</th>
                  <th className="px-2 py-1 text-left font-medium">Name</th>
                </tr>
              </thead>
              <tbody>
                {obj.children.map((c) => (
                  <tr key={`${c.oid}-${c.name}`} className="border-t border-gray-200">
                    <td className="px-2 py-1 font-mono text-gray-600">{c.oid}</td>
                    <td className="px-2 py-1">
                      <code className="text-gray-700">{c.klass}</code>
                    </td>
                    <td className="px-2 py-1">{c.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

PGObjBaseViewer.displayName = "PGObjBaseViewer";

registerViewer({
  klass: "PGObjBase",
  component: PGObjBaseViewer,
  displayName: "Generischer Property-Editor",
});
