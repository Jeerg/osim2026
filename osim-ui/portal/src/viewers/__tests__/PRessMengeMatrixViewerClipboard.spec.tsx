/**
 * PRessMengeMatrixViewerClipboard.spec.tsx — Spec für den Document-Level-
 * Copy/Paste-Listener des PRessMengeMatrixViewer (Phase 01.3 Welle 5 / Plan 07
 * Task 2a).
 *
 * Analog zur PRessBelegMatrixViewerClipboard.spec.tsx (Welle 1.2-E / Plan 06).
 * Unterschied: Payload-Schema ist {klass, menge} statt nur Status-Number; beim
 * Paste wird KEINE bestehende Cell überschrieben (Cell-Create-No-Op-Semantik).
 *
 * Tests (≥ 4):
 *   T1 — Copy mit aktiver Block-Selection: preventDefault + MATRIX_CLIPBOARD_MIME
 *        gesetzt mit cells-Array.
 *   T2 — Paste mit gültiger Payload (PAssozMengeErzgt + Menge=7) + leere Ziel-
 *        Cell ruft preventDefault + dispatcht createObject(PAssozMengeErzgt,
 *        m_iMengeAus=7).
 *   T3 — Copy ohne Selection ruft KEIN preventDefault (Pass-through).
 *   T4 — disabled=true verhindert beide Handler.
 *   T5 — Paste auf belegte Ziel-Cell: kein createObject (Cell-Create-No-Op).
 *
 * JSDOM-DataTransfer-Polyfill identisch zur Schablone (PRessBeleg-Clipboard-
 * Spec Z.20-58).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, cleanup } from "@testing-library/react";

// JSDOM-Polyfill für DataTransfer (Stand 2026-05 ohne nativen Konstruktor).
type DataTransferStub = {
  data: Record<string, string>;
  effectAllowed: string;
  setData(type: string, value: string): void;
  getData(type: string): string;
};
class DataTransferPolyfill implements DataTransferStub {
  data: Record<string, string> = {};
  effectAllowed = "none";
  setData(type: string, value: string) {
    this.data[type] = value;
  }
  getData(type: string): string {
    return this.data[type] ?? "";
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).DataTransfer === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DataTransfer = DataTransferPolyfill;
}
if (
  typeof window !== "undefined" &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (window as any).DataTransfer === "undefined"
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).DataTransfer = DataTransferPolyfill;
}

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

import { PRessMengeMatrixViewer } from "@/viewers/PRessMenge/PRessMengeMatrixViewer";
import { MATRIX_CLIPBOARD_MIME } from "@osim/graphobject";
import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

// ----------------------------------------------------------------------
// Fixtures (gleiches Wire-Layout wie PRessMengeMatrixViewer.spec.tsx)
// ----------------------------------------------------------------------

const schema: ClassSchema = {
  klass: "PDurchlaufplan",
  label_de: "Durchlaufplan",
  viewer_hints: ["matrix"],
  properties: [],
};

function buildPlan(): OBaseObj {
  return {
    oid: 100,
    klass: "PDurchlaufplan",
    attrs: { m_sName: "Plan 1", m_lKnoten: [200, 201, 202] },
    sub_refs: [[200, 201, 202], []],
  };
}

function buildFixture(): Record<number, OBaseObj> {
  // 2 PRessMenge-Zeilen.
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
  // PAssozMengeErzgt sitzt auf (L1 × K1) — Menge=5.
  const assoz: OBaseObj = {
    oid: 300,
    klass: "PAssozMengeErzgt",
    attrs: { m_sName: "E1", m_lMengRess: 1, m_iMengeAus: 5 },
    sub_refs: [[]],
  };
  const knotenK1Wrapper: OBaseObj = {
    oid: 250,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[300]],
  };
  const knotenK1: OBaseObj = {
    oid: 200,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "K1", m_lAssozRess: 250 },
    sub_refs: [[]],
  };
  const knotenK2: OBaseObj = {
    oid: 201,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "K2", m_lAssozRess: null },
    sub_refs: [[]],
  };
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

function renderViewer(disabled = false) {
  const plan = buildPlan();
  const allObjects = buildFixture();
  return render(
    <PRessMengeMatrixViewer
      obj={plan}
      schema={schema}
      allObjects={allObjects}
      onChange={() => {}}
      onCommand={() => {}}
      disabled={disabled}
    />,
  );
}

/** Triggert eine Block-Selection auf 2 Cells via pointerDown + shiftKey. */
function selectBlock(
  rowOid1: number,
  colOid1: number,
  rowOid2: number,
  colOid2: number,
) {
  const td1 = document.querySelector(`[data-matrix-cell="oid:${rowOid1}:oid:${colOid1}"]`);
  const td2 = document.querySelector(`[data-matrix-cell="oid:${rowOid2}:oid:${colOid2}"]`);
  if (!td1 || !td2) throw new Error("Cell not found");
  const div1 = td1.querySelector('[data-testid="matrix-cell"]') as HTMLElement;
  const div2 = td2.querySelector('[data-testid="matrix-cell"]') as HTMLElement;
  fireEvent.pointerDown(div1);
  fireEvent.pointerDown(div2, { shiftKey: true });
}

/**
 * Konstruiert ein Copy/Paste-Event mit injected DataTransfer + abgespy'tem
 * preventDefault.
 */
function buildClipboardEvent(type: "copy" | "paste", dataTransfer: DataTransfer) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: dataTransfer, writable: false });
  const preventSpy = vi.spyOn(ev, "preventDefault");
  return { ev, preventSpy };
}

// ----------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------

describe("PRessMengeMatrixViewer — Document-Clipboard-Listener (Phase 01.3 Welle 5)", () => {
  beforeEach(() => {
    nextSentinelOid = 9001;
    createObjectMock.mockClear();
    patchObjectMock.mockClear();
    deleteObjectMock.mockClear();
    appendSubRefMock.mockClear();
    removeSubRefMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // ------------------------------------------------------------------
  // T1 — Copy mit aktiver Selection
  // ------------------------------------------------------------------
  it("T1: Copy mit aktiver Block-Selection setzt MATRIX_CLIPBOARD_MIME + preventDefault", () => {
    renderViewer();
    // 2-Cell-Block: (L1 × K1) belegt + (L2 × K2) leer.
    selectBlock(1, 200, 2, 201);

    const dt = new DataTransfer();
    const { ev, preventSpy } = buildClipboardEvent("copy", dt);
    document.dispatchEvent(ev);

    expect(preventSpy).toHaveBeenCalled();
    const raw = dt.getData(MATRIX_CLIPBOARD_MIME);
    expect(raw.length).toBeGreaterThan(0);
    const payload = JSON.parse(raw);
    expect(payload.origin).toBe("PRessMengeMatrixViewer");
    expect(Array.isArray(payload.cells)).toBe(true);
    // Range deckt 2 Zeilen × 2 Spalten = 4 Cells ab (auch leere).
    expect(payload.cells.length).toBeGreaterThanOrEqual(1);
    // Mindestens eine Cell mit klass-Payload (die belegte L1 × K1).
    const belegteCells = payload.cells.filter(
      (c: { value: unknown }) => c.value !== null,
    );
    expect(belegteCells.length).toBeGreaterThanOrEqual(1);
    const erste = belegteCells[0];
    expect(erste.value).toMatchObject({
      klass: "PAssozMengeErzgt",
      menge: 5,
    });
  });

  // ------------------------------------------------------------------
  // T2 — Paste mit gültiger Payload + LEERE Ziel-Cell → createObject
  // ------------------------------------------------------------------
  it("T2: Paste mit gültigem Payload (Erzgt + Menge=7) auf leere Cell → createObject(PAssozMengeErzgt)", () => {
    renderViewer();
    // Selektion auf eine LEERE Ziel-Cell (L2 × K2, oid 2 × 201).
    selectBlock(2, 201, 2, 201);

    const dt = new DataTransfer();
    const payload = {
      origin: "PRessMengeMatrixViewer",
      cells: [
        { row: 0, col: 0, value: { klass: "PAssozMengeErzgt", menge: 7 } },
      ],
    };
    dt.setData(MATRIX_CLIPBOARD_MIME, JSON.stringify(payload));

    const { ev, preventSpy } = buildClipboardEvent("paste", dt);
    document.dispatchEvent(ev);

    expect(preventSpy).toHaveBeenCalled();
    // Lazy-Create-Wrapper für K2 + neue PAssozMengeErzgt mit m_iMengeAus=7
    // und m_lMengRess=2 (= L2).
    const klasses = createObjectMock.mock.calls.map((c) => c[0]);
    expect(klasses).toContain("PAssozRessourceLList");
    expect(klasses).toContain("PAssozMengeErzgt");
    const assozCall = createObjectMock.mock.calls.find(
      (c) => c[0] === "PAssozMengeErzgt",
    );
    expect(assozCall![1]).toMatchObject({
      m_lMengRess: 2,
      m_iMengeAus: 7,
    });
  });

  // ------------------------------------------------------------------
  // T3 — Copy ohne Selection: kein preventDefault (Pass-through)
  // ------------------------------------------------------------------
  it("T3: Copy ohne aktive Selection ruft KEIN preventDefault (Pass-through)", () => {
    renderViewer();
    const dt = new DataTransfer();
    const { ev, preventSpy } = buildClipboardEvent("copy", dt);
    document.dispatchEvent(ev);
    expect(preventSpy).not.toHaveBeenCalled();
    expect(dt.getData(MATRIX_CLIPBOARD_MIME)).toBe("");
  });

  // ------------------------------------------------------------------
  // T4 — disabled-Prop verhindert beide Listener
  // ------------------------------------------------------------------
  it("T4: disabled=true ignoriert sowohl Copy als auch Paste (effect-Listener nicht registriert)", () => {
    renderViewer(true);

    // Auch wenn wir versuchen, eine Selektion zu setzen — disabled-Cells
    // reagieren nicht auf pointerDown, weil der Cell-Handler beim
    // useBlockSelection-Pfad NICHT via disabled abgebrochen wird (das
    // läuft über die effect-Listener). Daher kein selectBlock-Aufruf.
    const dtCopy = new DataTransfer();
    const { ev: copyEv, preventSpy: copySpy } = buildClipboardEvent("copy", dtCopy);
    document.dispatchEvent(copyEv);
    expect(copySpy).not.toHaveBeenCalled();

    const dtPaste = new DataTransfer();
    dtPaste.setData(
      MATRIX_CLIPBOARD_MIME,
      JSON.stringify({
        origin: "PRessMengeMatrixViewer",
        cells: [{ row: 0, col: 0, value: { klass: "PAssozMengeErzgt", menge: 3 } }],
      }),
    );
    const { ev: pasteEv, preventSpy: pasteSpy } = buildClipboardEvent("paste", dtPaste);
    document.dispatchEvent(pasteEv);
    expect(pasteSpy).not.toHaveBeenCalled();
    expect(createObjectMock).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // T5 — Paste auf belegte Ziel-Cell ist No-Op (Cell-Create-Semantik)
  // ------------------------------------------------------------------
  it("T5: Paste auf belegte Ziel-Cell überschreibt NICHT (Cell-Create-No-Op-Pfad)", () => {
    renderViewer();
    // Ziel ist die BELEGTE Cell (L1 × K1, oid 1 × 200).
    selectBlock(1, 200, 1, 200);

    const dt = new DataTransfer();
    const payload = {
      origin: "PRessMengeMatrixViewer",
      cells: [
        { row: 0, col: 0, value: { klass: "PAssozMengeVerbr", menge: 99 } },
      ],
    };
    dt.setData(MATRIX_CLIPBOARD_MIME, JSON.stringify(payload));

    const { ev, preventSpy } = buildClipboardEvent("paste", dt);
    document.dispatchEvent(ev);

    // preventDefault wird gerufen (Listener greift), aber kein createObject
    // (existing-Cell-Skip im Viewer-Code).
    expect(preventSpy).toHaveBeenCalled();
    expect(createObjectMock).not.toHaveBeenCalled();
    expect(patchObjectMock).not.toHaveBeenCalled();
  });
});
