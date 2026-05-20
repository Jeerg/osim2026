// Plan 01-06 Task 2: Side-Effect-Index fuer Matrix-Viewer.
//
// MUSS einmal im App-Bootstrap importiert werden (geschieht ueber
// `import "@/viewers/property";` in main.tsx, das wiederum hierhin
// re-exportiert). Triggert alle registerViewer-Calls.

// Konkrete Matrix-Viewer (Side-Effect-Registrierung).
import "./PRessBelegMatrixViewer";
import "./PRessMengeMatrixViewer";
import "./PRessVerknuepfungViewer";

// Re-Exports fuer Tests / Direct-Konsumenten.
export { MatrixGrid, type MatrixGridProps } from "./MatrixGrid";
export {
  getAllOfKlass,
  getAllRessources,
  extractScheduleColumns,
  isGroupNode,
  type ScheduleColumn,
} from "./matrix-helpers";
export {
  SYNTHETIC_RESS_BELEG_OID,
  SYNTHETIC_RESS_BELEG_KLASS,
  SYNTHETIC_RESS_MENGE_OID,
  SYNTHETIC_RESS_MENGE_KLASS,
  SYNTHETIC_RESS_VERKN_OID,
  SYNTHETIC_RESS_VERKN_KLASS,
  SYNTHETIC_MATRIX_NODES,
  getSyntheticNode,
  isSyntheticOid,
  type SyntheticMatrixNode,
} from "./synthetic-nodes";
export { PRessBelegMatrixViewer } from "./PRessBelegMatrixViewer";
export { PRessMengeMatrixViewer } from "./PRessMengeMatrixViewer";
export { PRessVerknuepfungViewer } from "./PRessVerknuepfungViewer";
