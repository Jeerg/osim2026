/**
 * PDlplBetriebsmittelViewer — Verknüpfungs-Editor Knoten ↔ Betriebsmittel.
 *
 * C++-Konzeptvorlage: `OSim2004/inc/PDlplBetriebsmittelViewer.h`. Zeigt die
 * drei Felder (Knoten-Link, Betriebsmittel-Link, Anteil/Faktor), die das
 * PropertySchema bereits als OCtrls modelliert.
 *
 * Phase-1-MVP: reines Wrap um `PGObjBaseViewer`. Spezialisierte UI — z.B.
 * Drag-and-Drop einer Verknüpfung im Design-Editor — kommt in Phase 4, wenn
 * die graphische GraphObject-Schicht Knoten↔Ressource visualisiert.
 */

import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import type { ViewerProps } from "@/viewers/core/types";

export function PDlplBetriebsmittelViewer(props: ViewerProps) {
  return <PGObjBaseViewer {...props} />;
}
