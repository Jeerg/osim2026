/**
 * @osim/graphobject-react-flow — React-Flow-Adapter für @osim/graphobject.
 *
 * Übersetzt die renderer-agnostische Foundation in @xyflow/react-Konzepte:
 *  - `view-adapter.ogGridToReactFlow`: OGraphGrid → ReactFlow-Nodes/Edges.
 *  - `GraphFlowCanvas`: ReactFlowProvider-Wrapper mit fitView-on-revision.
 *  - `GridBackground`: SVG-Grid via ReactFlow-ViewportPortal (Welle G3).
 *  - `OsimNode`, `OsimGroupNode`, `osimNodeTypes`: Custom-Node-Komponenten.
 *  - `interactions`: Drag/Connect/Delete → Foundation-Mutationen.
 *
 * **Architektur-Vertrag (Audit 2026-05-28 §4.3):** dieses Paket hat die
 * EINZIGE React-Flow-Abhängigkeit der osim-ui-Codebase im Bereich Graph-
 * Foundation. `@osim/graphobject` selbst kennt React Flow nicht.
 *
 * **Stand 2026-05-28b:** API über Path-Alias eingerichtet, physischer Move
 * der 5 Adapter-Dateien folgt im selben Migrations-Schritt wie der Pur-Kern
 * (siehe `packages/graphobject/MIGRATION.md`).
 */

// View-Adapter (OGraphGrid → ReactFlow)
export {
  ogGridToReactFlow,
  applyPositionUpdate,
} from "@/graph/foundation/view-adapter";
export type {
  OsimNodeData,
  OsimEdgeData,
} from "@/graph/foundation/view-adapter";

// Custom-Node-Komponenten
export {
  OsimNode,
  OsimGroupNode,
  osimNodeTypes,
} from "@/graph/foundation/OsimNode";

// Canvas-Wrapper (ReactFlowProvider + fitView-on-revision)
export { GraphFlowCanvas } from "@/graph/foundation/GraphFlowCanvas";
export type { GraphFlowCanvasProps } from "@/graph/foundation/GraphFlowCanvas";

// Grid-Hintergrund (SVG via ViewportPortal — Welle G3)
export { GridBackground } from "@/graph/foundation/GridBackground";

// Drag/Connect/Delete-Adapter — RF-Events → Foundation-Mutationen
export {
  findObjectByNodeId,
  onNodeDragStop,
  onConnect,
  findEdgeCell,
  onNodesDelete,
  onEdgesDelete,
  onNodeDoubleClick,
} from "@/graph/foundation/interactions";
