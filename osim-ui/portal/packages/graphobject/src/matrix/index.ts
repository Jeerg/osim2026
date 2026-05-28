/**
 * Barrel-Export für die Matrix-Foundation (Welle 1.2-A+).
 *
 * Konsumenten (PRessBelegMatrixViewer in Welle 1.2-E + folgende
 * Matrix-Viewer) importieren ausschließlich von hier:
 *
 *   import { MatrixGrid, MatrixCell } from ".";
 *   import type { MatrixGridProps, MatrixCellProps } from ".";
 *
 * Folgewellen erweitern dieses Barrel:
 *   - 1.2-B: `useInlineCellEdit` (Inline-Edit-State-Machine).
 *   - 1.2-C: `useBlockSelection` + Pure-Functions (`computeCellRange`, …).
 *   - 1.2-D: `matrix-clipboard` (Serialize/Deserialize via DataTransfer).
 */

// Welle 1.2-A Task 1
export { MatrixGrid } from "./MatrixGrid";
export type { MatrixGridProps } from "./MatrixGrid";

// Welle 1.2-A Task 2
export { MatrixCell } from "./MatrixCell";
export type { MatrixCellProps } from "./MatrixCell";

// Welle 1.2-B Task 1 — Inline-Cell-Edit-Hook
export {
  useInlineCellEdit,
  parseRaw,
} from "./useInlineCellEdit";
export type {
  UseInlineCellEditOptions,
  UseInlineCellEditResult,
  OctrlType,
  ValueType,
  EnumOption,
} from "./useInlineCellEdit";

// Welle 1.2-C Task 1 — Block-Selection-Hook + Pure-Functions
export {
  useBlockSelection,
  computeCellRange,
  isInRange,
  extendSelection,
  toggleCellInSelection,
  cellKey,
} from "./useBlockSelection";
export type {
  CellRef,
  CellRange,
  BlockSelection,
  UseBlockSelectionResult,
} from "./useBlockSelection";

// Welle 1.2-D Task 1 — Clipboard-Format + DataTransfer-IO
export {
  MATRIX_CLIPBOARD_MIME,
  serializeClipboard,
  deserializeClipboard,
  writeToDataTransfer,
  readFromDataTransfer,
  checkOriginCompatible,
} from "./matrix-clipboard";
export type {
  MatrixClipboardCell,
  MatrixClipboardPayload,
} from "./matrix-clipboard";
