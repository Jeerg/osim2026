// Plan 01-04 Task 2: Tests fuer viewer-registry.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _clearRegistryForTests,
  getRegisteredKlasses,
  getViewer,
  getViewerRegistration,
  registerViewer,
} from "../viewer-registry";
import type { ChildDialogComponent } from "../types";

// Dummy-Component fuer Tests.
const DummyDialog: ChildDialogComponent = () => null;
const OtherDialog: ChildDialogComponent = () => null;

describe("viewer-registry", () => {
  afterEach(() => {
    _clearRegistryForTests();
  });

  it("registers and retrieves a viewer", () => {
    registerViewer({
      klass: "PFoo",
      component: DummyDialog,
      displayName: "FooViewer",
    });
    expect(getViewer("PFoo")).toBe(DummyDialog);
    expect(getViewerRegistration("PFoo")?.displayName).toBe("FooViewer");
  });

  it("returns null when no viewer is registered", () => {
    expect(getViewer("PUnknown")).toBeNull();
    expect(getViewerRegistration("PUnknown")).toBeNull();
  });

  it("warns and overwrites on duplicate registration (last wins)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerViewer({
      klass: "PFoo",
      component: DummyDialog,
      displayName: "FooV1",
    });
    registerViewer({
      klass: "PFoo",
      component: OtherDialog,
      displayName: "FooV2",
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(getViewer("PFoo")).toBe(OtherDialog);
    warnSpy.mockRestore();
  });

  it("getRegisteredKlasses returns sorted list", () => {
    registerViewer({
      klass: "PZ",
      component: DummyDialog,
      displayName: "Z",
    });
    registerViewer({
      klass: "PA",
      component: DummyDialog,
      displayName: "A",
    });
    registerViewer({
      klass: "PM",
      component: DummyDialog,
      displayName: "M",
    });
    expect(getRegisteredKlasses()).toEqual(["PA", "PM", "PZ"]);
  });
});
