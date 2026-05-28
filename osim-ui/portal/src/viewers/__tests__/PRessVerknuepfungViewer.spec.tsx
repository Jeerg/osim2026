/**
 * Spec für PRessVerknuepfungViewer (Welle 1.2-G).
 *
 * Ressource-zentrierter Graph-Viewer mit Reverse-Index + Kennzahl-Slot-
 * Placeholder (Phase-4-Vorgriff). Anders als der erfundene Stub aus
 * Phase 1 (gelöscht in Plan 01.2-01) liest dieser Viewer EXISTIERENDE
 * OSim2004-Wire-Strukturen rückwärts:
 *
 *   Ressource (PBetriebsmittel/PPerson/PRessBeleg)
 *     ← (über Reverse-Index)
 *   PAssozBeleg (m_lRessourcen via PRessBelegLList-Wrapper)
 *     ← (über knoten.m_lAssozRess via PAssozRessourceLList-Wrapper)
 *   PDpKn*-Knoten
 *
 * Tests:
 *   T1: KennzahlSlotPlaceholder rendert div mit data-slot="kennzahl-placeholder".
 *   T2: KennzahlSlotPlaceholder enthält "Phase 4" Text.
 *   T3: KennzahlSlotPlaceholder hat opacity-60 UND Token-Background (var(--color-surface-soft-cyan)).
 *   T4: KennzahlSlotPlaceholder hat ARIA-Label für Phase-4-Disabled-Status.
 *
 *   T5: Render Ressource OHNE verbundene Knoten → leere TTY-Liste +
 *       ReactFlow-Mock zeigt nur 1 Node (die Ressource selbst).
 *   T6: Render Ressource + 2 verbundene Knoten → TTY-Pane zeigt 2
 *       Einträge mit data-oid pro Knoten.
 *   T7: Graph-Mock zeigt mehr als 1 Node (Ressource + min 1 Assoz oder Knoten).
 *   T8: Kennzahl-Placeholder ist im DOM des Viewers vorhanden
 *       (Selektor [data-slot="kennzahl-placeholder"]).
 *   T9: data-viewer="PRessVerknuepfungViewer" auf Root-Element vorhanden.
 *
 * xyflow-Mock 1:1 aus PDlplConnKnotenViewer.spec.tsx (Welle 1.2-F).
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
  PRessVerknuepfungViewer,
  KennzahlSlotPlaceholder,
} from "@/viewers/PRessVerknuepfung/PRessVerknuepfungViewer";

// ---------------------------------------------------------------------------
// Fixtures — Wrapper-Indirektion 1:1 wie in SCHEMA-MAP.md dokumentiert.
// ---------------------------------------------------------------------------
const schema: ClassSchema = {
  klass: "PBetriebsmittel",
  label_de: "Betriebsmittel",
  viewer_hints: ["verknuepfung"],
  properties: [
    {
      name: "m_sName",
      label_de: "Name",
      octrl_type: "Variable",
      value_type: "string",
    },
  ],
};

/**
 * Baut eine Ressource OHNE verbundene Knoten — Reverse-Index liefert
 * leere Liste; im Graph nur die Ressource selbst.
 */
function buildLoneResource(): {
  ressource: OBaseObj;
  allObjects: Record<number, OBaseObj>;
} {
  const ressource: OBaseObj = {
    oid: 400,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "Maschine X" },
    sub_refs: [],
  };
  return {
    ressource,
    allObjects: { 400: ressource },
  };
}

/**
 * Baut eine Ressource mit 2 verbundenen PDpKnKonstant-Knoten. Jeder
 * Knoten hat eine eigene PAssozRessourceLList-Wrapper, in der genau
 * eine PAssozBeleg liegt; jede PAssozBeleg hat eine PRessBelegLList-
 * Wrapper, die auf unsere Ressource (oid 400) zeigt.
 */
function buildResourceMit2Knoten(): {
  ressource: OBaseObj;
  allObjects: Record<number, OBaseObj>;
} {
  const ressource: OBaseObj = {
    oid: 400,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "Maschine X" },
    sub_refs: [],
  };

  // Knoten 1: PDpKnKonstant + PAssozRessourceLList + PAssozBeleg +
  // PRessBelegLList → ressource(400)
  const knoten1: OBaseObj = {
    oid: 200,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "Knoten Alpha", m_lAssozRess: 210 },
    sub_refs: [[]],
  };
  const assozWrapper1: OBaseObj = {
    oid: 210,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[220]],
  };
  const assoz1: OBaseObj = {
    oid: 220,
    klass: "PAssozBeleg",
    attrs: { m_sName: "Assoz Alpha", m_lRessourcen: 230 },
    sub_refs: [[]],
  };
  const ressWrapper1: OBaseObj = {
    oid: 230,
    klass: "PRessBelegLList",
    attrs: {},
    sub_refs: [[400]],
  };

  // Knoten 2: PDpKnKonstant + Assoz-Wrapper + PAssozBeleg + Beleg-Wrapper → 400
  const knoten2: OBaseObj = {
    oid: 201,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "Knoten Beta", m_lAssozRess: 211 },
    sub_refs: [[]],
  };
  const assozWrapper2: OBaseObj = {
    oid: 211,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[221]],
  };
  const assoz2: OBaseObj = {
    oid: 221,
    klass: "PAssozBeleg",
    attrs: { m_sName: "Assoz Beta", m_lRessourcen: 231 },
    sub_refs: [[]],
  };
  const ressWrapper2: OBaseObj = {
    oid: 231,
    klass: "PRessBelegLList",
    attrs: {},
    sub_refs: [[400]],
  };

  return {
    ressource,
    allObjects: {
      400: ressource,
      200: knoten1,
      210: assozWrapper1,
      220: assoz1,
      230: ressWrapper1,
      201: knoten2,
      211: assozWrapper2,
      221: assoz2,
      231: ressWrapper2,
    },
  };
}

function renderViewer(
  ressource: OBaseObj,
  allObjects: Record<number, OBaseObj>,
) {
  return render(
    <PRessVerknuepfungViewer
      obj={ressource}
      schema={schema}
      allObjects={allObjects}
      onChange={() => {}}
      onCommand={() => {}}
    />,
  );
}

// ---------------------------------------------------------------------------
// KennzahlSlotPlaceholder — isoliert getestet.
// ---------------------------------------------------------------------------
describe("KennzahlSlotPlaceholder — Welle 1.2-G", () => {
  it("T1: rendert div mit data-slot='kennzahl-placeholder'", () => {
    const { container } = render(<KennzahlSlotPlaceholder />);
    const slot = container.querySelector('[data-slot="kennzahl-placeholder"]');
    expect(slot).not.toBeNull();
  });

  it("T2: enthält 'Phase 4' Text", () => {
    const { container } = render(<KennzahlSlotPlaceholder />);
    const slot = container.querySelector('[data-slot="kennzahl-placeholder"]');
    expect(slot?.textContent ?? "").toMatch(/Phase 4/);
  });

  it("T3: className enthält opacity-60 UND Token-basierten Cyan-Background", () => {
    const { container } = render(<KennzahlSlotPlaceholder />);
    const slot = container.querySelector('[data-slot="kennzahl-placeholder"]');
    expect(slot).not.toBeNull();
    const cls = slot?.className ?? "";
    expect(cls).toMatch(/opacity-60/);
    // Token-basierter Background (Cyan-Soft-Surface):
    expect(cls).toMatch(/bg-\[var\(--color-surface-soft-cyan\)\]/);
  });

  it("T4: ARIA-Label beschreibt Phase-4-Disabled-Status", () => {
    const { container } = render(<KennzahlSlotPlaceholder />);
    const slot = container.querySelector('[data-slot="kennzahl-placeholder"]');
    const aria = slot?.getAttribute("aria-label") ?? "";
    // ARIA-Label muss "Kennzahl" UND "Phase 4" enthalten (Disambiguierung
    // für Screen-Reader gegen aktive Kennzahlen).
    expect(aria).toMatch(/Kennzahl/);
    expect(aria).toMatch(/Phase 4/);
  });
});

// ---------------------------------------------------------------------------
// Viewer-Tests
// ---------------------------------------------------------------------------
describe("PRessVerknuepfungViewer — Welle 1.2-G", () => {
  it("T5: Render Ressource OHNE verbundene Knoten → leere TTY-Liste + 1 Node im ReactFlow-Mock", () => {
    const { ressource, allObjects } = buildLoneResource();
    const { container } = renderViewer(ressource, allObjects);
    // ReactFlow-Mock zeigt nur die Ressource selbst (1 Node).
    const rf = screen.getByTestId("reactflow-mock");
    expect(rf.getAttribute("data-node-count")).toBe("1");
    // TTY-Pane existiert, hat aber keine Knoten-Listeneinträge.
    const tty = container.querySelector('[data-testid="tty-pane"]');
    expect(tty).not.toBeNull();
    // Liste der verknüpften Knoten ist leer — es darf keine `<li
    // data-oid="...">` geben.
    const knotenItems = tty?.querySelectorAll("li[data-oid]");
    expect(knotenItems?.length ?? -1).toBe(0);
  });

  it("T6: Render Ressource + 2 verbundene Knoten → TTY-Pane zeigt 2 Einträge mit data-oid", () => {
    const { ressource, allObjects } = buildResourceMit2Knoten();
    const { container } = renderViewer(ressource, allObjects);
    const tty = container.querySelector('[data-testid="tty-pane"]');
    expect(tty).not.toBeNull();
    const knotenItems = tty?.querySelectorAll("li[data-oid]") ?? [];
    expect(knotenItems.length).toBe(2);
    // Die data-oid-Werte stimmen mit den verknüpften Knoten-OIDs überein
    // (200 und 201, sortiert).
    const oids = Array.from(knotenItems).map((el) => el.getAttribute("data-oid"));
    expect(oids).toEqual(["200", "201"]);
  });

  it("T7: Graph-Mock zeigt mehr als 1 Node bei verbundenen Knoten (Ressource + Knoten + Assoz)", () => {
    const { ressource, allObjects } = buildResourceMit2Knoten();
    renderViewer(ressource, allObjects);
    const rf = screen.getByTestId("reactflow-mock");
    const nodeCount = Number(rf.getAttribute("data-node-count") ?? "0");
    // 1 Ressource + 2 Knoten + 2 Assoz = 5 Nodes erwartet.
    // Mindestens > 1 ist die Smoke-Garantie.
    expect(nodeCount).toBeGreaterThan(1);
    // Erwartet: 4 Links (Knoten→Assoz + Assoz→Ress je 2 Knoten).
    const edgeCount = Number(rf.getAttribute("data-edge-count") ?? "0");
    expect(edgeCount).toBeGreaterThan(0);
  });

  it("T8: Kennzahl-Placeholder ist im DOM des Viewers vorhanden", () => {
    const { ressource, allObjects } = buildLoneResource();
    const { container } = renderViewer(ressource, allObjects);
    const slot = container.querySelector('[data-slot="kennzahl-placeholder"]');
    expect(slot).not.toBeNull();
    expect(slot?.textContent ?? "").toMatch(/Phase 4/);
  });

  it("T9: data-viewer='PRessVerknuepfungViewer' auf Root-Element vorhanden", () => {
    const { ressource, allObjects } = buildLoneResource();
    const { container } = renderViewer(ressource, allObjects);
    const root = container.querySelector('[data-viewer="PRessVerknuepfungViewer"]');
    expect(root).not.toBeNull();
  });
});
