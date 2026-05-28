/**
 * OGraphList — lineare doppelt verkettete Liste von GObjects.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h. Einfachere Variante von
 * OGraphCollection (keine 2D-Topologie, nur sequenzielle Reihenfolge).
 *
 * Konsumenten: linke-Seiten-Listen in einigen Viewern, einfache
 * Auftrag-Container, sortierte Übersichts-Listen.
 */

import { OGraphCollection } from "@/graph/foundation/OGraphCollection";
import { OGPositionList } from "@/graph/foundation/OGPosition";
import type { GObject } from "@/graph/foundation/GObject";

/**
 * Lineare Liste mit Head- und Tail-Pointer + bidirektionaler Verkettung.
 */
export class OGraphList extends OGraphCollection {
  /** Listenkopf (Sentinel). */
  protected m_Head: OGPositionList = new OGPositionList();
  /** Listenende (Sentinel). */
  protected m_Tail: OGPositionList = new OGPositionList();

  constructor() {
    super();
    // Zirkuläre Initialisierung: Head ↔ Tail.
    this.m_Head.pNext = this.m_Tail;
    this.m_Tail.pPrev = this.m_Head;
  }

  /** Fügt ein GObject am Ende der Liste an. */
  AddTail(obj: GObject): void {
    const node = new OGPositionList();
    node.pObj = obj;
    node.pPrev = this.m_Tail.pPrev;
    node.pNext = this.m_Tail;
    if (this.m_Tail.pPrev) this.m_Tail.pPrev.pNext = node;
    this.m_Tail.pPrev = node;
    obj.m_OGCollection = this;
    obj.m_OGPosition = node;
    this.m_objCount++;
  }

  /** Fügt ein GObject am Anfang der Liste an. */
  AddHead(obj: GObject): void {
    const node = new OGPositionList();
    node.pObj = obj;
    node.pNext = this.m_Head.pNext;
    node.pPrev = this.m_Head;
    if (this.m_Head.pNext) this.m_Head.pNext.pPrev = node;
    this.m_Head.pNext = node;
    obj.m_OGCollection = this;
    obj.m_OGPosition = node;
    this.m_objCount++;
  }

  /** Entfernt das Objekt aus der Liste. */
  protected removeImpl(obj: GObject): void {
    const node = obj.m_OGPosition;
    if (!(node instanceof OGPositionList)) return;
    if (node.pPrev) node.pPrev.pNext = node.pNext;
    if (node.pNext) node.pNext.pPrev = node.pPrev;
    obj.m_OGCollection = null;
    obj.m_OGPosition = null;
  }

  /**
   * Iteriert über alle echten Objekte (Sentinels werden übersprungen).
   */
  iterate(callback: (obj: GObject) => void): void {
    let pos = this.m_Head.pNext;
    while (pos && pos !== this.m_Tail) {
      const obj = pos.pObj;
      // pObj ist hier immer ein echtes GObject (Sentinels sind Head/Tail).
      if (obj && typeof obj === "object" && !("__sentinel" in obj)) {
        callback(obj as GObject);
      }
      pos = pos.pNext;
    }
  }
}
