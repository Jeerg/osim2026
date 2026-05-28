/**
 * PSimulatorViewer — Wrappt PGObjBaseViewer für die Simulator-Root-Klasse.
 *
 * Phase 1: kein Sim-Lauf-Footer (Sim-Lauf kommt in Phase 2). Der Viewer
 * delegiert vollständig an PGObjBaseViewer.
 */

import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import type { ViewerProps } from "@/viewers/core/types";

export function PSimulatorViewer(props: ViewerProps) {
  return (
    <div
      data-viewer="PSimulatorViewer"
      data-viewer-klass={props.obj.klass}
      className="h-full"
    >
      <PGObjBaseViewer {...props} />
    </div>
  );
}
