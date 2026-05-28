/**
 * Tests fuer DrawContext + DrawLayer + Null/RecordingDrawContext (Track B4).
 */

import { describe, expect, it } from "vitest";
import {
  DrawLayer,
  NullDrawContext,
  RecordingDrawContext,
} from "@/graph/foundation/DrawContext";
import { GObject } from "@/graph/foundation/GObject";
import { GObjSub } from "@/graph/foundation/GObjSub";
import { OGraphList } from "@/graph/foundation/OGraphList";
import { GOStateSub } from "@/graph/foundation/types";

describe("DrawLayer-Enum (Z-Ordnung)", () => {
  it("hat 6 Layer in der erwarteten Reihenfolge", () => {
    expect(DrawLayer.BACKGROUND).toBe(0);
    expect(DrawLayer.CONTENT).toBe(1);
    expect(DrawLayer.FOREGROUND).toBe(2);
    expect(DrawLayer.TEXT).toBe(3);
    expect(DrawLayer.HELPERS).toBe(4);
    expect(DrawLayer.OVERLAY).toBe(5);
  });

  it("Z-Ordnung ist strikt aufsteigend", () => {
    const ordered = [
      DrawLayer.BACKGROUND,
      DrawLayer.CONTENT,
      DrawLayer.FOREGROUND,
      DrawLayer.TEXT,
      DrawLayer.HELPERS,
      DrawLayer.OVERLAY,
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
    }
  });
});

describe("NullDrawContext", () => {
  it("alle Render-Ops sind no-op (kein Exception)", () => {
    const ctx = new NullDrawContext();
    ctx.setLayer(DrawLayer.CONTENT);
    ctx.drawRect({ left: 0, top: 0, right: 10, bottom: 10 });
    ctx.drawRoundedRect(
      { left: 0, top: 0, right: 10, bottom: 10 },
      { cx: 4, cy: 4 },
    );
    ctx.drawLine({ x: 0, y: 0 }, { x: 10, y: 10 });
    ctx.drawPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }]);
    ctx.drawPolyline([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    ctx.drawCircle({ x: 5, y: 5 }, 3);
    ctx.drawText({ x: 0, y: 0 }, "Hello");
    ctx.pushClip({ left: 0, top: 0, right: 100, bottom: 100 });
    ctx.popClip();
    // Kein Exception → ok.
  });

  it("measureText liefert grobe Heuristik (cx ~ text.length × fontSize × 0.6)", () => {
    const ctx = new NullDrawContext();
    const sz = ctx.measureText("Hello", { fontSize: 10 });
    expect(sz.cx).toBe(Math.round(5 * 10 * 0.6)); // 30
    expect(sz.cy).toBe(10);
  });

  it("measureText nutzt Default-fontSize wenn nicht angegeben", () => {
    const ctx = new NullDrawContext();
    const sz = ctx.measureText("X");
    expect(sz.cy).toBe(12); // Default
  });
});

describe("RecordingDrawContext", () => {
  it("zeichnet alle Ops mit aktuellem Layer auf", () => {
    const ctx = new RecordingDrawContext();
    ctx.setLayer(DrawLayer.BACKGROUND);
    ctx.drawRect({ left: 0, top: 0, right: 10, bottom: 10 });
    ctx.setLayer(DrawLayer.CONTENT);
    ctx.drawText({ x: 5, y: 5 }, "Inhalt");
    ctx.setLayer(DrawLayer.FOREGROUND);
    ctx.drawCircle({ x: 5, y: 5 }, 2);

    expect(ctx.operations).toHaveLength(3);
    expect(ctx.operations[0].op).toBe("drawRect");
    expect(ctx.operations[0].layer).toBe(DrawLayer.BACKGROUND);
    expect(ctx.operations[1].op).toBe("drawText");
    expect(ctx.operations[1].layer).toBe(DrawLayer.CONTENT);
    expect(ctx.operations[2].op).toBe("drawCircle");
    expect(ctx.operations[2].layer).toBe(DrawLayer.FOREGROUND);
  });

  it("opsByLayer filtert korrekt nach Layer", () => {
    const ctx = new RecordingDrawContext();
    ctx.setLayer(DrawLayer.BACKGROUND);
    ctx.drawRect({ left: 0, top: 0, right: 10, bottom: 10 });
    ctx.drawRect({ left: 20, top: 0, right: 30, bottom: 10 });
    ctx.setLayer(DrawLayer.CONTENT);
    ctx.drawText({ x: 5, y: 5 }, "X");
    expect(ctx.opsByLayer(DrawLayer.BACKGROUND)).toHaveLength(2);
    expect(ctx.opsByLayer(DrawLayer.CONTENT)).toHaveLength(1);
    expect(ctx.opsByLayer(DrawLayer.FOREGROUND)).toHaveLength(0);
  });

  it("pushClip/popClip werden mit aufgezeichnet", () => {
    const ctx = new RecordingDrawContext();
    ctx.pushClip({ left: 0, top: 0, right: 100, bottom: 100 });
    ctx.drawRect({ left: 10, top: 10, right: 50, bottom: 50 });
    ctx.popClip();
    expect(ctx.operations.map((o) => o.op)).toEqual([
      "pushClip",
      "drawRect",
      "popClip",
    ]);
  });
});

describe("GObject 4-Layer-Drawing-API (Default-No-Op)", () => {
  it("Default-Implementations machen nichts und liefern true", () => {
    const obj = new GObject();
    const ctx = new RecordingDrawContext();
    expect(obj.DrawBackground(ctx)).toBe(true);
    expect(obj.Draw(ctx)).toBe(true);
    expect(obj.DrawForeground(ctx)).toBe(true);
    expect(obj.DrawHelpers(ctx)).toBe(true);
    // Keine Ops aufgezeichnet — Default sind no-ops.
    expect(ctx.operations).toHaveLength(0);
  });
});

describe("GObjSub Draw-Delegation an Sub-Children (4-Layer-Pfad)", () => {
  it("DrawBackground in D_OPEN propagiert an alle Sub-Children", () => {
    // Sub-Klasse die Render-Op auf BACKGROUND aufzeichnet.
    class TestNode extends GObject {
      override DrawBackground(ctx: import(
        "@/graph/foundation/DrawContext"
      ).DrawContext): boolean {
        ctx.setLayer(DrawLayer.BACKGROUND);
        ctx.drawRect(this.m_VirtRect);
        return true;
      }
    }

    const parent = new GObjSub();
    parent.SetSubState(GOStateSub.D_OPEN);
    const child1 = new TestNode();
    const child2 = new TestNode();
    const subColl = new OGraphList(0);
    subColl.AddTail(child1);
    subColl.AddTail(child2);
    parent.AddSubCollection(subColl);

    const ctx = new RecordingDrawContext();
    parent.DrawBackground(ctx);

    // 1× Self (no-op) + 2× Children, jeweils 'drawRect' auf BACKGROUND.
    const bg = ctx.opsByLayer(DrawLayer.BACKGROUND);
    expect(bg.length).toBe(2);
    expect(bg.every((o) => o.op === "drawRect")).toBe(true);
  });

  it("DrawBackground in D_CLOSED propagiert NICHT an Sub-Children", () => {
    class TestNode extends GObject {
      override DrawBackground(ctx: import(
        "@/graph/foundation/DrawContext"
      ).DrawContext): boolean {
        ctx.drawRect(this.m_VirtRect);
        return true;
      }
    }

    const parent = new GObjSub();
    parent.SetSubState(GOStateSub.D_CLOSED);
    const child = new TestNode();
    const subColl = new OGraphList(0);
    subColl.AddTail(child);
    parent.AddSubCollection(subColl);

    const ctx = new RecordingDrawContext();
    parent.DrawBackground(ctx);

    // D_CLOSED → keine Sub-Iteration → Recording leer (super.DrawBackground
    // ist no-op).
    expect(ctx.operations).toHaveLength(0);
  });
});
