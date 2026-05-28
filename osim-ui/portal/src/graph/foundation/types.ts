/**
 * Basis-Typen der GraphObject-Schicht — 1:1-Portierung der MFC-Geometrie-Typen
 * (`CPoint`, `CSize`, `CRect`) und der OSim-Enums aus
 * `OSim2004/inc/GraphObj.h`.
 *
 * Wir behalten die MFC-Namen bei (cx/cy für CSize, left/top/right/bottom für
 * CRect) — das hält die Portierung der Algorithmen aus den .cpp-Files
 * mechanisch und prüfbar.
 */

/** 2D-Punkt mit Ganzzahlkoordinaten (MFC CPoint). */
export interface CPoint {
  x: number;
  y: number;
}

/** 2D-Größe (MFC CSize, cx=Breite, cy=Höhe). */
export interface CSize {
  cx: number;
  cy: number;
}

/** Rechteck mit absoluten Koordinaten (MFC CRect). */
export interface CRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Helper: erzeugt einen neuen CPoint. */
export function cpoint(x: number, y: number): CPoint {
  return { x, y };
}

/** Helper: erzeugt eine neue CSize. */
export function csize(cx: number, cy: number): CSize {
  return { cx, cy };
}

/** Helper: erzeugt ein neues CRect aus zwei Punkten. */
export function crect(left: number, top: number, right: number, bottom: number): CRect {
  return { left, top, right, bottom };
}

/** Helper: leeres CRect. */
export function crectEmpty(): CRect {
  return { left: 0, top: 0, right: 0, bottom: 0 };
}

/** Helper: Breite eines CRect. */
export function crectWidth(r: CRect): number {
  return r.right - r.left;
}

/** Helper: Höhe eines CRect. */
export function crectHeight(r: CRect): number {
  return r.bottom - r.top;
}

/** Helper: Punkt liegt in Rect? */
export function crectContains(r: CRect, p: CPoint): boolean {
  return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
}

/**
 * Region-Werte für CheckRegion(point) — wo im Knoten klickt der User?
 * 1:1 aus GraphObj.h Z. 327.
 */
export enum GORegion {
  R_NO = 0,
  R_MOVE = 1,
  R_EDIT = 2,
  R_LINK_EDIT = 3,
  R_LEFT = 4,
  R_RIGHT = 5,
}

/**
 * Knoten-State. 1:1 aus GraphObj.h Z. 336.
 * - HIDDEN: Knoten ist unsichtbar (z.B. in geschlossenem GObjSub)
 * - MARKED: Knoten ist selektiert (sichtbare Markierung)
 * - NO_STATE: Default, keine besondere Markierung
 */
export enum GObjState {
  HIDDEN = 0,
  MARKED = 1,
  NO_STATE = 2,
}

/**
 * Link-Routing-Richtung (16 Werte). 1:1 aus GraphObj.h Z. 512.
 * Definiert von welcher Seite ein Link an einen Knoten andockt.
 *
 * Die Reihenfolge ist exakt wie im C++-Enum — sie wird in den
 * Routing-Algorithmen aus OGLink.cpp als numerischer Index genutzt.
 */
export enum GLDirection {
  DEFAULT = 0,
  NORTH = 1,
  SOUTH = 2,
  EAST = 3,
  WEST = 4,
  MIDDLE = 5,
  NORTH_EAST = 6,
  NORTH_WEST = 7,
  SOUTH_WEST = 8,
  SOUTH_EAST = 9,
  NORTH_NORTH_EAST = 10,
  NORTH_EAST_EAST = 11,
  NORTH_NORTH_WEST = 12,
  NORTH_WEST_WEST = 13,
  SOUTH_SOUTH_EAST = 14,
  SOUTH_EAST_EAST = 15,
  SOUTH_SOUTH_WEST = 16,
  SOUTH_WEST_WEST = 17,
}

/**
 * State eines GObjSub (geöffnet/geschlossen).
 * 1:1 aus GraphObj.h Z. 2058-2061.
 */
export enum GOStateSub {
  D_CLOSED = 0,
  D_OPEN = 1,
}

/**
 * Sentinel-Typ-Marker für LNULL.
 * Im C++-Original: `#define LNULL ((GObject*) 0xffffffff)` — ein magischer
 * Pointer-Wert, der einen Listenkopf markiert (NICHT NULL, NICHT dereferenzierbar).
 *
 * In TS: ein Singleton-Object mit Marker-Symbol. Vergleiche via `obj === LNULL`
 * (Identitäts-Vergleich, O(1)). NIE Properties darauf zugreifen.
 */
export type LNullSentinel = { readonly __sentinel: "LNULL" };
