// Plan 01-07 Task 1: Shared types fuer Node-Renderer.
//
// Liegt im graph/nodes/-Folder als gemeinsamer Vertrag zwischen GraphView
// (graph/core/) und den konkreten Node-Components (KnotenNode/AusloeserNode).

import type { GObject } from "@/graph/core/types";

/**
 * Daten-Slot fuer einen reactflow-Node, der ein GObject verkoerpert.
 *
 * Phase 1: data.gobj enthaelt den GObject (mit klass/position/size +
 * subklass-spezifischen Properties wie KnotenNode.name/dauer_s).
 * data.onDoubleClickGobj wird in der Node-Komponente fuer Click-Routing
 * genutzt (Property-Viewer-Switch).
 */
export interface GObjectNodeData {
  gobj: GObject;
  onDoubleClickGobj?: (id: string) => void;
}
