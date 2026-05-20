// Plan 01-08 Task 2: Helpers fuer Schicht-/Wochenraster-Viewer.
//
// AEinsatzWunschViewer rendert eine Wochen-Stunden-Matrix (7 Tage × N
// Stunden); AKapBedViewer rendert Perioden-Stunden-Tabellen. Diese
// gemeinsamen Helfer kapseln die Wochentag-/Stunden-Iteration und ein
// einfaches Zeit-Format.
//
// Sprach-Konvention: Wochentag-Kuerzel auf Deutsch (Mo..So), wie im
// HKA-Lehrumfeld und im OSim2004-Original ueblich.

import type { OtxJsonNode } from "@/viewers/core/types";

// ---------------------------------------------------------------------------
// Wochentage und Stunden-Iteration
// ---------------------------------------------------------------------------

/**
 * Wochentag-Kuerzel in ISO-Reihenfolge (Mo=0..So=6).
 * Matched die OSim2004-Konvention (siehe AEinsatzWunschViewer.h).
 */
export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Tag-Index (0=Mo .. 6=So). Vollstaendige Woche.
 */
export const WEEKDAY_INDICES: number[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Stunden eines Tages (0..23). Default-Granularitaet fuer das
 * Wochen-Stunden-Raster.
 */
export const HOURS_OF_DAY: number[] = Array.from({ length: 24 }, (_, i) => i);

// ---------------------------------------------------------------------------
// Zeit-Konvertierung
// ---------------------------------------------------------------------------

/**
 * Sekunden seit Mitternacht → "HH:MM"-Format.
 */
export function formatSecondsAsTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Zwei Zeitpunkte (Sekunden) → "HH:MM-HH:MM" Range-Label.
 */
export function formatTimeRange(startSec: number, endSec: number): string {
  return `${formatSecondsAsTime(startSec)}-${formatSecondsAsTime(endSec)}`;
}

/**
 * Stunde (0..23) → "HH:00"-Label fuer Spalten-/Zeilen-Header.
 */
export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// ---------------------------------------------------------------------------
// Schicht-Wunsch-Iteration
// ---------------------------------------------------------------------------

/**
 * Ein Schicht-Wunsch-Slot innerhalb eines Tages.
 * Phase 1 nutzt den AEinsatzzeitWunsch-Knoten als Träger (siehe TYPE_MAP
 * in type-maps.ts) — wenn die Engine das Schema aendert, wird hier der
 * Adapter angepasst.
 */
export interface EinsatzWunschSlot {
  weekday: number;
  startSec: number;
  endSec: number;
  oid?: number;
}

/**
 * Liest Schicht-Wunsch-Slots aus den AEinsatzzeitWunsch-Kindknoten einer
 * AGruppe/Person.
 */
export function parseEinsatzWuensche(node: OtxJsonNode): EinsatzWunschSlot[] {
  const out: EinsatzWunschSlot[] = [];
  const stack: OtxJsonNode[] = [...node.children];
  while (stack.length > 0) {
    const n = stack.shift()!;
    if (n.klass === "AEinsatzzeitWunsch") {
      const weekday =
        typeof n.properties.m_iWochentag === "number"
          ? (n.properties.m_iWochentag as number)
          : 0;
      const startSec =
        typeof n.properties.m_iVon === "number"
          ? (n.properties.m_iVon as number)
          : 0;
      const endSec =
        typeof n.properties.m_iBis === "number"
          ? (n.properties.m_iBis as number)
          : 0;
      out.push({ weekday, startSec, endSec, oid: n.oid });
    }
    for (const c of n.children) stack.push(c);
  }
  return out;
}

/**
 * Boolean-Lookup: ist im (weekday, hour)-Slot ein Wunsch-Block aktiv?
 * Ein Slot ist aktiv, wenn die Stunde im [startSec, endSec)-Intervall
 * liegt. Stunden-Granularitaet: hourSec = hour * 3600.
 */
export function isWunschActive(
  slots: EinsatzWunschSlot[],
  weekday: number,
  hour: number,
): boolean {
  const hourSec = hour * 3600;
  return slots.some(
    (s) =>
      s.weekday === weekday && s.startSec <= hourSec && hourSec < s.endSec,
  );
}
