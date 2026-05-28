/**
 * Tests fuer PhantomController + GObject.DrawPhantom (Track B5).
 */

import { describe, expect, it } from "vitest";
import {
  PhantomController,
  phantomController as defaultController,
} from "@/graph/foundation/PhantomController";
import { GObject } from "@/graph/foundation/GObject";
import {
  RecordingDrawContext,
  DrawLayer,
} from "@/graph/foundation/DrawContext";

describe("PhantomController — Session-Lifecycle", () => {
  it("show() aktiviert Phantom-State auf dem Quell-Objekt", () => {
    const c = new PhantomController();
    const o = new GObject();
    o.m_GSize = { cx: 80, cy: 40 };

    const p = c.show(o, { x: 100, y: 50 });
    expect(c.isActive()).toBe(true);
    expect(o.m_isPhShown).toBe(true);
    expect(o.m_OldPhantomRect).toEqual({
      left: 100,
      top: 50,
      right: 180,
      bottom: 90,
    });
    expect(p.source).toBe(o);
    expect(p.cursor).toEqual({ x: 100, y: 50 });
  });

  it("update() verschiebt das Phantom auf neue Cursor-Position", () => {
    const c = new PhantomController();
    const o = new GObject();
    o.m_GSize = { cx: 80, cy: 40 };
    c.show(o, { x: 100, y: 50 });

    const p = c.update({ x: 200, y: 70 });

    expect(p).not.toBeNull();
    expect(p!.cursor).toEqual({ x: 200, y: 70 });
    expect(o.m_OldPhantomRect).toEqual({
      left: 200,
      top: 70,
      right: 280,
      bottom: 110,
    });
  });

  it("update() ist No-Op wenn keine Session aktiv ist", () => {
    const c = new PhantomController();
    const result = c.update({ x: 200, y: 70 });
    expect(result).toBeNull();
    expect(c.isActive()).toBe(false);
  });

  it("hide() beendet Session + setzt m_isPhShown=false", () => {
    const c = new PhantomController();
    const o = new GObject();
    c.show(o, { x: 0, y: 0 });
    expect(o.m_isPhShown).toBe(true);

    c.hide();

    expect(c.isActive()).toBe(false);
    expect(o.m_isPhShown).toBe(false);
    expect(c.getActivePhantom()).toBeNull();
  });

  it("hide() ohne aktive Session ist No-Op", () => {
    const c = new PhantomController();
    c.hide();
    expect(c.isActive()).toBe(false);
  });

  it("show() ueberschreibt aktive Session auf anderem Objekt", () => {
    const c = new PhantomController();
    const a = new GObject();
    const b = new GObject();
    c.show(a, { x: 0, y: 0 });
    expect(a.m_isPhShown).toBe(true);

    c.show(b, { x: 10, y: 10 });

    expect(b.m_isPhShown).toBe(true);
    expect(c.getActivePhantom()?.source).toBe(b);
    // Hinweis: a.m_isPhShown bleibt true bis hide() — das ist absichtlich
    // konsistent mit C++ ShowPhantom-Semantik (Caller muss vor neuem
    // show ein hide aufrufen wenn er aufraeumen will).
  });

  it("Singleton phantomController ist instanziert + funktional", () => {
    expect(defaultController).toBeInstanceOf(PhantomController);
    defaultController.hide(); // sicherheitshalber, falls vorherige Tests Spuren hinterliessen
    expect(defaultController.isActive()).toBe(false);
  });
});

describe("GObject.DrawPhantom", () => {
  it("rendert nichts wenn m_isPhShown=false", () => {
    const o = new GObject();
    const ctx = new RecordingDrawContext();
    o.DrawPhantom(ctx);
    expect(ctx.operations).toHaveLength(0);
  });

  it("rendert Rechteck auf OVERLAY-Layer wenn m_isPhShown=true", () => {
    const o = new GObject();
    o.m_isPhShown = true;
    o.m_OldPhantomRect = { left: 10, top: 20, right: 110, bottom: 80 };
    o.m_BackColor = "#ffe0e0";

    const ctx = new RecordingDrawContext();
    o.DrawPhantom(ctx);

    const overlayOps = ctx.opsByLayer(DrawLayer.OVERLAY);
    expect(overlayOps).toHaveLength(1);
    expect(overlayOps[0].op).toBe("drawRect");
    expect(overlayOps[0].args[0]).toEqual({
      left: 10,
      top: 20,
      right: 110,
      bottom: 80,
    });
    // Style ist semi-transparent + dashed
    const style = overlayOps[0].args[1] as Record<string, unknown>;
    expect(style.fill).toBe("#ffe0e0");
    expect(style.opacity).toBe(0.5);
    expect(style.strokeDasharray).toEqual([4, 2]);
  });
});

describe("GObject.ShowPhantom + GetPhantomRect", () => {
  it("ShowPhantom setzt State + GetPhantomRect liefert das Rect", () => {
    const o = new GObject();
    o.m_GSize = { cx: 50, cy: 30 };
    const ctx = new RecordingDrawContext();
    o.ShowPhantom(ctx, { x: 100, y: 200 });
    expect(o.GetPhantomRect()).toEqual({
      left: 100,
      top: 200,
      right: 150,
      bottom: 230,
    });
  });

  it("GetPhantomRect liefert null wenn m_isPhShown=false", () => {
    const o = new GObject();
    expect(o.GetPhantomRect()).toBeNull();
  });

  it("HidePhantom setzt m_isPhShown=false", () => {
    const o = new GObject();
    const ctx = new RecordingDrawContext();
    o.ShowPhantom(ctx, { x: 0, y: 0 });
    expect(o.m_isPhShown).toBe(true);
    o.HidePhantom(ctx);
    expect(o.m_isPhShown).toBe(false);
    expect(o.GetPhantomRect()).toBeNull();
  });
});
