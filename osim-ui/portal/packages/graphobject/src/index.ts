/**
 * @osim/graphobject — Public API der renderer-agnostischen Foundation.
 *
 * **Stand 2026-05-28b (Track C2 — Migration Schritt 1):** dieses Paket
 * exportiert die Foundation-Klassen aus `portal/src/graph/foundation/` —
 * die physischen Dateien wandern in Folge-Wellen hierher. Bis dahin ist
 * dieser Re-Export die Brücke, die den Package-Vertrag stabil hält:
 *
 * ```ts
 * import { GObject, GObjLink, DrawLayer } from "@osim/graphobject";
 * ```
 *
 * Konsumenten dürfen NICHT mehr von `@/graph/foundation` importieren —
 * neue Code-Wellen nutzen immer `@osim/graphobject`. Bestehende Importe
 * werden im Rahmen der Folge-Migrationen umgestellt.
 *
 * **Render-Adapter-Abgrenzung:** der RF-spezifische Code (GraphFlowCanvas,
 * OsimNode, view-adapter, interactions, GridBackground) gehört NICHT in
 * dieses Paket. Er lebt in `@osim/graphobject-react-flow` (Track C3).
 *
 * **Migration-Roadmap:**
 *  1. ✅ C1 + C2 (diese Welle): Workspace-Setup, Path-Alias, Public-API
 *     über Re-Export. Validierung über Canvas-Adapter (Track C4).
 *  2. ⏳ Folge-Welle: physischer Move der 21 Pur-Dateien nach
 *     packages/graphobject/src/. Mechanische Operation (mv + Import-
 *     Pfad-Update). Keine semantische Änderung mehr nötig.
 */

// ============================================================
// Pure Foundation — Basis-Typen + Konstanten
// ============================================================
export * from "./constants";
export * from "./types";
export { LNULL, isLNull } from "./LNULL";

// ============================================================
// 4-Layer-Drawing-Vertrag
// ============================================================
export {
  DrawLayer,
  NullDrawContext,
  RecordingDrawContext,
} from "./DrawContext";
export type {
  DrawContext,
  DrawStyle,
  DrawTextStyle,
  PolygonPoints,
} from "./DrawContext";

// ============================================================
// Datenstrukturen + Position
// ============================================================
export { OGPositionGrid } from "./OGPositionGrid";
export { GOGridCol } from "./GOGridCol";
export { GOGridRow } from "./GOGridRow";
export { OGPosition, OGPositionList } from "./OGPosition";

// ============================================================
// Domain-Klassen (1:1 zum C++-Original)
// ============================================================
export { GObject } from "./GObject";
export { GObjLink } from "./GObjLink";
export { GObjSub } from "./GObjSub";
export {
  GObjElements,
  GElement,
  GElementLinkinList,
  GObjElementKlickAction,
} from "./GObjElements";
export { GObjCEdit, STD_ROUND_CORNER } from "./GObjCEdit";
export {
  GObjOSimDlp,
  GObjSquare,
  GObjRect,
  GObjType,
  GSqrType,
  STD_PEAK_WIDTH,
} from "./GObjShapes";

export { GLink } from "./GLink";
export {
  GLinkPoint,
  LinkSetState,
  MAX_POINT_NUM,
  STD_LINK_EDIT_DISTANCE,
} from "./GLinkPoint";
export { GLinkSquare } from "./GLinkSquare";

// ============================================================
// Container
// ============================================================
export { OGraphCollection } from "./OGraphCollection";
export { OGraphList } from "./OGraphList";
export { OGraphView } from "./OGraphView";
export { OGraphGrid } from "./OGraphGrid";
export type { GridSnapshot } from "./OGraphGrid";
export {
  OGGridAlt,
  OGGRIDALT_DEFAULT_TEXT_SPACE,
} from "./OGGridAlt";

// ============================================================
// Phantom-Preview-Modell
// ============================================================
export {
  PhantomController,
  phantomController,
} from "./PhantomController";
export type { ActivePhantom } from "./PhantomController";

// ============================================================
// Matrix-Foundation
// ============================================================
export * from "./matrix";

// ============================================================
// Wire-Bridge (osim-spezifisch — bleibt im Paket weil GObject-zentriert)
// ============================================================
export { wireToGrid } from "./wire-to-grid";
export type { WireToGridResult } from "./wire-to-grid";
