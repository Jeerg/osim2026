// Plan 01-04 Task 2: Viewer-Registry.
//
// Mappt Klassen-Name -> ChildDialog-Komponente. ClientCtrl konsultiert
// die Registry bei jedem setObj()-Aufruf, um den passenden Dialog zu
// finden. Plan 05+ registriert hier ihre konkreten ChildDialogs.
//
// Fallback-Pattern: Wenn fuer eine Klasse kein Viewer registriert ist,
// liefert getViewer(klass) null; ClientCtrl/ViewerHost faellt dann auf
// PGObjBaseViewer zurueck (Plan 05).

import type { ChildDialogComponent, Klass, ViewerRegistration } from "./types";

const _registry = new Map<Klass, ViewerRegistration>();

/**
 * Registriere eine ChildDialog-Komponente fuer eine OSim-Klasse.
 *
 * Bei doppelter Registrierung wird der vorherige Eintrag ueberschrieben;
 * Warnung in der Konsole. (Phase 1 hat keine Priority-basierte Merge-Logik —
 * Plan 09+ kann das nachziehen, sobald Sub-Viewer/Variant-Viewer benoetigt
 * werden.)
 */
export function registerViewer(reg: ViewerRegistration): void {
  if (_registry.has(reg.klass)) {
    console.warn(
      `viewer-registry: ${reg.klass} ueberschrieben (alt: ` +
        `${_registry.get(reg.klass)?.displayName}, neu: ${reg.displayName})`,
    );
  }
  _registry.set(reg.klass, reg);
}

/**
 * Hole die registrierte ChildDialog-Komponente fuer eine Klasse.
 * Liefert null wenn nichts registriert ist; Caller faellt typischerweise
 * auf PGObjBase zurueck (Plan 05).
 */
export function getViewer(klass: Klass): ChildDialogComponent | null {
  return _registry.get(klass)?.component ?? null;
}

/**
 * Liefert die volle ViewerRegistration (inkl. displayName + priority) —
 * nuetzlich fuer Diagnose-UIs.
 */
export function getViewerRegistration(klass: Klass): ViewerRegistration | null {
  return _registry.get(klass) ?? null;
}

/** Alle registrierten Klassen, alphabetisch sortiert. */
export function getRegisteredKlasses(): Klass[] {
  return Array.from(_registry.keys()).sort();
}

/**
 * Test-Helper — leert die Registry. NUR fuer Unit-Tests verwenden.
 * Produktiv-Code darf das nicht benutzen.
 */
export function _clearRegistryForTests(): void {
  _registry.clear();
}
