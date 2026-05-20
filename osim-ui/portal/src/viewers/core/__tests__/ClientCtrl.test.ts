// Plan 01-04 Task 2: Tests fuer ClientCtrl + ViewerFrame-Subscribe-Mechanik.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerFrame } from "../ViewerFrame";
import { ClientCtrl, FALLBACK_KLASS } from "../ClientCtrl";
import {
  _clearRegistryForTests,
  getViewer,
  registerViewer,
} from "../viewer-registry";
import type { ChildDialogComponent, OtxJsonNode } from "../types";

const FooDialog: ChildDialogComponent = () => null;
FooDialog.displayName = "FooDialog";

const BarDialog: ChildDialogComponent = () => null;
BarDialog.displayName = "BarDialog";

const FallbackDialog: ChildDialogComponent = () => null;
FallbackDialog.displayName = "FallbackDialog";

function makeObj(oid: number, klass: string, name = "x"): OtxJsonNode {
  return {
    oid,
    klass,
    name,
    properties: {},
    children: [],
  };
}

describe("ClientCtrl", () => {
  beforeEach(() => {
    _clearRegistryForTests();
    registerViewer({
      klass: "PFoo",
      component: FooDialog,
      displayName: "FooDialog",
    });
    registerViewer({
      klass: "PBar",
      component: BarDialog,
      displayName: "BarDialog",
    });
    registerViewer({
      klass: FALLBACK_KLASS,
      component: FallbackDialog,
      displayName: "FallbackDialog",
    });
  });

  afterEach(() => {
    _clearRegistryForTests();
  });

  it("setObj sets current and picks the matching ChildDialog", () => {
    const frame = new ViewerFrame("test");
    const fooObj = makeObj(1, "PFoo");
    const ok = frame.setObj(fooObj);
    expect(ok).toBe(true);
    expect(frame.clientCtrl.current).toBe(fooObj);
    expect(frame.clientCtrl.childDialogKlass).toBe("PFoo");
    expect(frame.clientCtrl.isFallback).toBe(false);
  });

  it("setObj switches ChildDialog when klass changes", () => {
    const frame = new ViewerFrame("test");
    frame.setObj(makeObj(1, "PFoo"));
    expect(frame.clientCtrl.childDialogKlass).toBe("PFoo");
    frame.setObj(makeObj(2, "PBar"));
    expect(frame.clientCtrl.childDialogKlass).toBe("PBar");
  });

  it("pickChildDialog falls back to PGObjBase for unknown klass", () => {
    const frame = new ViewerFrame("test");
    frame.setObj(makeObj(1, "PUnregistered"));
    expect(frame.clientCtrl.isFallback).toBe(true);
    expect(frame.clientCtrl.pickChildDialog("PUnregistered")).toBe(
      FallbackDialog,
    );
  });

  it("pickChildDialog returns null when no fallback is registered", () => {
    _clearRegistryForTests();
    registerViewer({
      klass: "PFoo",
      component: FooDialog,
      displayName: "FooDialog",
    });
    expect(getViewer(FALLBACK_KLASS)).toBeNull();
    const cc = new ClientCtrl({ update: () => {} });
    expect(cc.pickChildDialog("PUnregistered")).toBeNull();
  });

  it("setObj(null) clears current and childDialogKlass", () => {
    const frame = new ViewerFrame("test");
    frame.setObj(makeObj(1, "PFoo"));
    frame.setObj(null);
    expect(frame.clientCtrl.current).toBeNull();
    expect(frame.clientCtrl.childDialogKlass).toBeNull();
  });

  it("frame.subscribe is notified on setObj and on update()", () => {
    const frame = new ViewerFrame("test");
    const listener = vi.fn();
    const unsub = frame.subscribe(listener);
    frame.setObj(makeObj(1, "PFoo"));
    expect(listener).toHaveBeenCalledTimes(1);
    frame.update();
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    frame.update();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("frame.setObj triggers onObjChange callback", () => {
    const onObjChange = vi.fn();
    const frame = new ViewerFrame("test", onObjChange);
    const o = makeObj(1, "PFoo");
    frame.setObj(o);
    expect(onObjChange).toHaveBeenCalledWith(o);
  });

  it("describeSelection returns selection metadata for diagnostics", () => {
    const frame = new ViewerFrame("test");
    frame.setObj(makeObj(1, "PFoo"));
    const sel = frame.clientCtrl.describeSelection();
    expect(sel).toEqual({
      klass: "PFoo",
      componentName: "FooDialog",
      fallback: false,
    });
  });

  it("describeSelection reports fallback=true for unregistered klass", () => {
    const frame = new ViewerFrame("test");
    frame.setObj(makeObj(1, "PUnknown"));
    const sel = frame.clientCtrl.describeSelection();
    expect(sel?.fallback).toBe(true);
    expect(sel?.componentName).toBe("FallbackDialog");
  });
});
