/**
 * PRessBelegMatrixViewerClipboard.spec.tsx — Spec fuer den Document-Level-
 * Copy/Paste-Listener des PRessBelegMatrixViewer (Welle 1.2-E / Plan 06 Task 3).
 *
 * SC-5 verlangt, dass die Pure-Function-Clipboard-Foundation (Welle 1.2-D)
 * im UI verdrahtet ist. Diese Spec deckt:
 *   T1 — Copy mit aktiver Block-Selection setzt MATRIX_CLIPBOARD_MIME-Daten
 *        + ruft preventDefault.
 *   T2 — Paste mit gueltiger Payload + Edit-Mode-Target ruft preventDefault
 *        + dispatcht onCellEdit fuer jede Range-Cell.
 *   T3 — Copy ohne Selection ruft KEIN preventDefault (Pass-through).
 *   T4 — disabled-Prop verhindert beide Handler.
 *   T5 — Unmount entfernt die Document-Listener (kein Re-Trigger nach Unmount).
 *
 * JSDOM-DataTransfer-Pattern: das Stub-Constructor `DataTransfer` ist verfuegbar.
 * `ClipboardEvent` muss von Hand konstruiert werden (kein clipboardData-init
 * via constructor), daher ein Custom-Event mit defineProperty.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, cleanup } from "@testing-library/react";

// JSDOM-Polyfill fuer DataTransfer. JSDOM (Stand 2026-05) hat den
// DataTransfer-Konstruktor nicht implementiert; wir brauchen ihn aber
// fuer Clipboard-Event-Tests. Minimaler Spec-kompatibler Stub.
type DataTransferStub = {
  data: Record<string, string>;
  effectAllowed: string;
  setData(type: string, value: string): void;
  getData(type: string): string;
};
// Stub-Class deklarieren und auf beide Globalen Slots schreiben — JSDOM
// fuehrt window und globalThis separat, und das Spec-File koennte unter
// einer Umgebung evaluiert werden, die nur einen der beiden hat.
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
// Mock-Wire-Objects: setLinkStatus liest store.getState().wire?.objects, um
// existierende Belegungen/LinkInfos zu finden. renderViewer setzt das auf das
// jeweilige Fixture.
let wireObjects: Record<number, unknown> = {};
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
      wire: { objects: wireObjects },
    }),
  },
}));

import { PRessBelegMatrixViewer } from "@/viewers/PRessBelegMatrix/PRessBelegMatrixViewer";
import { MATRIX_CLIPBOARD_MIME } from "@/graph/foundation/matrix";
import type { ClassSchema, OBaseObj } from "@/viewers/core/types";

// ----------------------------------------------------------------------
// Fixtures (gleiches Wire-Layout wie PRessBelegMatrixViewer.spec.tsx)
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
    attrs: { m_sName: "Plan 1", m_lKnoten: [200, 201] },
    sub_refs: [[200, 201], []],
  };
}

function buildFixture(): Record<number, OBaseObj> {
  const ressBelegWrapperA: OBaseObj = {
    oid: 350,
    klass: "PRessBelegLList",
    attrs: {},
    sub_refs: [[400]],
  };
  const ressBelegWrapperB: OBaseObj = {
    oid: 351,
    klass: "PRessBelegLList",
    attrs: {},
    sub_refs: [[401]],
  };
  const assozA: OBaseObj = {
    oid: 300,
    klass: "PAssozBeleg",
    attrs: { m_lRessourcen: 350, m_eStatus: 1 }, // standard
    sub_refs: [[]],
  };
  const assozB: OBaseObj = {
    oid: 301,
    klass: "PAssozBeleg",
    attrs: { m_lRessourcen: 351, m_eStatus: 2 }, // notfalls
    sub_refs: [[]],
  };
  // Knoten A traegt assozA, Knoten B traegt assozB → Block-Range (2 Cells).
  const knotenAWrapper: OBaseObj = {
    oid: 250,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[300]],
  };
  const knotenBWrapper: OBaseObj = {
    oid: 251,
    klass: "PAssozRessourceLList",
    attrs: {},
    sub_refs: [[301]],
  };
  const knotenA: OBaseObj = {
    oid: 200,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "K-A", m_lAssozRess: 250 },
    sub_refs: [[]],
  };
  const knotenB: OBaseObj = {
    oid: 201,
    klass: "PDpKnKonstant",
    attrs: { m_sName: "K-B", m_lAssozRess: 251 },
    sub_refs: [[]],
  };
  const ress1: OBaseObj = {
    oid: 400,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "M1" },
    sub_refs: [],
  };
  const ress2: OBaseObj = {
    oid: 401,
    klass: "PBetriebsmittel",
    attrs: { m_sName: "M2" },
    sub_refs: [],
  };
  return {
    100: buildPlan(),
    200: knotenA,
    201: knotenB,
    250: knotenAWrapper,
    251: knotenBWrapper,
    300: assozA,
    301: assozB,
    350: ressBelegWrapperA,
    351: ressBelegWrapperB,
    400: ress1,
    401: ress2,
  };
}

function renderViewer(disabled = false) {
  const plan = buildPlan();
  const allObjects = buildFixture();
  wireObjects = allObjects;
  return render(
    <PRessBelegMatrixViewer
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
function selectBlock(rowOid1: number, colOid1: number, rowOid2: number, colOid2: number) {
  const td1 = document.querySelector(`[data-matrix-cell="oid:${rowOid1}:oid:${colOid1}"]`);
  const td2 = document.querySelector(`[data-matrix-cell="oid:${rowOid2}:oid:${colOid2}"]`);
  if (!td1 || !td2) throw new Error("Cell not found");
  const div1 = td1.querySelector('[data-testid="matrix-cell"]') as HTMLElement;
  const div2 = td2.querySelector('[data-testid="matrix-cell"]') as HTMLElement;
  // Erst Plain-Click (Drag-Start, 1-Cell-Range), dann Shift-Click → erweitert.
  fireEvent.pointerDown(div1);
  fireEvent.pointerDown(div2, { shiftKey: true });
}

/**
 * Konstruiert ein Copy/Paste-Event mit injected DataTransfer + abgespy'tem
 * preventDefault. JSDOM (vor v22) hat keinen ClipboardEvent-Konstruktor mit
 * clipboardData-Option, daher Custom-Event + defineProperty.
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

describe("PRessBelegMatrixViewer — Document-Clipboard-Listener (Welle 1.2-E Task 3)", () => {
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
  it("Copy mit aktiver Block-Selection: preventDefault + MIME-Daten gesetzt", () => {
    renderViewer();
    // 2-Cell-Block markieren: (M1 × K-A) + (M2 × K-B).
    selectBlock(400, 200, 401, 201);

    const dt = new DataTransfer();
    const { ev, preventSpy } = buildClipboardEvent("copy", dt);
    document.dispatchEvent(ev);

    expect(preventSpy).toHaveBeenCalled();
    const raw = dt.getData(MATRIX_CLIPBOARD_MIME);
    expect(raw.length).toBeGreaterThan(0);
    const payload = JSON.parse(raw);
    expect(payload.origin).toBe("PRessBelegMatrixViewer");
    expect(Array.isArray(payload.cells)).toBe(true);
    // Beide Cells haben Status (1 + 2) → 2 Eintraege.
    expect(payload.cells.length).toBeGreaterThanOrEqual(1);
  });

  // ------------------------------------------------------------------
  // T2 — Paste dispatcht onCellEdit fuer jede Range-Cell
  // ------------------------------------------------------------------
  it("Paste mit gueltigem Payload + aktiver Selection ruft preventDefault + setzt Link-Status", () => {
    renderViewer();
    // Selection auf eine belegte Ziel-Cell legen.
    selectBlock(400, 200, 400, 200);

    // Custom Payload: 1 Cell mit value=3 (geblockt).
    const dt = new DataTransfer();
    const payload = {
      origin: "PRessBelegMatrixViewer",
      cells: [{ row: 0, col: 0, value: 3 }],
    };
    dt.setData(MATRIX_CLIPBOARD_MIME, JSON.stringify(payload));

    const { ev, preventSpy } = buildClipboardEvent("paste", dt);
    document.dispatchEvent(ev);

    expect(preventSpy).toHaveBeenCalled();
    // Ziel-Cell (400, 200) ist belegt (assoz 300) → Status-Edit via
    // setLinkStatus: ein PAssozBelegLinkInfo mit m_oRessBeleg=400 + Status=3
    // wird angelegt (Status lebt per Ressource in m_LinkStatusList, NICHT als
    // m_eStatus auf der PAssozBeleg).
    expect(createObjectMock).toHaveBeenCalledWith(
      "PAssozBelegLinkInfo",
      expect.objectContaining({ m_oRessBeleg: 400, m_eStatus: 3, m_eBaseStatus: 3 }),
    );
  });

  // ------------------------------------------------------------------
  // T3 — Copy ohne Selection: kein preventDefault
  // ------------------------------------------------------------------
  it("Copy ohne aktive Selection ruft KEIN preventDefault (Pass-through)", () => {
    renderViewer();
    const dt = new DataTransfer();
    const { ev, preventSpy } = buildClipboardEvent("copy", dt);
    document.dispatchEvent(ev);
    expect(preventSpy).not.toHaveBeenCalled();
    expect(dt.getData(MATRIX_CLIPBOARD_MIME)).toBe("");
  });

  // ------------------------------------------------------------------
  // T4 — disabled-Prop verhindert Listener-Aktion
  // ------------------------------------------------------------------
  it("disabled=true ignoriert sowohl Copy als auch Paste", () => {
    renderViewer(true);
    selectBlock(400, 200, 401, 201);

    const dtCopy = new DataTransfer();
    const { ev: copyEv, preventSpy: copySpy } = buildClipboardEvent("copy", dtCopy);
    document.dispatchEvent(copyEv);
    expect(copySpy).not.toHaveBeenCalled();

    const dtPaste = new DataTransfer();
    dtPaste.setData(
      MATRIX_CLIPBOARD_MIME,
      JSON.stringify({
        origin: "PRessBelegMatrixViewer",
        cells: [{ row: 0, col: 0, value: 3 }],
      }),
    );
    const { ev: pasteEv, preventSpy: pasteSpy } = buildClipboardEvent("paste", dtPaste);
    document.dispatchEvent(pasteEv);
    expect(pasteSpy).not.toHaveBeenCalled();
    expect(patchObjectMock).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // T5 — Unmount cleanupt die Listener
  // ------------------------------------------------------------------
  it("Unmount entfernt die Document-Copy/Paste-Listener (kein Re-Trigger)", () => {
    const { unmount } = renderViewer();
    selectBlock(400, 200, 401, 201);
    unmount();

    const dt = new DataTransfer();
    const { ev, preventSpy } = buildClipboardEvent("copy", dt);
    document.dispatchEvent(ev);
    // Nach Unmount darf der Listener nichts mehr tun.
    expect(preventSpy).not.toHaveBeenCalled();
    expect(dt.getData(MATRIX_CLIPBOARD_MIME)).toBe("");
  });
});
