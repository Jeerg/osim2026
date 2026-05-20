// Plan 01-07 Task 1: KanteEdge — GLink-Subklasse + reactflow-Edge-FC.
//
// Phase 1: nutzt reactflow's Standard-Edge-Renderer (gerade Linie mit
// Pfeilspitze), die KanteEdge-Klasse traegt nur den Label (Uebergangszeit)
// als ergaenzendes Daten-Feld. Wenn der Edge-Label gerendert werden soll,
// wird das via reactflow Edge.label-Prop direkt im GraphView gesetzt;
// eine eigene Edge-FC ist Phase-1 nicht noetig.
//
// Phase 3 wird hier einen voll konfigurierbaren Renderer einbauen
// (Routing entlang Grid, Label-Positionierung, animierte Anzeige beim
// Strahlen-Render).

import type { ReactNode } from "react";
import { GObjLink } from "@/graph/core/GObjLink";
import type { GObject } from "@/graph/core/GObject";
import type { GLDirection } from "@/graph/core/types";

/**
 * KanteEdge — semantischer Wrapper um GObjLink mit OSim-spezifischen
 * Properties (uebergangszeit, klass).
 *
 * Die konkrete Visualisierung wird in Phase 1 durch reactflow's
 * Default-Edge-Renderer geleistet; der `label`-String wird via
 * Edge.label-Prop in GraphView verarbeitet (siehe glinkToEdge).
 */
export class KanteEdge extends GObjLink {
  constructor(
    id: string,
    sourceObj: GObject,
    targetObj: GObject,
    public klass: string,
    public uebergangszeit_s: number,
    direction: GLDirection = "DEFAULT",
  ) {
    super(id, sourceObj, targetObj, direction);
  }

  /** Phase 1: kein eigener Renderer, reactflow uebernimmt. */
  render(): ReactNode {
    return null;
  }

  /** Label-Text fuer die Kante (z.B. "5 s") — wird in GraphView gelesen. */
  get label(): string | undefined {
    if (!Number.isFinite(this.uebergangszeit_s) || this.uebergangszeit_s <= 0) {
      return undefined;
    }
    return `${this.uebergangszeit_s} s`;
  }
}
