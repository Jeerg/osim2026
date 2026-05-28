/**
 * PDlplPersonalViewer — Verknüpfungs-Editor Knoten ↔ Personal.
 *
 * C++-Konzeptvorlage: `OSim2004/inc/PDlplPersonalViewer.h`. Strukturell
 * identisch zu `PDlplBetriebsmittelViewer`, nur ein anderes link_target_klass
 * (PPerson statt PBetriebsmittel) — das steht im PropertySchema, hier ist
 * kein Unterschied im Viewer-Code nötig.
 *
 * Phase-1-MVP: reines Wrap um `PGObjBaseViewer`. Spezialisierte UI in Phase 4.
 */

import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import type { ViewerProps } from "@/viewers/core/types";

export function PDlplPersonalViewer(props: ViewerProps) {
  return <PGObjBaseViewer {...props} />;
}
