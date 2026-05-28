/**
 * GObjCEdit — Knoten mit integriertem In-Place-Text-Editor.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z.950-990
 * (`class GObjCEdit : public GObjLink`).
 *
 * Im C++-Original hält die Klasse eine `CEdit`-MFC-Komponente (Z.961
 * `m_Edti` — Tippfehler im Original beibehalten in Kommentar). Beim Klick
 * via `OnEditGo` aktiviert sich das Edit-Feld; der eingegebene Text wird
 * via `GObject::m_string` persistiert.
 *
 * **Portierungs-Strategie:** Foundation hält nur das **Modell + den Edit-
 * State** (m_isEditing). Das Rendering eines `<input>`/`contentEditable`
 * macht der React-Flow-Adapter (OsimNode oder eine spezialisierte
 * Node-Komponente). Foundation kennt React Flow nicht.
 *
 * **State-Pfad:**
 *  - Doppelklick → OnEditGo(virtpoint) → m_isEditing=true → Renderer rendert
 *    Edit-Feld.
 *  - Tipp + Enter/Blur → Renderer ruft EndEditing(newText) → m_string
 *    aktualisiert, m_isEditing=false.
 *  - Esc → Renderer ruft CancelEditing() → m_isEditing=false, m_string
 *    unverändert.
 *
 * **Nicht portiert (bewusst):** Clipboard-Methoden (MFC-spezifisch), Draw/
 * DrawHelpers (MFC-Renderer), OnOpenPopUp/OnCommand (Win-Events).
 */

import { GObjLink } from "@/graph/foundation/GObjLink";
import {
  GORegion,
  type CPoint,
} from "@/graph/foundation/types";
import { GO_DEFAULT } from "@/graph/foundation/constants";

/**
 * Default-Eck-Rundung in Pixeln. 1:1 aus C++ Z.956
 * `#define STD_ROUND_CORNER 30`. Renderer-Hinweis; Foundation hält nur
 * den Wert.
 */
export const STD_ROUND_CORNER = 30;

/**
 * Knoten mit integriertem Edit-Feld.
 */
export class GObjCEdit extends GObjLink {
  // ============================================================
  // Edit-State (synthetisches Foundation-Feld — Renderer fragt es ab)
  // ============================================================

  /**
   * Ist das Edit-Feld aktiv? Renderer rendert dann `<input>` o.ä. statt
   * des statischen Texts. Im C++-Original gespiegelt durch die Sichtbarkeit
   * der `m_Edti`-MFC-Komponente.
   */
  protected m_isEditing: boolean = false;

  /**
   * Snapshot des Textes vor Beginn der Editier-Session (für Esc-Cancel).
   * Im C++-Original implizit durch `CEdit::SetWindowText` — wir halten ihn
   * explizit.
   */
  protected m_editingSnapshot: string = "";

  constructor(width: number = GO_DEFAULT, height: number = GO_DEFAULT) {
    super(width, height);
  }

  override IsOnlyGObj(): boolean {
    return false;
  }

  // ============================================================
  // Editier-State-Maschine
  // ============================================================

  /** Liefert ob der Knoten aktuell im Edit-Modus ist. */
  IsEditing(): boolean {
    return this.m_isEditing;
  }

  /**
   * Startet die Edit-Session. Snapshot des aktuellen Texts wird genommen
   * (für Cancel). Wenn schon im Edit-Modus: No-Op.
   *
   * Im C++-Original macht das `OnEditGo` direkt — hier als eigene
   * Methode entkoppelt, damit der RF-Adapter den State explizit setzen
   * kann (z.B. wenn der User direkt in ein Edit-Feld klickt statt
   * Doppelklick).
   */
  BeginEditing(): void {
    if (this.m_isEditing) return;
    this.m_editingSnapshot = this.m_string;
    this.m_isEditing = true;
  }

  /**
   * Commitet die Edit-Session mit `newText` als neuem Wert. Wenn nicht
   * im Edit-Modus: No-Op (defensiv).
   */
  EndEditing(newText: string): void {
    if (!this.m_isEditing) return;
    this.m_string = newText;
    this.m_isEditing = false;
    this.m_editingSnapshot = "";
  }

  /**
   * Bricht die Edit-Session ab — `m_string` wird auf den Snapshot vor
   * BeginEditing zurückgesetzt.
   */
  CancelEditing(): void {
    if (!this.m_isEditing) return;
    this.m_string = this.m_editingSnapshot;
    this.m_isEditing = false;
    this.m_editingSnapshot = "";
  }

  // ============================================================
  // OnEditGo (C++ Z.977) — Doppelklick öffnet Edit
  // ============================================================

  /**
   * Doppelklick aktiviert das Edit-Feld. 1:1 zu C++ Z.977. Beim erneuten
   * Aufruf während aktiver Session schließt die Session und commitet den
   * aktuellen `m_string` (das simuliert den Klick außerhalb des Felds).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override OnEditGo(_virtpoint: CPoint): boolean {
    if (this.m_isEditing) {
      this.EndEditing(this.m_string);
    } else {
      this.BeginEditing();
    }
    return true;
  }

  // ============================================================
  // CheckRegion (C++ Z.975) — Klick in Knoten = R_EDIT
  // ============================================================

  /**
   * Klick im Inneren des Knotens liefert R_EDIT (statt R_MOVE) — das
   * signalisiert dem Caller, dass eine Doppelklick-Edit-Aktion sinnvoll
   * ist. 1:1 zu C++ Z.975.
   *
   * Falls außerhalb des Knotens (super liefert R_NO): durchreichen.
   */
  override CheckRegion(virtp: CPoint): GORegion {
    const baseRegion = super.CheckRegion(virtp);
    if (baseRegion === GORegion.R_NO) return GORegion.R_NO;
    // Innerhalb des Knotens: immer Edit-Region (Text-Bereich = ganzer Knoten).
    return GORegion.R_EDIT;
  }
}
