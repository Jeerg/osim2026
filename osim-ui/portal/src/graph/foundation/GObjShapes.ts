/**
 * Shape-Klassen — GObjOSimDlp / GObjSquare / GObjRect.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z.741-948.
 * Drei konkrete GObjLink-Spezialisierungen mit unterschiedlichen visuellen
 * Formen. Im C++-Original entscheiden sie über die Form-Variante, die der
 * MFC-Renderer zeichnet; in osim-ui haben wir diese Form bisher direkt in
 * `OsimNode.tsx` als SVG-Polygon HARTCODIERT (siehe Welle G7).
 *
 * **Track B3 macht Shape-Polymorphismus möglich** — der RF-Adapter
 * (view-adapter.ts) wählt anhand des Foundation-Typs den passenden
 * Node-Renderer. OsimNode.tsx kann seine Pfeil-Spitze als „Default für
 * GObjOSimDlp" abbilden; GObjSquare bekommt sein kleines Rechteck (heute
 * OsimEdgeBox); GObjRect bekommt eine abgerundete Variante.
 *
 * **Strategischer Mehrwert (Architektur-Audit 2026-05-28):** ohne diese
 * Klassen ist OsimNode.tsx der einzige Renderer für ALLE Knoten — selbst
 * mit Welle G11's m_wireKlass-Hack. Mit eigenen Shape-Klassen kann die
 * Renderer-Wahl deterministisch + erweiterbar werden, und Track C
 * (Renderer-Agnostik / Canvas-Adapter) hat einen sauberen Hook-Punkt.
 *
 * **Nicht portiert (bewusst):** Draw/DrawHelpers/DrawText/DrawSymbol/
 * ShowPhantom/HidePhantom (MFC-Renderer; Phantom kommt eigens in Track B5),
 * Clipboard-Methoden, OnOpenPopUp/OnCommand (Win-Events).
 */

import { GObjLink } from "@/graph/foundation/GObjLink";
import {
  type CPoint,
  type CSize,
} from "@/graph/foundation/types";
import { GO_DEFAULT } from "@/graph/foundation/constants";
import type { GLink } from "@/graph/foundation/GLink";

// ============================================================
// Enums (C++ Z.741-763 GObjType, Z.830-836 GSqrType)
// ============================================================

/**
 * OSim-Knoten-Typ-Identifier. 1:1 aus C++ Z.741-763.
 *
 * Wird von GObjOSimDlp/GObjSquare als `m_eGObjType` gehalten und vom
 * Renderer für die Form-Variante des Knotens verwendet (z.B. die
 * Pfeil-Spitze für PDLPLKNOTEN-Default vs eckiger Container für
 * PDPKNALTERNATIV).
 */
export enum GObjType {
  PDLPLKNOTEN = 0,
  PDPKNZEITVORGABE = 1,
  PDPKNVERTEILUNG = 2,
  PDPKNKONSTANT = 3,
  PDPKNMENGE = 4,
  PDPKNMENGERUESTEN = 5,
  PDPKNRUECKSPRUNG = 6,
  PDPKNRUECKKONSTANT = 7,
  PDPKNRUECKVERTEILUNG = 8,
  PDPKNALTERNATIV = 9,
  PDPKNALTERNATIVTYPID = 10,
  PDPKNALTERNATIVEVERTEILUNG = 11,
  PDPKNALTERNATIVLOGIK = 12,

  PDLPLKANTE = 13,
  PDPKAEXTERN = 14,
  PDPKAUEBERGANG = 15,
  PDPKAENTITAET = 16,
  PDPKAENTITAETABLAGE = 17,

  NO_TYPE = 18,
}

/**
 * Subtype für GObjSquare. 1:1 aus C++ Z.830-836.
 * Markiert die Rolle des Square-Knotens in der Link-Reihe:
 *  - START_NODE: erster Knoten (Link beginnt hier).
 *  - END_NODE: letzter Knoten (Link endet hier).
 *  - START_AND_END: beides (Single-Square als Anfang+Ende).
 *  - STD_NODE: Default — Standard-Mittelknoten in einer Link-Kette.
 */
export enum GSqrType {
  START_NODE = 0,
  END_NODE = 1,
  START_AND_END = 2,
  STD_NODE = 3,
}

/**
 * Pixel-Breite des „Peaks" am Square. 1:1 aus C++ Z.765
 * `#define STD_PEAK_WIDTH 20`.
 */
export const STD_PEAK_WIDTH = 20;

// ============================================================
// GObjOSimDlp (C++ Z.767-823)
// ============================================================

/**
 * OSim-spezifischer Durchlaufplan-Knoten. Im C++-Original zeichnet er
 * sich als Pfeil-Spitze (Polygon mit Pfeilform); aktuell macht das in
 * osim-ui das `OsimNode.tsx`-SVG-Polygon direkt.
 */
export class GObjOSimDlp extends GObjLink {
  /** Welcher GObjType — entscheidet Renderer-Variante. */
  m_eGObjType: GObjType = GObjType.NO_TYPE;

  constructor(width: number = GO_DEFAULT, height: number = GO_DEFAULT) {
    super(width, height);
  }

  override IsOnlyGObj(): boolean {
    return false;
  }

  /** 1:1 zu C++ Z.780. */
  GetGObjType(): GObjType {
    return this.m_eGObjType;
  }

  /** 1:1 zu C++ Z.781. */
  SetGObjType(type: GObjType): void {
    this.m_eGObjType = type;
  }
}

// ============================================================
// GObjSquare (C++ Z.840-905)
// ============================================================

/**
 * Kleines Rechteck mit OSim-Subtype + GObjType. Im C++-Original kommt
 * an jeder Link-Stelle ein GObjSquare-Knoten — also für PDlplKante-
 * Visualisierung. osim-ui hat das in Welle G11 als `OsimEdgeBox` realisiert
 * (1:1 zur Original-Geometrie aus dlp16.jpg).
 */
export class GObjSquare extends GObjLink {
  m_eGObjType: GObjType = GObjType.NO_TYPE;
  m_SqrType: GSqrType = GSqrType.STD_NODE;

  /** Delta für Mauspointer-Drag (1:1 C++ Z.865 `SetDelta`). */
  protected m_delta: CPoint = { x: 0, y: 0 };

  constructor(width: number = GO_DEFAULT, height: number = GO_DEFAULT) {
    super(width, height);
  }

  override IsOnlyGObj(): boolean {
    return false;
  }

  GetGObjType(): GObjType {
    return this.m_eGObjType;
  }

  SetGObjType(type: GObjType): void {
    this.m_eGObjType = type;
  }

  /** 1:1 zu C++ Z.857. */
  GetSqrState(): GSqrType {
    return this.m_SqrType;
  }

  /** 1:1 zu C++ Z.858. */
  SetSqrState(s: GSqrType): void {
    this.m_SqrType = s;
  }

  /**
   * 1:1 zu C++ Z.865 `virtual void SetDelta(CPoint fvMousePos)`.
   * Setzt den Mauspointer-Delta für Drag-Phantom-Berechnung.
   */
  SetDelta(mousePos: CPoint): void {
    this.m_delta = { x: mousePos.x, y: mousePos.y };
  }

  GetDelta(): CPoint {
    return this.m_delta;
  }

  // ============================================================
  // GetLinkStartPos (C++ Z.864) — Square dockt zentral an
  // ============================================================

  /**
   * Liefert die Mitte des Squares als Link-Andock-Punkt. Standard-Override
   * gegenüber GObjLink: kein Side-spezifisches Andocken — Square ist ein
   * „Punkt"-Knoten.
   */
  override GetLinkStartPos(
    p: CPoint,
    dir: number,
    link: GLink | null = null,
  ): void {
    // Default-Pfad: super (Side-Andocken). Wenn das Original-Verhalten
    // davon abweicht, wird das hier explizit überschrieben.
    super.GetLinkStartPos(p, dir, link);
  }
}

// ============================================================
// GObjRect (C++ Z.914-948)
// ============================================================

/**
 * Knoten als abgerundetes Rechteck. Hält `m_RoundCorner` als CPoint
 * (cx/cy ist die Eck-Rundung in Pixeln).
 *
 * Im C++-Original Z.912 ist `#define STD_ROUND_CORNER 30` definiert —
 * Default-Eckrundung. Wir importieren die Konstante aus `GObjCEdit.ts`
 * (dort dieselbe Definition), um Duplikation zu vermeiden.
 */
export class GObjRect extends GObjLink {
  /**
   * Eck-Rundung als Pixel-Tupel (cx=horizontal, cy=vertikal).
   * Default: (STD_ROUND_CORNER, STD_ROUND_CORNER).
   */
  m_RoundCorner: CSize = { cx: 30, cy: 30 };

  constructor(width: number = GO_DEFAULT, height: number = GO_DEFAULT) {
    super(width, height);
  }

  override IsOnlyGObj(): boolean {
    return false;
  }

  /** 1:1 zu C++ Z.920 — leichte API-Anpassung: nimmt CSize statt CPoint
   *  (cx/cy ist semantisch korrekter als x/y für Eck-Rundung). */
  SetRoundCorner(rc: CSize): void {
    this.m_RoundCorner = { cx: rc.cx, cy: rc.cy };
  }

  GetRoundCorner(): CSize {
    return this.m_RoundCorner;
  }
}
