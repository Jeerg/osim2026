// Plan 01-05 Task 3: PDurchlaufplanViewer-Standard.
// Plan 01-07 Task 2: Tab-Switch Standard/Design (additiv erweitert).
//
// Portierung von PDlplViewerStd.h (C++). Zeigt die Plan-Properties +
// zwei Sub-Tabellen (Knoten / Kanten). Der Backend-Tree wraps die
// Sub-Listen in synthetische _group-Knoten ("Knoten", "Kanten"); wir
// finden sie ueber den Namen.
//
// Add/Remove fuer Knoten/Kanten geht via onMethodCall("addChild", [klass])
// und onMethodCall("removeChild", [oid]) — der ViewerHost (Plan 05 Task 3)
// routet diese Methoden auf model-store.addChildSkeleton/removeNode.
//
// Plan 01-07: Der Standard-Viewer rahmt jetzt einen Tab-Switch (Standard /
// Design); im Design-Modus wird die PDurchlaufplanViewerDesign-Komponente
// (graphisch, reactflow) angezeigt. Beide Modi teilen das gleiche obj.

import { useState } from "react";
import { useChildDialog } from "@/viewers/core/ChildDialog";
import { OCtrlVariable } from "@/viewers/octrl";
import { registerViewer } from "@/viewers/core/viewer-registry";
import { PDurchlaufplanViewerDesign } from "@/viewers/design/PDurchlaufplanViewerDesign";
import type {
  ChildDialogComponent,
  ChildDialogProps,
  OtxJsonNode,
} from "@/viewers/core/types";

const GROUP_KLASS = "_group";

/** Default-Klasse fuer neue Knoten in einem Standard-Plan. */
const DEFAULT_KNOTEN_KLASS = "PDpKnKonstant";
/** Default-Klasse fuer neue Kanten. */
const DEFAULT_KANTE_KLASS = "PDpKaUebergang";

/**
 * Sucht die Sub-Group mit dem gegebenen Namen (z.B. "Knoten", "Kanten")
 * in den Children. Liefert null, wenn nicht gefunden.
 */
function findGroup(
  obj: OtxJsonNode,
  name: string,
): OtxJsonNode | null {
  return (
    obj.children.find((c) => c.klass === GROUP_KLASS && c.name === name) ??
    null
  );
}

/**
 * Rendert eine read-only Tabelle der Sub-Knoten einer Gruppe (oid, klass,
 * name, evtl. weitere Spalten). Plus "+"/"X"-Buttons.
 *
 * Edit der einzelnen Knoten-Properties geht ueber Sidebar-Klick →
 * eigener Knoten-Viewer (PGObjBaseViewer als Fallback fuer
 * Phase-1-Knoten-Klassen, die noch keinen spezifischen Viewer haben).
 */
function GroupTable({
  group,
  columns,
  addKlass,
  parentOid,
}: {
  group: OtxJsonNode | null;
  columns: { property: string; label: string }[];
  addKlass: string;
  parentOid: number;
}) {
  const { onMethodCall } = useChildDialog();
  const items = group?.children ?? [];

  return (
    <div className="text-xs" data-testid={`dlpl-group-${group?.name ?? "n/a"}`}>
      <table className="w-full border-collapse text-left">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-2 py-1 font-medium">OID</th>
            <th className="px-2 py-1 font-medium">Klasse</th>
            <th className="px-2 py-1 font-medium">Name</th>
            {columns.map((c) => (
              <th key={c.property} className="px-2 py-1 font-medium">
                {c.label}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td
                colSpan={3 + columns.length + 1}
                className="px-2 py-2 italic text-gray-400"
              >
                Keine Eintraege.
              </td>
            </tr>
          )}
          {items.map((it) => (
            <tr
              key={it.oid}
              className="border-t border-gray-200"
              data-testid={`dlpl-row-${it.oid}`}
            >
              <td className="px-2 py-1 font-mono text-gray-600">{it.oid}</td>
              <td className="px-2 py-1">
                <code>{it.klass}</code>
              </td>
              <td className="px-2 py-1">{it.name}</td>
              {columns.map((c) => (
                <td
                  key={c.property}
                  className="px-2 py-1 font-mono text-gray-700"
                >
                  {formatPropertyValue(it.properties[c.property])}
                </td>
              ))}
              <td className="px-2 py-1">
                <button
                  type="button"
                  onClick={() =>
                    onMethodCall(parentOid, "removeChild", [it.oid])
                  }
                  className="text-red-700 hover:underline"
                  data-testid={`dlpl-remove-${it.oid}`}
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
        onClick={() => onMethodCall(parentOid, "addChild", [addKlass])}
        className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
        data-testid={`dlpl-add-${addKlass}`}
      >
        + {addKlass} hinzufuegen
      </button>
    </div>
  );
}

function formatPropertyValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  return String(v);
}

/**
 * Standard-Modus: Properties + Knoten-/Kanten-Tabellen.
 * Extrahiert aus dem urspruenglichen PDurchlaufplanViewerStd, damit der
 * Tab-Switch beide Modi mounten kann.
 */
function PDurchlaufplanStandardMode({ obj }: ChildDialogProps) {
  // Achtung: Add/Remove muss am PARENT-Knoten der Sub-Liste hängen, nicht
  // an der _group. Aber: Im Backend ist die _group nur eine virtuelle
  // Konstruktion — der echte Parent ist der Durchlaufplan. addChild
  // routen wir auf obj.oid (Plan), nicht auf die _group-oid (-1).
  //
  // Wenn ein Phase-2-Serializer die _group entfernt und Knoten direkt
  // unter Plan haengt, ist das transparent — der Frontend-Code referenziert
  // Knoten ueber obj.oid (Plan) und holt sich die Liste ueber den
  // Group-Namen.
  const knGroup = findGroup(obj, "Knoten");
  const kaGroup = findGroup(obj, "Kanten");

  return (
    <div className="p-6" data-testid="pdurchlaufplan-viewer-std-mode-standard">
      <section className="mb-6 max-w-2xl">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Plan-Properties
        </h3>
        <div className="grid grid-cols-1 gap-3">
          <OCtrlVariable property="m_sName" />
        </div>
      </section>

      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Knoten ({knGroup?.children.length ?? 0})
        </h3>
        <GroupTable
          group={knGroup}
          parentOid={obj.oid}
          addKlass={DEFAULT_KNOTEN_KLASS}
          columns={[
            { property: "m_iDurchfuehrungszeit", label: "Dauer (s)" },
          ]}
        />
        <p className="mt-2 text-xs text-gray-500">
          Default-Klasse fuer neue Knoten: <code>{DEFAULT_KNOTEN_KLASS}</code>.
          Klick auf einen Knoten in der Sidebar oeffnet den passenden
          Detail-Viewer.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          Kanten ({kaGroup?.children.length ?? 0})
        </h3>
        <GroupTable
          group={kaGroup}
          parentOid={obj.oid}
          addKlass={DEFAULT_KANTE_KLASS}
          columns={[
            { property: "m_iUebergangszeit", label: "Uebergangszeit (s)" },
          ]}
        />
      </section>
    </div>
  );
}

type ViewerMode = "standard" | "design";

export const PDurchlaufplanViewerStd: ChildDialogComponent = (props) => {
  const { obj } = props;
  const [mode, setMode] = useState<ViewerMode>("standard");

  return (
    <div
      className="flex h-full flex-col"
      data-testid="pdurchlaufplan-viewer-std"
    >
      <header className="border-b border-gray-200 px-6 pb-2 pt-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Durchlaufplan: {obj.name}
        </h2>
        <p className="text-xs text-gray-500">
          PDurchlaufplan · OID <code>{obj.oid}</code>
        </p>
        <div className="mt-3 flex gap-1 border-b border-transparent">
          <button
            type="button"
            onClick={() => setMode("standard")}
            className={[
              "border-b-2 px-3 py-1 text-xs",
              mode === "standard"
                ? "border-blue-600 font-semibold text-blue-700"
                : "border-transparent text-gray-600 hover:text-gray-800",
            ].join(" ")}
            data-testid="pdurchlaufplan-tab-standard"
            aria-pressed={mode === "standard"}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => setMode("design")}
            className={[
              "border-b-2 px-3 py-1 text-xs",
              mode === "design"
                ? "border-blue-600 font-semibold text-blue-700"
                : "border-transparent text-gray-600 hover:text-gray-800",
            ].join(" ")}
            data-testid="pdurchlaufplan-tab-design"
            aria-pressed={mode === "design"}
          >
            Design
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        {mode === "standard" ? (
          <PDurchlaufplanStandardMode {...props} />
        ) : (
          <PDurchlaufplanViewerDesign {...props} />
        )}
      </div>
    </div>
  );
};

PDurchlaufplanViewerStd.displayName = "PDurchlaufplanViewerStd";

registerViewer({
  klass: "PDurchlaufplan",
  component: PDurchlaufplanViewerStd,
  displayName: "Durchlaufplan (Standard)",
});
