/**
 * matrix-clipboard.spec.ts — Vitest-Specs für Welle 1.2-D.
 *
 * Verifiziert Serialize/Deserialize-Round-Trip, defensive JSON-Parser,
 * DataTransfer-IO (Mock-Klasse — jsdom liefert keinen DataTransfer-Konstruktor)
 * und Cross-Viewer-Origin-Compat-Helper.
 *
 * Plan-Vorgabe: ≥8 Specs. Implementierung: 12 Specs (alle Branches der
 * defensiven Deserialize-Pipeline + 3 Origin-Compat-Cases + structuredClone-
 * Disziplin-Assertion).
 */

import { describe, expect, it, vi } from "vitest";

import {
  MATRIX_CLIPBOARD_MIME,
  checkOriginCompatible,
  deserializeClipboard,
  readFromDataTransfer,
  serializeClipboard,
  writeToDataTransfer,
  type MatrixClipboardPayload,
} from "@/graph/foundation/matrix/matrix-clipboard";

// ----------------------------------------------------------------------
// Mock-DataTransfer (jsdom hat keinen DataTransfer-Konstruktor).
// Konsumenten-Vertrag-relevante Properties: setData(type, value),
// getData(type), effectAllowed.
// ----------------------------------------------------------------------

class MockDataTransfer {
  private data = new Map<string, string>();
  public effectAllowed: string = "";
  setData(t: string, v: string): void {
    this.data.set(t, v);
  }
  getData(t: string): string {
    return this.data.get(t) ?? "";
  }
  /** Test-Helper — direkter Map-Inspekt für Assertions. */
  hasType(t: string): boolean {
    return this.data.has(t);
  }
  listTypes(): string[] {
    return Array.from(this.data.keys());
  }
}

describe("matrix-clipboard", () => {
  // ------------------------------------------------------------------
  // Konstante
  // ------------------------------------------------------------------

  it("Test 1: MATRIX_CLIPBOARD_MIME ist der vereinbarte Custom-MIME-Type", () => {
    expect(MATRIX_CLIPBOARD_MIME).toBe("application/x-osim-matrix-cells");
  });

  // ------------------------------------------------------------------
  // Serialize / Deserialize
  // ------------------------------------------------------------------

  it("Test 2: serializeClipboard liefert valides JSON mit origin + cells", () => {
    const raw = serializeClipboard({
      origin: "X",
      cells: [{ row: 0, col: 0, value: 42 }],
    });
    expect(typeof raw).toBe("string");
    const parsed = JSON.parse(raw) as MatrixClipboardPayload<number>;
    expect(parsed.origin).toBe("X");
    expect(parsed.cells).toEqual([{ row: 0, col: 0, value: 42 }]);
  });

  it("Test 3: Round-Trip — deserialize(serialize(p)) ist deep-equal zu p", () => {
    const payload: MatrixClipboardPayload<{ status: string }> = {
      origin: "PRessBelegMatrixViewer",
      cells: [
        { row: 0, col: 0, value: { status: "PREFER" } },
        { row: 1, col: 2, value: { status: "BLOCKED" } },
        { row: 2, col: 1, value: { status: "STD" } },
      ],
    };
    const raw = serializeClipboard(payload);
    const back = deserializeClipboard<{ status: string }>(raw);
    expect(back).toEqual(payload);
  });

  it("Test 4: deserializeClipboard returnt null bei nicht-JSON-String (kein Throw)", () => {
    expect(deserializeClipboard("nicht-json")).toBeNull();
    expect(deserializeClipboard("")).toBeNull();
    expect(deserializeClipboard("{unclosed")).toBeNull();
  });

  it("Test 5: deserializeClipboard returnt null wenn origin nicht-string", () => {
    expect(deserializeClipboard('{"origin":42,"cells":[]}')).toBeNull();
    expect(deserializeClipboard('{"origin":null,"cells":[]}')).toBeNull();
    expect(deserializeClipboard('{"cells":[]}')).toBeNull(); // origin fehlt
  });

  it("Test 6: deserializeClipboard returnt null wenn cells nicht-array", () => {
    expect(deserializeClipboard('{"origin":"X","cells":"nope"}')).toBeNull();
    expect(deserializeClipboard('{"origin":"X","cells":null}')).toBeNull();
    expect(deserializeClipboard('{"origin":"X"}')).toBeNull(); // cells fehlt
  });

  it("Test 6b: deserializeClipboard returnt null wenn eine Cell row/col nicht-number", () => {
    expect(
      deserializeClipboard('{"origin":"X","cells":[{"row":"0","col":0,"value":1}]}'),
    ).toBeNull();
    expect(
      deserializeClipboard('{"origin":"X","cells":[{"col":0,"value":1}]}'),
    ).toBeNull(); // row fehlt
    expect(deserializeClipboard('{"origin":"X","cells":[null]}')).toBeNull();
  });

  // ------------------------------------------------------------------
  // DataTransfer-IO
  // ------------------------------------------------------------------

  it("Test 7: writeToDataTransfer setzt Custom-MIME + effectAllowed='copy' + KEIN Plain-Text-Fallback", () => {
    const dt = new MockDataTransfer();
    const spy = vi.spyOn(dt, "setData");
    writeToDataTransfer(dt as unknown as DataTransfer, {
      origin: "X",
      cells: [{ row: 0, col: 0, value: "v" }],
    });
    expect(dt.effectAllowed).toBe("copy");
    // setData wurde GENAU 1× mit MATRIX_CLIPBOARD_MIME aufgerufen.
    const mimeCalls = spy.mock.calls.filter(
      (c) => c[0] === MATRIX_CLIPBOARD_MIME,
    );
    expect(mimeCalls).toHaveLength(1);
    expect(typeof mimeCalls[0][1]).toBe("string");
    // KEIN setData("text/plain", ...) — T-01.2-10 Information-Disclosure-
    // Mitigation: Custom-MIME verhindert dass externe Apps (Excel etc.)
    // den Inhalt lesen, Plain-Text-Fallback würde diese Mitigation aufheben.
    expect(dt.hasType("text/plain")).toBe(false);
    expect(dt.listTypes()).toEqual([MATRIX_CLIPBOARD_MIME]);
  });

  it("Test 8: readFromDataTransfer liest geschriebenen Payload zurück; leerer MIME → null", () => {
    const dt = new MockDataTransfer();
    const payload: MatrixClipboardPayload<number> = {
      origin: "PRessMengeMatrixViewer",
      cells: [{ row: 3, col: 7, value: 99 }],
    };
    writeToDataTransfer(dt as unknown as DataTransfer, payload);
    const back = readFromDataTransfer<number>(dt as unknown as DataTransfer);
    expect(back).toEqual(payload);
    // Fresh DataTransfer ohne MIME → null (kein Throw).
    const dt2 = new MockDataTransfer();
    expect(
      readFromDataTransfer<number>(dt2 as unknown as DataTransfer),
    ).toBeNull();
  });

  // ------------------------------------------------------------------
  // structuredClone-Disziplin
  // ------------------------------------------------------------------

  it("Test 9: Mutation des Source-Cells-Arrays nach serialize beeinflusst den serialisierten String NICHT", () => {
    const cells = [{ row: 0, col: 0, value: { tag: "original" } }];
    const payload: MatrixClipboardPayload<{ tag: string }> = {
      origin: "X",
      cells,
    };
    const raw = serializeClipboard(payload);
    // Mutiere Source nach Serialize.
    cells[0].value.tag = "mutated";
    cells.push({ row: 1, col: 1, value: { tag: "added" } });
    // Re-deserialize: muss original snapshot ergeben.
    const back = deserializeClipboard<{ tag: string }>(raw);
    expect(back?.cells).toHaveLength(1);
    expect(back?.cells[0].value.tag).toBe("original");
  });

  // ------------------------------------------------------------------
  // checkOriginCompatible
  // ------------------------------------------------------------------

  it("Test 10: checkOriginCompatible — gleicher Origin ist immer kompatibel", () => {
    expect(checkOriginCompatible("X", "X")).toBe(true);
    expect(
      checkOriginCompatible(
        "PRessBelegMatrixViewer",
        "PRessBelegMatrixViewer",
      ),
    ).toBe(true);
  });

  it("Test 11: checkOriginCompatible — verschiedene Origins ohne compatMap → false", () => {
    expect(checkOriginCompatible("X", "Y")).toBe(false);
    expect(
      checkOriginCompatible(
        "PRessBelegMatrixViewer",
        "PRessMengeMatrixViewer",
      ),
    ).toBe(false);
  });

  it("Test 12: checkOriginCompatible — compatMap erlaubt Cross-Viewer-Paste explizit", () => {
    const compat: Record<string, string[]> = {
      Y: ["X", "Z"],
    };
    expect(checkOriginCompatible("X", "Y", compat)).toBe(true);
    expect(checkOriginCompatible("Z", "Y", compat)).toBe(true);
    expect(checkOriginCompatible("W", "Y", compat)).toBe(false);
    // Target NICHT in der Map → false (kein default-true)
    expect(checkOriginCompatible("X", "ZZ", compat)).toBe(false);
  });
});
