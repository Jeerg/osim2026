/**
 * Tests für PDurchlaufplanViewerDesign (Plan 01-10 Task 4).
 *
 * @xyflow/react ist gemockt, weil:
 *  - ResizeObserver in jsdom fehlt (React-Flow crasht beim Mount)
 *  - der eigentliche Canvas-Render nicht relevant ist für Toolbar-/Dialog-
 *    Tests; das wird via E2E (Playwright) abgedeckt
 *
 * Der Mock liefert die wenigen Exports, die der Viewer + Adapter brauchen,
 * als Pass-Through-Stubs.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

vi.mock("@xyflow/react", () => {
  // Minimal pass-through: ReactFlow rendert nur die Kinder + ein
  // data-testid wrapper. nodes/edges werden im data-Attribut serialisiert,
  // damit Tests darauf assert können wenn nötig.
  const ReactFlow = ({
    nodes,
    edges,
    children,
  }: {
    nodes?: unknown[];
    edges?: unknown[];
    children?: React.ReactNode;
  }) => (
    <div
      data-testid="reactflow-mock"
      data-node-count={Array.isArray(nodes) ? nodes.length : 0}
      data-edge-count={Array.isArray(edges) ? edges.length : 0}
    >
      {children}
    </div>
  );
  const Background = () => null;
  const Controls = () => null;
  const MiniMap = () => null;
  const Handle = () => null;
  // ViewportPortal rendert seine Kinder inline im Mock — der GridBackground-
  // Aufruf darf nicht crashen; die Viewport-Projection ist Test-irrelevant.
  const ViewportPortal = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="viewport-portal-mock">{children}</div>
  );
  // Welle G10: GraphFlowCanvas wraps Inner in ReactFlowProvider + nutzt
  // useReactFlow() für fitView-Re-Trigger. Mock liefert No-Op-Variants.
  const ReactFlowProvider = ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  );
  const useReactFlow = () => ({
    fitView: () => {},
    setViewport: () => {},
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    // Welle G21: PDurchlaufplanViewerDesign konvertiert Rechtsklick-Coords
    // via screenToFlowPosition. Mock liefert Identity (clientX→x).
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
  });
  return {
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    Background,
    Controls,
    MiniMap,
    Handle,
    ViewportPortal,
    Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  };
});

// Stylesheet-Import in ReactFlowAdapter muss als no-op resolvieren.
vi.mock("@xyflow/react/dist/style.css", () => ({}));

import { PDurchlaufplanViewerDesign } from "@/viewers/PDurchlaufplan/PDurchlaufplanViewerDesign";

const schema: ClassSchema = {
  klass: "PDurchlaufplan",
  label_de: "Durchlaufplan",
  viewer_hints: ["std", "design"],
  properties: [
    {
      name: "m_sName",
      label_de: "Name",
      octrl_type: "Variable",
      value_type: "string",
    },
  ],
};

const plan: OBaseObj = {
  oid: 100,
  klass: "PDurchlaufplan",
  attrs: { m_sName: "Test-Plan" },
  sub_refs: [
    [10, 11, 12],
    [20],
  ],
};

// Welle G17-C: alle Knoten + Kanten brauchen m_pntRaster. Original-Verhalten
// (PSimObj.odh:108): Default = (-1,-1) = "nicht im Plan platziert" → wire-to-
// grid skipped solche Objekte. Test-Fixtures müssen platziert sein, sonst
// fehlen die Render-Nodes.
const allObjects: Record<number, OBaseObj> = {
  100: plan,
  10: {
    oid: 10, klass: "PDpKnKonstant",
    attrs: { m_sName: "K1", m_pntRaster: [1, 0] }, sub_refs: [],
  },
  11: {
    oid: 11, klass: "PDpKnKonstant",
    attrs: { m_sName: "K2", m_pntRaster: [3, 0] }, sub_refs: [],
  },
  12: {
    oid: 12, klass: "PDpKnKonstant",
    attrs: { m_sName: "K3", m_pntRaster: [5, 0] }, sub_refs: [],
  },
  20: {
    oid: 20, klass: "PDlplKante",
    attrs: {
      m_lVorgaenger: [10],
      m_lNachfolger: [11],
      m_pntRaster: [2, 0],
    },
    sub_refs: [],
  },
};

describe("PDurchlaufplanViewerDesign", () => {
  it("rendert PlanToolbar mit Knoten-/Kanten-Combos und Löschen (Welle G12)", () => {
    render(
      <PDurchlaufplanViewerDesign
        obj={plan}
        schema={schema}
        allObjects={allObjects}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    expect(screen.getByTestId("plan-toolbar")).toBeInTheDocument();
    // Welle G17-A: Combobox-Rebuild — drei <select>, jeweils mit allen Optionen
    expect(screen.getByTestId("combo-knoten")).toBeInTheDocument();
    expect(screen.getByTestId("combo-kante")).toBeInTheDocument();
    expect(screen.getByTestId("kennzahl-combo")).toBeInTheDocument();
    // <option>-Items haben eigene testids für gezielte Selektion
    expect(screen.getByTestId("combo-knoten-PDpKnKonstant")).toBeInTheDocument();
    expect(screen.getByTestId("combo-knoten-PDpKnVerteilung")).toBeInTheDocument();
    expect(screen.getByTestId("combo-knoten-PDpKnMengeRuesten")).toBeInTheDocument();
    expect(screen.getByTestId("combo-knoten-PDpKnAlternativTypID")).toBeInTheDocument();
    expect(screen.getByTestId("combo-knoten-PAssozBeleg")).toBeInTheDocument();
    expect(screen.getByTestId("combo-kante-PDlplKante")).toBeInTheDocument();
    expect(screen.getByTestId("combo-kante-PDpKaUebergang")).toBeInTheDocument();
    expect(screen.getByTestId("combo-kante-PDpKaEntitaet")).toBeInTheDocument();
    expect(screen.getByTestId("btn-delete-selected")).toBeInTheDocument();
  });

  it("rendert ReactFlow-Canvas mit 3 Knoten + 1 Kanten-Box + 2 Verbindungslinien", () => {
    render(
      <PDurchlaufplanViewerDesign
        obj={plan}
        schema={schema}
        allObjects={allObjects}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    const canvas = screen.getByTestId("reactflow-mock");
    expect(canvas).toBeInTheDocument();
    // Welle G11: PDlplKante ist ein eigenständiger Grid-Knoten (Kanten-Box)
    // + 2 GLink-Verbindungen (von→box, box→nach). Daher 3+1=4 Render-Nodes
    // und 2 Render-Edges pro PDlplKante.
    expect(canvas.getAttribute("data-node-count")).toBe("4");
    expect(canvas.getAttribute("data-edge-count")).toBe("2");
  });

  it("Welle G17-A: Combobox-Selection aktiviert INSERT-Mode (Visual-Indikator erscheint)", async () => {
    const user = userEvent.setup();
    render(
      <PDurchlaufplanViewerDesign
        obj={plan}
        schema={schema}
        allObjects={allObjects}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );

    // Combobox-Select-Pattern: selectOptions statt click auf <option>
    const knotenSelect = screen.getByTestId("combo-knoten-select");
    await user.selectOptions(knotenSelect, "PDpKnKonstant");
    expect(screen.getByTestId("insert-mode-indicator")).toBeInTheDocument();
  });
});
