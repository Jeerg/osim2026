// Plan 01-07 Task 1: GraphObject-Foundation — Public Re-Exports.
//
// Phase-1-Surface:
//   - Geometrie-Primitives (Position/Size/Rect)
//   - Enums (GORegion/GObjState/GLDirection)
//   - Abstract Bases (GObject/GLink, GObjLink konkret)
//   - React-Wrapper (GraphView)
//   - GraphViewProps
//
// Konsumenten (PDurchlaufplanViewerDesign + Phase-3-Viewer) importieren
// alles ueber `@/graph/core`.

export type {
  Position,
  Size,
  Rect,
  GORegion,
  GObjState,
  GLDirection,
  GraphViewProps,
  GObject as IGObject,
  GLink as IGLink,
} from "./types";

export { GObject, DEFAULT_OBJECT_SIZE } from "./GObject";
export { GLink } from "./GLink";
export { GObjLink } from "./GObjLink";
export { GraphView } from "./GraphView";
