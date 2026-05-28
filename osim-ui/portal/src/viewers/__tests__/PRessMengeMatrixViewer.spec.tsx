/**
 * PRessMengeMatrixViewer.spec.tsx — Component-Spec für die migrierte 2D-Mengen-
 * Matrix (Phase 01.3 Welle 5 / Plan 07 Task 1).
 *
 * Schablone: PRessBelegMatrixViewer.spec.tsx (Welle 1.2-E / Plan 06).
 * Subject:   osim-ui/portal/src/viewers/PRessMenge/PRessMengeMatrixViewer.tsx
 *            (Plan 06 — 2D-Matrix Ressource × Knoten × PAssozMenge*).
 *
 * Pflicht-Tests (Plan 01.3-07 SC-8, ≥ 8):
 *   1. Empty: kein PRessMenge im Modell → "Keine Mengen-Ressourcen"-Hinweis.
 *   2. Empty: keine Knoten im Durchlaufplan → "Keine Knoten"-Hinweis.
 *   3. Smoke: 2 PRessMenge × 3 Knoten + 1 PAssozMengeErzgt → 2×3 Cells gerendert,
 *      eine zeigt Pill mit Subklassen-Kurzcode "E" + Mengen-Wert.
 *   4. Linksklick leere Cell mit Default-Toolbar (Erzgt + Menge=1) → createObject
 *      ("PAssozMengeErzgt", { m_lMengRess: rowOid, m_iMengeAus: 1, ... }).
 *   5. Linksklick mit Toolbar-Typ "Verbr" + Menge=5 → createObject
 *      ("PAssozMengeVerbr", { m_iMengeEin: 5, ... }).
 *   6. Linksklick auf belegte Cell ist No-Op (1:1 C++ Z.867 `if (gobj == NULL)`).
 *   7. Rechtsklick auf belegte Cell → deleteObject(assoc.oid) + removeSubRef vom
 *      Knoten-Wrapper m_lAssozRess.
 *   8. disabled=true → weder Linksklick (Create) noch Rechtsklick (Delete).
 *   9. Toolbar-Typ-Combo Default ist PAssozMengeErzgt (1:1 C++ Z.1438
 *      m_cbTyp.SetCurSel(0)).
 *  10. Ctrl+Klick auf 2 Cells → beide haben das data-matrix-cell-selected="true"
 *      Attribut (Block-Selektion via useBlockSelection).
 *
 * Mock-Pattern: useModelStore wird komplett ge-vi.mock'ed; Tests asserten
 * konkrete createObject/patchObject/appendSubRef/deleteObject/removeSubRef-
 * Argumente. 1:1 zum PRessBelegMatrixViewer.spec.tsx-Pattern.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Sentinel-OIDs für die in createObject-Aufrufen erzeugten Wrapper/Assoz-
// Objekte. Wir vergeben sie monoton steigend ab 9001, damit kein Konflikt mit
// dem 100-/200-/300-/400-Fixture-Bereich entsteht.
let nextSentinelOid = 9001;
const createObjectMock = vi.fn().mockImplementation(() => {
  const oid = nextSentinelOid;
  nextSentinelOid += 1;
  return oid;
});
const patchObjectMock = vi.fn();
const deleteObjectMock = vi.fn();
const appendSubRefMock = vi.fn();
const removeSubRefMock = vi.fn();

vi.mock("@/stores/model-store", () => ({
  useModelStore: {
    getState: () => ({
      patchObject: patchObjectMock,
      createObject: createObjectMock,
      deleteObject: deleteObjectMock,
      appendSubRef: appendSubRefMock,
      removeSubRef: removeSubRefMock,
    }),
  },
}));

// Import NACH dem Mock.
import { PRessMengeMatrixViewer } from "@/viewers/PRessMenge/PRessMengeMatrixViewer";
import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

// ----------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------

const schema: ClassSchema = {
  klass: "PDurchlaufplan",
  label_de: "Durchlaufplan",
  viewer_hints: ["matrix"],
  properties: [
    { name: "m_sName", label_de: "Name", octrl_type: "Variable", value_type: "string" },
  ],
};

/**
 * Bau einen Plan mit 3 Knoten (Spalten):
 *   100: PDurchlaufplan { m_lKnoten: [200, 201, 202] }
 *   200: K1 mit m_lAssozRess=250 (Wrapper) → enthält PAssozMengeErzgt 300.
 *   201: K2 mit m_lAssozRess=null  → für Lazy-Create-Test.
 *   202: K3 mit m_lAssozRess=null.
 *   250: PAssozRessourceLList-Wrapper {sub_refs[0]: [300]}.
 *   300: PAssozMengeErzgt mit m_lMengRess=1 (Pointer auf PRessMenge oid=1)
 *        + m_iMengeAus=5.
 *
 * Plus zwei PRessMenge (Zeilen):
 *   1: PRessMenge "L1"
 *   2: PRessMenge "L2"
 */
function buildPlan(): OBaseObj {
  return {
    oid: 100,
    klass: "PDurchlaufplan",
    attrs: { m_sName: "Plan 1", m_lKnoten: [200, 201, 202] },
    sub_refs: [[200, 201, 202], []],
  };
}

function buildFixtureWithBelegung(): Record<number, OBaseObj> {
  // PRessMenge-Zeilen.
  const l1: OBaseObj = {
    oid: 1,
    klass: "PRessMenge",
    attrs: { m_sName: "L1" },
    sub_refs: [[]],
  };
  const l2: OBaseObj = {
    oid: 2,
    klass: "PRessMenge",
    attrs: { m_sName: "L2" },
    sub_refs: [[]],
  };
  // PAssozMengeErzgt verknüpft L1 (oid=1) mit K1 (oid=200) — m_iMengeAus=5.
  const assoz: OBaseObj = {
    oid: 300,
    klass: "PAssozMengeErzgt",
    attrs: { m_sName: "E1", m_lMengRess: 1, m_iMengeAus: 5 },
    sub_refs: [[]],
  };
  // PAssozRessourceLList-Wrapper am Knoten K1.
  const knotenK1Wrapper: OBaseObj = {
    oid: 250,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[300]],
  };
  // Knoten K1 mit m_lAssozRess=250 (Wrapper-Reuse-Pfad).
  const knotenK1: OBaseObj = {
    oid: 200,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "K1", m_lAssozRess: 250 },
    sub_refs: [[]],
  };
  // Knoten K2 ohne Wrapper (Lazy-Create-Pfad).
  const knotenK2: OBaseObj = {
    oid: 201,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "K2", m_lAssozRess: null },
    sub_refs: [[]],
  };
  // Knoten K3 ohne Wrapper.
  const knotenK3: OBaseObj = {
    oid: 202,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "K3", m_lAssozRess: null },
    sub_refs: [[]],
  };
  return {
    1: l1,
    2: l2,
    100: buildPlan(),
    200: knotenK1,
    201: knotenK2,
    202: knotenK3,
    250: knotenK1Wrapper,
    300: assoz,
  };
}

function renderViewer(overrides?: {
  allObjects?: Record<number, OBaseObj>;
  obj?: OBaseObj;
  disabled?: boolean;
}) {
  const plan = overrides?.obj ?? buildPlan();
  const allObjects = overrides?.allObjects ?? buildFixtureWithBelegung();
  return render(
    <PRessMengeMatrixViewer
      obj={plan}
      schema={schema}
      allObjects={allObjects}
      onChange={() => {}}
      onCommand={() => {}}
      disabled={overrides?.disabled ?? false}
    />,
  );
}

/**
 * Finde das innere clickable Cell-`<div>` (data-testid="matrix-cell") für ein
 * gegebenes rowOid:colOid-Paar. Das äußere `<td>` trägt data-matrix-cell-Attr.
 * onClick hängt am inneren `<div>` (MatrixMengeCell).
 */
function findCell(rowOid: number, colOid: number): HTMLElement {
  const tdSelector = `[data-matrix-cell="oid:${rowOid}:oid:${colOid}"]`;
  const td = document.querySelector(tdSelector);
  if (!td) throw new Error(`Cell ${tdSelector} not found`);
  const div = td.querySelector('[data-testid="matrix-cell"]');
  if (!div) throw new Error(`inner matrix-cell <div> not found in ${tdSelector}`);
  return div as HTMLElement;
}

/** Setzt Toolbar-Typ-Combo auf den angegebenen Wert. */
function setToolbarTyp(value: string) {
  const select = document.querySelector(
    '[data-testid="combo-typ-select"]',
  ) as HTMLSelectElement | null;
  if (!select) throw new Error("combo-typ-select nicht gefunden");
  fireEvent.change(select, { target: { value } });
}

/** Setzt Toolbar-Mengen-Input auf den angegebenen Wert. */
function setToolbarMenge(value: number) {
  const input = document.querySelector(
    '[data-testid="combo-menge-input"]',
  ) as HTMLInputElement | null;
  if (!input) throw new Error("combo-menge-input nicht gefunden");
  fireEvent.change(input, { target: { value: String(value) } });
}

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

describe("PRessMengeMatrixViewer (Phase 01.3 Welle 5)", () => {
  beforeEach(() => {
    nextSentinelOid = 9001;
    createObjectMock.mockClear();
    patchObjectMock.mockClear();
    deleteObjectMock.mockClear();
    appendSubRefMock.mockClear();
    removeSubRefMock.mockClear();
  });

  // ------------------------------------------------------------------
  // Test 1 — Empty: kein PRessMenge im Modell
  // ------------------------------------------------------------------
  it("rendert Empty-Message wenn allObjects keine PRessMenge enthält", () => {
    // Fixture ohne PRessMenge (oid 1+2 entfernt), nur Plan + Knoten.
    const allObjects: Record<number, OBaseObj> = {
      100: buildPlan(),
      200: {
        oid: 200,
        klass: "PDpKnKonstant",
        attrs: { m_sName: "K1", m_lAssozRess: null },
        sub_refs: [[]],
      },
      201: {
        oid: 201,
        klass: "PDpKnKonstant",
        attrs: { m_sName: "K2", m_lAssozRess: null },
        sub_refs: [[]],
      },
      202: {
        oid: 202,
        klass: "PDpKnKonstant",
        attrs: { m_sName: "K3", m_lAssozRess: null },
        sub_refs: [[]],
      },
    };
    renderViewer({ allObjects });
    expect(
      screen.getByText(/Keine Mengen-Ressourcen|Keine Knoten/i),
    ).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Test 2 — Empty: keine Knoten im Plan
  // ------------------------------------------------------------------
  it("rendert Empty-Message wenn Plan keine Knoten hat", () => {
    const planLeer: OBaseObj = {
      oid: 100,
      klass: "PDurchlaufplan",
      attrs: { m_sName: "Leer", m_lKnoten: [] },
      sub_refs: [[], []],
    };
    const allObjects: Record<number, OBaseObj> = {
      1: {
        oid: 1,
        klass: "PRessMenge",
        attrs: { m_sName: "L1" },
        sub_refs: [[]],
      },
      100: planLeer,
    };
    renderViewer({ obj: planLeer, allObjects });
    expect(screen.getByText(/Keine Knoten im Durchlaufplan/i)).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Test 3 — Smoke: 2D-Matrix mit existierender PAssozMengeErzgt-Belegung
  // ------------------------------------------------------------------
  it("rendert 2 Mengen-Ressourcen × 3 Knoten + zeigt Erzeuger-Pill mit Kurzcode 'E' und Menge 5", () => {
    renderViewer();
    // Zeilen-Header.
    expect(screen.getByText("L1")).toBeInTheDocument();
    expect(screen.getByText("L2")).toBeInTheDocument();
    // Spalten-Header.
    expect(screen.getByText("K1")).toBeInTheDocument();
    expect(screen.getByText("K2")).toBeInTheDocument();
    expect(screen.getByText("K3")).toBeInTheDocument();
    // Belegte Cell (L1 × K1) zeigt Pill mit "E" + "5".
    const belegteCell = findCell(1, 200);
    expect(belegteCell.textContent).toContain("E");
    expect(belegteCell.textContent).toContain("5");
    // Leere Cells haben kein data-oid (nur belegte tragen data-oid).
    const leereCell = findCell(2, 201);
    expect(leereCell.getAttribute("data-oid")).toBeNull();
  });

  // ------------------------------------------------------------------
  // Test 4 — Linksklick leere Cell mit Default-Toolbar → Cell-Create
  //          PAssozMengeErzgt + Menge 1
  // ------------------------------------------------------------------
  it("Linksklick leere Cell mit Default (Erzgt+1) → createObject(PAssozMengeErzgt, m_lMengRess=rowOid, m_iMengeAus=1)", () => {
    renderViewer();
    // Leere Cell: L2 (oid=2) × K2 (oid=201). K2 hat KEIN Wrapper → Lazy-Create.
    fireEvent.click(findCell(2, 201));

    const klasses = createObjectMock.mock.calls.map((c) => c[0]);
    expect(klasses).toContain("PAssozRessourceLList");
    expect(klasses).toContain("PAssozMengeErzgt");

    // patchObject(knoten.oid=201, { m_lAssozRess: wrapperOid }).
    expect(patchObjectMock).toHaveBeenCalledWith(
      201,
      expect.objectContaining({ m_lAssozRess: expect.any(Number) }),
    );

    // PAssozMengeErzgt-Call: m_lMengRess=2 (rowOid), m_iMengeAus=1 (Default).
    const assozCall = createObjectMock.mock.calls.find(
      (c) => c[0] === "PAssozMengeErzgt",
    );
    expect(assozCall).toBeDefined();
    expect(assozCall![1]).toMatchObject({
      m_lMengRess: 2,
      m_iMengeAus: 1,
    });

    // appendSubRef auf den neuen Wrapper.
    expect(appendSubRefMock).toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Test 5 — Linksklick mit Toolbar-Typ "Verbr" + Menge=5
  // ------------------------------------------------------------------
  it("Linksklick leere Cell mit Toolbar=Verbr+5 → createObject(PAssozMengeVerbr, m_iMengeEin=5)", () => {
    renderViewer();
    // Toolbar umstellen: Typ → Verbr, Menge → 5.
    setToolbarTyp("PAssozMengeVerbr");
    setToolbarMenge(5);

    // Leere Cell: L1 (oid=1) × K2 (oid=201). K2 hat KEIN Wrapper.
    fireEvent.click(findCell(1, 201));

    // PAssozMengeVerbr-Call mit m_iMengeEin=5 + m_lMengRess=1 (rowOid).
    const assozCall = createObjectMock.mock.calls.find(
      (c) => c[0] === "PAssozMengeVerbr",
    );
    expect(assozCall).toBeDefined();
    expect(assozCall![1]).toMatchObject({
      m_lMengRess: 1,
      m_iMengeEin: 5,
    });
    // Pflicht: KEIN m_iMengeAus (das ist Erzgt-Attribut).
    expect(assozCall![1]).not.toHaveProperty("m_iMengeAus");
  });

  // ------------------------------------------------------------------
  // Test 6 — Linksklick belegte Cell → No-Op
  // ------------------------------------------------------------------
  it("Linksklick auf belegte Cell ist No-Op (1:1 C++: gobj != NULL fällt durch)", () => {
    renderViewer();
    // Belegte Cell: L1 (oid=1) × K1 (oid=200). PAssozMengeErzgt 300 sitzt dort.
    fireEvent.click(findCell(1, 200));

    expect(createObjectMock).not.toHaveBeenCalled();
    expect(patchObjectMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(appendSubRefMock).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Test 7 — Rechtsklick belegte Cell → deleteObject + removeSubRef
  // ------------------------------------------------------------------
  it("Rechtsklick auf belegte Cell → deleteObject(300) + removeSubRef vom Knoten-Wrapper", () => {
    renderViewer();
    fireEvent.contextMenu(findCell(1, 200));

    // PAssozMengeErzgt 300 wird gelöscht.
    expect(deleteObjectMock).toHaveBeenCalledWith(300);
    // Pflicht: removeSubRef vom Knoten-Wrapper 250 (slot 0, oid 300).
    expect(removeSubRefMock).toHaveBeenCalledWith(250, 0, 300);
  });

  // ------------------------------------------------------------------
  // Test 8 — disabled=true blockiert sowohl Links- als auch Rechtsklick
  // ------------------------------------------------------------------
  it("disabled=true → weder Links- noch Rechtsklick lösen Mutationen aus", () => {
    renderViewer({ disabled: true });
    // Versuch Linksklick (leere Cell).
    fireEvent.click(findCell(2, 201));
    // Versuch Rechtsklick (belegte Cell).
    fireEvent.contextMenu(findCell(1, 200));

    expect(createObjectMock).not.toHaveBeenCalled();
    expect(patchObjectMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(appendSubRefMock).not.toHaveBeenCalled();
    expect(removeSubRefMock).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Test 9 — Toolbar-Typ-Combo Default ist PAssozMengeErzgt
  // ------------------------------------------------------------------
  it("Toolbar-Typ-Combo Default ist PAssozMengeErzgt (1:1 C++ m_cbTyp.SetCurSel(0))", () => {
    renderViewer();
    const select = document.querySelector(
      '[data-testid="combo-typ-select"]',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select!.value).toBe("PAssozMengeErzgt");
  });

  // ------------------------------------------------------------------
  // Test 10 — Ctrl+Klick auf 2 Cells → beide haben data-matrix-cell-selected="true"
  // ------------------------------------------------------------------
  it("Ctrl+Klick (pointerDown shiftKey) auf 2 Cells → beide tragen data-matrix-cell-selected='true'", () => {
    renderViewer();
    // Block-Selektion läuft über pointerDown (siehe useBlockSelection).
    // Erste Cell: plain pointerDown → Single-Cell-Range.
    // Zweite Cell: shiftKey-pointerDown → erweitert die Range.
    const cell1 = findCell(1, 200); // L1 × K1
    const cell2 = findCell(2, 201); // L2 × K2

    fireEvent.pointerDown(cell1);
    fireEvent.pointerDown(cell2, { shiftKey: true });

    // Beide Cells (und alle dazwischen) tragen jetzt data-matrix-cell-selected=true.
    // Die Range deckt Zeilen 0-1 + Spalten 0-1 = 4 Cells ab (L1×K1, L1×K2, L2×K1, L2×K2).
    expect(cell1.getAttribute("data-matrix-cell-selected")).toBe("true");
    expect(cell2.getAttribute("data-matrix-cell-selected")).toBe("true");
  });

  // ------------------------------------------------------------------
  // Test 11 — Bonus: Root trägt data-viewer + data-matrix-grid Attribute
  // ------------------------------------------------------------------
  it("Root trägt data-viewer='PRessMengeMatrixViewer' und data-matrix-grid='PRessMenge'", () => {
    renderViewer();
    const root = document.querySelector('[data-viewer="PRessMengeMatrixViewer"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute("data-matrix-grid")).toBe("PRessMenge");
  });
});
