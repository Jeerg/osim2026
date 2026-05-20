// Plan 01-07 Task 1: GObjLink — typed Variante von GLink mit GObject-
// Referenzen.
//
// PHASE-1-SKELETON: Portierung von GObjLink (GraphObj.h:533-606), aber
// _stark_ reduziert.
//
// Was Phase 1 macht:
//   - extends GLink, mit konkreten sourceObj / targetObj Referenzen
//     (statt nur source/target ids)
//   - sourceObj/targetObj sind typed (GObject), damit Konsumenten direkt
//     auf Position/Size zugreifen koennen ohne Lookup im Object-Pool
//
// Was Phase 1 NICHT macht (Phase 3 ergaenzt):
//   - InList/OutList am GObjLink (Vorgaenger/Nachfolger-Adjazenz):
//     der Design-Viewer fragt die Adjazenz ueber die OSim-Tree-Struktur
//     ab (PDlplKante.m_lVon / m_lNach), nicht ueber GObject-interne
//     Listen. Phase 3 baut die InList/OutList nach, wenn die Live-
//     Animation die Vorgaenger/Folger anzeigen muss (ShowFolger /
//     ShowVorgaenger aus GraphObj.h:552-553).

import type { ReactNode } from "react";
import { GLink } from "./GLink";
import type { GLDirection } from "./types";
import type { GObject } from "./GObject";

/**
 * GObjLink — GLink mit getypten GObject-Referenzen.
 *
 * Die konkrete render()-Implementierung kommt ueber die Subklasse
 * (z.B. KanteEdge). Phase 1 ueberlaesst das Rendering ohnehin
 * reactflow + den Edge-Renderern in graph/edges/.
 */
export class GObjLink extends GLink {
  constructor(
    id: string,
    public sourceObj: GObject,
    public targetObj: GObject,
    direction: GLDirection = "DEFAULT",
  ) {
    super(id, sourceObj.id, targetObj.id, direction);
  }

  render(): ReactNode {
    // Default-Implementation: leerer Node. Die echte Edge-Darstellung
    // uebernimmt reactflow ueber den edgeTypes-Slot in GraphView.tsx
    // bzw. die Custom-Edge-Component in graph/edges/KanteEdge.tsx.
    return null;
  }
}
