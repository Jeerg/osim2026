// Plan 01-07 Task 2: Auto-Layout fuer Durchlaufplan-Design-Viewer.
//
// Hintergrund (siehe risks-Block im PLAN):
//   Die GFX-Positionen (OGfxDesign*-Klassen) sind in der otx_loader-Skip-
//   Liste — kein OTX-Modell liefert aktuell Original-Positions-Daten ueber
//   den Backend-Tree. Phase-1-Loesung ist Auto-Layout via dagre; Plan 01-09
//   (Save-Mechanik) wird einen IndexedDB-Override fuer manuell-gezogene
//   Positionen einbauen — dieses Modul stellt nur den Layout-Algorithmus
//   bereit.
//
// API:
//   computeAutoLayout(nodeIds, edges, options) → Map<nodeId, Position>
//
// dagre nutzt einen Hierarchical-Layout-Algorithmus (rankdir LR default
// fuer Plaene, weil Durchlaufplaene typischerweise links-nach-rechts
// gerichtet sind).

import dagre from "dagre";
import type { Position, Size } from "@/graph/core/types";
import { DEFAULT_OBJECT_SIZE } from "@/graph/core/GObject";

export interface AutoLayoutEdge {
  source: string;
  target: string;
}

export interface AutoLayoutOptions {
  rankdir?: "LR" | "TB" | "RL" | "BT";
  /** horizontaler Abstand zwischen den Ranks (default 80). */
  ranksep?: number;
  /** vertikaler Abstand zwischen Knoten desselben Ranks (default 40). */
  nodesep?: number;
  /** Default-Knoten-Groesse, falls nicht pro Node spezifiziert. */
  nodeSize?: Size;
}

/**
 * Berechnet deterministische Positionen fuer alle Node-IDs anhand der
 * Edges via dagre.
 *
 * - Liefert immer eine Position pro nodeId, auch wenn isolierte Knoten
 *   (keine Edges) im Set sind.
 * - Bei leerem Input liefert es eine leere Map.
 * - dagre's interne Koordinaten liegen mit Mittelpunkt-Anker; wir
 *   konvertieren auf top-left-Anker (reactflow-Convention).
 */
export function computeAutoLayout(
  nodeIds: string[],
  edges: AutoLayoutEdge[],
  options: AutoLayoutOptions = {},
): Map<string, Position> {
  const result = new Map<string, Position>();
  if (nodeIds.length === 0) return result;

  const {
    rankdir = "LR",
    ranksep = 80,
    nodesep = 40,
    nodeSize = DEFAULT_OBJECT_SIZE,
  } = options;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, ranksep, nodesep });
  g.setDefaultEdgeLabel(() => ({}));

  for (const id of nodeIds) {
    g.setNode(id, {
      width: nodeSize.width,
      height: nodeSize.height,
    });
  }

  for (const e of edges) {
    // dagre verlangt, dass source und target als Nodes registriert sind;
    // wir filtern Edges, deren Endpunkte nicht in nodeIds liegen.
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  for (const id of nodeIds) {
    const node = g.node(id);
    if (!node) continue;
    // dagre gibt Mittelpunkts-Koordinaten zurueck; reactflow erwartet
    // top-left (x = node.x - node.width/2).
    result.set(id, {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
    });
  }

  return result;
}
