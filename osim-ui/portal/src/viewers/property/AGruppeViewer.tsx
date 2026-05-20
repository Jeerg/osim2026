// Plan 01-05 Task 3: AGruppeViewer — Personal-Gruppen-Editor.
//
// Portierung von AGruppeViewer.h (C++). Phase-1-Scope: Name + Beschreibung
// editierbar + Mitglieder-Liste als read-only Tabelle (Edit-Mode kommt mit
// Plan 08, wenn die Verknuepfungs-Viewer den Personal-Pool definieren).
//
// HINWEIS: Das Backend-TYPE_MAP in osim-ui/app/services/json_tree_service.py
// enthaelt AGruppe aktuell NICHT — der otx_loader liefert AGruppe-Objekte
// nur als unsupported (siehe Plan-Risk). Wenn AGruppe-Daten im Tree
// auftauchen, rendert dieser Viewer sie korrekt; ansonsten faellt
// ClientCtrl auf PGObjBaseViewer zurueck.

import { OCtrlVariable } from "@/viewers/octrl";
import { registerViewer } from "@/viewers/core/viewer-registry";
import { useChildDialog } from "@/viewers/core/ChildDialog";
import type {
  ChildDialogComponent,
  OtxJsonNode,
} from "@/viewers/core/types";

const DEFAULT_MEMBER_KLASS = "PPerson";

function MemberTable({
  members,
  parentOid,
}: {
  members: OtxJsonNode[];
  parentOid: number;
}) {
  const { onMethodCall } = useChildDialog();
  return (
    <div className="text-xs" data-testid="agruppe-members">
      <table className="w-full border-collapse text-left">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1 font-medium">OID</th>
            <th className="px-2 py-1 font-medium">Klasse</th>
            <th className="px-2 py-1 font-medium">Name</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {members.length === 0 && (
            <tr>
              <td colSpan={4} className="px-2 py-2 italic text-gray-400">
                Keine Mitglieder.
              </td>
            </tr>
          )}
          {members.map((m) => (
            <tr
              key={m.oid}
              className="border-t border-gray-200"
              data-testid={`agruppe-member-${m.oid}`}
            >
              <td className="px-2 py-1 font-mono text-gray-600">{m.oid}</td>
              <td className="px-2 py-1">
                <code>{m.klass}</code>
              </td>
              <td className="px-2 py-1">{m.name}</td>
              <td className="px-2 py-1">
                <button
                  type="button"
                  onClick={() =>
                    onMethodCall(parentOid, "removeChild", [m.oid])
                  }
                  className="text-red-700 hover:underline"
                  data-testid={`agruppe-remove-${m.oid}`}
                >
                  x
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() =>
          onMethodCall(parentOid, "addChild", [DEFAULT_MEMBER_KLASS])
        }
        className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
        data-testid="agruppe-add-member"
      >
        + Mitglied hinzufuegen
      </button>
    </div>
  );
}

export const AGruppeViewer: ChildDialogComponent = ({ obj }) => {
  return (
    <div className="p-6" data-testid="agruppe-viewer">
      <header className="mb-4 border-b border-gray-200 pb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          Personal-Gruppe: {obj.name}
        </h2>
        <p className="text-xs text-gray-500">
          AGruppe · OID <code>{obj.oid}</code>
        </p>
      </header>

      <section className="mb-6 max-w-2xl space-y-3">
        <OCtrlVariable property="m_sName" />
        <OCtrlVariable property="m_sBeschreibung" />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Mitglieder ({obj.children.length})
        </h3>
        <MemberTable members={obj.children} parentOid={obj.oid} />
      </section>
    </div>
  );
};

AGruppeViewer.displayName = "AGruppeViewer";

registerViewer({
  klass: "AGruppe",
  component: AGruppeViewer,
  displayName: "Personal-Gruppe",
});
