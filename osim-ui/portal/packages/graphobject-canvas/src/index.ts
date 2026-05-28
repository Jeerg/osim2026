/**
 * @osim/graphobject-canvas — HTML5-Canvas-Renderer für @osim/graphobject.
 *
 * Beweis-of-Concept der Renderer-Agnostik (Track C4, Audit 2026-05-28).
 * Implementiert das `DrawContext`-Interface aus `@osim/graphobject` und
 * rendert in einen HTML5-Canvas-2D-Context. Foundation-Klassen rufen
 * ihre `Draw*`-Methoden mit dieser Implementation auf — kein React Flow,
 * kein DOM-Element pro Knoten, nur Canvas-Pinsel-Operationen.
 *
 * Verwendung:
 * ```ts
 * import { CanvasDrawContext } from "@osim/graphobject-canvas";
 * const canvas = document.querySelector("canvas")!;
 * const ctx = new CanvasDrawContext(canvas.getContext("2d")!);
 * gobject.Draw(ctx);
 * ctx.flush();  // einmal pro Frame
 * ```
 */

export { CanvasDrawContext } from "./CanvasDrawContext";
export type { CanvasCtxLike } from "./CanvasDrawContext";
