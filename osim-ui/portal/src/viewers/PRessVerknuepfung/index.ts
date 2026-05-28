/**
 * Barrel-Export für PRessVerknuepfung-Viewer (Welle 1.2-G).
 *
 * Siehe `01.2-08-CPP-AUDIT.md` für die Pipeline-Vorlage aus
 * `PRessVerknuepfungViewer.cpp` und `01.2-SCHEMA-MAP.md` für die
 * Wrapper-Indirektion (PAssozRessourceLList / PRessBelegLList).
 *
 * Der `useSimulationListener`-Hook wird aus Welle 1.2-F
 * (`PDlplConnKnotenViewer`) re-used — single source of truth.
 */

export { PRessVerknuepfungViewer } from "./PRessVerknuepfungViewer";
export { KennzahlSlotPlaceholder } from "./KennzahlSlotPlaceholder";
