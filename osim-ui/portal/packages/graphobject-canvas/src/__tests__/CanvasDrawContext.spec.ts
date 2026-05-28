/**
 * Tests für CanvasDrawContext (Track C4).
 *
 * Beweis: Foundation-Klassen aus @osim/graphobject können in einen
 * Canvas-2D-Context rendern, OHNE dass die Foundation Canvas kennt.
 * Der Vertrag DrawContext aus @osim/graphobject ist der einzige Bezug.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  CanvasDrawContext,
  type CanvasCtxLike,
} from "@osim/graphobject-canvas";
import { DrawLayer, GObject } from "@osim/graphobject";

/**
 * Erzeugt einen Mock-Canvas-Context, dessen Methoden Call-Spies sind.
 * Damit verifizieren wir, WAS die CanvasDrawContext.flush() tatsaechlich
 * an Pinsel-Operationen schickt.
 */
function mockCanvas(): CanvasCtxLike {
  return {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    font: "12px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
  };
}

describe("CanvasDrawContext — Layer-disziplinierte Puffer-Pipeline", () => {
  let canvas: CanvasCtxLike;
  let ctx: CanvasDrawContext;

  beforeEach(() => {
    canvas = mockCanvas();
    ctx = new CanvasDrawContext(canvas);
  });

  it("setLayer + drawRect: Op wird ins Puffer-Array des Layers geschrieben", () => {
    ctx.setLayer(DrawLayer.BACKGROUND);
    ctx.drawRect({ left: 0, top: 0, right: 10, bottom: 10 });
    const buffered = ctx.getBufferedOps();
    expect(buffered[DrawLayer.BACKGROUND]).toHaveLength(1);
    expect(buffered[DrawLayer.BACKGROUND][0].type).toBe("rect");
  });

  it("flush() rendert Ops in DrawLayer-Reihenfolge (BACKGROUND zuerst)", () => {
    ctx.setLayer(DrawLayer.OVERLAY);
    ctx.drawRect({ left: 50, top: 50, right: 60, bottom: 60 });
    ctx.setLayer(DrawLayer.BACKGROUND);
    ctx.drawRect({ left: 0, top: 0, right: 10, bottom: 10 });
    ctx.setLayer(DrawLayer.CONTENT);
    ctx.drawRect({ left: 20, top: 20, right: 30, bottom: 30 });

    ctx.flush();

    // Reihenfolge der strokeRect-Calls: BACKGROUND (0,0), CONTENT (20,20),
    // OVERLAY (50,50) — auch wenn sie in umgekehrter Reihenfolge aufgerufen
    // wurden.
    const calls = (canvas.strokeRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([0, 0, 10, 10]); // BACKGROUND
    expect(calls[1]).toEqual([20, 20, 10, 10]); // CONTENT
    expect(calls[2]).toEqual([50, 50, 10, 10]); // OVERLAY
  });

  it("flush() leert die Puffer", () => {
    ctx.setLayer(DrawLayer.CONTENT);
    ctx.drawRect({ left: 0, top: 0, right: 10, bottom: 10 });
    ctx.flush();
    const buffered = ctx.getBufferedOps();
    for (const layer of buffered) expect(layer).toHaveLength(0);
  });
});

describe("CanvasDrawContext — Render-Operationen", () => {
  let canvas: CanvasCtxLike;
  let ctx: CanvasDrawContext;

  beforeEach(() => {
    canvas = mockCanvas();
    ctx = new CanvasDrawContext(canvas);
  });

  it("drawRect ohne Fill: nur strokeRect", () => {
    ctx.drawRect({ left: 10, top: 10, right: 50, bottom: 30 });
    ctx.flush();
    expect(canvas.fillRect).not.toHaveBeenCalled();
    expect(canvas.strokeRect).toHaveBeenCalledWith(10, 10, 40, 20);
  });

  it("drawRect mit Fill: erst fillRect, dann strokeRect", () => {
    ctx.drawRect(
      { left: 0, top: 0, right: 10, bottom: 10 },
      { fill: "#ff0000", stroke: "#000000" },
    );
    ctx.flush();
    expect(canvas.fillRect).toHaveBeenCalledWith(0, 0, 10, 10);
    expect(canvas.strokeRect).toHaveBeenCalledWith(0, 0, 10, 10);
  });

  it("drawPolygon zeichnet n Punkte + closePath", () => {
    ctx.drawPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ]);
    ctx.flush();
    expect(canvas.beginPath).toHaveBeenCalled();
    expect(canvas.moveTo).toHaveBeenCalledWith(0, 0);
    expect(canvas.lineTo).toHaveBeenCalledWith(10, 0);
    expect(canvas.lineTo).toHaveBeenCalledWith(5, 10);
    expect(canvas.closePath).toHaveBeenCalled();
    expect(canvas.stroke).toHaveBeenCalled();
  });

  it("drawPolyline schließt NICHT", () => {
    ctx.drawPolyline([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    ctx.flush();
    expect(canvas.closePath).not.toHaveBeenCalled();
    expect(canvas.stroke).toHaveBeenCalled();
  });

  it("drawCircle nutzt arc(0, 2π)", () => {
    ctx.drawCircle({ x: 50, y: 50 }, 10);
    ctx.flush();
    expect(canvas.arc).toHaveBeenCalledWith(50, 50, 10, 0, Math.PI * 2);
  });

  it("drawText setzt font + textAlign + textBaseline + fillText", () => {
    ctx.drawText(
      { x: 100, y: 50 },
      "Hello",
      { fontSize: 14, textAnchor: "middle", fill: "#0000ff" },
    );
    ctx.flush();
    expect(canvas.font).toMatch(/14px/);
    expect(canvas.textAlign).toBe("middle");
    expect(canvas.fillText).toHaveBeenCalledWith("Hello", 100, 50);
  });

  it("measureText nutzt Canvas-measureText", () => {
    const size = ctx.measureText("Hello", { fontSize: 14 });
    expect(size.cy).toBe(14);
    // mockCanvas measureText liefert text.length * 7 → "Hello" = 35.
    expect(size.cx).toBe(35);
  });

  it("pushClip/popClip nutzen save/clip/restore", () => {
    ctx.pushClip({ left: 0, top: 0, right: 100, bottom: 100 });
    ctx.drawRect({ left: 10, top: 10, right: 50, bottom: 50 });
    ctx.popClip();
    ctx.flush();
    expect(canvas.save).toHaveBeenCalled();
    expect(canvas.clip).toHaveBeenCalled();
    expect(canvas.restore).toHaveBeenCalled();
  });

  it("Stil mit strokeDasharray setzt setLineDash", () => {
    ctx.drawLine({ x: 0, y: 0 }, { x: 10, y: 10 }, {
      strokeDasharray: [4, 2],
    });
    ctx.flush();
    expect(canvas.setLineDash).toHaveBeenCalledWith([4, 2]);
  });
});

describe("Integration: GObject + CanvasDrawContext", () => {
  it("GObject.DrawPhantom zeichnet auf Canvas via Foundation-Vertrag", () => {
    const canvas = mockCanvas();
    const ctx = new CanvasDrawContext(canvas);

    const obj = new GObject();
    obj.m_isPhShown = true;
    obj.m_OldPhantomRect = { left: 10, top: 20, right: 110, bottom: 80 };
    obj.m_BackColor = "#aabbcc";

    // Foundation-Code kennt CanvasDrawContext NICHT — er ruft mit dem
    // DrawContext-Vertrag aus @osim/graphobject auf.
    obj.DrawPhantom(ctx);
    ctx.flush();

    // Phantom landet auf OVERLAY (Layer 5), als Rechteck mit Fill + Stroke.
    expect(canvas.fillRect).toHaveBeenCalledWith(10, 20, 100, 60);
    expect(canvas.strokeRect).toHaveBeenCalledWith(10, 20, 100, 60);
  });

  it("GObject.Draw (Default-No-Op) verursacht keine Canvas-Operations", () => {
    const canvas = mockCanvas();
    const ctx = new CanvasDrawContext(canvas);
    const obj = new GObject();

    obj.Draw(ctx);
    obj.DrawBackground(ctx);
    obj.DrawForeground(ctx);
    obj.DrawHelpers(ctx);
    ctx.flush();

    expect(canvas.fillRect).not.toHaveBeenCalled();
    expect(canvas.strokeRect).not.toHaveBeenCalled();
    expect(canvas.fillText).not.toHaveBeenCalled();
  });
});
