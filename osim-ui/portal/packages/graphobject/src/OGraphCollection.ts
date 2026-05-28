/**
 * OGraphCollection — abstrakte Basis für OGraphList und OGraphGrid.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h (Container-Basis). Bietet die
 * gemeinsame API für Iteration, Add/Remove/Search.
 *
 * Im C++-Original werden hier u.a. m_pObjCount, m_pParent (GObjSub-Owner)
 * und die OGView-Referenz verwaltet. Konkrete Speicherung übernehmen die
 * Sub-Klassen (OGraphList: lineare Liste; OGraphGrid: Spalten-/Zeilen-Grid).
 */

import type { GObject } from "./GObject";
import type { OGraphView } from "./OGraphView";

/**
 * Abstrakte Collection.
 */
export abstract class OGraphCollection {
  /** Anzahl Objekte in der Collection. */
  m_objCount: number = 0;

  /** Parent-GObject (für GObjSub-internes Sub-Grid). null = Top-Level. */
  m_Parent: GObject | null = null;

  /** View-Layer, dem die Collection zugeordnet ist. */
  m_OGView: OGraphView | null = null;

  /** Sendet Messages an Parent? */
  m_sendMessage: boolean = true;

  /**
   * Iteriert über alle Objekte. Default-Implementation muss von Sub-Klassen
   * überschrieben werden.
   */
  abstract iterate(callback: (obj: GObject) => void): void;

  /**
   * Sucht das erste Objekt, das einem Prädikat entspricht.
   */
  find(predicate: (obj: GObject) => boolean): GObject | null {
    let found: GObject | null = null;
    this.iterate((obj) => {
      if (!found && predicate(obj)) found = obj;
    });
    return found;
  }

  /**
   * Prüft rekursiv ob ein Objekt zu dieser Collection oder einer ihrer
   * Sub-Collections gehört. Welle B-Basis; Welle B-Erweiterung (GObjSub)
   * macht die Rekursion vollständig.
   */
  IsParentFrom(obj: GObject, _rekursiv: boolean = true): boolean {
    let isParent = false;
    this.iterate((o) => {
      if (o === obj) isParent = true;
    });
    return isParent;
  }

  /**
   * Alle löschen. Default: iteriert und ruft remove pro Objekt.
   * Sub-Klassen können effizientere Implementierungen liefern.
   */
  ClearAll(sendMessage: boolean = true): void {
    const prev = this.m_sendMessage;
    this.m_sendMessage = sendMessage;
    const items: GObject[] = [];
    this.iterate((o) => items.push(o));
    for (const o of items) {
      this.removeImpl(o);
    }
    this.m_objCount = 0;
    this.m_sendMessage = prev;
  }

  /**
   * Entfernt ein Objekt aus der Collection (interne Implementierung).
   * Sub-Klassen müssen das implementieren.
   */
  protected abstract removeImpl(obj: GObject): void;
}
