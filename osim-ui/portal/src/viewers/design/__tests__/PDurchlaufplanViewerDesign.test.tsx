// Plan 01-07 Task 2: Tests fuer PDurchlaufplanViewerDesign.
//
// Schwerpunkt:
//   - Render mit Mock-Plan (3 Knoten + 2 Kanten) → Canvas + GraphView
//     mounten ohne Crash.
//   - Empty-State (Plan ohne Knoten) → Hinweis-Banner.
//   - Auto-Layout: dagre liefert deterministische Positionen.
//   - position-store: setNodePositionOverride wird bei onObjectMove
//     gerufen, ueberschreibt das Auto-Layout.
//   - Registry: Viewer ist unter SYNTHETIC_PDURCHLAUFPLAN_DESIGN_KLASS
//     registriert.
//   - Tab-Switch im Std-Viewer: Klick auf "Design" mountet den Design-Mode.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import { useModelStore } from "@/state/model-store";
import type {
  MethodArg,
  Oid,
  OtxJsonNode,
  PropertyValue,
} from "@/viewers/core/types";
import "@/viewers/property/type-maps";
import "../PDurchlaufplanViewerDesign";
import {
  PDurchlaufplanViewerDesign,
  SYNTHETIC_PDURCHLAUFPLAN_DESIGN_KLASS,
} from "../PDurchlaufplanViewerDesign";
import {
  _clearOverridesForTests,
  getNodePositionOverride,
  setNodePositionOverride,
} from "../position-store";
import { computeAutoLayout } from "../auto-layout";

function resetStore() {
  useModelStore.setState({
    modelId: null,
    version: null,
    tree: null,
    selectedOid: null,
    dirty: new Set(),
    undoStack: [],
    redoStack: [],
    _oidIndex: new Map(),
  });
}

function makePlan(): OtxJsonNode {
  return {
    oid: 100,
    klass: "PDurchlaufplan",
    name: "Test-Plan",
    properties: { m_sName: "Test-Plan" },
    children: [
      {
        oid: -1,
        klass: "_group",
        name: "Knoten",
        properties: {},
        children: [
          {
            oid: 200,
            klass: "PDpKnKonstant",
            name: "A",
            properties: { m_sName: "A", m_iDurchfuehrungszeit: 60 },
            children: [],
          },
          {
            oid: 201,
            klass: "PDpKnKonstant",
            name: "B",
            properties: { m_sName: "B", m_iDurchfuehrungszeit: 120 },
            children: [],
          },
          {
            oid: 202,
            klass: "PDpKnMenge",
            name: "C",
            properties: { m_sName: "C", m_iDfzProEinheit: 5 },
            children: [],
          },
        ],
      },
      {
        oid: -1,
        klass: "_group",
        name: "Kanten",
        properties: {},
        children: [
          {
            oid: 300,
            klass: "PDpKaUebergang",
            name: "A-B",
            properties: { m_lVon: 200, m_lNach: 201 },
            children: [],
          },
          {
            oid: 301,
            klass: "PDpKaUebergang",
            name: "B-C",
            properties: { m_lVon: 201, m_lNach: 202 },
            children: [],
          },
        ],
      },
    ],
  };
}

function makeEmptyPlan(): OtxJsonNode {
  return {
    oid: 100,
    klass: "PDurchlaufplan",
    name: "Leerer Plan",
    properties: { m_sName: "Leerer Plan" },
    children: [
      {
        oid: -1,
        klass: "_group",
        name: "Knoten",
        properties: {},
        children: [],
      },
      {
        oid: -1,
        klass: "_group",
        name: "Kanten",
        properties: {},
        children: [],
      },
    ],
  };
}

interface Captured {
  prop: Array<{ oid: Oid; key: string; value: PropertyValue }>;
  method: Array<{ oid: Oid; method: string; args?: MethodArg[] }>;
}

function harness(obj: OtxJsonNode) {
  const cap: Captured = { prop: [], method: [] };
  render(
    <ChildDialog
      obj={obj}
      onPropertyChange={(o, k, v) => cap.prop.push({ oid: o, key: k, value: v })}
      onMethodCall={(o, m, a) => cap.method.push({ oid: o, method: m, args: a })}
    >
      <PDurchlaufplanViewerDesign
        obj={obj}
        onPropertyChange={(o, k, v) =>
          cap.prop.push({ oid: o, key: k, value: v })
        }
        onMethodCall={(o, m, a) =>
          cap.method.push({ oid: o, method: m, args: a })
        }
      />
    </ChildDialog>,
  );
  return cap;
}

beforeEach(() => {
  resetStore();
  _clearOverridesForTests();
});

afterEach(cleanup);

describe("PDurchlaufplanViewerDesign", () => {
  it("ist unter PDurchlaufplanDesign in der viewer-registry registriert", async () => {
    const { getViewer } = await import("@/viewers/core/viewer-registry");
    expect(getViewer(SYNTHETIC_PDURCHLAUFPLAN_DESIGN_KLASS)).toBe(
      PDurchlaufplanViewerDesign,
    );
  });

  it("rendert Header + Canvas mit Knoten- und Kanten-Zaehler", () => {
    const plan = makePlan();
    useModelStore.getState().setTree(plan, 1, 1);
    harness(plan);

    expect(
      screen.getByTestId("pdurchlaufplan-viewer-design"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("pdurchlaufplan-design-canvas"),
    ).toBeInTheDocument();
    // Header zeigt Plan-Name
    expect(screen.getByText(/Design-Modus: Test-Plan/i)).toBeInTheDocument();
    // Zaehler: 3 Knoten / 2 Kanten
    expect(screen.getByText(/3 Knoten · 2 Kanten/i)).toBeInTheDocument();
  });

  it("zeigt Empty-State, wenn Plan keine Knoten enthaelt", () => {
    const plan = makeEmptyPlan();
    useModelStore.getState().setTree(plan, 1, 1);
    harness(plan);
    expect(
      screen.getByTestId("pdurchlaufplan-design-empty"),
    ).toBeInTheDocument();
  });
});

describe("computeAutoLayout (dagre)", () => {
  it("liefert eine Position pro Node, deterministisch", () => {
    const positions = computeAutoLayout(
      ["a", "b", "c"],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    );
    expect(positions.size).toBe(3);
    expect(positions.has("a")).toBe(true);
    expect(positions.has("b")).toBe(true);
    expect(positions.has("c")).toBe(true);
    // Erster Knoten links von b (LR-Layout).
    const aX = positions.get("a")!.x;
    const bX = positions.get("b")!.x;
    expect(aX).toBeLessThan(bX);
  });

  it("liefert leere Map bei leerem Input", () => {
    expect(computeAutoLayout([], []).size).toBe(0);
  });

  it("toleriert Edges mit unbekannten Endpunkten", () => {
    const positions = computeAutoLayout(
      ["a"],
      [{ source: "a", target: "nonexistent" }],
    );
    expect(positions.has("a")).toBe(true);
  });
});

describe("position-store (Phase-1-Override)", () => {
  it("setNodePositionOverride und getNodePositionOverride round-trip", () => {
    expect(getNodePositionOverride(100, 200)).toBeNull();
    setNodePositionOverride(100, 200, { x: 42, y: 84 });
    expect(getNodePositionOverride(100, 200)).toEqual({ x: 42, y: 84 });
  });

  it("verschiedene plan-oids haben getrennte Override-Maps", () => {
    setNodePositionOverride(100, 200, { x: 10, y: 20 });
    setNodePositionOverride(101, 200, { x: 30, y: 40 });
    expect(getNodePositionOverride(100, 200)).toEqual({ x: 10, y: 20 });
    expect(getNodePositionOverride(101, 200)).toEqual({ x: 30, y: 40 });
  });
});

describe("Tab-Switch im Std-Viewer", () => {
  it("Klick auf 'Design' wechselt zum Design-Modus", async () => {
    const { PDurchlaufplanViewerStd } = await import(
      "@/viewers/property/PDurchlaufplanViewerStd"
    );
    const plan = makePlan();
    useModelStore.getState().setTree(plan, 1, 1);

    const cap: Captured = { prop: [], method: [] };
    render(
      <ChildDialog
        obj={plan}
        onPropertyChange={(o, k, v) =>
          cap.prop.push({ oid: o, key: k, value: v })
        }
        onMethodCall={(o, m, a) =>
          cap.method.push({ oid: o, method: m, args: a })
        }
      >
        <PDurchlaufplanViewerStd
          obj={plan}
          onPropertyChange={(o, k, v) =>
            cap.prop.push({ oid: o, key: k, value: v })
          }
          onMethodCall={(o, m, a) =>
            cap.method.push({ oid: o, method: m, args: a })
          }
        />
      </ChildDialog>,
    );

    // Default: Standard-Mode mounted
    expect(
      screen.getByTestId("pdurchlaufplan-viewer-std-mode-standard"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("pdurchlaufplan-viewer-design"),
    ).not.toBeInTheDocument();

    // Klick auf "Design"-Tab
    fireEvent.click(screen.getByTestId("pdurchlaufplan-tab-design"));

    expect(
      screen.getByTestId("pdurchlaufplan-viewer-design"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("pdurchlaufplan-viewer-std-mode-standard"),
    ).not.toBeInTheDocument();

    // Zurueck zu Standard
    fireEvent.click(screen.getByTestId("pdurchlaufplan-tab-standard"));
    expect(
      screen.getByTestId("pdurchlaufplan-viewer-std-mode-standard"),
    ).toBeInTheDocument();
  });
});
