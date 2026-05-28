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
export * from "@/graph/foundation/constants";
export * from "@/graph/foundation/types";
export { LNULL, isLNull } from "@/graph/foundation/LNULL";

// ============================================================
// 4-Layer-Drawing-Vertrag
// ============================================================
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

// ============================================================
// Datenstrukturen + Position
// ============================================================
export { OGPositionGrid } from "@/graph/foundation/OGPositionGrid";
export { GOGridCol } from "@/graph/foundation/GOGridCol";
export { GOGridRow } from "@/graph/foundation/GOGridRow";
export { OGPosition, OGPositionList } from "@/graph/foundation/OGPosition";

// ============================================================
// Domain-Klassen (1:1 zum C++-Original)
// ============================================================
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

// ============================================================
// Container
// ============================================================
export { OGraphCollection } from "@/graph/foundation/OGraphCollection";
export { OGraphList } from "@/graph/foundation/OGraphList";
export { OGraphView } from "@/graph/foundation/OGraphView";
export { OGraphGrid } from "@/graph/foundation/OGraphGrid";
export type { GridSnapshot } from "@/graph/foundation/OGraphGrid";
export {
  OGGridAlt,
  OGGRIDALT_DEFAULT_TEXT_SPACE,
} from "@/graph/foundation/OGGridAlt";

// ============================================================
// Phantom-Preview-Modell
// ============================================================
export {
  PhantomController,
  phantomController,
} from "@/graph/foundation/PhantomController";
export type { ActivePhantom } from "@/graph/foundation/PhantomController";

// ============================================================
// Matrix-Foundation
// ============================================================
export * from "@/graph/foundation/matrix";

// ============================================================
// Wire-Bridge (osim-spezifisch — bleibt im Paket weil GObject-zentriert)
// ============================================================
export { wireToGrid } from "@/graph/foundation/wire-to-grid";
export type { WireToGridResult } from "@/graph/foundation/wire-to-grid";
