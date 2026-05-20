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
import "./PDurchlaufplanViewerStd";
import "./AGruppeViewer";

// Matrix-Viewer (Plan 01-06). Eigener Folder, aber via Side-Effect-Re-
// Export hier eingebunden, damit der bestehende main.tsx-Import
// (`import "@/viewers/property"`) auch die Matrix-Viewer auf einmal
// aktiviert. Spaetere Plan-07/Plan-08-Viewer schliessen analog an.
import "@/viewers/matrix";

// Design-Viewer (Plan 01-07). Analog Matrix-Viewer: eigener Folder,
// Side-Effect-Import zum Aktivieren der Registry-Eintraege.
import "@/viewers/design";

// Verknuepfungs-Viewer (Plan 01-08): PDlplBetriebsmittel + PDlplPersonal.
// Cross-Tree-Editoren Knoten × Ressource.
import "@/viewers/linking";

// Re-Exports fuer direkten Import in Tests / sonstigen Konsumenten.
export { PGObjBaseViewer } from "./PGObjBaseViewer";
export { PSimulatorViewer } from "./PSimulatorViewer";
export { PDurchlaufplanViewerStd } from "./PDurchlaufplanViewerStd";
export { AGruppeViewer } from "./AGruppeViewer";
export {
  getDefaultProperties,
  registerDefaults,
  registerKlass,
} from "./type-maps";
