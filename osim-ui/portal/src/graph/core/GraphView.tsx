// Plan 01-07 Task 1: GraphView — React-Composition um reactflow.
//
// PHASE-1-SKELETON: Adapter zwischen der TS-GraphObject-Schicht (graph/core/
// GObject + GLink) und reactflow (graph-Renderer-Backend).
//
// Architektur-Note:
//   Im Original (OSim2004) ist OGraphView eine Composition aus 4 Layern
//   (Background/Main/Foreground/Helpers) — siehe GraphObj.h Abschnitt
//   "DrawBackground/Draw/DrawForeground/DrawHelpers" (Zeilen 467-470).
//   Phase 1 reduziert das auf 2 Layer:
//     - reactflow-Canvas selbst (Knoten + Kanten in einer Ebene)
//     - reactflow's <Background> (Grid-Pattern, entspricht dem alten
//       Background-Layer in vereinfachter Form)
//   Die anderen 2 Layer (Foreground = Live-Animations-Strahlen, Helpers
//   = Lineale/Hilfslinien) kommen in Phase 3 dazu, wenn die Live-Viz-
//   Komponenten gebraucht werden.

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";

import type { GraphViewProps, GObject, GLink } from "./types";
import { KnotenNodeView } from "@/graph/nodes/KnotenNode";
import { AusloeserNodeView } from "@/graph/nodes/AusloeserNode";
import type { GObjectNodeData } from "@/graph/nodes/types";

// ---------------------------------------------------------------------------
// reactflow-Node-Types Registrierung.
//
// Phase 1: zwei konkrete Node-Typen — "knoten" (Bearbeitungs-Knoten) und
// "ausloeser" (Diamond-Form). Die Type-Selection geht ueber den klass-
// String des GObject (siehe gobjectToNode unten).
//
// Phase 3 (volle Portierung) wird hier 18 GObjType-Klassen registrieren
// (siehe CONTEXT D-07).
// ---------------------------------------------------------------------------

const NODE_TYPES: NodeTypes = {
  knoten: KnotenNodeView,
  ausloeser: AusloeserNodeView,
};

/**
 * Phase-1-Mapping: klass-String → reactflow-Node-Type.
 *
 * Default ist "knoten" — alle PDpKn*-Klassen + unbekannte Klassen werden
 * als Rect mit Label gerendert.
 */
function pickNodeType(klass: string): string {
  if (
    klass.startsWith("PAsl") ||
    klass.startsWith("EPAsl") ||
    klass === "ACOAnt"
  ) {
    return "ausloeser";
  }
  return "knoten";
}

/** Konvertiert ein GObject in einen reactflow-Node. */
function gobjectToNode(
  obj: GObject,
  onDoubleClick: ((id: string) => void) | undefined,
): Node<GObjectNodeData> {
  const nodeType = pickNodeType(obj.klass);
  // Spezifische Data-Shape pro NodeType — der NodeType-Component greift
  // ueber data.gobj zu (siehe KnotenNode/AusloeserNode).
  // gobj wird als GObject typisiert; die FCs casten intern via data.gobj
  // auf die konkrete Subklasse (KnotenNodeData/AusloeserNodeData haben
  // die engeren gobj-Felder).
  const data: GObjectNodeData = {
    gobj: obj,
    onDoubleClickGobj: onDoubleClick,
  };
  return {
    id: obj.id,
    type: nodeType,
    position: obj.position,
    data,
  };
}

/** Konvertiert einen GLink in einen reactflow-Edge. */
function glinkToEdge(link: GLink): Edge {
  // Wenn der konkrete GLink eine label-Property anbietet (z.B. KanteEdge
  // liefert "5 s" als Uebergangszeit), nehmen wir sie auf den Edge.
  // Phase-1: nur Standard-Edge mit Pfeilspitze + optionalem Label.
  const maybeLabel = (link as unknown as { label?: string }).label;
  return {
    id: link.id,
    source: link.source,
    target: link.target,
    type: "default",
    markerEnd: { type: "arrowclosed" } as Edge["markerEnd"],
    label: maybeLabel,
    data: { glink: link },
  };
}

/**
 * GraphView — Wrapper um reactflow + Adapter auf GObject/GLink.
 *
 * Phase 1: subset der OGraphView-Funktionalitaet aus dem Original:
 *   - Knoten anzeigen + draggable
 *   - Kanten anzeigen (Standard-Pfeil, kein Routing-Algorithmus)
 *   - Doppelklick auf Knoten → Property-Viewer (via onObjectDoubleClick)
 *   - Drag von einem Knoten-Handle zu einem anderen → onLinkCreate
 *
 * Spaeter (Phase 3) ergaenzt:
 *   - 4-Layer-Rendering (Background-Pattern, Main, Foreground-Live-Strahlen,
 *     Helpers wie Lineale)
 *   - Marquee-Selektion + Multi-Drag
 *   - Context-Menu (vgl. OGObject::OnGOContextMenu)
 *   - Keyboard-Shortcuts (vgl. ViewerMenuSpec Routing)
 *   - Grid-Snapping (GraphGrid-Portierung)
 *   - Live-Animation (DrawRed-Pendant fuer Werkstueck-Bewegung)
 */
function GraphViewInner({
  objects,
  links,
  onObjectMove,
  onLinkCreate,
  onObjectDoubleClick,
  readonly = false,
}: GraphViewProps) {
  // Konvertiere GObjects/GLinks in reactflow-Nodes/Edges.
  // useMemo: Vermeidet unnoetige Re-Renders bei stabilen Eingangs-Listen.
  const nodes = useMemo<Node<GObjectNodeData>[]>(
    () => objects.map((o) => gobjectToNode(o, onObjectDoubleClick)),
    [objects, onObjectDoubleClick],
  );

  const edges = useMemo<Edge[]>(() => links.map(glinkToEdge), [links]);

  // Node-Drag-Handler: Wir hoeren auf das `position`-Change-Event und
  // melden _nur_ bei dragging===false (= Drag beendet) zurueck — sonst
  // wuerde jedes Pixel-Frame einen onObjectMove-Call ausloesen.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (readonly || !onObjectMove) return;
      for (const c of changes) {
        if (c.type === "position" && c.position && c.dragging === false) {
          onObjectMove(c.id, { x: c.position.x, y: c.position.y });
        }
      }
    },
    [onObjectMove, readonly],
  );

  // Connect-Handler: Wenn der User eine neue Kante zieht.
  const onConnect = useCallback(
    (conn: Connection) => {
      if (readonly || !onLinkCreate) return;
      if (conn.source && conn.target) {
        onLinkCreate(conn.source, conn.target);
      }
    },
    [onLinkCreate, readonly],
  );

  // Doppelklick-Handler: reactflow liefert (event, node).
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onObjectDoubleClick?.(node.id);
    },
    [onObjectDoubleClick],
  );

  return (
    <div
      style={{ width: "100%", height: "100%" }}
      data-testid="graphview-root"
      className="bg-white"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        nodesDraggable={!readonly}
        nodesConnectable={!readonly}
        edgesUpdatable={!readonly}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

/**
 * GraphView — public Component.
 *
 * Wrappt in einen ReactFlowProvider, damit der innere GraphViewInner alle
 * reactflow-Hooks (useReactFlow, useNodes, ...) nutzen kann — Pflicht-
 * Voraussetzung der reactflow-API.
 */
export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}

GraphView.displayName = "GraphView";
