/**
 * Spec für PDlplConnKnotenViewer (Welle 1.2-F).
 *
 * Knoten-zentrierter Detail-Graph-Viewer auf der GraphObject-Foundation
 * (Phase 1.1). 6 Tests gemäss PLAN 01.2-07:
 *
 *  T1: Empty knoten (keine Assoz) → 1 Node im ReactFlow-Mock (nur der Knoten selbst).
 *  T2: knoten mit 2 PAssozBeleg-Assoz → 3 Nodes (Knoten + 2 Assoz).
 *  T3: PAssozBeleg mit 2 Ressourcen → 4 Nodes (Knoten + Assoz + 2 Ress).
 *  T4: Speicher-Assoz aus knoten.m_lAssozSpeich → zusätzliche Nodes + Links.
 *  T5: Listener-Hook-Mount: useSimulationListener({}) wirft nicht und triggert keinen Effekt.
 *  T6: data-viewer="PDlplConnKnotenViewer" auf Root vorhanden.
 *
 * xyflow-Mock 1:1 aus PDurchlaufplanViewerDesign.spec.tsx (Welle G).
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

// ---------------------------------------------------------------------------
// xyflow-Mock — wird VOR dem Viewer-Import gehängt.
// ---------------------------------------------------------------------------
vi.mock("@xyflow/react", () => {
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
  const ViewportPortal = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="viewport-portal-mock">{children}</div>
  );
  const ReactFlowProvider = ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  );
  const useReactFlow = () => ({
    fitView: () => {},
    setViewport: () => {},
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
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
vi.mock("@xyflow/react/dist/style.css", () => ({}));

// Import NACH dem Mock
import {
  PDlplConnKnotenViewer,
  useSimulationListener,
} from "@/viewers/PDlplConnKnoten/PDlplConnKnotenViewer";

// ---------------------------------------------------------------------------
// Fixture-Bauer — gemäss SCHEMA-MAP.md Wrapper-Indirektion.
// ---------------------------------------------------------------------------
const schema: ClassSchema = {
  klass: "PDpKnKonstant",
  label_de: "Knoten (konstant)",
  viewer_hints: ["conn"],
  properties: [
    {
      name: "m_sName",
      label_de: "Name",
      octrl_type: "Variable",
      value_type: "string",
    },
  ],
};

/** Baut ein minimales Knoten-Fixture ohne Assoziationen. */
function buildEmptyKnoten(): {
  knoten: OBaseObj;
  allObjects: Record<number, OBaseObj>;
} {
  const knoten: OBaseObj = {
    oid: 541,
    klass: "PDpKnKonstant",
    attrs: {
      m_sName: "Knoten A",
      m_lAssozRess: null,
      m_lAssozSpeich: null,
    },
    sub_refs: [[]],
  };
  return {
    knoten,
    allObjects: { 541: knoten },
  };
}

/**
 * Knoten mit 2 PAssozBeleg-Assoziationen (Wrapper-Pfad: knoten →
 * PAssozRessourceLList → PAssozBelegs).
 */
function buildKnotenMit2Assoz(): {
  knoten: OBaseObj;
  allObjects: Record<number, OBaseObj>;
} {
  const knoten: OBaseObj = {
    oid: 541,
    klass: "PDpKnKonstant",
    attrs: {
      m_sName: "Knoten A",
      m_lAssozRess: 544, // Wrapper-OID
      m_lAssozSpeich: null,
    },
    sub_refs: [[]],
  };
  const wrapperRess: OBaseObj = {
    oid: 544,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[421, 426]],
  };
  const assoz1: OBaseObj = {
    oid: 421,
    klass: "PAssozBeleg",
    attrs: {
      m_sName: "Assoz A1",
      m_pntRaster: [4, 0],
      m_lRessourcen: null,
    },
    sub_refs: [[]],
  };
  const assoz2: OBaseObj = {
    oid: 426,
    klass: "PAssozBeleg",
    attrs: {
      m_sName: "Assoz A2",
      m_pntRaster: [2, 0],
      m_lRessourcen: null,
    },
    sub_refs: [[]],
  };
  return {
    knoten,
    allObjects: {
      541: knoten,
      544: wrapperRess,
      421: assoz1,
      426: assoz2,
    },
  };
}

/**
 * Knoten mit 1 PAssozBeleg, das 2 Ressourcen referenziert (Wrapper:
 * PAssozBeleg.m_lRessourcen → PRessBelegLList → PBetriebsmittel).
 */
function buildKnotenMitAssozRess(): {
  knoten: OBaseObj;
  allObjects: Record<number, OBaseObj>;
} {
  const knoten: OBaseObj = {
    oid: 541,
    klass: "PDpKnKonstant",
    attrs: {
      m_sName: "Knoten A",
      m_lAssozRess: 544,
      m_lAssozSpeich: null,
    },
    sub_refs: [[]],
  };
  const wrapperRess: OBaseObj = {
    oid: 544,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[421]],
  };
  const assoz: OBaseObj = {
    oid: 421,
    klass: "PAssozBeleg",
    attrs: {
      m_sName: "Assoz A1",
      m_pntRaster: [4, 0],
      m_lRessourcen: 424, // Wrapper-OID
    },
    sub_refs: [[]],
  };
  const wrapperBeleg: OBaseObj = {
    oid: 424,
    klass: "PRessBelegLList",
    attrs: {},
    sub_refs: [[1137, 1146]],
  };
  const ress1: OBaseObj = {
    oid: 1137,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "Maschine 1" },
    sub_refs: [],
  };
  const ress2: OBaseObj = {
    oid: 1146,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "Maschine 2" },
    sub_refs: [],
  };
  return {
    knoten,
    allObjects: {
      541: knoten,
      544: wrapperRess,
      421: assoz,
      424: wrapperBeleg,
      1137: ress1,
      1146: ress2,
    },
  };
}

/** Knoten mit Speicher-Assoz (m_lAssozSpeich → PAssozSpeicher → SpeicherProz-Wrapper). */
function buildKnotenMitSpeicher(): {
  knoten: OBaseObj;
  allObjects: Record<number, OBaseObj>;
} {
  const knoten: OBaseObj = {
    oid: 541,
    klass: "PDpKnKonstant",
    attrs: {
      m_sName: "Knoten A",
      m_lAssozRess: null,
      m_lAssozSpeich: 700, // direkter PAssozSpeicher
    },
    sub_refs: [[]],
  };
  const assozSpeich: OBaseObj = {
    oid: 700,
    klass: "PAssozSpeicher",
    attrs: {
      m_sName: "AssozSpeich",
      m_pntRaster: [1, 1],
      m_lSpeicher: 701, // Wrapper PSpeicherProzLList
    },
    sub_refs: [[]],
  };
  const wrapperSpeicher: OBaseObj = {
    oid: 701,
    klass: "PSpeicherProzLList",
    attrs: {},
    sub_refs: [[702]],
  };
  const speiproz: OBaseObj = {
    oid: 702,
    klass: "PSpeicherProz",
    attrs: { m_sName: "Speicher A" },
    sub_refs: [],
  };
  return {
    knoten,
    allObjects: {
      541: knoten,
      700: assozSpeich,
      701: wrapperSpeicher,
      702: speiproz,
    },
  };
}

function renderViewer(knoten: OBaseObj, allObjects: Record<number, OBaseObj>) {
  return render(
    <PDlplConnKnotenViewer
      obj={knoten}
      schema={schema}
      allObjects={allObjects}
      onChange={() => {}}
      onCommand={() => {}}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("PDlplConnKnotenViewer — Welle 1.2-F", () => {
  it("T1: Empty knoten → 1 Node im ReactFlow-Mock (nur der Knoten selbst)", () => {
    const { knoten, allObjects } = buildEmptyKnoten();
    renderViewer(knoten, allObjects);
    const rf = screen.getByTestId("reactflow-mock");
    expect(rf.getAttribute("data-node-count")).toBe("1");
  });

  it("T2: Knoten mit 2 PAssozBeleg-Assoz → 3 Nodes (Knoten + 2 Assoz)", () => {
    const { knoten, allObjects } = buildKnotenMit2Assoz();
    renderViewer(knoten, allObjects);
    const rf = screen.getByTestId("reactflow-mock");
    expect(rf.getAttribute("data-node-count")).toBe("3");
    // 2 Knoten→Assoz-Links erwartet (VT_KNO_ASSRES).
    expect(rf.getAttribute("data-edge-count")).toBe("2");
  });

  it("T3: PAssozBeleg mit 2 Ressourcen → 4 Nodes (Knoten + Assoz + 2 Ress)", () => {
    const { knoten, allObjects } = buildKnotenMitAssozRess();
    renderViewer(knoten, allObjects);
    const rf = screen.getByTestId("reactflow-mock");
    expect(rf.getAttribute("data-node-count")).toBe("4");
    // Edges: 1 Knoten→Assoz + 2 Assoz→Ress = 3 Links.
    expect(rf.getAttribute("data-edge-count")).toBe("3");
  });

  it("T4: Speicher-Assoz erzeugt zusätzliche Nodes + Knoten→AssozSpeich + AssozSpeich→ProzSpeich Links", () => {
    const { knoten, allObjects } = buildKnotenMitSpeicher();
    renderViewer(knoten, allObjects);
    const rf = screen.getByTestId("reactflow-mock");
    // Knoten + AssozSpeich + 1 SpeicherProz = 3 Nodes.
    expect(rf.getAttribute("data-node-count")).toBe("3");
    // 1 Knoten→AssozSpeich + 1 AssozSpeich→SpeicherProz = 2 Links.
    expect(rf.getAttribute("data-edge-count")).toBe("2");
  });

  it("T5: useSimulationListener({}) mountet ohne Crash, kein Effect-Side-Effect", () => {
    // No-op Hook — explizit mountable in einer Test-Component.
    const handlers = {
      onPeriodBegin: vi.fn(),
      onPeriodEnd: vi.fn(),
      onSimBegin: vi.fn(),
      onGfxEvent: vi.fn(),
    };
    function TestComp() {
      useSimulationListener(handlers);
      return <div data-testid="listener-host" />;
    }
    const { getByTestId, unmount } = render(<TestComp />);
    expect(getByTestId("listener-host")).toBeInTheDocument();
    // No-op: keiner der Handler darf gerufen werden.
    expect(handlers.onPeriodBegin).not.toHaveBeenCalled();
    expect(handlers.onPeriodEnd).not.toHaveBeenCalled();
    expect(handlers.onSimBegin).not.toHaveBeenCalled();
    expect(handlers.onGfxEvent).not.toHaveBeenCalled();
    unmount();
    // Auch nach Unmount: nichts triggert.
    expect(handlers.onPeriodBegin).not.toHaveBeenCalled();
  });

  it("T6: data-viewer='PDlplConnKnotenViewer' auf Root-Element vorhanden", () => {
    const { knoten, allObjects } = buildEmptyKnoten();
    const { container } = renderViewer(knoten, allObjects);
    const root = container.querySelector('[data-viewer="PDlplConnKnotenViewer"]');
    expect(root).not.toBeNull();
  });
});
