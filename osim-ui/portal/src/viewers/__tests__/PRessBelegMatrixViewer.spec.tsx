/**
 * PRessBelegMatrixViewer.spec.tsx — Component-Spec für die echte 2D-Belegungs-
 * Matrix (Welle 1.2-E / Plan 06 Task 2).
 *
 * Pflicht-Assertions aus 01.2-SCHEMA-MAP.md §Test-Strategie:
 *   1. Wrapper-Lazy-Create (Knoten + Beleg)
 *   2. Wrapper-Reuse
 *   3. Cell-Delete
 *   4. Status-Edit (orthogonal)
 *
 * Plus Smoke + Filter + Toolbar-Render.
 *
 * Mock-Pattern: useModelStore wird komplett ge-vi.mock'ed, damit Tests
 * keine Zustand-State-Mutation brauchen und Assert auf konkrete Aufruf-
 * Argumente machen können. Pattern 1:1 aus dem in Welle 1.2-01 gelöschten
 * Alt-Spec.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Sentinel-OIDs für die in createObject-Aufrufen erzeugten Wrappers /
// PAssozBeleg. Wir vergeben sie monoton steigend ab 9001, damit kein
// Konflikt mit dem 100-/200-/300-/400-Fixture-Bereich entsteht.
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
import { PRessBelegMatrixViewer } from "@/viewers/PRessBelegMatrix/PRessBelegMatrixViewer";
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

function buildPlan(): OBaseObj {
  return {
    oid: 100,
    klass: "PDurchlaufplan",
    attrs: { m_sName: "Plan 1", m_lKnoten: [200, 201] },
    sub_refs: [[200, 201], []],
  };
}

function buildFixtureWithBelegung(): Record<number, OBaseObj> {
  // PRessBelegLList-Wrapper enthaelt die Ressource (Maschine 1).
  const ressBelegWrapper: OBaseObj = {
    oid: 350,
    klass: "PRessBelegLList",
    attrs: {},
    sub_refs: [[400]],
  };
  // PAssozBeleg traegt m_eStatus + Pointer auf den Beleg-Wrapper.
  const assoz: OBaseObj = {
    oid: 300,
    klass: "PAssozBeleg",
    attrs: { m_lRessourcen: 350, m_eStatus: 1 },
    sub_refs: [[]],
  };
  // PAssozRessourceLList-Wrapper am Knoten A — enthaelt PAssozBeleg.
  const knotenAWrapper: OBaseObj = {
    oid: 250,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[300]],
  };
  // Knoten A — m_lAssozRess scalar Pointer auf den Wrapper.
  const knotenA: OBaseObj = {
    oid: 200,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "Knoten A", m_lAssozRess: 250 },
    sub_refs: [[]],
  };
  // Knoten B — KEIN Wrapper (m_lAssozRess: null) — fuer Lazy-Create-Test.
  const knotenB: OBaseObj = {
    oid: 201,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "Knoten B", m_lAssozRess: null },
    sub_refs: [[]],
  };
  // Ressource — PBetriebsmittel "Maschine 1".
  const ress: OBaseObj = {
    oid: 400,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "Maschine 1" },
    sub_refs: [],
  };
  // Person — fuer View-Mode-PERS-Filter-Test.
  const person: OBaseObj = {
    oid: 401,
    klass: "PPerson",
    attrs: { m_sName: "Anna" },
    sub_refs: [],
  };
  return {
    100: buildPlan(),
    200: knotenA,
    201: knotenB,
    250: knotenAWrapper,
    300: assoz,
    350: ressBelegWrapper,
    400: ress,
    401: person,
  };
}

function renderViewer(overrides?: { allObjects?: Record<number, OBaseObj> }) {
  const plan = buildPlan();
  const allObjects = overrides?.allObjects ?? buildFixtureWithBelegung();
  return render(
    <PRessBelegMatrixViewer
      obj={plan}
      schema={schema}
      allObjects={allObjects}
      onChange={() => {}}
      onCommand={() => {}}
    />,
  );
}

/**
 * Finde das innere clickable Cell-`<div>` (das mit `data-testid="matrix-cell"`)
 * fuer ein gegebenes rowOid:colOid-Paar. Das aeussere `<td>` traegt das
 * `data-matrix-cell="${rk}:${ck}"`-Attribut (MatrixGrid-Konvention), aber
 * `onClick` haengt am inneren `<div>` (EditableCell). fireEvent.click
 * auf das `<td>` wuerde am `<td>` haengen — onClick capture passiert hier
 * nicht. Daher den inneren Div suchen.
 */
function findEditableCell(rowOid: number, colOid: number): HTMLElement {
  const tdSelector = `[data-matrix-cell="oid:${rowOid}:oid:${colOid}"]`;
  const td = document.querySelector(tdSelector);
  if (!td) throw new Error(`Cell ${tdSelector} not found`);
  const div = td.querySelector('[data-testid="matrix-cell"]');
  if (!div) throw new Error(`inner matrix-cell <div> not found in ${tdSelector}`);
  return div as HTMLElement;
}

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

describe("PRessBelegMatrixViewer (Welle 1.2-E)", () => {
  beforeEach(() => {
    nextSentinelOid = 9001;
    createObjectMock.mockClear();
    patchObjectMock.mockClear();
    deleteObjectMock.mockClear();
    appendSubRefMock.mockClear();
    removeSubRefMock.mockClear();
  });

  // ------------------------------------------------------------------
  // Test 1 — Empty model
  // ------------------------------------------------------------------
  it("rendert Empty-Message bei Plan ohne Knoten", () => {
    const plan: OBaseObj = {
      oid: 100,
      klass: "PDurchlaufplan",
      attrs: { m_sName: "Leer", m_lKnoten: [] },
      sub_refs: [[], []],
    };
    render(
      <PRessBelegMatrixViewer
        obj={plan}
        schema={schema}
        allObjects={{ 100: plan }}
        onChange={() => {}}
        onCommand={() => {}}
      />,
    );
    expect(screen.getByText(/Keine Daten|Keine Knoten|Keine Ressourcen/i)).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Test 2 — Smoke: Row/Col-Header + Cell mit Status
  // ------------------------------------------------------------------
  it("rendert 2 Knoten-Spalten + 2 Ressourcen-Zeilen + Status 'standard' fuer belegte Cell", () => {
    renderViewer();
    expect(screen.getByText("Maschine 1")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Knoten A")).toBeInTheDocument();
    expect(screen.getByText("Knoten B")).toBeInTheDocument();
    // PAssozBeleg oid=300 hat m_eStatus=1 → "standard" wird als
    // <span> in der belegten Cell angezeigt. (Die Toolbar-Combobox
    // hat ebenfalls einen "standard"-Option-Text, daher selector auf Cell.)
    const cell = document.querySelector('[data-matrix-cell="oid:400:oid:200"]');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toContain("standard");
  });

  // ------------------------------------------------------------------
  // Test 3 — Linksklick auf belegte Cell ist No-Op (1:1 OnLButtonDown:
  //          gobj != NULL → kein Create/Edit, kein Else-Zweig).
  // ------------------------------------------------------------------
  it("Linksklick auf belegte Cell ist No-Op (kein In-Place-Status-Change)", () => {
    renderViewer();
    fireEvent.click(findEditableCell(400, 200)); // belegte Cell (Status standard)
    expect(patchObjectMock).not.toHaveBeenCalled();
    expect(createObjectMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(appendSubRefMock).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // Test 3b — Linksklick auf leere Cell legt eine neue Belegung an
  //          (Toolbar-Paint). Der Status lebt NICHT als m_eStatus auf der
  //          PAssozBeleg, sondern per Ressource in m_LinkStatusList
  //          (setLinkStatus, real-store-getrieben → E2E-Coverage).
  // ------------------------------------------------------------------
  it("Linksklick auf leere Cell legt eine neue Belegung an (PAssozBeleg ohne m_eStatus)", () => {
    renderViewer();
    fireEvent.click(findEditableCell(400, 201)); // leere Cell (Maschine 1 × Knoten B)
    const klasses = createObjectMock.mock.calls.map((c) => c[0]);
    expect(klasses).toContain("PAssozBeleg");
    expect(klasses).toContain("PRessBelegLList");
    // PAssozBeleg wird OHNE m_eStatus angelegt (Feld existiert im Modell nicht).
    const assozCall = createObjectMock.mock.calls.find((c) => c[0] === "PAssozBeleg");
    expect(assozCall?.[1]).not.toHaveProperty("m_eStatus");
  });

  // ------------------------------------------------------------------
  // Test 4 — Cell-Create + Wrapper-Lazy-Create (Pflicht-Assertion 1).
  //          Linksklick auf leere Cell (Default-Status "standard").
  // ------------------------------------------------------------------
  it("Cell-Create auf leere Cell mit Knoten ohne m_lAssozRess-Wrapper → Lazy-Create kompletter Indirektion", () => {
    renderViewer();
    // Leere Cell: Ressource 400 (Maschine 1) × Knoten 201 (Knoten B).
    // Knoten B hat m_lAssozRess=null → muss Lazy-Create triggern.
    fireEvent.click(findEditableCell(400, 201));

    // Drei createObject-Calls: PAssozRessourceLList (Knoten-Wrapper),
    // PAssozBeleg, PRessBelegLList (Beleg-Wrapper).
    const calledKlasses = createObjectMock.mock.calls.map((c) => c[0]);
    expect(calledKlasses).toContain("PAssozRessourceLList");
    expect(calledKlasses).toContain("PAssozBeleg");
    expect(calledKlasses).toContain("PRessBelegLList");

    // patchObject(knoten.oid, { m_lAssozRess: knotenWrapperOid }).
    expect(patchObjectMock).toHaveBeenCalledWith(
      201,
      expect.objectContaining({ m_lAssozRess: expect.any(Number) }),
    );
    // patchObject(neueAssozOid, { m_lRessourcen: belegWrapperOid }).
    const belegPatch = patchObjectMock.mock.calls.find(
      (c) => typeof c[1] === "object" && c[1] !== null && "m_lRessourcen" in (c[1] as object),
    );
    expect(belegPatch).toBeDefined();

    // appendSubRef-Calls: Knoten-Wrapper (neueAssozOid) + Beleg-Wrapper (rowRess.oid).
    expect(appendSubRefMock).toHaveBeenCalledTimes(2);
    const ressAppend = appendSubRefMock.mock.calls.find((c) => c[2] === 400);
    expect(ressAppend).toBeDefined();
  });

  // ------------------------------------------------------------------
  // Test 5 — Cell-Create + Wrapper-Reuse (Pflicht-Assertion 2).
  // ------------------------------------------------------------------
  it("Cell-Create auf leere Cell mit vorhandenem m_lAssozRess-Wrapper → kein neuer Knoten-Wrapper", () => {
    renderViewer();
    // Leere Cell: Person 401 × Knoten A 200. Knoten A hat bereits
    // m_lAssozRess=250 → KEIN neuer PAssozRessourceLList.
    fireEvent.click(findEditableCell(401, 200));

    const calledKlasses = createObjectMock.mock.calls.map((c) => c[0]);
    expect(calledKlasses).not.toContain("PAssozRessourceLList");
    expect(calledKlasses).toContain("PAssozBeleg");
    expect(calledKlasses).toContain("PRessBelegLList");
    // patchObject darf NICHT auf knoten.oid mit m_lAssozRess gerufen worden sein.
    const knotenPatch = patchObjectMock.mock.calls.find(
      (c) => c[0] === 200 && typeof c[1] === "object" && c[1] !== null && "m_lAssozRess" in (c[1] as object),
    );
    expect(knotenPatch).toBeUndefined();
    // appendSubRef auf bestehenden Knoten-Wrapper 250.
    const wrapperAppend = appendSubRefMock.mock.calls.find((c) => c[0] === 250);
    expect(wrapperAppend).toBeDefined();
  });

  // ------------------------------------------------------------------
  // Test 6 — Cell-Delete via Rechtsklick (1:1 OnRButtonDown, Pflicht-Assertion 3).
  // ------------------------------------------------------------------
  it("Rechtsklick auf belegte Cell → deleteObject(assoz.oid) wenn Beleg-Wrapper leer wird", () => {
    renderViewer();
    fireEvent.contextMenu(findEditableCell(400, 200));
    // Beleg-Wrapper 350 hat nur 1 Ressource → wird leer → komplette PAssozBeleg-Instanz löschen.
    expect(deleteObjectMock).toHaveBeenCalledWith(300);
  });

  // ------------------------------------------------------------------
  // Test 7 — Toolbar-Render
  // ------------------------------------------------------------------
  it("Toolbar rendert 3 Comboboxes (view / verk / status)", () => {
    renderViewer();
    expect(document.querySelector('[data-testid="combo-view-select"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="combo-verk-select"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="combo-status-select"]')).not.toBeNull();
  });

  // ------------------------------------------------------------------
  // Test 8 — View-Filter PERS
  // ------------------------------------------------------------------
  it("View-Combo auf PERS → nur Personen-Zeilen sichtbar", () => {
    renderViewer();
    const viewSelect = document.querySelector(
      '[data-testid="combo-view-select"]',
    ) as HTMLSelectElement | null;
    expect(viewSelect).not.toBeNull();
    fireEvent.change(viewSelect!, { target: { value: "PERS" } });
    // Maschine 1 (Betriebsmittel) ist jetzt raus, Anna (Person) bleibt.
    expect(screen.queryByText("Maschine 1")).toBeNull();
    expect(screen.getByText("Anna")).toBeInTheDocument();
  });

  // ------------------------------------------------------------------
  // Test 9 — data-Attribute auf Root
  // ------------------------------------------------------------------
  it("Root traegt data-viewer und data-matrix-grid Attribute", () => {
    renderViewer();
    const root = document.querySelector('[data-viewer="PRessBelegMatrixViewer"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute("data-matrix-grid")).toBe("PRessBeleg");
  });
});
