/**
 * Barrel-Export der GraphObject-Foundation.
 *
 * Konsumenten (PDurchlaufplanViewerDesign, Custom-Viewer in Folge-Phasen)
 * importieren von hier:
 *
 *   import { OGraphGrid, GObjLink, GLink, GraphFlowCanvas, ogGridToReactFlow }
 *     from "@/graph/foundation";
 */

// Typen + Konstanten
export * from "@/graph/foundation/constants";
export * from "@/graph/foundation/types";
export { LNULL, isLNull } from "@/graph/foundation/LNULL";

// 4-Layer-Drawing-API (Track B4) — renderer-agnostischer Vertrag
export {
  DrawLayer,
  NullDrawContext,
  RecordingDrawContext,
} from "@/graph/foundation/DrawContext";
export type {
  DrawContext,
  DrawStyle,
  DrawTextStyle,
  PolygonPoints,
} from "@/graph/foundation/DrawContext";

// Phantom-Preview-Modell (Track B5) — Drag-Vorschau
export {
  PhantomController,
  phantomController,
} from "@/graph/foundation/PhantomController";
export type { ActivePhantom } from "@/graph/foundation/PhantomController";

// Datenstrukturen
export { OGPositionGrid } from "@/graph/foundation/OGPositionGrid";
export { GOGridCol } from "@/graph/foundation/GOGridCol";
export { GOGridRow } from "@/graph/foundation/GOGridRow";
export { OGPosition, OGPositionList } from "@/graph/foundation/OGPosition";

// Domain-Klassen
export { GObject } from "@/graph/foundation/GObject";
export { GObjLink } from "@/graph/foundation/GObjLink";
export { GObjSub } from "@/graph/foundation/GObjSub";
export {
  GObjElements,
  GElement,
  GElementLinkinList,
  GObjElementKlickAction,
} from "@/graph/foundation/GObjElements";
export { GObjCEdit, STD_ROUND_CORNER } from "@/graph/foundation/GObjCEdit";
export {
  GObjOSimDlp,
  GObjSquare,
  GObjRect,
  GObjType,
  GSqrType,
  STD_PEAK_WIDTH,
} from "@/graph/foundation/GObjShapes";
export { GLink } from "@/graph/foundation/GLink";
export {
  GLinkPoint,
  LinkSetState,
  MAX_POINT_NUM,
  STD_LINK_EDIT_DISTANCE,
} from "@/graph/foundation/GLinkPoint";
export { GLinkSquare } from "@/graph/foundation/GLinkSquare";

// Container
export { OGraphCollection } from "@/graph/foundation/OGraphCollection";
export { OGraphList } from "@/graph/foundation/OGraphList";
export { OGraphView } from "@/graph/foundation/OGraphView";
export { OGraphGrid } from "@/graph/foundation/OGraphGrid";
export type { GridSnapshot } from "@/graph/foundation/OGraphGrid";
export {
  OGGridAlt,
  OGGRIDALT_DEFAULT_TEXT_SPACE,
} from "@/graph/foundation/OGGridAlt";

// View-Adapter + Komponenten
export {
  ogGridToReactFlow,
  applyPositionUpdate,
} from "@/graph/foundation/view-adapter";
export type {
  OsimNodeData,
  OsimEdgeData,
} from "@/graph/foundation/view-adapter";
export { OsimNode, OsimGroupNode, osimNodeTypes } from "@/graph/foundation/OsimNode";
export { GraphFlowCanvas } from "@/graph/foundation/GraphFlowCanvas";
export type { GraphFlowCanvasProps } from "@/graph/foundation/GraphFlowCanvas";

// Interaktions-Hooks
export {
  findObjectByNodeId,
  onNodeDragStop,
  onConnect,
  findEdgeCell,
  onNodesDelete,
  onEdgesDelete,
  onNodeDoubleClick,
} from "@/graph/foundation/interactions";

// Wire-Bridge
export { wireToGrid } from "@/graph/foundation/wire-to-grid";
export type { WireToGridResult } from "@/graph/foundation/wire-to-grid";
