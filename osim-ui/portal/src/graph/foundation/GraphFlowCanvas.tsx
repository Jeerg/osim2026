/**
 * GraphFlowCanvas — React-Flow-Komponente, die einen OGraphGrid rendert.
 *
 * Welle E der GraphObject-Foundation. Konsumenten (PDurchlaufplanViewerDesign
 * in Welle G) reichen einen OGraphGrid rein und bekommen einen voll
 * interaktiven Canvas mit nested-Sub-Grid-Support.
 *
 * Performance-Patterns (NOTES + Plan-1-10-Pitfalls):
 * - nodeTypes außerhalb der Komponente (siehe OsimNode.osimNodeTypes)
 * - React.memo auf den Custom-Node-Renderern
 * - useMemo für den Adapter-Output (rebuilt nur bei Grid-Mutation)
 * - useCallback für Event-Handler
 * - onlyRenderVisibleElements für Bosch-Stress
 */

import * as React from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import type { OGraphGrid } from "@osim/graphobject";
import {
  ogGridToReactFlow,
  type OsimEdgeData,
  type OsimNodeData,
} from "./view-adapter";
import { osimNodeTypes } from "./OsimNode";
import { GridBackground } from "./GridBackground";

export interface GraphFlowCanvasProps {
  /** Der OGraphGrid, der gerendert wird. */
  grid: OGraphGrid;
  /** Inkrementiert sich bei Grid-Mutation — triggert Re-Adapter-Build. */
  revision?: number;
  /** Click auf einen Knoten (mit Wire-OID). */
  onNodeSelect?: (oid: unknown) => void;
  /** Doppelklick (öffnet/schließt GObjSub). */
  onNodeDblClick?: (oid: unknown) => void;
  /** Drag-Stop: Konsument bekommt den ReactFlow-Node und kann die neue Position
   *  via Foundation-Drag-Handler (interactions.onNodeDragStop) im Grid +
   *  Wire-Store persistieren. */
  onNodeDragStop?: (event: unknown, node: Node<OsimNodeData>) => void;
  /** User hat Source- mit Target-Handle verbunden → neue Kante erzeugen. */
  onConnect?: (connection: Connection) => void;
  /** User hat Knoten gelöscht (Backspace/Delete oder Edge-Selection-Delete). */
  onNodesDelete?: (nodes: Node<OsimNodeData>[]) => void;
  /** User hat Kanten gelöscht. */
  onEdgesDelete?: (edges: Edge<OsimEdgeData>[]) => void;
  /** Welle G18: Click auf das Pane (Background, NICHT auf einen Knoten).
   *  Konsument bekommt React-Flow-Canvas-Koords (post Zoom/Pan) als
   *  `flowPos` — geeignet für Knoten-Anlegen via INSERT-Mode. */
  onPaneClick?: (flowPos: { x: number; y: number }) => void;
  /** Read-only-Modus (Drag etc. deaktiviert). */
  readOnly?: boolean;
  /** Welle G18: Grid-Linien-Anzeige (toggle). Default true. */
  showGrid?: boolean;
  /** Zusätzliches className. */
  className?: string;
}

/**
 * GraphFlowCanvas — erwartet einen umschließenden `<ReactFlowProvider>` vom
 * Consumer (Welle G21: PDurchlaufplanViewerDesign liftet den Provider rauf,
 * damit auch der Viewer selbst `useReactFlow()` für Coord-Transformationen
 * nutzen kann — etwa für Rechtsklick-Insert).
 */
export const GraphFlowCanvas: React.FC<GraphFlowCanvasProps> = ({
  grid,
  revision = 0,
  onNodeSelect,
  onNodeDblClick,
  onNodeDragStop,
  onConnect,
  onNodesDelete,
  onEdgesDelete,
  onPaneClick,
  readOnly = false,
  showGrid = true,
  className,
}) => {
  // Adapter-Build memoized auf [grid, revision]. Bei jeder OGraphGrid-Mutation
  // muss der Aufrufer `revision++` setzen — `revision` ist explizite Re-Build-
  // Quelle, daher exhaustive-deps-disable.
  const { nodes, edges } = React.useMemo(
    () => ogGridToReactFlow(grid),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, revision],
  );

  // Welle G22: fitView NUR beim Initial-Render mit Daten — nicht bei jedem
  // Insert/Edit (revision++).
  //
  // Welle G10 hatte fitView bei jedem revision-Change ausgelöst, weil neue
  // Knoten nach finalizeLayout außerhalb des Viewports landen konnten. Beim
  // aktiven Editieren (Welle G18+ Knoten-Anlegen, G21 Insert-Mode) führt
  // das aber dazu, dass Pan + Zoom bei JEDEM Insert resetten — der User
  // verliert seine Übersicht. User-Befund 2026-05-24: "du veränderst dabei
  // zoom und lage des panes, das ist im Original nicht so".
  //
  // Im OSim2004 macht der Viewport gar nichts automatisch — der User hat
  // immer ScrollPosition + Zoom unter Kontrolle. Wir folgen dem Original
  // und resetten den Viewport NUR wenn:
  //   - Component frisch gemounted ist (key={obj.oid} bei Plan-Wechsel)
  //   - UND zum ersten Mal nodes da sind (async-Load)
  // Danach: Hände weg vom Viewport.
  const rfInstance = useReactFlow();
  const initialFittedRef = React.useRef(false);
  React.useEffect(() => {
    if (nodes.length === 0) {
      initialFittedRef.current = false;
      return;
    }
    if (initialFittedRef.current) return;
    initialFittedRef.current = true;
    const handle = requestAnimationFrame(() => {
      rfInstance.fitView({ padding: 0.2, duration: 200 });
    });
    return () => cancelAnimationFrame(handle);
  }, [rfInstance, nodes.length]);

  const handleNodeClick = React.useCallback(
    (_e: React.MouseEvent, node: Node<OsimNodeData>) => {
      onNodeSelect?.(node.data.viewedObjectId);
    },
    [onNodeSelect],
  );

  const handleNodeDoubleClick = React.useCallback(
    (_e: React.MouseEvent, node: Node<OsimNodeData>) => {
      onNodeDblClick?.(node.data.viewedObjectId);
    },
    [onNodeDblClick],
  );

  const handleNodeDragStop = React.useCallback(
    (event: React.MouseEvent | TouchEvent | MouseEvent, node: Node<OsimNodeData>) => {
      onNodeDragStop?.(event, node);
    },
    [onNodeDragStop],
  );

  // Welle G18: Pane-Click mit korrekten React-Flow-Canvas-Koords. Triggert
  // NUR bei Klick aufs Pane (Background), NICHT auf Knoten — React-Flow's
  // onPaneClick filtert das automatisch. screenToFlowPosition transformiert
  // Screen-Pixel zu Canvas-Coords (rechnet Zoom + Pan raus).
  const handlePaneClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (!onPaneClick) return;
      const flowPos = rfInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      onPaneClick(flowPos);
    },
    [rfInstance, onPaneClick],
  );

  return (
    <div className={className} data-testid="graph-flow-canvas">
      <ReactFlow<Node<OsimNodeData>, Edge<OsimEdgeData>>
        nodes={nodes}
        edges={edges}
        nodeTypes={osimNodeTypes}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onPaneClick={handlePaneClick}
        onlyRenderVisibleElements
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={4}
        // Welle G24-A: Pan via Mittelmaustaste, KEIN Selektionsrechteck-
        // Drag (das war ein G21-Overshoot). Konsequenz nach G24:
        //   - Linksklick auf Knoten: Selektion (React-Flow-Default)
        //   - Linksklick auf Pane (INSERT-Mode aktiv): Knoten anlegen
        //   - Linksklick + ziehen auf Pane: NICHTS (kein Pan, kein Rect)
        //   - Mittelmaustaste + ziehen: Pan (panOnDrag={[1]})
        //   - Mausrad: Zoom
        //   - Doppelklick: GObjSub-D_OPEN-Toggle (kein React-Flow-Zoom)
        panOnDrag={[1]}
        panOnScroll={false}
        zoomOnScroll
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
      >
        {showGrid && <GridBackground grid={grid} />}
        <Controls position="bottom-right" />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
};
