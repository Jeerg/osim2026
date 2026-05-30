/**
 * AuswertungChart — flaches 2D-Balken-Chart für OSim-Kennzahlen.
 *
 * Bewusst 2D (Nutzer-Entscheidung 2026-05-30: „kannst du auch 2d machen, muss
 * nicht so sein wie im OSim"). Die frühere 3D-bmStd-Nachbildung (skewed Top-/
 * Side-Flächen) war optisch fehlerhaft und wird durch saubere, performante
 * Rechteck-Balken ersetzt. Die OSim-Semantik bleibt: grüne Objekt-Balken, der
 * letzte Balken ist die Zusammenfassung (ø rot / Sum blau), Wert-Label über dem
 * Balken (%6.2f), Kategorie-Label darunter, Achse 0..nice-Max in 5 Intervallen.
 *
 * Balken-Farben sind datengetriebene OSim-Farbwerte (ccDEFAULT grün, ccRED, ccBLUE)
 * und daher inline-style (osim-ui/CLAUDE.md: 1:1-Treue-Ausnahme). Übrige Styles
 * über 3FLS-Design-Tokens.
 *
 * `note`: optionaler ehrlicher Hinweis bei Top-N-Anzeige (z.B. „Top 30 von 364"),
 * damit eine gekappte Objektmenge nicht als „alles gezeigt" missverstanden wird.
 *
 * Leere Daten → ehrlich leerer Chart, keine erfundenen Balken.
 */

import * as React from "react";

/** Eine Chart-Kategorie. */
export interface ChartCategory {
  /** Kategorie-Name (Achsenbezeichnung unten). */
  name: string;
  /** Wert der Kategorie. */
  value: number;
}

export interface AuswertungChartProps {
  /** Titel des Charts = Kennzahl-Name. */
  title: string;
  /** Geordnete Kategorien (letzter Eintrag = Zusammenfassung ø/Sum). */
  categories: ChartCategory[];
  /**
   * Typ des Zusammenfassungs-Balkens (default: "oe" → rot).
   * "sum" → blau.
   */
  summaryType?: "oe" | "sum";
  /** Ehrlicher Top-N-Hinweis (null/undefined = alle Objekte gezeigt). */
  note?: string | null;
}

// OSim-Farbkonstanten (MthChart.cpp:403-423)
const COLOR_DEFAULT = "rgb(0,224,0)"; // ccDEFAULT grün
const COLOR_RED = "rgb(224,0,0)"; // ccRED (ø)
const COLOR_BLUE = "rgb(0,0,224)"; // ccBLUE (Sum)
const BAR_WIDTH = 44; // Balkenbreite in px
const CELL_WIDTH = 64; // Spaltenbreite je Kategorie

/**
 * "Nice" Achsen-Maximum: aufgerundetes Maximum für 5 Intervalle.
 * (MthChart.cpp:57-128, vereinfacht.)
 */
function niceMax(max: number, intervals = 5): number {
  if (max <= 0) return intervals; // Fallback: 5 Einheiten
  const intv = max / intervals;
  const pot = Math.pow(10, Math.floor(Math.log10(intv)));
  const niceIntv = Math.ceil(intv / pot) * pot;
  return niceIntv * intervals;
}

/** Formatiert einen Wert nach %6.2f (2 Dezimalstellen). */
function fmt2f(v: number): string {
  return v.toFixed(2);
}

/** Formatiert einen Achsen-Wert nach %6.0f. */
function fmt0f(v: number): string {
  return Math.round(v).toString();
}

/** Ein flacher 2D-Balken mit Wert-Label oben und Kategorie-Label unten. */
function Bar2D({
  value,
  axisMax,
  color,
  chartHeight,
  index,
  name,
}: {
  value: number;
  axisMax: number;
  color: string;
  chartHeight: number;
  index: number;
  name: string;
}): React.ReactElement {
  const fillH = axisMax > 0 ? Math.max(0, (value / axisMax) * chartHeight) : 0;

  return (
    <div
      className="flex shrink-0 flex-col items-center"
      style={{ width: CELL_WIDTH }}
      aria-label={`${name}: ${fmt2f(value)}`}
    >
      {/* Wert-Label über dem Balken (%6.2f) */}
      <span
        className="mb-0.5 text-[10px] font-medium tabular-nums text-foreground"
        data-testid={`ausw-chart-label-${index}`}
      >
        {fmt2f(value)}
      </span>

      {/* Balken-Zone fester Höhe, Balken unten ausgerichtet */}
      <div
        className="flex items-end"
        style={{ height: chartHeight }}
      >
        <div
          data-testid={`ausw-chart-bar-${index}`}
          className="rounded-t-sm"
          style={{
            width: BAR_WIDTH,
            height: fillH,
            backgroundColor: color,
          }}
        />
      </div>

      {/* Kategorie-Label unterhalb */}
      <span
        className="mt-1 max-w-[60px] truncate text-center text-[10px] text-muted-foreground"
        title={name}
      >
        {name}
      </span>
    </div>
  );
}

export function AuswertungChart({
  title,
  categories,
  summaryType = "oe",
  note = null,
}: AuswertungChartProps): React.ReactElement {
  if (categories.length === 0) {
    return (
      <div
        className="flex h-32 items-center justify-center text-sm text-muted-foreground"
        data-testid="ausw-chart-empty"
        aria-label={`${title}: keine Daten`}
      >
        Keine Auswertungs-Daten.
      </div>
    );
  }

  const maxVal = Math.max(...categories.map((c) => c.value), 0);
  const axisMax = niceMax(maxVal);
  const axisIntervals = 5;
  const chartHeight = 160; // Balken-Zone in px

  const summaryColor = summaryType === "sum" ? COLOR_BLUE : COLOR_RED;

  return (
    <div
      className="flex flex-col gap-2"
      data-testid="ausw-chart"
      aria-label={`Chart: ${title}`}
    >
      {/* Titel */}
      <div
        className="text-center text-sm font-semibold text-foreground"
        data-testid="ausw-chart-title"
      >
        {title}
      </div>

      {/* Ehrlicher Top-N-Hinweis */}
      {note && (
        <div
          className="text-center text-[11px] text-muted-foreground"
          data-testid="ausw-chart-note"
        >
          {note}
        </div>
      )}

      {/* Achse + Balken nebeneinander */}
      <div className="flex gap-2">
        {/* Y-Achse links (0..nice-Max, 5 Intervalle) */}
        <div
          className="flex flex-col-reverse justify-between border-r border-border pr-1 text-right text-[10px] tabular-nums text-muted-foreground"
          style={{ height: chartHeight, width: 52 }}
          data-testid="ausw-chart-axis"
          aria-label="Werteachse"
        >
          {Array.from({ length: axisIntervals + 1 }, (_, i) => {
            const val = (i / axisIntervals) * axisMax;
            return (
              <span key={i} data-testid={`ausw-axis-tick-${i}`}>
                {fmt0f(val)}
              </span>
            );
          })}
        </div>

        {/* Balken (horizontal scrollbar bei vielen Kategorien) */}
        <div className="flex items-end gap-1 overflow-x-auto pb-1">
          {categories.map((cat, i) => {
            const isLast = i === categories.length - 1;
            const color = isLast ? summaryColor : COLOR_DEFAULT;
            return (
              <Bar2D
                key={`${cat.name}-${i}`}
                value={cat.value}
                axisMax={axisMax}
                color={color}
                chartHeight={chartHeight}
                index={i}
                name={cat.name}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
