/**
 * AEinsatzWunschViewer — Schicht-/Einsatzwunsch-Editor.
 *
 * C++-Konzeptvorlage: `OSim2004/inc/AEinsatzWunschViewer.h`. Zeigt die
 * Properties einer Schicht-Definition: Name, Beginn-Datum, End-Datum,
 * Anteil/Faktor. Das PropertySchema (Plan 07) liefert genau diese 4-6
 * Felder; PGObjBaseViewer rendert sie generisch.
 *
 * Phase-1-MVP: reines Wrap. Eine spezialisierte Kalender-/Heatmap-UI für
 * Schichten ist optionale Verbesserung in späteren Phasen.
 */

import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import type { ViewerProps } from "@/viewers/core/types";

export function AEinsatzWunschViewer(props: ViewerProps) {
  return <PGObjBaseViewer {...props} />;
}
