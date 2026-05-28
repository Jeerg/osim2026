/**
 * AGruppeViewer — Personalgruppen-Editor.
 *
 * C++-Konzeptvorlage: `OSim2004/inc/AGruppeViewer.h`. Zeigt die Properties
 * einer Personalgruppe (Name) und die Mitglieder-Liste `m_oids_personal`
 * als OCtrlList.
 *
 * Phase-1-MVP: reines Wrap um PGObjBaseViewer — das PropertySchema
 * deklariert `m_oids_personal` bereits als `octrl_type: "List"`,
 * `list_item_klass: "PPerson"`. PGObjBaseViewer rendert die Liste
 * generisch via OCtrlList, der allObjects nach Klasse=PPerson filtert.
 *
 * Eine spezialisierte UI (z.B. Mitglieder als Tab oder als Two-Pane mit
 * verfügbarem Personalpool) ist optionale Verbesserung in späteren Phasen.
 */

import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import type { ViewerProps } from "@/viewers/core/types";

export function AGruppeViewer(props: ViewerProps) {
  return <PGObjBaseViewer {...props} />;
}
