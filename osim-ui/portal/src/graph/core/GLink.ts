// Plan 01-07 Task 1: GLink — abstract base class fuer Verbindungen.
//
// PHASE-1-SKELETON: Portierung von GLink + GLinkPoint (GraphObj.h ~1000-1200),
// reduziert auf das Minimum, das der Design-Viewer braucht.
//
// Was Phase 1 macht:
//   - id, source (GObject.id), target (GObject.id)
//   - direction (Phase 1: DEFAULT — reactflow waehlt Handle-Position selbst)
//   - waypoints (leere Liste oder einzelne Zwischenpunkte fuer Polyline-
//     Renderer; Phase 1 nutzt sie nicht aktiv — reactflow nutzt eigene
//     Edge-Renderer)
//   - render() abstract — Subklassen liefern den ReactNode fuer den
//     Edge-Renderer (reactflow ruft das ueber den edgeTypes-Slot)
//
// Was Phase 1 NICHT macht (Phase 3 ergaenzt):
//   - GLinkPoint (Phantom-Endpunkte mit Snap-to-Object)
//   - CheckNeighbourhood (welche Richtung soll der Link starten?)
//   - Drag-Routing entlang Grid (Phase 3 GraphGrid-Foundation)
//   - prev/next-Geschwister-Links (Reihenfolge an einem GObjLink)

import type { ReactNode } from "react";
import type {
  GLink as IGLink,
  GLDirection,
  Position,
} from "./types";

/**
 * Abstract base class fuer alle Verbindungen zwischen GObjects.
 *
 * Subklassen MUESSEN render() implementieren — analog zu GObject ist
 * der ReactNode in Phase 1 nicht der primaere Render-Pfad (reactflow
 * uebernimmt die Edge-Darstellung), aber das Interface ist Foundation
 * fuer Phase 3.
 */
export abstract class GLink implements IGLink {
  public waypoints: Position[] = [];

  constructor(
    public id: string,
    public source: string,
    public target: string,
    public direction: GLDirection = "DEFAULT",
  ) {}

  abstract render(): ReactNode;
}
