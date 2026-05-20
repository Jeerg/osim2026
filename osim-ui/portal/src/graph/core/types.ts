// Plan 01-07 Task 1: GraphObject-Foundation — gemeinsame Typen.
//
// PHASE-1-SKELETON: Diese Typen sind der erste Auszug der GraphObject-
// Schicht (vgl. OSim2004 GraphObj.h). Die Vollportierung (4-Layer-
// Drawing, GraphGrid/OGraphList-Container, GLinkPoint mit
// CheckNeighbourhood, Phantom-System, OGBlock-Sub-Composition) ist
// fuer Phase 3 (live-viz) reserviert (siehe roadmap + 01-CONTEXT D-07).
//
// Phase 1 deckt nur ab, was der PDurchlaufplanViewerDesign + spaetere
// Charts/Gantt-Viewer als Mindest-Vertrag brauchen.

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Geometrie-Primitives.
// ---------------------------------------------------------------------------

/** 2D-Position in virtuellen Koordinaten (entspricht CPoint in C++). */
export interface Position {
  x: number;
  y: number;
}

/** 2D-Groesse in virtuellen Einheiten (entspricht CSize in C++). */
export interface Size {
  width: number;
  height: number;
}

/** Rechteck = Position + Groesse (entspricht CRect in C++). */
export interface Rect extends Position, Size {}

// ---------------------------------------------------------------------------
// Knoten-Regionen (vgl. enum GORegion in GraphObj.h:327).
//
// Phase 1 reduziert die 6 Regionen aus dem Original auf "inside" / "edge"
// / "outside" — der Design-Viewer braucht nur "ist der Punkt drin?"
// fuer Hit-Tests. Move-/Edit-/Link-Regionen werden in Phase 3 ergaenzt,
// wenn die volle Maus-Interaktion (Edit-on-Click, Link-from-Edge) im
// Portal portiert wird (aktuell macht das reactflow via Handles).
// ---------------------------------------------------------------------------

export type GORegion =
  | "inside" // Punkt ist innerhalb des Rects (entspricht R_MOVE/R_EDIT)
  | "edge" // Punkt ist auf dem Rand (entspricht R_LEFT/R_RIGHT/R_LINK_EDIT)
  | "outside"; // Punkt ist ausserhalb (entspricht R_NO)

// ---------------------------------------------------------------------------
// Knoten-Zustand (vgl. enum GObjState in GraphObj.h:336).
//
// Phase 1 nutzt nur den Standard-Zustand. MARKED + HIDDEN werden in
// Phase 3 (Live-Animation, selection) gebraucht.
// ---------------------------------------------------------------------------

export type GObjState =
  | "NO_STATE" // Standard, sichtbar, unmarkiert
  | "MARKED" // Selektiert (Phase 3: highlight-Rendering)
  | "HIDDEN"; // Versteckt (Phase 3: SetChildsVisible-Pendant)

// ---------------------------------------------------------------------------
// Link-Richtungen (vgl. enum GLDirection in GraphObj.h:512-531).
//
// Phase 1 reicht die DEFAULT-Richtung (reactflow waehlt die Position der
// Handles automatisch). Die 16 Kompass-Richtungen aus dem Original sind
// hier fuer Phase 3 (CheckNeighbourhood + Linkpoint-Layout) deklariert,
// werden aber aktuell nicht ausgewertet.
// ---------------------------------------------------------------------------

export type GLDirection =
  | "DEFAULT"
  | "NORTH"
  | "SOUTH"
  | "EAST"
  | "WEST"
  | "MIDDLE"
  | "NORTH_EAST"
  | "NORTH_WEST"
  | "SOUTH_EAST"
  | "SOUTH_WEST"
  | "NORTH_NORTH_EAST"
  | "NORTH_EAST_EAST"
  | "NORTH_NORTH_WEST"
  | "NORTH_WEST_WEST"
  | "SOUTH_SOUTH_EAST"
  | "SOUTH_EAST_EAST"
  | "SOUTH_SOUTH_WEST"
  | "SOUTH_WEST_WEST";

// ---------------------------------------------------------------------------
// Render-Vertrag fuer GraphView.
// ---------------------------------------------------------------------------

/**
 * Props des React-GraphView-Wrappers (siehe GraphView.tsx). Phase 1
 * unterstuetzt Move + Connect + DoubleClick; Phase 3 ergaenzt Selection,
 * Marquee, Context-Menu, Keyboard-Routing.
 */
export interface GraphViewProps {
  /** Knoten-Liste (jeweils GObject-Subklasse). */
  objects: GObject[];
  /** Kanten-Liste (jeweils GLink-Subklasse). */
  links: GLink[];
  /** Wird bei Drag-Ende eines Knotens aufgerufen. */
  onObjectMove?: (id: string, pos: Position) => void;
  /** Wird beim Ziehen einer neuen Kante von Handle zu Handle aufgerufen. */
  onLinkCreate?: (sourceId: string, targetId: string) => void;
  /** Doppelklick auf einen Knoten (Phase 1: oeffnet Property-Viewer). */
  onObjectDoubleClick?: (id: string) => void;
  /** Wenn true: keine Drag/Connect-Operationen erlaubt. */
  readonly?: boolean;
}

// ---------------------------------------------------------------------------
// Vor-Deklaration der Klassen (Vermeidung von Circular-Imports).
// ---------------------------------------------------------------------------

export interface GObject {
  id: string;
  klass: string;
  position: Position;
  size: Size;
  state: GObjState;
  render(): ReactNode;
  contains(p: Position): boolean;
  regionCheck(p: Position): GORegion;
  updatePosition(p: Position): void;
}

export interface GLink {
  id: string;
  source: string;
  target: string;
  direction: GLDirection;
  waypoints: Position[];
  render(): ReactNode;
}
