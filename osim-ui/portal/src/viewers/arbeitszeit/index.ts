// Plan 01-08 Task 2: Side-Effect-Index fuer Arbeitszeit-Viewer.
//
// Wird ueber @/viewers/property/index.ts beim App-Start importiert,
// triggert die registerViewer-Calls.

import "./AEinsatzWunschViewer";
import "./AKapBedViewer";

export { AEinsatzWunschViewer } from "./AEinsatzWunschViewer";
export { AKapBedViewer } from "./AKapBedViewer";
export {
  WEEKDAYS,
  WEEKDAY_INDICES,
  HOURS_OF_DAY,
  formatSecondsAsTime,
  formatTimeRange,
  formatHourLabel,
  parseEinsatzWuensche,
  isWunschActive,
  type EinsatzWunschSlot,
  type Weekday,
} from "./schicht-helpers";
