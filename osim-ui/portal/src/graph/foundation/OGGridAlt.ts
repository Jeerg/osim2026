/**
 * OGGridAlt — Spezial-Grid mit rechter Text-Reserve.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z.1863-1925
 * (`class OGGridAlt : public OGraphGrid`).
 *
 * **Use-Case im Original:** Alternativ-Knoten (PDpKnAlternativ, GObjAlt)
 * brauchen ein Grid, das auf der rechten Seite Platz für Beschriftungs-
 * Text (z.B. die Alternativ-Bedingung) reserviert. Die Friends im C++-
 * Header (Z.1872-1875: OGBlock, GraphObjCtrl, GObjSub, GObjAlt) zeigen den
 * Verwendungs-Kontext.
 *
 * **Verhalten:** identisch zu OGraphGrid in allen Layout-Aspekten — nur
 * `GetSize()` meldet zusätzlich `m_TextSpace` zur rechten Seite der
 * berechneten Spalten-Bounds. Das schiebt den Render-Bereich des
 * Sub-Plans nach links und lässt Platz für den Text.
 *
 * **Was im Port wichtig ist:**
 *  - m_TextSpace (int): rechtsseitige Pixel-Reserve.
 *  - m_TextColor (string): Renderer-Hinweis-Farbe.
 *  - m_string (string): Text-Inhalt. Im C++ direkt geerbt via MFC-Basis;
 *    wir halten ihn explizit auf der Klasse.
 *  - SetText/SetTextColor/SetTextSpace/GetTextSpace: 1:1 zu C++ Z.1894-1897.
 *
 * **Nicht portiert (bewusst):** Draw/DrawFrame/DrawText/DrawSymbol (MFC-
 * Renderer; React-Flow-Adapter setzt Text-Reserve via CSS-Layout um) +
 * Clipboard-Methoden + Win-Events (OnLMButtonDown, OnRMButtonDown,
 * OnGOContextMenu).
 */

import { OGraphGrid } from "@/graph/foundation/OGraphGrid";

/**
 * Default-Text-Reserve, wenn keine explizit gesetzt wurde. Im C++-Original
 * implizit über den Konstruktor; hier explizit.
 */
export const OGGRIDALT_DEFAULT_TEXT_SPACE = 120;

/**
 * Grid mit rechtsseitiger Text-Reserve.
 */
export class OGGridAlt extends OGraphGrid {
  // ============================================================
  // Text-Felder (C++ Z.1879-1880)
  // ============================================================

  /** Rechtsseitige Pixel-Reserve für den Text-Bereich. */
  protected m_TextSpace: number = OGGRIDALT_DEFAULT_TEXT_SPACE;

  /** Renderer-Hinweis: Text-Farbe. Default schwarz. */
  m_TextColor: string = "#000000";

  /** Text-Inhalt. Renderer rendert diesen rechts neben dem Grid. */
  m_string: string = "";

  constructor(id: number = 0) {
    super(id);
  }

  // ============================================================
  // Text-API (C++ Z.1894-1897)
  // ============================================================

  /** 1:1 aus C++ Z.1894. */
  SetText(text: string): void {
    this.m_string = text;
  }

  /** 1:1 aus C++ Z.1895. */
  SetTextColor(color: string): void {
    this.m_TextColor = color;
  }

  /** 1:1 aus C++ Z.1896. */
  SetTextSpace(space: number): void {
    this.m_TextSpace = space;
  }

  /** 1:1 aus C++ Z.1897. */
  GetTextSpace(): number {
    return this.m_TextSpace;
  }

  GetText(): string {
    return this.m_string;
  }

  GetTextColor(): string {
    return this.m_TextColor;
  }

  // ============================================================
  // computeSizes (Welle G7-Konvention, semantisch C++ Z.1905 GetSize)
  // ============================================================

  /**
   * Berechnet Spalten/Zeilen-Sizes ZUZÜGLICH m_TextSpace auf der rechten
   * Seite. Das Parent-Grid streckt seine Spalte entsprechend, sodass der
   * Renderer rechts neben dem Sub-Grid Platz für den Text hat.
   *
   * In OGraphGrid lebt die Layout-Berechnung in `computeSizes()` (Welle G7,
   * pendant zu C++ `OGraphGrid::GetSize`). OGGridAlt erweitert m_GSize um
   * die Text-Reserve nach Super-Aufruf.
   */
  override computeSizes(): void {
    super.computeSizes();
    // Text-Reserve auf der rechten Seite — additiv zur berechneten Spalten-Breite.
    this.m_GSize.cx += this.m_TextSpace;
  }
}
