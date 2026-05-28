/**
 * PDurchlaufplanViewerStd — Standard-Ansicht eines Durchlaufplans.
 *
 * C++-Konzeptvorlage: `OSim2004/inc/PDlplViewerStd.h`. Zeigt drei Tabs:
 *   1. "Eigenschaften" — Property-Editor (PGObjBaseViewer)
 *   2. "Knoten (N)" — OCtrlList der Prozess-Knoten (`obj.sub_refs[0]`)
 *   3. "Kanten (N)" — OCtrlList der Kanten (`obj.sub_refs[1]`)
 *
 * Die graphische Design-Variante ist `PDurchlaufplanViewerDesign` (Plan 10).
 * Die Registry wählt anhand des `viewerHint` ("std" vs. "design") aus.
 *
 * sub_refs-Layout: Plan 04 SUMMARY dokumentiert, dass das Wire-Format
 * sub_refs als List-of-Lists exponiert; Slot 0 = Knoten, Slot 1 = Kanten
 * (Konvention aus dem OSim-Reader). Wir greifen defensiv mit `?? []` zu.
 *
 * Phase-1-Grenze: Reordering der Knoten-/Kanten-Liste (drag-and-drop)
 * landet als `onChange` auf der OCtrlList, ist hier aber als **noop**
 * implementiert — die Liste ist read-only-anzeigend, Add/Remove läuft über
 * `onCommand({type:"create", …})` bzw. row-Deletion in der OCtrlList. Plan 10
 * ergänzt echtes Reordering im Design-Viewer.
 */

import * as React from "react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import { OCtrlList, OCtrlTabViewer } from "@/viewers/core/octrl";
import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import type {
  PropertyMeta,
  ViewerProps,
} from "@/viewers/core/types";

/**
 * Synthetische PropertyMeta für die Knoten-Liste — wird der OCtrlList als
 * Schema-Prop übergeben, damit Label und list_item_klass stimmen.
 */
const knotenListMeta: PropertyMeta = {
  name: "_knoten",
  label_de: "Knoten",
  octrl_type: "List",
  list_item_klass: "PDpKnKonstant",
  description_de: "Prozess-Knoten dieses Durchlaufplans",
};

const kantenListMeta: PropertyMeta = {
  name: "_kanten",
  label_de: "Kanten",
  octrl_type: "List",
  list_item_klass: "PDlplKante",
  description_de: "Kanten zwischen den Knoten",
};

export function PDurchlaufplanViewerStd(props: ViewerProps) {
  const { obj, allObjects, onCommand, disabled } = props;
  const [tab, setTab] = React.useState<string>("eigenschaften");

  // Defensiv: sub_refs ist eine List-of-Lists; Slots können fehlen.
  const knotenOids: number[] = obj.sub_refs[0] ?? [];
  const kantenOids: number[] = obj.sub_refs[1] ?? [];

  const handleKnotenChange = (next: number[] | null) => {
    // Phase 1: nur Remove (Row-Filter) wird in die sub_refs übernommen.
    // Reordering ist Phase-2/Plan-10. Wir dispatchen ein sub_refs_update-
    // Command, das der Workspace-handleCommand verdrahtet (oder no-op).
    onCommand({
      type: "sub_refs_update",
      oid: obj.oid,
      slot: 0,
      newList: next ?? [],
    });
  };

  const handleKantenChange = (next: number[] | null) => {
    onCommand({
      type: "sub_refs_update",
      oid: obj.oid,
      slot: 1,
      newList: next ?? [],
    });
  };

  const title =
    typeof obj.attrs["m_sName"] === "string"
      ? `Durchlaufplan — ${obj.attrs["m_sName"]}`
      : `Durchlaufplan — oid ${obj.oid}`;

  return (
    <ChildDialog title={title} description={obj.klass}>
      <div
        data-viewer="PDurchlaufplanViewerStd"
        data-viewer-klass={obj.klass}
        className="h-full"
      >
        <OCtrlTabViewer
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: "eigenschaften",
              label: "Eigenschaften",
              content: <PGObjBaseViewer {...props} />,
            },
            {
              id: "knoten",
              label: `Knoten (${knotenOids.length})`,
              content: (
                <div className="p-4">
                  <OCtrlList
                    value={knotenOids}
                    onChange={handleKnotenChange}
                    schema={knotenListMeta}
                    allObjects={allObjects}
                    onCreate={(klass) =>
                      onCommand({ type: "create", objKlass: klass })
                    }
                    onOpenSubViewer={(oid) =>
                      onCommand({ type: "open-sub-viewer", oid })
                    }
                    disabled={disabled}
                  />
                </div>
              ),
            },
            {
              id: "kanten",
              label: `Kanten (${kantenOids.length})`,
              content: (
                <div className="p-4">
                  <OCtrlList
                    value={kantenOids}
                    onChange={handleKantenChange}
                    schema={kantenListMeta}
                    allObjects={allObjects}
                    onCreate={(klass) =>
                      onCommand({ type: "create", objKlass: klass })
                    }
                    onOpenSubViewer={(oid) =>
                      onCommand({ type: "open-sub-viewer", oid })
                    }
                    disabled={disabled}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </ChildDialog>
  );
}
