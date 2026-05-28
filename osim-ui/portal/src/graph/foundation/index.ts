/**
 * Barrel der React-Flow-Adapter-Schicht (RF-Adapter).
 *
 * **Stand 2026-05-28c (Folge-Welle Foundation-Move):** der renderer-agnostische
 * Foundation-Kern lebt jetzt physisch in `@osim/graphobject`
 * (siehe `portal/packages/graphobject/src/`). Dieses Barrel exportiert
 *
 *  1. die verbleibenden RF-spezifischen Adapter aus diesem Verzeichnis
 *     (`GraphFlowCanvas`, `OsimNode`, `GridBackground`, `view-adapter`,
 *     `interactions`) — sie wandern in Track C3 in `@osim/graphobject-react-flow`
 *  2. **plus** alle Pur-Exports aus `@osim/graphobject` als Backwards-Compat-
 *     Brücke. So bleiben bestehende `import … from "@/graph/foundation"`-
 *     Konsumenten ohne Edit lauffähig.
 *
 * Neue Konsumenten sollen direkt importieren:
 *
 *   import { GObject, OGraphGrid } from "@osim/graphobject";          // Pur
 *   import { GraphFlowCanvas } from "@/graph/foundation";              // RF
 */

// Pur-Kern als Backwards-Compat-Re-Export.
export * from "@osim/graphobject";

// RF-Adapter (verbleiben in diesem Verzeichnis bis Track C3).
export {
  ogGridToReactFlow,
  applyPositionUpdate,
} from "./view-adapter";
export type {
  OsimNodeData,
  OsimEdgeData,
} from "./view-adapter";
export { OsimNode, OsimGroupNode, osimNodeTypes } from "./OsimNode";
export { GraphFlowCanvas } from "./GraphFlowCanvas";
export type { GraphFlowCanvasProps } from "./GraphFlowCanvas";
export { GridBackground } from "./GridBackground";

export {
  findObjectByNodeId,
  onNodeDragStop,
  onConnect,
  findEdgeCell,
  onNodesDelete,
  onEdgesDelete,
  onNodeDoubleClick,
} from "./interactions";
