// Plan 01-04 Task 2: ClientCtrl — TS-Klasse (KEIN React).
//
// Bildet OViewer.h Abschnitt 2.2 + 3.2-3.3 ab:
// - haelt `current`-Objekt + `childDialogKlass`
// - bei setObj(): prueft store() (Phase 1 immer true), waehlt ggf. neuen
//   ChildDialog ueber viewer-registry, triggert frame.update()
// - pickChildDialog(): delegiert an getViewer(klass); Fallback auf
//   PGObjBase wird via Konstanten-Name dargestellt — die konkrete
//   Komponenten-Registrierung passiert in Plan 05.
//
// Phase-1-Vereinfachung: store() liefert IMMER true zurueck. Echte
// Validierung+Persistenz laeuft via model-store; ein expliziter Store-Flush
// pro Dialog wird in Plan 09 ergaenzt, falls noetig.

import { getViewer } from "./viewer-registry";
import type {
  ChildDialogComponent,
  ChildDialogSelection,
  Klass,
  OtxJsonNode,
} from "./types";

/** Konvention: Fallback-Klasse fuer noch nicht registrierte Klassen. */
export const FALLBACK_KLASS: Klass = "PGObjBase";

export class ClientCtrl {
  current: OtxJsonNode | null = null;
  childDialogKlass: Klass | null = null;
  /**
   * Markiert, ob der gerade geladene Dialog der Fallback ist (PGObjBase).
   * Wird in ViewerHost und in Tests genutzt.
   */
  isFallback = false;

  // Lazy-Imported circular: ViewerFrame importiert ClientCtrl. Wir nehmen
  // im Konstruktor nur die minimale Schnittstelle ("ein Objekt mit
  // update()-Methode"), um Circular-Import-Probleme zu vermeiden.
  constructor(
    private readonly _frame: { update: () => void },
  ) {}

  /**
   * OViewer.h 3.3 SET-OBJ-Routing.
   * @returns true wenn das Setzen geklappt hat; false wenn der bisherige
   *          Inhalt nicht gestored werden konnte (Phase 1: nie false).
   */
  setObj(obj: OtxJsonNode | null): boolean {
    if (!this.store()) return false;
    this.current = obj;
    if (obj) {
      // Pruefen ob der bisherige ChildDialog noch passt (gleiche klass).
      // Wenn nicht, neu auswaehlen.
      if (this.childDialogKlass !== obj.klass) {
        this._pickChildDialogForCurrent();
      }
    } else {
      this.childDialogKlass = null;
      this.isFallback = false;
    }
    this._frame.update();
    return true;
  }

  /**
   * OViewer.h 3.3 b) OViewStore — Inhalt zurueck in das aktuelle Objekt
   * schreiben. Phase 1: alle Edits laufen sofort durch onPropertyChange
   * in den model-store, deshalb gibt es hier nichts zu flushen.
   * Plan 09 kann das fuer batched-Edits erweitern.
   */
  store(): boolean {
    return true;
  }

  /**
   * Triggert ein Re-Render des Hosts. Wird benutzt, wenn sich am
   * `current`-Objekt extern (z.B. via undo()) etwas geaendert hat.
   */
  update(): void {
    this._frame.update();
  }

  /**
   * Liefert die ChildDialog-Komponente fuer eine Klasse. Fallback auf
   * PGObjBase wenn nichts registriert. Wenn auch das Fallback fehlt
   * (Phase 1 noch nicht registriert), wird null zurueckgegeben — der
   * Host muss dann eine Inline-EmptyState anzeigen.
   */
  pickChildDialog(klass: Klass): ChildDialogComponent | null {
    const direct = getViewer(klass);
    if (direct) return direct;
    return getViewer(FALLBACK_KLASS);
  }

  /**
   * Liefert eine reine Datenstruktur, die beschreibt, welcher Dialog
   * gerade ausgewaehlt ist. Praktisch fuer Tests + Diagnose-UIs.
   */
  describeSelection(): ChildDialogSelection | null {
    if (!this.childDialogKlass) return null;
    const component = this.pickChildDialog(this.childDialogKlass);
    return {
      klass: this.childDialogKlass,
      componentName:
        component?.displayName ?? component?.name ?? "<unknown>",
      fallback: this.isFallback,
    };
  }

  // --- private ---

  private _pickChildDialogForCurrent(): void {
    if (!this.current) {
      this.childDialogKlass = null;
      this.isFallback = false;
      return;
    }
    const klass = this.current.klass;
    const direct = getViewer(klass);
    if (direct) {
      this.childDialogKlass = klass;
      this.isFallback = false;
      return;
    }
    const fallback = getViewer(FALLBACK_KLASS);
    if (fallback) {
      this.childDialogKlass = klass; // wir merken die ORIGINAL-klass, nicht "PGObjBase"
      this.isFallback = true;
      return;
    }
    // Weder klass-spezifisch noch Fallback registriert. Setzen wir
    // childDialogKlass auf die klass; Host wird EmptyState rendern.
    this.childDialogKlass = klass;
    this.isFallback = false;
  }
}
