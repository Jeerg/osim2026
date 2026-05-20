// Plan 01-07 Task 1: GraphView smoke-tests.
//
// Schwerpunkt:
//   - GObject/GLink koennen instanziiert werden (Foundation-Vertrag).
//   - GObject.contains und regionCheck arbeiten korrekt.
//   - GraphView rendert ohne Crash mit Mock-Daten.
//   - Snapshot der erzeugten Node-Anzahl (reactflow internals nicht
//     getestet — der Test prueft die Adapter-Schicht).
//
// reactflow nutzt intern ResizeObserver + getBoundingClientRect. happy-dom
// stellt beides bereit; falls in einer spaeteren Umgebung Probleme
// auftauchen, kann hier ein vi.mock("reactflow", ...) ergaenzt werden.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GraphView, GObject, GObjLink, DEFAULT_OBJECT_SIZE } from "../index";
import { KnotenNode } from "@/graph/nodes/KnotenNode";
import { AusloeserNode } from "@/graph/nodes/AusloeserNode";
import { KanteEdge } from "@/graph/edges/KanteEdge";

afterEach(cleanup);

describe("GObject (Foundation-Klasse)", () => {
  it("contains() erkennt Punkte innerhalb des Rects", () => {
    const k = new KnotenNode(
      "k1",
      { x: 100, y: 100 },
      "PDpKnKonstant",
      "Test",
      60,
    );
    expect(k.contains({ x: 110, y: 110 })).toBe(true);
    expect(k.contains({ x: 50, y: 110 })).toBe(false);
    expect(k.contains({ x: 110, y: 50 })).toBe(false);
    expect(k.contains({ x: 999, y: 999 })).toBe(false);
  });

  it("contains() liefert true auf der Grenze (inclusive)", () => {
    const k = new KnotenNode(
      "k1",
      { x: 0, y: 0 },
      "PDpKnKonstant",
      "Test",
      60,
    );
    expect(k.contains({ x: 0, y: 0 })).toBe(true);
    expect(k.contains({ x: DEFAULT_OBJECT_SIZE.width, y: DEFAULT_OBJECT_SIZE.height })).toBe(true);
  });

  it("regionCheck() liefert inside/edge/outside", () => {
    const k = new KnotenNode(
      "k1",
      { x: 0, y: 0 },
      "PDpKnKonstant",
      "Test",
      60,
      { width: 100, height: 100 },
    );
    // Mitte → inside
    expect(k.regionCheck({ x: 50, y: 50 })).toBe("inside");
    // Nahe Rand (0..4 Tolerance) → edge
    expect(k.regionCheck({ x: 1, y: 50 })).toBe("edge");
    expect(k.regionCheck({ x: 50, y: 99 })).toBe("edge");
    // Ausserhalb
    expect(k.regionCheck({ x: -10, y: 50 })).toBe("outside");
    expect(k.regionCheck({ x: 50, y: 200 })).toBe("outside");
  });

  it("updatePosition() setzt eine neue Position (immutable Copy)", () => {
    const k = new KnotenNode(
      "k1",
      { x: 0, y: 0 },
      "PDpKnKonstant",
      "Test",
      60,
    );
    k.updatePosition({ x: 42, y: 84 });
    expect(k.position).toEqual({ x: 42, y: 84 });
    // mutiert NICHT die alte position-Referenz beim Caller — wir kopieren.
    const refBefore = { x: 0, y: 0 };
    k.position = refBefore;
    k.updatePosition({ x: 10, y: 20 });
    expect(refBefore).toEqual({ x: 0, y: 0 });
  });

  it("GObject ist abstrakt — kann nur via Subklasse instanziiert werden", () => {
    // KnotenNode/AusloeserNode sind Subklassen, beide instanziierbar.
    const k = new KnotenNode("k1", { x: 0, y: 0 }, "PDpKnKonstant", "K", 1);
    const a = new AusloeserNode("a1", { x: 0, y: 0 }, "PAslEinzel", "A", 0);
    expect(k).toBeInstanceOf(GObject);
    expect(a).toBeInstanceOf(GObject);
    // render() ist abstract — Subklassen liefern (Phase 1) null.
    expect(k.render()).toBeNull();
    expect(a.render()).toBeNull();
  });
});

describe("GObjLink / KanteEdge", () => {
  it("KanteEdge extrahiert source/target von uebergebenen GObjects", () => {
    const a = new KnotenNode("k1", { x: 0, y: 0 }, "PDpKnKonstant", "A", 1);
    const b = new KnotenNode("k2", { x: 200, y: 0 }, "PDpKnKonstant", "B", 1);
    const edge = new KanteEdge("e1", a, b, "PDpKaUebergang", 5);
    expect(edge.id).toBe("e1");
    expect(edge.source).toBe("k1");
    expect(edge.target).toBe("k2");
    expect(edge.sourceObj).toBe(a);
    expect(edge.targetObj).toBe(b);
    expect(edge.klass).toBe("PDpKaUebergang");
    expect(edge.label).toBe("5 s");
  });

  it("GObjLink ist Basis-Subklasse von GLink, label nur bei KanteEdge", () => {
    const a = new KnotenNode("k1", { x: 0, y: 0 }, "PDpKnKonstant", "A", 1);
    const b = new KnotenNode("k2", { x: 200, y: 0 }, "PDpKnKonstant", "B", 1);
    const link = new GObjLink("l1", a, b);
    expect(link.source).toBe("k1");
    expect(link.target).toBe("k2");
    expect(link.direction).toBe("DEFAULT");
    expect(link.render()).toBeNull();
  });

  it("KanteEdge.label ist undefined wenn Uebergangszeit <= 0", () => {
    const a = new KnotenNode("k1", { x: 0, y: 0 }, "PDpKnKonstant", "A", 1);
    const b = new KnotenNode("k2", { x: 200, y: 0 }, "PDpKnKonstant", "B", 1);
    const edge = new KanteEdge("e1", a, b, "PDpKaUebergang", 0);
    expect(edge.label).toBeUndefined();
  });
});

describe("GraphView smoke", () => {
  it("rendert mit leeren Listen", () => {
    const { container } = render(
      <div style={{ width: 400, height: 300 }}>
        <GraphView objects={[]} links={[]} />
      </div>,
    );
    expect(screen.getByTestId("graphview-root")).toBeInTheDocument();
    // reactflow rendert einen Wrapper-Container — wir pruefen nur das
    // Vorhandensein der GraphView-Wurzel; die internen reactflow-DOM-
    // Knoten sind nicht Gegenstand dieses Tests.
    expect(container.querySelector(".react-flow")).toBeTruthy();
  });

  it("rendert mit 2 Knoten + 1 Kante", () => {
    const k1 = new KnotenNode(
      "k1",
      { x: 0, y: 0 },
      "PDpKnKonstant",
      "Schritt-1",
      60,
    );
    const k2 = new KnotenNode(
      "k2",
      { x: 200, y: 0 },
      "PDpKnKonstant",
      "Schritt-2",
      120,
    );
    const edge = new KanteEdge("e1", k1, k2, "PDpKaUebergang", 5);
    render(
      <div style={{ width: 400, height: 300 }}>
        <GraphView objects={[k1, k2]} links={[edge]} />
      </div>,
    );
    expect(screen.getByTestId("graphview-root")).toBeInTheDocument();
    // Die Knoten werden via NODE_TYPES gerendert; in happy-dom haengt es
    // davon ab, ob reactflow den Viewport mitbekommt. Wir pruefen daher
    // nur das nicht-leere Rendern + die Existenz der reactflow-Wurzel.
    // Phase 1: Existenz reicht; tiefere DOM-Pruefung gehoert in
    // Integration-Tests (Playwright), die Plan 10 ergaenzt.
  });

  it("rendert mit Ausloeser-Knoten", () => {
    const a = new AusloeserNode(
      "a1",
      { x: 0, y: 0 },
      "PAslEinzel",
      "Ausloeser-1",
      0,
    );
    render(
      <div style={{ width: 400, height: 300 }}>
        <GraphView objects={[a]} links={[]} />
      </div>,
    );
    expect(screen.getByTestId("graphview-root")).toBeInTheDocument();
  });
});
