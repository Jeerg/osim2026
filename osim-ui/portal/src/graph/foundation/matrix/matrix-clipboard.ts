/**
 * matrix-clipboard — Clipboard-Format + DataTransfer-IO für Matrix-Foundation
 * (Welle 1.2-D).
 *
 * Standardisiertes JSON-Format in einem Custom-MIME-Type für Cross-Viewer-
 * Block-Copy/Paste. Pattern existiert bereits in
 * `portal/src/viewers/PDurchlaufplan/PlanToolbar.tsx` (Welle G17-A, Z.78)
 * für Knoten/Kanten-Drag via `application/x-osim-plan-toolbar` — hier:
 * derselbe Mechanismus für Matrix-Cells via
 * `application/x-osim-matrix-cells`.
 *
 * Architektur (CONTEXT D-6):
 *   - JSON-Payload `{ origin, cells: [{ row, col, value }] }`.
 *   - `row`/`col` sind RELATIVE Offsets zum Block-Ursprung (analog
 *     C++ `PRessBelegMatrix_CellCopyStruct::relpoint` =
 *     `m_pRPos = absolutePoint - originPoint`, siehe
 *     `PRessBelegMatrixViewer.cpp` Z.1079 `CopyCell2Buffer` und
 *     Z.1129 `PasteCell` mit `rasterpoint = org + cell.m_pRPos`).
 *   - Custom-MIME verhindert, dass externe Apps (Excel etc.) den Inhalt
 *     lesen; KEIN `text/plain`-Fallback (T-01.2-10 Information-
 *     Disclosure-Mitigation).
 *   - `checkOriginCompatible` ist Pure-Function — Konsument entscheidet
 *     vor `patchObject`/`createObject`, ob ein Cross-Viewer-Paste
 *     erlaubt ist (T-01.2-11 Tampering-Mitigation).
 *
 * NICHT in diesem Modul:
 *   - `navigator.clipboard.read/write`-Wrapper — DataTransfer reicht
 *     für Copy/Paste-via-Browser-Events (DragStart/Drop, Cut/Copy/Paste-
 *     ClipboardEvent.clipboardData). Globaler Clipboard-Read in einem
 *     DOM ohne aktive Drag ist Phase-1.3-Backlog.
 *   - Persistenz der Cells über Tab-Schließung — DataTransfer ist tab-
 *     /event-lokal, Browser-Clipboard wäre extra Story.
 *   - Cell-Werte-Validierung (Wire-Schema) — Konsument prüft Werte
 *     vor dem Paste; Foundation parst nur Struktur.
 */

// --------------------------- Konstante --------------------------------

/** Custom-MIME-Type für Cell-Block-Clipboard-Payloads. */
export const MATRIX_CLIPBOARD_MIME = "application/x-osim-matrix-cells";

// ----------------------------- Types ----------------------------------

/**
 * Eine einzelne kopierte Cell mit relativem Offset zum Block-Ursprung.
 *
 * `row`/`col` sind RELATIVE Integer-Offsets — beim Paste an Ziel-Position
 * `(targetRow, targetCol)` wird die Cell auf
 * `(targetRow + row, targetCol + col)` plaziert (analog
 * C++ `rasterpoint = org + cell.m_pRPos`).
 */
export interface MatrixClipboardCell<TVal = unknown> {
  row: number;
  col: number;
  value: TVal;
}

/**
 * Vollständiger Clipboard-Payload. `origin` ist der Viewer-Klass-Name
 * (z.B. `"PRessBelegMatrixViewer"`) — wird vom Konsumenten beim Paste
 * via `checkOriginCompatible` gegen den Ziel-Viewer geprüft.
 */
export interface MatrixClipboardPayload<TVal = unknown> {
  origin: string;
  cells: MatrixClipboardCell<TVal>[];
}

// --------------------- Serialize / Deserialize ------------------------

/**
 * Serialisiert einen Payload zu JSON-String. `cells` wird via
 * `structuredClone` kopiert, damit nachträgliche Mutationen am Source-
 * Array den serialisierten String nicht beeinflussen — Pattern-Disziplin
 * 1:1 aus `portal/src/snapshot/snapshot-service.ts` (Wire-Snapshots
 * kopieren ebenfalls, um Live-Refs zu vermeiden).
 */
export function serializeClipboard<TVal>(
  payload: MatrixClipboardPayload<TVal>,
): string {
  return JSON.stringify({
    origin: payload.origin,
    cells: structuredClone(payload.cells),
  });
}

/**
 * Parsen eines Clipboard-JSON-Strings. Defensive Pipeline — bei JEDEM
 * Form-Fehler returnt `null` statt zu werfen (T-01.2-12 Tampering-
 * Mitigation, Konsument darf rohe DataTransfer-Daten füttern ohne
 * vorherigen try/catch).
 *
 * Geprüft wird:
 *   1. Input ist nicht-leerer String.
 *   2. `JSON.parse` wirft nicht (sonst null).
 *   3. Resultat ist non-null Object.
 *   4. `origin` ist string.
 *   5. `cells` ist Array.
 *   6. Jede Cell ist non-null Object mit numerischem `row` UND `col`.
 *
 * Cell-`value` wird NICHT validiert — die Foundation kennt das Wire-
 * Schema nicht. Konsument validiert vor Paste-Anwendung.
 */
export function deserializeClipboard<TVal>(
  raw: string,
): MatrixClipboardPayload<TVal> | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.origin !== "string") return null;
  if (!Array.isArray(p.cells)) return null;
  for (const c of p.cells) {
    if (typeof c !== "object" || c === null) return null;
    const cc = c as Record<string, unknown>;
    if (typeof cc.row !== "number" || typeof cc.col !== "number") return null;
  }
  return p as unknown as MatrixClipboardPayload<TVal>;
}

// ------------------------- DataTransfer-IO ----------------------------

/**
 * Schreibt einen Payload in den DataTransfer (DragStart/Copy-Event-
 * Handler). Setzt:
 *   - `effectAllowed = "copy"` (Browser zeigt Copy-Cursor)
 *   - `setData(MATRIX_CLIPBOARD_MIME, serializeClipboard(payload))`
 *
 * BEWUSST KEIN `setData("text/plain", ...)` — T-01.2-10:
 * Custom-MIME isoliert den Payload von externen Apps (Excel würde
 * Plain-Text lesen und Inhalte sichtbar machen). Wenn der Konsument
 * explizit Cross-App-Export braucht, muss er einen TSV-Generator
 * separat aufrufen (out-of-scope für Welle D).
 */
export function writeToDataTransfer<TVal>(
  dt: DataTransfer,
  payload: MatrixClipboardPayload<TVal>,
): void {
  dt.effectAllowed = "copy";
  dt.setData(MATRIX_CLIPBOARD_MIME, serializeClipboard(payload));
}

/**
 * Liest einen Payload aus dem DataTransfer zurück (Drop/Paste-Event-
 * Handler). Returnt `null`, wenn der Custom-MIME-Type nicht vorhanden
 * ODER der Inhalt malformed ist (`deserializeClipboard` ist defensiv).
 */
export function readFromDataTransfer<TVal>(
  dt: DataTransfer,
): MatrixClipboardPayload<TVal> | null {
  const raw = dt.getData(MATRIX_CLIPBOARD_MIME);
  if (!raw) return null;
  return deserializeClipboard<TVal>(raw);
}

// ----------------------- Cross-Viewer-Compat --------------------------

/**
 * Cross-Viewer-Origin-Compat-Check. Pure-Function — Konsument
 * entscheidet, ob ein Paste erlaubt ist.
 *
 * Regeln:
 *   1. `payloadOrigin === targetOrigin` → IMMER true (Same-Viewer-Paste).
 *   2. Sonst: `compatMap[targetOrigin]?.includes(payloadOrigin)` → true.
 *   3. Sonst: false (default-deny).
 *
 * Beispiel (`PRessBelegMatrixViewer` kann von sich selbst pasten,
 * aber nicht von einem hypothetischen `PRessMengeMatrixViewer`):
 *
 * ```ts
 * checkOriginCompatible("PRessBelegMatrixViewer", "PRessBelegMatrixViewer");
 * // → true
 *
 * checkOriginCompatible("PRessMengeMatrixViewer", "PRessBelegMatrixViewer");
 * // → false (verschiedene Zellen-Semantik)
 *
 * checkOriginCompatible("PRessBelegMatrixViewer", "PRessVerknuepfungViewer", {
 *   PRessVerknuepfungViewer: ["PRessBelegMatrixViewer"],
 * });
 * // → true (Konsument hat explizit erlaubt)
 * ```
 */
export function checkOriginCompatible(
  payloadOrigin: string,
  targetOrigin: string,
  compatMap?: Record<string, string[]>,
): boolean {
  if (payloadOrigin === targetOrigin) return true;
  if (!compatMap) return false;
  return compatMap[targetOrigin]?.includes(payloadOrigin) ?? false;
}
