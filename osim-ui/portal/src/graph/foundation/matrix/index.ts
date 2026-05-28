/**
 * Barrel-Export für die Matrix-Foundation (Welle 1.2-A+).
 *
 * Konsumenten (PRessBelegMatrixViewer in Welle 1.2-E + folgende
 * Matrix-Viewer) importieren ausschließlich von hier:
 *
 *   import { MatrixGrid, MatrixCell } from "@/graph/foundation/matrix";
 *   import type { MatrixGridProps, MatrixCellProps } from "@/graph/foundation/matrix";
 *
 * Folgewellen erweitern dieses Barrel:
 *   - 1.2-B: `useInlineCellEdit` (Inline-Edit-State-Machine).
 *   - 1.2-C: `useBlockSelection` + Pure-Functions (`computeCellRange`, …).
 *   - 1.2-D: `matrix-clipboard` (Serialize/Deserialize via DataTransfer).
 */

// Welle 1.2-A Task 1
export { MatrixGrid } from "@/graph/foundation/matrix/MatrixGrid";
export type { MatrixGridProps } from "@/graph/foundation/matrix/MatrixGrid";

// Welle 1.2-A Task 2
export { MatrixCell } from "@/graph/foundation/matrix/MatrixCell";
export type { MatrixCellProps } from "@/graph/foundation/matrix/MatrixCell";

// Welle 1.2-B Task 1 — Inline-Cell-Edit-Hook
export {
  useInlineCellEdit,
  parseRaw,
} from "@/graph/foundation/matrix/useInlineCellEdit";
export type {
  UseInlineCellEditOptions,
  UseInlineCellEditResult,
  OctrlType,
  ValueType,
  EnumOption,
} from "@/graph/foundation/matrix/useInlineCellEdit";

// Welle 1.2-C Task 1 — Block-Selection-Hook + Pure-Functions
export {
  useBlockSelection,
  computeCellRange,
  isInRange,
  extendSelection,
  toggleCellInSelection,
  cellKey,
} from "@/graph/foundation/matrix/useBlockSelection";
export type {
  CellRef,
  CellRange,
  BlockSelection,
  UseBlockSelectionResult,
} from "@/graph/foundation/matrix/useBlockSelection";

// Welle 1.2-D Task 1 — Clipboard-Format + DataTransfer-IO
export {
  MATRIX_CLIPBOARD_MIME,
  serializeClipboard,
  deserializeClipboard,
  writeToDataTransfer,
  readFromDataTransfer,
  checkOriginCompatible,
} from "@/graph/foundation/matrix/matrix-clipboard";
export type {
  MatrixClipboardCell,
  MatrixClipboardPayload,
} from "@/graph/foundation/matrix/matrix-clipboard";
