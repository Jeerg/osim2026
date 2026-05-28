import { describe, expect, it, beforeEach } from "vitest";
import type { ComponentType } from "react";
import { ViewerRegistry } from "@/viewers/core/ViewerRegistry";
import type { ViewerProps } from "@/viewers/core/types";

// Dummy-Components — wir prüfen nur Identität, nicht das Rendering.
const ViewerA: ComponentType<ViewerProps> = () => null;
const ViewerB: ComponentType<ViewerProps> = () => null;
const ViewerC: ComponentType<ViewerProps> = () => null;
const FallbackViewer: ComponentType<ViewerProps> = () => null;

describe("ViewerRegistry", () => {
  let registry: ViewerRegistry;

  beforeEach(() => {
    registry = new ViewerRegistry();
  });

  it("exact match (klass + hint) gewinnt gegenüber klass-only", () => {
    registry.register({ klass: "PDurchlaufplan", Component: ViewerA });
    registry.register({
      klass: "PDurchlaufplan",
      hint: "design",
      Component: ViewerB,
    });

    expect(registry.resolve("PDurchlaufplan", "design")).toBe(ViewerB);
  });

  it("klass-only Fallback wenn hint nicht registriert", () => {
    registry.register({ klass: "PDurchlaufplan", Component: ViewerA });
    registry.register({
      klass: "PDurchlaufplan",
      hint: "design",
      Component: ViewerB,
    });

    // hint="unknown" matcht nicht exakt — fällt auf klass-only zurück
    expect(registry.resolve("PDurchlaufplan", "unknown")).toBe(ViewerA);
  });

  it("Fallback-Component wenn kein klass-Eintrag passt", () => {
    registry.register({ klass: "PDurchlaufplan", Component: ViewerA });
    registry.setFallback(FallbackViewer);

    expect(registry.resolve("UnknownKlass")).toBe(FallbackViewer);
  });

  it("undefined wenn nichts registriert und kein Fallback gesetzt", () => {
    expect(registry.resolve("UnknownKlass")).toBeUndefined();
  });

  it("clear() entfernt alle Einträge und den Fallback", () => {
    registry.register({ klass: "PDurchlaufplan", Component: ViewerA });
    registry.setFallback(FallbackViewer);
    registry.clear();

    expect(registry.resolve("PDurchlaufplan")).toBeUndefined();
  });

  it("hint ohne korrespondierenden klass-only-Eintrag fällt auf Fallback", () => {
    registry.register({
      klass: "PDurchlaufplan",
      hint: "design",
      Component: ViewerB,
    });
    registry.setFallback(ViewerC);

    // hint="std" matcht weder exakt noch gibt es einen klass-only-Eintrag
    expect(registry.resolve("PDurchlaufplan", "std")).toBe(ViewerC);
  });
});
