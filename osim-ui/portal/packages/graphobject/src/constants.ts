/**
 * GraphObject Konstanten — 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 22-46.
 *
 * Alle Werte exakt wie im C++-Original. NICHT modernisieren.
 */

export const MAX_BLOCK_STR_LEN = 256;
export const MAX_START_NODES = 10;

/** Standardbreite Knoten (Pixel). */
export const STD_OBJ_WIDTH = 200;
/** Standardhöhe Knoten (Pixel). */
export const STD_OBJ_HEIGHT = 80;

/** Standardbreite einer Gridzelle. */
export const STD_GRID_WIDTH = 20;
/** Standardhöhe einer Gridzelle. */
export const STD_GRID_HEIGHT = 10;

export const STD_SHOW_DELTA_X = 0;
export const STD_SHOW_DELTA_Y = 30;

/** Standardabstand zwischen den Knoten (Spalten-/Zeilen-Lücke). */
export const STD_LINK_PLACE = 20;

/** Zeichnungsbeginn im SubNode (x). */
export const STD_BGN_X = 20;
/** Zeichnungsbeginn im SubNode (y). */
export const STD_BGN_Y = 20;
export const STD_END_X = 0;
export const STD_END_Y = 0;

/** Anzahl der Knotenstati (Original-Konstante, dokumentiert die State-Maschine). */
export const STATE_NUM = 2;

/** Bei senkrechten/waagerechten Links: Breite/Höhe des Link-Rect. */
export const STD_LINKRECT_DISTANCE = 20;
export const ANIMATE_BEAM_HEIGHT = 10;
export const FORGROUND_FONT_HEIGHT = 30;

/** Sentinel für Default-Parameter (entspricht GO_DEFAULT = -99). */
export const GO_DEFAULT = -99;

/** Object-Style-Flags (Bitmask). Aus GraphObj.h Z. 322. */
export const GS_LEFT_ALLIGN = 0x00000001;
export const GS_MIDDLE_ALLIGN = 0x00000002;
/** Richtet sich an Standard-Knotenhöhe aus. */
export const GS_STDOBJECT_ALLIGN = 0x00000004;

/**
 * Block-Größe der C++-Pool-Allokator (CPlex-Block für OGPositionGrid).
 * In TS irrelevant (GC), aber dokumentiert.
 */
export const POOL_BLOCK_SIZE = 1000;
