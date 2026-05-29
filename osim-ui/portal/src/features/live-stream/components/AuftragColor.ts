/**
 * AuftragColor — OID→RGB-Quantisierung für Belegungs-Segmente (Plan 01-15 Task 1).
 *
 * Faithful 1:1-Port der OSim2004-Farbformel für den Standard-Modus pmKAuftr
 * (Farbe nach Kundenauftrag):
 *   RGB((oid%4)*64, ((oid/4)%4)*64, ((oid/16)%4)*64)
 *
 * Quelle: PGfxRowObj.cpp:368-378 (GetProzColor, pmKAuftr-Zweig).
 *
 * Jede Komponente ist aus {0,64,128,192}. oid=0 → schwarz (rgb(0,0,0)).
 * Das ist KEIN Idle-Zustand — schwarze Segmente sind Aufträge mit niedriger OID.
 * Negative oid → Gap/Hintergrund (keine Belegung): weiß.
 *
 * Inline-style (nicht Token) ist hier 1:1-Treue, kein UI-Branding.
 * Diese Farben sind datengetriebene OSim-Farbwerte — die 3FLS-Token-Regel gilt
 * nicht für algorithmisch berechnete Daten-Farben (osim-ui/CLAUDE.md §2).
 *
 * Keine React-Abhängigkeit — reines TS-Modul, unit-testbar ohne DOM.
 */

/** Gap-Farbe für oid < 0 (kein aktiver Prozess = Hintergrund weiß). */
export const GAP_COLOR = "rgb(255,255,255)";

/**
 * Gibt den CSS rgb()-String für eine Auftrags-OID zurück.
 *
 * @param oid  Numerische OID des Kundenauftrags (PAusloeser.oid).
 *             Negative Werte werden als Gap behandelt.
 */
export function auftragColor(oid: number): string {
  if (oid < 0) return GAP_COLOR;
  // Ganzzahlige Division — Math.floor für positive oid korrekt.
  const r = (oid % 4) * 64;
  const g = (Math.floor(oid / 4) % 4) * 64;
  const b = (Math.floor(oid / 16) % 4) * 64;
  return `rgb(${r},${g},${b})`;
}
