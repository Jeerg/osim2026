// Plan 01-05 Task 2: Side-Effect-Index fuer Property-Viewer.
//
// MUSS einmal im App-Bootstrap importiert werden
// (`import "@/viewers/property";` in app.tsx oder main.tsx), damit alle
// registerViewer-Calls + TYPE_MAP-Eintraege ausgefuehrt werden.

// TYPE_MAP-Befuellung zuerst — die Viewer rendern OCtrls, die auf die
// Metadaten zugreifen.
import "./type-maps";

// Konkrete ChildDialog-Komponenten.
import "./PGObjBaseViewer";
import "./PSimulatorViewer";
// PDurchlaufplanViewerStd + AGruppeViewer: siehe Task 3.

// Re-Exports fuer direkten Import in Tests / sonstigen Konsumenten.
export { PGObjBaseViewer } from "./PGObjBaseViewer";
export { PSimulatorViewer } from "./PSimulatorViewer";
export {
  getDefaultProperties,
  registerDefaults,
  registerKlass,
} from "./type-maps";
