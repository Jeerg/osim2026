/**
 * DrawContext + DrawLayer — renderer-agnostischer Zeichen-Vertrag.
 *
 * **Hintergrund (Track B4, Audit 2026-05-28 §5.3):** das C++-Original hat
 * eine 4-Layer-Drawing-API auf `GObject` (`DrawBackground`, `Draw`,
 * `DrawForeground`, `DrawHelpers`) — und intern noch `DrawText`/`DrawSymbol`
 * /`DrawPhantom`. Sie alle nehmen einen `CDC*` (MFC-Device-Context) als
 * Argument; das bindet die Foundation an MFC.
 *
 * **Diese Datei definiert den entsprechenden TS-Vertrag** als
 * Renderer-Interface, das osim-ui's React-Flow-Adapter (heute), eine
 * Canvas-Implementation (Track C4) oder ein direkter SVG-Renderer
 * implementieren können. **Foundation kennt nur dieses Interface — kein
 * React Flow, kein Canvas, kein HTMLElement.**
 *
 * **Aktueller Stand (Phase 1.1+):** die RF-Adapter-Schicht in
 * `view-adapter.ts` baut React-Flow-Node/Edge-Daten direkt aus `OGraphGrid`,
 * ohne `GObject.Draw*` aufzurufen. Der `DrawContext`-Vertrag ist damit
 * **vorbereitend** — er erlaubt zukünftige Adapter (Canvas in Track C4)
 * den 4-Layer-Pfad konsistent zu implementieren.
 */

import type { CPoint, CRect, CSize } from "@/graph/foundation/types";

/**
 * Render-Layer für die 4-Layer-Drawing-API + Helpers/Overlay.
 *
 * **Reihenfolge (von hinten nach vorne):**
 *  1. BACKGROUND — Hintergrund-Layer (z.B. Container-Füllung, Pattern).
 *  2. CONTENT — eigentlicher Knoten/Edge-Inhalt (Form, Border).
 *  3. FOREGROUND — Overlays über dem Inhalt (z.B. Icons, Badges).
 *  4. TEXT — Beschriftungen (separat, weil oft skaliert/positioniert anders).
 *  5. HELPERS — Hilfslinien, Grid-Marker, Bounding-Boxes (Debug + nicht
 *               unter Map-Mode, 1:1 zu C++ „Kein Map Mode"-Kommentar).
 *  6. OVERLAY — UI-Overlay nach allen Knoten (z.B. Drag-Phantom).
 *
 * 1:1-Mapping zu C++-Methoden:
 *  BACKGROUND → DrawBackground
 *  CONTENT    → Draw
 *  FOREGROUND → DrawForeground
 *  TEXT       → DrawText
 *  HELPERS    → DrawHelpers
 *  OVERLAY    → DrawPhantom (Drag-Ghost im C++ via Show/HidePhantom-Pair)
 */
export enum DrawLayer {
  BACKGROUND = 0,
  CONTENT = 1,
  FOREGROUND = 2,
  TEXT = 3,
  HELPERS = 4,
  OVERLAY = 5,
}

/**
 * Style-Spezifikation für Render-Operationen. Renderer-Implementations
 * übersetzen das in ihre Backend-Konventionen (Canvas: fillStyle/strokeStyle;
 * SVG: fill/stroke-Attribute; React Flow: CSS-Properties).
 */
export interface DrawStyle {
  /** Füll-Farbe (CSS-Color). Optional — Default = transparent. */
  fill?: string;
  /** Linien-Farbe (CSS-Color). Optional — Default = "#000000". */
  stroke?: string;
  /** Linien-Breite in Pixeln. Default = 1. */
  strokeWidth?: number;
  /** Dash-Pattern (z.B. [4, 2] für 4px solid, 2px gap). Default = solid. */
  strokeDasharray?: number[];
  /** Render-Opacity 0..1. Default = 1.0. */
  opacity?: number;
}

/**
 * Text-Style-Erweiterung von DrawStyle.
 */
export interface DrawTextStyle extends DrawStyle {
  /** Schrift-Familie (CSS). Default = "Segoe UI, sans-serif". */
  fontFamily?: string;
  /** Schrift-Größe in Pixeln. Default = 12. */
  fontSize?: number;
  /** Schrift-Gewicht (CSS). Default = "normal". */
  fontWeight?: "normal" | "bold" | "lighter" | string;
  /** Horizontaler Text-Anker. Default = "start". */
  textAnchor?: "start" | "middle" | "end";
  /** Vertikaler Baseline-Anker. Default = "alphabetic". */
  textBaseline?: "top" | "middle" | "alphabetic" | "bottom";
}

/**
 * Polygon-Punkte (für Pfeil-Spitzen, Star-Shapes etc.).
 */
export type PolygonPoints = readonly CPoint[];

/**
 * Renderer-Interface. Foundation-Klassen rufen diese Methoden in ihren
 * `Draw*`-Implementations auf; der Renderer-Adapter implementiert das
 * Interface und übersetzt in sein Backend.
 *
 * **Layer-Disziplin:** vor jeder Render-Primitive setzt der Aufrufer per
 * `setLayer(layer)` den aktuellen Layer. Implementations müssen die
 * Z-Ordnung gemäß DrawLayer respektieren (BACKGROUND zuerst, OVERLAY
 * zuletzt).
 *
 * **Koordinatensystem:** alle Koordinaten sind absolute Welt-Koordinaten
 * (= MFC „virtual coords" + Pan/Zoom-Transformation findet im Renderer
 * statt). Foundation rechnet in Welt-Pixeln.
 */
export interface DrawContext {
  /** Aktuellen Render-Layer setzen. Renderer respektiert Z-Ordnung. */
  setLayer(layer: DrawLayer): void;

  /** Rechteck zeichnen. Style optional — Default = solid black border. */
  drawRect(rect: CRect, style?: DrawStyle): void;

  /**
   * Abgerundetes Rechteck. `corner.cx`/`cy` = horizontale/vertikale Eck-
   * Rundung in Pixeln. Default-Corner falls undefined.
   */
  drawRoundedRect(rect: CRect, corner: CSize, style?: DrawStyle): void;

  /** Linie zwischen zwei Punkten. */
  drawLine(from: CPoint, to: CPoint, style?: DrawStyle): void;

  /** Polygon (geschlossen) durch n Punkte. */
  drawPolygon(points: PolygonPoints, style?: DrawStyle): void;

  /**
   * Polyline (offen) — wie Polygon, aber ohne Schließ-Linie. Für
   * Link-Pfade mit mehreren Knick-Punkten.
   */
  drawPolyline(points: PolygonPoints, style?: DrawStyle): void;

  /** Kreis um Mittelpunkt mit Radius. */
  drawCircle(center: CPoint, radius: number, style?: DrawStyle): void;

  /** Text an Position rendern. */
  drawText(pos: CPoint, text: string, style?: DrawTextStyle): void;

  /**
   * Misst Text-Bounding-Box ohne ihn zu rendern. Wird von DrawText-
   * Implementations gebraucht um Auto-Layout zu berechnen.
   */
  measureText(text: string, style?: DrawTextStyle): CSize;

  /**
   * Clipping-Region aktivieren. Nachfolgende Render-Ops werden auf
   * `rect` beschränkt. `pop` revertiert.
   */
  pushClip(rect: CRect): void;
  popClip(): void;
}

/**
 * Null-Implementation für Unit-Tests + Foundation-Code, der noch keine
 * echte Render-Pipeline braucht. Alle Methoden sind no-op; `measureText`
 * liefert eine grobe Schätzung (10px-Zeichen-Breite × 12px-Höhe).
 *
 * Verwendung in Tests:
 *   const ctx = new NullDrawContext();
 *   gobject.Draw(ctx);
 *   // Foundation-Code lief, keine Side-Effects.
 */
export class NullDrawContext implements DrawContext {
  setLayer(_layer: DrawLayer): void {
    // no-op
  }
  drawRect(_rect: CRect, _style?: DrawStyle): void {
    // no-op
  }
  drawRoundedRect(_rect: CRect, _corner: CSize, _style?: DrawStyle): void {
    // no-op
  }
  drawLine(_from: CPoint, _to: CPoint, _style?: DrawStyle): void {
    // no-op
  }
  drawPolygon(_points: PolygonPoints, _style?: DrawStyle): void {
    // no-op
  }
  drawPolyline(_points: PolygonPoints, _style?: DrawStyle): void {
    // no-op
  }
  drawCircle(_center: CPoint, _radius: number, _style?: DrawStyle): void {
    // no-op
  }
  drawText(_pos: CPoint, _text: string, _style?: DrawTextStyle): void {
    // no-op
  }
  measureText(text: string, style?: DrawTextStyle): CSize {
    const fontSize = style?.fontSize ?? 12;
    // grobe Heuristik: 0.6 * fontSize pro Zeichen-Breite (Monospace ≈ 0.5,
    // Proportional ≈ 0.55-0.65). Für Tests reicht das.
    return {
      cx: Math.round(text.length * fontSize * 0.6),
      cy: fontSize,
    };
  }
  pushClip(_rect: CRect): void {
    // no-op
  }
  popClip(): void {
    // no-op
  }
}

/**
 * Recording-Implementation für Tests + Debugging. Sammelt alle
 * Render-Aufrufe in `operations`, sodass Foundation-Tests verifizieren
 * können WAS gerendert wurde.
 */
export class RecordingDrawContext implements DrawContext {
  operations: Array<{
    op: string;
    args: unknown[];
    layer: DrawLayer;
  }> = [];
  private currentLayer: DrawLayer = DrawLayer.CONTENT;
  private clipStack: CRect[] = [];

  private record(op: string, ...args: unknown[]): void {
    this.operations.push({
      op,
      args,
      layer: this.currentLayer,
    });
  }

  setLayer(layer: DrawLayer): void {
    this.currentLayer = layer;
  }
  drawRect(rect: CRect, style?: DrawStyle): void {
    this.record("drawRect", rect, style);
  }
  drawRoundedRect(rect: CRect, corner: CSize, style?: DrawStyle): void {
    this.record("drawRoundedRect", rect, corner, style);
  }
  drawLine(from: CPoint, to: CPoint, style?: DrawStyle): void {
    this.record("drawLine", from, to, style);
  }
  drawPolygon(points: PolygonPoints, style?: DrawStyle): void {
    this.record("drawPolygon", points, style);
  }
  drawPolyline(points: PolygonPoints, style?: DrawStyle): void {
    this.record("drawPolyline", points, style);
  }
  drawCircle(center: CPoint, radius: number, style?: DrawStyle): void {
    this.record("drawCircle", center, radius, style);
  }
  drawText(pos: CPoint, text: string, style?: DrawTextStyle): void {
    this.record("drawText", pos, text, style);
  }
  measureText(text: string, style?: DrawTextStyle): CSize {
    const fontSize = style?.fontSize ?? 12;
    return {
      cx: Math.round(text.length * fontSize * 0.6),
      cy: fontSize,
    };
  }
  pushClip(rect: CRect): void {
    this.clipStack.push(rect);
    this.record("pushClip", rect);
  }
  popClip(): void {
    this.clipStack.pop();
    this.record("popClip");
  }

  /** Hilfs-Methode für Tests: Operationen eines bestimmten Layers. */
  opsByLayer(layer: DrawLayer): Array<{ op: string; args: unknown[] }> {
    return this.operations
      .filter((o) => o.layer === layer)
      .map((o) => ({ op: o.op, args: o.args }));
  }
}
