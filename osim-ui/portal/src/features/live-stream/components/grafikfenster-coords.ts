/**
 * grafikfenster-coords — Sim-Zeit-Zoom-Koordinaten (GAP-CLOSURE Plan 01-15).
 *
 * Analog zu 3fls scheduler-widget/coords.ts (PX_PER_DAY_BY_ZOOM + makeDateToX/
 * makeXToDate), aber für Simulations-Zeit in Sekunden statt Kalenderdaten.
 *
 * Zoom-Semantik (analog 3fls ZoomLevel):
 *  - "fit"          → Inhalt passt genau in die Container-Breite (dynamisch)
 *  - "tag"          → 1 Sim-Tag = feste px-Breite (Übersicht für ~59-Tage-Läufe)
 *  - "stunde"       → 1 Sim-Stunde = feste px-Breite (Detail für 1-Tages-Läufe)
 *  - "viertelstunde"→ 1 Sim-Viertelstunde = feste px-Breite (Feinansicht)
 *
 * pxPerSecond-Werte (analog PX_PER_DAY_BY_ZOOM) sind so gewählt, dass:
 *  - "tag": 59 Tage (~5,1 Mio s) scrollbar ohne sinnlose Pixel-Breite → 4px/Stunde = ~0.00111 px/s × 3600 = ~4px/h
 *  - "stunde": 1 Tag (86400s) gut sichtbar → 30px/h = ~0.00833 px/s × 3600 = 30px/h
 *  - "viertelstunde": 1 Stunde gut sichtbar → 120px/h = ~0.03333 px/s × 3600 = 120px/h
 *
 * Kontinuierlicher zoomFactor (Default 1.0) analog zu 3fls zoomFactor:
 *  effectivePxPerSecond = PX_PER_SECOND_BY_ZOOM[level] * zoomFactor
 *  "fit" ignoriert PX_PER_SECOND_BY_ZOOM und berechnet pxPerSecond dynamisch
 *  aus containerWidth / span.
 *
 * Keine React-Abhängigkeit — reines TS-Modul, unit-testbar ohne DOM.
 */

/** Zoom-Stufen für das Grafikfenster (analog 3fls ZoomLevel). */
export type SimZoomLevel = "fit" | "tag" | "stunde" | "viertelstunde";

/** Alle definierten Zoom-Stufen (Ordnung: Übersicht → Detail). */
export const SIM_ZOOM_LEVELS: readonly SimZoomLevel[] = [
  "fit",
  "tag",
  "stunde",
  "viertelstunde",
] as const;

/**
 * Pixel pro Sekunde je Zoom-Stufe (analog PX_PER_DAY_BY_ZOOM in 3fls).
 *
 * Herleitung:
 *  - "tag"          = 4 px/h = 4/3600 px/s ≈ 0.001111  → bei 59 Tagen: ~505 px Content
 *  - "stunde"       = 30 px/h = 30/3600 px/s ≈ 0.008333 → bei 1 Tag: ~720 px Content
 *  - "viertelstunde"= 120 px/h = 120/3600 px/s ≈ 0.03333 → bei 1h: ~120 px Content
 *
 * "fit" hat keinen festen Wert — er wird per Container-Breite/Span berechnet.
 */
export const PX_PER_SECOND_BY_ZOOM: Record<Exclude<SimZoomLevel, "fit">, number> = {
  tag: 4 / 3600,          // ~0.001111 px/s → 4 px pro Sim-Stunde
  stunde: 30 / 3600,      // ~0.008333 px/s → 30 px pro Sim-Stunde
  viertelstunde: 120 / 3600, // ~0.033333 px/s → 120 px pro Sim-Stunde (= 2px/min)
};

/**
 * Berechnet den effektiven px/s-Wert für eine Zoom-Stufe + Faktor.
 *
 * Für "fit" wird containerWidthPx / span verwendet (muss vom Caller übergeben werden).
 * Wenn containerWidthPx oder span fehlen/ungültig → Fallback auf "tag"-Wert.
 *
 * @param level          Zoom-Stufe
 * @param zoomFactor     Kontinuierlicher Multiplikator (Default 1.0)
 * @param containerWidthPx  Container-Breite in Pixeln (nur für "fit" relevant)
 * @param spanSeconds    Gesamt-Spanne in Sekunden (nur für "fit" relevant)
 */
export function effectivePxPerSecond(
  level: SimZoomLevel,
  zoomFactor = 1,
  containerWidthPx = 0,
  spanSeconds = 0,
): number {
  if (level === "fit") {
    if (containerWidthPx > 0 && spanSeconds > 0) {
      return (containerWidthPx / spanSeconds) * zoomFactor;
    }
    // Fallback: wie "tag"
    return PX_PER_SECOND_BY_ZOOM.tag * zoomFactor;
  }
  return PX_PER_SECOND_BY_ZOOM[level] * zoomFactor;
}

/**
 * Erzeugt eine Closure `(t) => xPixel` für gegebene Zoom-Stufe.
 *
 * x = (t - begin) * effectivePxPerSecond(level, zoomFactor)
 *
 * Analog zu 3fls `makeDateToX`, aber für Sim-Zeit.
 *
 * @param begin          Perioden-Beginn in Sekunden
 * @param level          Zoom-Stufe
 * @param zoomFactor     Kontinuierlicher Multiplikator (Default 1.0)
 * @param containerWidthPx  Container-Breite (nur für "fit" relevant)
 * @param spanSeconds    Gesamt-Spanne (nur für "fit" relevant)
 */
export function makeSimTimeToX(
  begin: number,
  level: SimZoomLevel,
  zoomFactor = 1,
  containerWidthPx = 0,
  spanSeconds = 0,
): (t: number) => number {
  const pxPerSec = effectivePxPerSecond(level, zoomFactor, containerWidthPx, spanSeconds);
  return (t: number) => (t - begin) * pxPerSec;
}

/**
 * Inverse zu `makeSimTimeToX`: `(x) => sim-Zeit in Sekunden`.
 *
 * Analog zu 3fls `makeXToDate`.
 */
export function makeSimXToTime(
  begin: number,
  level: SimZoomLevel,
  zoomFactor = 1,
  containerWidthPx = 0,
  spanSeconds = 0,
): (x: number) => number {
  const pxPerSec = effectivePxPerSecond(level, zoomFactor, containerWidthPx, spanSeconds);
  return (x: number) => {
    if (pxPerSec <= 0) return begin;
    return begin + Math.round(x / pxPerSec);
  };
}

/**
 * Berechnet die Content-Breite in Pixeln für einen gegebenen Span.
 *
 * contentWidthPx = span * effectivePxPerSecond
 *
 * Für "fit" wird containerWidthPx zurückgegeben (1:1 passend).
 */
export function contentWidthPx(
  spanSeconds: number,
  level: SimZoomLevel,
  zoomFactor = 1,
  containerWidthPx = 0,
): number {
  if (level === "fit") {
    return containerWidthPx > 0 ? containerWidthPx : spanSeconds * PX_PER_SECOND_BY_ZOOM.tag;
  }
  return spanSeconds * PX_PER_SECOND_BY_ZOOM[level] * zoomFactor;
}

/** Ein Tick auf der Sim-Zeit-Achse. */
export interface SimTimeTick {
  /** x-Koordinate in Pixeln (relativ zum Content-Beginn). */
  x: number;
  /** Lesbares Label (z.B. "12h", "30m", "2d"). */
  label: string;
}

/**
 * Erzeugt Ticks für die Sim-Zeit-Achse.
 *
 * Tick-Intervalle werden nach der Zoom-Stufe gewählt:
 *  - "fit" / "tag"          → Ticks alle N Stunden (je nach Spanne)
 *  - "stunde"               → Ticks alle N Stunden oder Minuten
 *  - "viertelstunde"        → Ticks alle 15 min
 *
 * Labels tragen Einheit-Suffix (d/h/m/s) passend zur Zoom-Stufe.
 * Ticks überlappen nicht (Mindestabstand 30px).
 *
 * @param begin      Perioden-Beginn in Sekunden
 * @param end        Perioden-Ende in Sekunden
 * @param level      Zoom-Stufe
 * @param zoomFactor Kontinuierlicher Multiplikator (Default 1.0)
 * @param containerWidthPx  Container-Breite in Pixeln (für "fit")
 */
export function simTimeTicks(
  begin: number,
  end: number,
  level: SimZoomLevel,
  zoomFactor = 1,
  containerWidthPx = 0,
): SimTimeTick[] {
  const span = end - begin;
  if (span <= 0) return [];

  const pxPerSec = effectivePxPerSecond(level, zoomFactor, containerWidthPx, span);
  const toX = (t: number) => (t - begin) * pxPerSec;

  // Tick-Intervall und Einheit nach Zoom-Stufe und Span wählen.
  const MIN_TICK_PX = 40; // Mindestabstand zwischen Ticks in px

  let intervalSec: number;
  let unit: "d" | "h" | "m" | "s";
  let divider: number; // für Label-Wert

  if (level === "viertelstunde") {
    intervalSec = 15 * 60; // 15 min
    unit = "m";
    divider = 60;
  } else if (level === "stunde") {
    // 1 Stunde = pxPerSec * 3600 px
    const pxPerHour = pxPerSec * 3600;
    if (pxPerHour >= MIN_TICK_PX) {
      intervalSec = 3600; unit = "h"; divider = 3600;
    } else {
      intervalSec = 86400; unit = "d"; divider = 86400;
    }
  } else {
    // "tag" / "fit" — Spanne bestimmt sinnvollen Tick-Abstand
    const spanDays = span / 86400;
    if (spanDays <= 2) {
      // < 2 Tage → Stunden-Ticks
      intervalSec = 3600; unit = "h"; divider = 3600;
    } else if (spanDays <= 14) {
      intervalSec = 86400; unit = "d"; divider = 86400;
    } else {
      // Viele Tage: 7-Tage-Ticks
      intervalSec = 7 * 86400; unit = "d"; divider = 86400;
    }

    // Sicherstellen, dass Mindestabstand eingehalten wird
    const pxPerInterval = pxPerSec * intervalSec;
    if (pxPerInterval < MIN_TICK_PX) {
      // Interval verdoppeln bis ausreichend Platz
      let factor = Math.ceil(MIN_TICK_PX / pxPerInterval);
      // Runde factor auf sinnvolle Werte
      if (unit === "h") {
        factor = [1, 2, 3, 4, 6, 8, 12, 24].find((f) => f >= factor) ?? 24;
      } else {
        factor = [1, 2, 3, 7, 14, 30].find((f) => f >= factor) ?? 30;
      }
      intervalSec *= factor;
    }
  }

  const ticks: SimTimeTick[] = [];
  // Ersten Tick auf rundes Intervall setzen (ab begin)
  const firstT = Math.ceil(begin / intervalSec) * intervalSec;

  for (let t = firstT; t <= end; t += intervalSec) {
    const x = toX(t);
    const value = Math.round(t / divider);
    ticks.push({ x, label: `${value}${unit}` });
  }

  return ticks;
}
