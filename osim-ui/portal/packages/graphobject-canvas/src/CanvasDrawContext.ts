/**
 * CanvasDrawContext — HTML5-Canvas-Implementation des DrawContext-Vertrags.
 *
 * Track C4 (Audit 2026-05-28 §5.4): Beweis-of-Concept der renderer-
 * agnostischen Foundation. Die `@osim/graphobject`-Klassen rufen ihre
 * `Draw*`-Methoden mit DEM SELBEN `DrawContext`-Interface auf, das von
 * `@osim/graphobject-react-flow` ODER von dieser Canvas-Implementation
 * implementiert wird.
 *
 * **Strategischer Wert:** beweist, dass `@osim/graphobject` tatsächlich
 * portabel ist. Jedes andere osim-Projekt kann diese Datei kopieren und
 * mit seinem eigenen Renderer auf der Foundation arbeiten.
 *
 * **Layer-Semantik:** Canvas hat kein natives Z-Layering — Render-Ops sind
 * sequentiell. Daher PUFFERN wir Ops pro Layer und FLUSHEN in der
 * `DrawLayer`-Reihenfolge bei `flush()`. Aufrufer ruft `flush()` einmal
 * pro Frame (typisch innerhalb `requestAnimationFrame`).
 *
 * **Koordinaten:** Welt-Koordinaten (siehe DrawContext.ts Docs). Pan/Zoom-
 * Transformation kann via canvas.context.setTransform() VOR flush()
 * gemacht werden.
 *
 * **Performance:** kein Optimierungs-Ziel in C4 — die Implementation ist
 * straightforward. Für 10k-Knoten-Modelle muss eine Welle die Render-Ops
 * batch'en (z.B. Path2D für gleichartige Shapes).
 */

import {
  DrawLayer,
  type DrawContext,
  type DrawStyle,
  type DrawTextStyle,
  type PolygonPoints,
} from "@osim/graphobject";
import type { CPoint, CRect, CSize } from "@osim/graphobject";

/**
 * Operation-Records pro Layer — die `flush()`-Methode rendert sie sequentiell.
 */
interface BufferedOp {
  type:
    | "rect"
    | "roundedRect"
    | "line"
    | "polygon"
    | "polyline"
    | "circle"
    | "text"
    | "pushClip"
    | "popClip";
  /** Position-/Geometrie-Argumente — Discriminated-Union per `type`. */
  args: unknown[];
  /** Effektiver Style nach Default-Merging. */
  style?: DrawStyle | DrawTextStyle;
}

/**
 * Default-Styles für Render-Ops ohne explizite Style-Angabe.
 */
const DEFAULT_STROKE = "#000000";
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_FONT_FAMILY = "Segoe UI, sans-serif";
const DEFAULT_FONT_SIZE = 12;
const DEFAULT_FONT_WEIGHT = "normal";

export class CanvasDrawContext implements DrawContext {
  /** Buffer der Operationen pro Layer (Index = DrawLayer-Wert). */
  private buffers: BufferedOp[][] = [[], [], [], [], [], []];

  /** Aktueller Layer (default = CONTENT). */
  private currentLayer: DrawLayer = DrawLayer.CONTENT;

  /**
   * Browser-Canvas oder ein API-kompatibles Mock-Objekt (für Tests).
   * Wir akzeptieren das Minimum-Interface, das wir brauchen — kein
   * volles CanvasRenderingContext2D, sodass Tests es einfach mocken
   * können ohne JSDOM-Canvas-Polyfill.
   */
  private ctx: CanvasCtxLike;

  constructor(canvasCtx: CanvasCtxLike) {
    this.ctx = canvasCtx;
  }

  // ============================================================
  // DrawContext-Vertrag — Operationen werden gepuffert
  // ============================================================

  setLayer(layer: DrawLayer): void {
    this.currentLayer = layer;
  }

  drawRect(rect: CRect, style?: DrawStyle): void {
    this.buffer({ type: "rect", args: [rect], style });
  }

  drawRoundedRect(rect: CRect, corner: CSize, style?: DrawStyle): void {
    this.buffer({ type: "roundedRect", args: [rect, corner], style });
  }

  drawLine(from: CPoint, to: CPoint, style?: DrawStyle): void {
    this.buffer({ type: "line", args: [from, to], style });
  }

  drawPolygon(points: PolygonPoints, style?: DrawStyle): void {
    this.buffer({ type: "polygon", args: [points], style });
  }

  drawPolyline(points: PolygonPoints, style?: DrawStyle): void {
    this.buffer({ type: "polyline", args: [points], style });
  }

  drawCircle(center: CPoint, radius: number, style?: DrawStyle): void {
    this.buffer({ type: "circle", args: [center, radius], style });
  }

  drawText(pos: CPoint, text: string, style?: DrawTextStyle): void {
    this.buffer({ type: "text", args: [pos, text], style });
  }

  measureText(text: string, style?: DrawTextStyle): CSize {
    // Canvas-Pfad: Font setzen, dann measureText nutzen.
    const fontSize = style?.fontSize ?? DEFAULT_FONT_SIZE;
    const fontFamily = style?.fontFamily ?? DEFAULT_FONT_FAMILY;
    const fontWeight = style?.fontWeight ?? DEFAULT_FONT_WEIGHT;
    const savedFont = this.ctx.font;
    this.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = this.ctx.measureText(text);
    this.ctx.font = savedFont;
    return {
      cx: Math.ceil(metrics.width),
      cy: fontSize,
    };
  }

  pushClip(rect: CRect): void {
    this.buffer({ type: "pushClip", args: [rect] });
  }

  popClip(): void {
    this.buffer({ type: "popClip", args: [] });
  }

  // ============================================================
  // Flush — gibt alle gepufferten Ops in Layer-Reihenfolge aus
  // ============================================================

  /**
   * Zeichnet alle gepufferten Operationen auf den Canvas in DrawLayer-
   * Reihenfolge (BACKGROUND zuerst, OVERLAY zuletzt). Leert die Puffer.
   *
   * Aufrufer ruft typischerweise einmal pro Frame, NACHDEM alle
   * Foundation-Knoten ihre Draw*-Methoden aufgerufen haben.
   */
  flush(): void {
    for (let layer = 0; layer < this.buffers.length; layer++) {
      const ops = this.buffers[layer];
      for (const op of ops) {
        this.renderOp(op);
      }
    }
    // Buffers leeren
    for (let i = 0; i < this.buffers.length; i++) this.buffers[i] = [];
  }

  /**
   * Liefert eine Vorschau der gepufferten Ops pro Layer (für Debugging
   * + Tests). Mutiert nichts.
   */
  getBufferedOps(): readonly BufferedOp[][] {
    return this.buffers.map((b) => [...b]);
  }

  // ============================================================
  // Interna
  // ============================================================

  private buffer(op: BufferedOp): void {
    this.buffers[this.currentLayer].push(op);
  }

  private applyStrokeStyle(style?: DrawStyle): void {
    this.ctx.strokeStyle = style?.stroke ?? DEFAULT_STROKE;
    this.ctx.lineWidth = style?.strokeWidth ?? DEFAULT_STROKE_WIDTH;
    if (style?.strokeDasharray && this.ctx.setLineDash) {
      this.ctx.setLineDash(style.strokeDasharray);
    } else if (this.ctx.setLineDash) {
      this.ctx.setLineDash([]);
    }
    this.ctx.globalAlpha = style?.opacity ?? 1;
  }

  private applyFillStyle(style?: DrawStyle): void {
    if (style?.fill) {
      this.ctx.fillStyle = style.fill;
    }
    this.ctx.globalAlpha = style?.opacity ?? 1;
  }

  private renderOp(op: BufferedOp): void {
    switch (op.type) {
      case "rect":
        this.renderRect(op.args[0] as CRect, op.style);
        break;
      case "roundedRect":
        this.renderRoundedRect(
          op.args[0] as CRect,
          op.args[1] as CSize,
          op.style,
        );
        break;
      case "line":
        this.renderLine(
          op.args[0] as CPoint,
          op.args[1] as CPoint,
          op.style,
        );
        break;
      case "polygon":
        this.renderPath(op.args[0] as PolygonPoints, true, op.style);
        break;
      case "polyline":
        this.renderPath(op.args[0] as PolygonPoints, false, op.style);
        break;
      case "circle":
        this.renderCircle(
          op.args[0] as CPoint,
          op.args[1] as number,
          op.style,
        );
        break;
      case "text":
        this.renderText(
          op.args[0] as CPoint,
          op.args[1] as string,
          op.style as DrawTextStyle | undefined,
        );
        break;
      case "pushClip":
        this.renderPushClip(op.args[0] as CRect);
        break;
      case "popClip":
        this.ctx.restore();
        break;
    }
  }

  private renderRect(rect: CRect, style?: DrawStyle): void {
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;
    if (style?.fill) {
      this.applyFillStyle(style);
      this.ctx.fillRect(rect.left, rect.top, w, h);
    }
    this.applyStrokeStyle(style);
    this.ctx.strokeRect(rect.left, rect.top, w, h);
  }

  private renderRoundedRect(
    rect: CRect,
    corner: CSize,
    style?: DrawStyle,
  ): void {
    const w = rect.right - rect.left;
    const h = rect.bottom - rect.top;
    this.ctx.beginPath();
    if (this.ctx.roundRect) {
      // Modernes API
      this.ctx.roundRect(rect.left, rect.top, w, h, [corner.cx]);
    } else {
      // Fallback: einfaches Rechteck (Eck-Rundung weglassen).
      this.ctx.rect(rect.left, rect.top, w, h);
    }
    if (style?.fill) {
      this.applyFillStyle(style);
      this.ctx.fill();
    }
    this.applyStrokeStyle(style);
    this.ctx.stroke();
  }

  private renderLine(from: CPoint, to: CPoint, style?: DrawStyle): void {
    this.applyStrokeStyle(style);
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
  }

  private renderPath(
    points: PolygonPoints,
    close: boolean,
    style?: DrawStyle,
  ): void {
    if (points.length === 0) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    if (close) this.ctx.closePath();
    if (style?.fill && close) {
      this.applyFillStyle(style);
      this.ctx.fill();
    }
    this.applyStrokeStyle(style);
    this.ctx.stroke();
  }

  private renderCircle(
    center: CPoint,
    radius: number,
    style?: DrawStyle,
  ): void {
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    if (style?.fill) {
      this.applyFillStyle(style);
      this.ctx.fill();
    }
    this.applyStrokeStyle(style);
    this.ctx.stroke();
  }

  private renderText(
    pos: CPoint,
    text: string,
    style?: DrawTextStyle,
  ): void {
    const fontSize = style?.fontSize ?? DEFAULT_FONT_SIZE;
    const fontFamily = style?.fontFamily ?? DEFAULT_FONT_FAMILY;
    const fontWeight = style?.fontWeight ?? DEFAULT_FONT_WEIGHT;
    this.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    this.ctx.textAlign = (style?.textAnchor ?? "start") as CanvasTextAlign;
    this.ctx.textBaseline = (style?.textBaseline ??
      "alphabetic") as CanvasTextBaseline;
    this.ctx.globalAlpha = style?.opacity ?? 1;
    if (style?.fill) {
      this.ctx.fillStyle = style.fill;
    } else {
      this.ctx.fillStyle = DEFAULT_STROKE;
    }
    this.ctx.fillText(text, pos.x, pos.y);
  }

  private renderPushClip(rect: CRect): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(
      rect.left,
      rect.top,
      rect.right - rect.left,
      rect.bottom - rect.top,
    );
    this.ctx.clip();
  }
}

/**
 * Minimum-Interface, das wir vom Canvas-2D-Context benötigen. Erlaubt
 * Tests mit einem strukturellen Mock ohne JSDOM-Canvas-Polyfill.
 */
export interface CanvasCtxLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    start: number,
    end: number,
  ): void;
  rect(x: number, y: number, w: number, h: number): void;
  roundRect?(
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number | number[],
  ): void;
  fill(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  setLineDash?(segments: number[]): void;
  save(): void;
  restore(): void;
  clip(): void;
}
