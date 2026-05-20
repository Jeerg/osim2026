// Plan 01-08 Task 1: Side-Effect-Index fuer Verknuepfungs-Viewer.
//
// Side-Effect-Import in @/viewers/property/index.ts aktiviert die
// registerViewer-Calls bei App-Start.

import "./PDlplBetriebsmittelViewer";
import "./PDlplPersonalViewer";

export { PDlplBetriebsmittelViewer } from "./PDlplBetriebsmittelViewer";
export { PDlplPersonalViewer } from "./PDlplPersonalViewer";
