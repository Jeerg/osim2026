import type { ComponentType } from "react";
import type { ObjectKlass, ViewerHint, ViewerProps } from "@/viewers/core/types";

/**
 * Registrierung eines Viewer-Components für eine Objektklasse (optional mit
 * Hint-Variante).
 */
export interface ViewerEntry {
  klass: ObjectKlass;
  hint?: ViewerHint;
  Component: ComponentType<ViewerProps>;
}

/**
 * Map: (objKlass, viewerHint?) → React-Component
 *
 * Ersetzt das MFC-`IMPLEMENT_DYNCREATE` + ID-Lookup aus dem C++-Original
 * (siehe `OSim2004/inc/idObjectBase.h`). Resolution-Reihenfolge:
 *   1. exact match (klass + hint)
 *   2. klass-only Eintrag (hint=undefined)
 *   3. Fallback-Component (in Plan 07 wird das `PGObjBaseViewer` — generischer
 *      Property-Editor, der jede Klasse über das Schema rendern kann)
 *   4. undefined (kein Viewer verfügbar → ViewerFrame zeigt EmptyState)
 */
export class ViewerRegistry {
  private entries: ViewerEntry[] = [];
  private fallback?: ComponentType<ViewerProps>;

  register(entry: ViewerEntry): void {
    this.entries.push(entry);
  }

  setFallback(C: ComponentType<ViewerProps>): void {
    this.fallback = C;
  }

  resolve(
    klass: ObjectKlass,
    hint?: ViewerHint,
  ): ComponentType<ViewerProps> | undefined {
    // 1. exact match (klass + hint)
    if (hint !== undefined) {
      const exact = this.entries.find(
        (e) => e.klass === klass && e.hint === hint,
      );
      if (exact) return exact.Component;
    }
    // 2. klass-only (Eintrag ohne hint)
    const klassOnly = this.entries.find(
      (e) => e.klass === klass && e.hint === undefined,
    );
    if (klassOnly) return klassOnly.Component;
    // 3. Fallback
    return this.fallback;
  }

  /**
   * Test-Hilfe: löscht alle Einträge und den Fallback. In Produktiv-Code
   * nicht zu verwenden — die Registry ist ein Modul-Singleton, der einmal
   * beim App-Start gefüllt wird.
   */
  clear(): void {
    this.entries = [];
    this.fallback = undefined;
  }
}

/**
 * Modul-Singleton. App-Bootstrap (Plan 07) registriert hier alle konkreten
 * Viewer (PSimulatorViewer, PDurchlaufplanViewerStd, …).
 */
export const viewerRegistry = new ViewerRegistry();
