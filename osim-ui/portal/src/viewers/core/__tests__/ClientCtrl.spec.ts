import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ComponentType } from "react";
import { ClientCtrl } from "@/viewers/core/ClientCtrl";
import { ViewerRegistry } from "@/viewers/core/ViewerRegistry";
import type { OBaseObj, ViewerProps, ViewerHint } from "@/viewers/core/types";

const ViewerA: ComponentType<ViewerProps> = () => null;
const FallbackViewer: ComponentType<ViewerProps> = () => null;

function makeObj(klass: string, oid = 1): OBaseObj {
  return { oid, klass, attrs: {}, sub_refs: [] };
}

describe("ClientCtrl", () => {
  let registry: ViewerRegistry;
  let setSelection: ReturnType<typeof vi.fn>;
  let setViewerHint: ReturnType<typeof vi.fn>;
  let state: { selection: number | null; viewerHint: ViewerHint | null };
  let ctrl: ClientCtrl;

  beforeEach(() => {
    registry = new ViewerRegistry();
    setSelection = vi.fn();
    setViewerHint = vi.fn();
    state = { selection: null, viewerHint: null };
    ctrl = new ClientCtrl(
      registry,
      () => state,
      (oid) => {
        state.selection = oid;
        setSelection(oid);
      },
      (h) => {
        state.viewerHint = h;
        setViewerHint(h);
      },
    );
  });

  it("resolveViewer liefert registrierte Component für bekannte Klasse", () => {
    registry.register({ klass: "PDurchlaufplan", Component: ViewerA });

    const result = ctrl.resolveViewer(makeObj("PDurchlaufplan"));

    expect(result).toBe(ViewerA);
  });

  it("resolveViewer liefert Fallback für unbekannte Klasse", () => {
    registry.setFallback(FallbackViewer);

    const result = ctrl.resolveViewer(makeObj("UnknownKlass"));

    expect(result).toBe(FallbackViewer);
  });

  it("resolveViewer liefert null wenn obj null ist", () => {
    expect(ctrl.resolveViewer(null)).toBeNull();
  });

  it("setObject ruft setSelection-Callback mit oid", () => {
    ctrl.setObject(42);

    expect(setSelection).toHaveBeenCalledWith(42);
    expect(state.selection).toBe(42);
  });

  it("setViewerHint ruft setViewerHint-Callback mit hint", () => {
    ctrl.setViewerHint("design");

    expect(setViewerHint).toHaveBeenCalledWith("design");
    expect(state.viewerHint).toBe("design");
  });

  it("resolveViewer berücksichtigt aktuellen viewerHint aus state", () => {
    const ViewerStd: ComponentType<ViewerProps> = () => null;
    const ViewerDesign: ComponentType<ViewerProps> = () => null;
    registry.register({ klass: "PDurchlaufplan", Component: ViewerStd });
    registry.register({
      klass: "PDurchlaufplan",
      hint: "design",
      Component: ViewerDesign,
    });

    state.viewerHint = "design";
    expect(ctrl.resolveViewer(makeObj("PDurchlaufplan"))).toBe(ViewerDesign);

    state.viewerHint = null;
    expect(ctrl.resolveViewer(makeObj("PDurchlaufplan"))).toBe(ViewerStd);
  });
});
