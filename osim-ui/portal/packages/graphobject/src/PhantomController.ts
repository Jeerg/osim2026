/**
 * PhantomController — verwaltet das aktuell sichtbare Drag-Phantom.
 *
 * **Hintergrund (Track B5, Audit 2026-05-28 §5.3):** im C++-Original hängt
 * das Phantom direkt am Knoten (m_isPhShown + m_OldPhantomRect), und der
 * GraphObjCtrl ruft `ShowPhantom`/`HidePhantom` mit dem aktuellen CDC
 * während des Drag-Loops auf. Foundation in TS hält denselben Zustand auf
 * GObject; der Controller hier verwaltet den **globalen Drag-State** —
 * welcher Knoten gerade gedraggt wird, wo der Cursor steht, ob das
 * Phantom gerade sichtbar ist.
 *
 * **Renderer-Anbindung (osim-ui-spezifisch):** der React-Flow-Adapter
 * pollt `getActivePhantom()` während des `onNodeDrag`-Lifecycles und
 * rendert das Vorschau-Overlay als zusätzlichen Custom-Node mit
 * `data.isPhantom = true`. Das hält den Foundation-Code renderer-agnostisch.
 *
 * **Nicht im Scope von B5:** die tatsächliche RF-Integration. Das gehört
 * in eine spätere Drag-Lifecycle-Welle, sobald der Use-Case auftaucht
 * (z.B. „Knoten von außerhalb auf Canvas droppen mit Vorschau"). B5 baut
 * nur das Foundation-Modell.
 */

import type { GObject } from "./GObject";
import type { CPoint, CRect } from "./types";

/**
 * Beschreibung eines aktiven Phantoms.
 */
export interface ActivePhantom {
  /** Das Objekt für das das Phantom gezeigt wird. */
  source: GObject;
  /** Aktuelle Phantom-Position (Welt-Koordinaten). */
  rect: CRect;
  /** Aktueller Cursor-Punkt (für „beste Drop-Zelle"-Berechnung). */
  cursor: CPoint;
}

/**
 * Globaler Phantom-Zustand. Singleton-Pattern (eine Drag-Session zur Zeit),
 * aber instanzierbar für Tests + Stories.
 */
export class PhantomController {
  private active: ActivePhantom | null = null;

  /**
   * Startet eine Phantom-Session für ein Objekt. Setzt `source.m_isPhShown`
   * und initialisiert `m_OldPhantomRect`. Wenn schon eine Session aktiv ist,
   * wird sie ohne explizites Hide überschrieben.
   */
  show(source: GObject, cursor: CPoint): ActivePhantom {
    source.m_isPhShown = true;
    const rect: CRect = {
      left: cursor.x,
      top: cursor.y,
      right: cursor.x + source.m_GSize.cx,
      bottom: cursor.y + source.m_GSize.cy,
    };
    source.m_OldPhantomRect = rect;
    this.active = { source, rect, cursor };
    return this.active;
  }

  /**
   * Aktualisiert die Phantom-Position auf den neuen Cursor-Punkt. Wenn
   * keine Session aktiv ist: No-Op (defensiv).
   */
  update(cursor: CPoint): ActivePhantom | null {
    if (!this.active) return null;
    const rect: CRect = {
      left: cursor.x,
      top: cursor.y,
      right: cursor.x + this.active.source.m_GSize.cx,
      bottom: cursor.y + this.active.source.m_GSize.cy,
    };
    this.active.source.m_OldPhantomRect = rect;
    this.active = { ...this.active, rect, cursor };
    return this.active;
  }

  /**
   * Beendet die Phantom-Session. Setzt `m_isPhShown=false` auf dem Source-
   * Objekt zurück. Wenn keine Session aktiv ist: No-Op.
   */
  hide(): void {
    if (!this.active) return;
    this.active.source.m_isPhShown = false;
    this.active = null;
  }

  /**
   * Lese-Zugriff für den Renderer: was ist gerade das aktive Phantom?
   * Liefert `null` wenn keine Drag-Session läuft.
   */
  getActivePhantom(): ActivePhantom | null {
    return this.active;
  }

  /** True wenn aktuell ein Phantom sichtbar ist. */
  isActive(): boolean {
    return this.active !== null;
  }
}

/**
 * Default-Singleton-Instanz. App-weit ein einziges Phantom zur Zeit —
 * Drag-Operationen sind sequentiell. Tests können eigene Instanzen
 * erstellen statt diese zu nutzen.
 */
export const phantomController = new PhantomController();
