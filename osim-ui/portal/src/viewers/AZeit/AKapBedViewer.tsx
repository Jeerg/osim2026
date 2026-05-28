/**
 * AKapBedViewer — Kapazitätsbedarf-Sicht.
 *
 * C++-Konzeptvorlage: `OSim2004/inc/AKapBedViewer.h`. Zeigt die Properties
 * einer Kapazitätsbedarfs-Zeile: Periode-Link, SollKapazität, IstKapazität,
 * Auslastung. Das PropertySchema (Plan 07) liefert die Felder; PGObjBaseViewer
 * rendert sie generisch.
 *
 * Phase-1-MVP: reines Wrap. Eine Aggregations-/Diagramm-UI für Kapazitäts-
 * verläufe ist Phase-5/Reports-Scope.
 */

import { PGObjBaseViewer } from "@/viewers/PGObjBase/PGObjBaseViewer";
import type { ViewerProps } from "@/viewers/core/types";

export function AKapBedViewer(props: ViewerProps) {
  return <PGObjBaseViewer {...props} />;
}
