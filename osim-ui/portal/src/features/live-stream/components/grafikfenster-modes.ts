/**
 * grafikfenster-modes — Zeit-Achsen-Mathematik und Modus-Registry (Plan 01-15 Task 1).
 *
 * Faithful 1:1-Port aus OGfxRowGrid (OSimBase/OGfxRow.cpp):
 *  - timeAxisScale: SetTimeInterval-Logik (OGfxRow.cpp:1265-1303) — auto-skaliert
 *    die Zeitachse nach der Perioden-Länge.
 *  - time2client: Time2Client-Formel (OGfxRow.cpp:1497-1521) — lineare Pixel-Abbildung.
 *  - GRAFIKFENSTER_MODES: die drei OSim-Modi aus PGfxMode.cpp (m_name-Strings aus
 *    OSimPro.rc:6664-6666).
 *
 * Keine React-Abhängigkeit — reines TS-Modul, unit-testbar ohne DOM.
 */

/** Zeiteinhein-Bezeichner für Achsen-Labels. */
export type TimeUnit = "h" | "d" | "s";

/** Ergebnis der Achsen-Auto-Skalierung. */
export interface AxisScale {
  /** Anzahl Intervalle (vertikale Raster-Linien + Labels). */
  intervals: number;
  /** Einheits-Suffix für Achsen-Labels. */
  unit: TimeUnit;
}

/**
 * Bestimmt die Achsen-Skalierung einer Periode nach SPEC §2.4 / OGfxRow.cpp:1265-1303.
 *
 * | spanSeconds | intervals | unit |
 * |-------------|-----------|------|
 * | 86400       | 24        | "h"  |
 * | 604800      | 7         | "d"  |
 * | 2592000     | 30        | "d"  |
 * | 2678400     | 31        | "d"  |
 * | else        | 10        | "s"  |
 *
 * @param spanSeconds  Perioden-Länge end-begin in Sekunden.
 */
export function timeAxisScale(spanSeconds: number): AxisScale {
  switch (spanSeconds) {
    case 86400:
      return { intervals: 24, unit: "h" };
    case 604800:
      return { intervals: 7, unit: "d" };
    case 2592000:
      return { intervals: 30, unit: "d" };
    case 2678400:
      return { intervals: 31, unit: "d" };
    default:
      return { intervals: 10, unit: "s" };
  }
}

/**
 * Lineare Pixel-Abbildung t → x (OGfxRow.cpp:1497-1521, vereinfacht ohne Scroll/Zoom).
 *
 * Vereinfachung: faktZoom=1.0, scrollPosX=0 (Port, nicht ursprüngliches C++).
 *
 * @param t        Simulations-Zeit in Sekunden.
 * @param begin    Perioden-Beginn in Sekunden.
 * @param end      Perioden-Ende in Sekunden.
 * @param widthPx  Pixel-Breite des Grid-Bereichs.
 * @returns        x-Koordinate in Pixeln.
 */
export function time2client(
  t: number,
  begin: number,
  end: number,
  widthPx: number,
): number {
  const span = end - begin;
  if (span <= 0) return 0;
  return ((t - begin) / span) * widthPx;
}

/** Ein OSim-Grafikfenster-Modus. */
export interface GrafikfensterModus {
  /** Technischer Schlüssel für State-Management. */
  key: "belegung" | "warteschlangen" | "qualifikation";
  /** OSim-Anzeige-Name (1:1 aus OSimPro.rc IDS_PGFX_MODE_1/2/3). */
  name: string;
  /** Left-Bar-Header (OSimPro.rc IDS_PGFX_4). */
  header: string;
}

/**
 * Die drei OSim-Modi des Grafikfensters (OSimPro/PGfxMode.cpp, IDS_PGFX_MODE_*).
 *
 * Reihenfolge 1:1 wie im C++ (PGfxModeRessBeleg zuerst, dann WaitQueue, dann Quali).
 */
export const GRAFIKFENSTER_MODES: readonly GrafikfensterModus[] = [
  {
    key: "belegung",
    name: "Auftragsdurchlauf Belegungsressourcen",
    header: "Ressourcen",
  },
  {
    key: "warteschlangen",
    name: "Warteschlangen",
    header: "Ressourcen",
  },
  {
    key: "qualifikation",
    name: "Veränderung der Qualifikationselemente",
    header: "Ressourcen",
  },
] as const;
