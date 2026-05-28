/**
 * OGraphView — View-Layer der GraphObject-Hierarchie.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 1257+. Im C++-Original der
 * Kontext für Painting (CDC, ScrollBars, Viewport-Origin etc.). Im
 * React-Flow-Backend wird diese Klasse zum Adapter zwischen Grid-Koordinaten
 * und React-Flow-Coords + zum Container für ein- oder mehrere
 * OGraphCollections.
 *
 * GObjSub erbt von OGraphView UND von GObjLink — d.h. ein GObjSub-Knoten
 * IST ein View-Layer und kann eigene Collections halten (= nested Sub-Grids).
 */

import type { CPoint, CSize } from "./types";
import type { GObject } from "./GObject";
import type { OGraphCollection } from "./OGraphCollection";

/**
 * View-Layer. Hält die Liste der ihm zugeordneten Collections + Viewport-
 * Origin/Size für Koordinaten-Transformation.
 */
export class OGraphView {
  /** Liste der Collections in diesem View. */
  m_Collections: OGraphCollection[] = [];

  /** Viewport-Origin (Scroll-Position). */
  m_GOrg: CPoint = { x: 0, y: 0 };

  /** Viewport-Size (sichtbarer Bereich). */
  m_GSize: CSize = { cx: 0, cy: 0 };

  /** Owner-GObject (bei GObjSub: dieser GObjSub selbst). null = Top-Level-View. */
  m_OwnerGObj: GObject | null = null;

  /**
   * Fügt eine Collection zu diesem View hinzu.
   */
  AddCollection(coll: OGraphCollection): void {
    coll.m_OGView = this;
    if (this.m_OwnerGObj) coll.m_Parent = this.m_OwnerGObj;
    this.m_Collections.push(coll);
  }

  /**
   * Triggers Re-Render. Im React-Flow-Backend: ein Event-Emit oder
   * State-Update; in Welle E wird der Adapter das verdrahten.
   */
  InvalidateView(): void {
    // TODO Welle E: Event-Emit für React-Flow-Re-Render.
  }

  /**
   * Berechnet die Gesamt-Größe des Views (Summe über alle Collection-Sizes).
   * Default: gibt die m_GSize zurück. Sub-Klassen überschreiben.
   */
  CalcSize(): CSize {
    return { ...this.m_GSize };
  }
}
