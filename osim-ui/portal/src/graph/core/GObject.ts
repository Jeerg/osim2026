// Plan 01-07 Task 1: GObject — abstract base class.
//
// PHASE-1-SKELETON: Portierung von GObject (GraphObj.h:341-503), reduziert
// auf das Minimum, das der Design-Viewer braucht.
//
// Was Phase 1 macht:
//   - id (eindeutig im View), klass (OSim-Klassen-Name), position, size, state
//   - render() abstract — Subklassen liefern den ReactNode (in der Praxis
//     wird der ReactNode aber via die reactflow-NodeType-Wrapper gerendert,
//     nicht direkt via GObject.render(); render() ist als Foundation-
//     Vertrag schon da, damit Phase 3 die volle 4-Layer-Drawing-Mechanik
//     (DrawBackground/Draw/DrawForeground/DrawHelpers) implementieren kann)
//   - contains(p) — Rect-basierter Hit-Test (vgl. GObject::IsHit)
//   - regionCheck(p) — Phase 1: binary inside/outside; Edge nur grobe Naehe
//   - updatePosition(p) — setzt die neue Position (vgl. GObject::SetPosition)
//
// Was Phase 1 NICHT macht (Phase 3 ergaenzt):
//   - Phantom-System (m_OldPhantomRect, ShowPhantom/HidePhantom)
//   - 4-Layer-Drawing (DrawBackground/Draw/DrawForeground/DrawHelpers)
//   - OnEditGo / OnLMButtonDown / OnContextMenu (Maus-Routing)
//   - DrawRed (Live-Highlight) — Phase 3 Animation
//   - Clipboard (CopyToClipboard / RestoreFromClipboard)
//   - SetChildsVisible (HIDDEN-Propagation in Sub-GObjs)

import type { ReactNode } from "react";
import type {
  GObject as IGObject,
  GORegion,
  GObjState,
  Position,
  Size,
} from "./types";

/** Default-Knoten-Groesse, wenn keiner explizit gesetzt wird (vgl. STD_OBJ_WIDTH/HEIGHT in GraphObj.h:26-27). */
export const DEFAULT_OBJECT_SIZE: Size = { width: 120, height: 60 };

/** Toleranz fuer Edge-Region in virtuellen Einheiten. */
const EDGE_TOLERANCE = 4;

/**
 * Abstract base class fuer alle graphischen Objekte.
 *
 * Subklassen MUESSEN render() implementieren — der ReactNode wird in
 * Phase 1 zwar nicht direkt vom GraphView aufgerufen (die Konkreten
 * Node-Renderer fuer reactflow leben in graph/nodes/), aber das Foundation-
 * Interface stellt sicher, dass Phase 3 die 4-Layer-Drawing-Mechanik
 * andocken kann, ohne die Konsumenten in graph/nodes/ aendern zu muessen.
 */
export abstract class GObject implements IGObject {
  public state: GObjState = "NO_STATE";

  constructor(
    public id: string,
    public klass: string,
    public position: Position,
    public size: Size = { ...DEFAULT_OBJECT_SIZE },
  ) {}

  abstract render(): ReactNode;

  /** True wenn der Punkt innerhalb des Knoten-Rects liegt (Hit-Test). */
  contains(p: Position): boolean {
    return (
      p.x >= this.position.x &&
      p.x <= this.position.x + this.size.width &&
      p.y >= this.position.y &&
      p.y <= this.position.y + this.size.height
    );
  }

  /**
   * Phase-1-Region-Check: liefert "inside", "edge" oder "outside".
   *
   * "edge" wird zurueckgeliefert wenn der Punkt zwar im Rect liegt, aber
   * naeher als EDGE_TOLERANCE am Rand ist — wird in Phase 3 zur Unterscheidung
   * von Move-vs-Link-Region genutzt. Phase 1 wertet das nur als Foundation
   * aus; reactflow uebernimmt die echte Maus-Routing-Logik via Handles.
   */
  regionCheck(p: Position): GORegion {
    if (!this.contains(p)) return "outside";
    const dx = Math.min(
      p.x - this.position.x,
      this.position.x + this.size.width - p.x,
    );
    const dy = Math.min(
      p.y - this.position.y,
      this.position.y + this.size.height - p.y,
    );
    if (dx <= EDGE_TOLERANCE || dy <= EDGE_TOLERANCE) return "edge";
    return "inside";
  }

  /** Setzt eine neue Position. (Vgl. GObject::SetPosition in C++.) */
  updatePosition(p: Position): void {
    this.position = { ...p };
  }
}
