/**
 * AuswertungChart — 3D-Balken-Chart nach OSim2004-bmStd-Spezifikation
 * (Plan 01-15 Task 3).
 *
 * 1:1-Port des OChartCtrl bmStd-Renderers (ofc/OChartCtrl.cpp:602-685):
 *  - Balken grün (ccDEFAULT = RGB(0,224,0)) — MthChart.cpp:28
 *  - Letzter Balken = Zusammenfassungs-Kategorie "ø" rot (ccRED = RGB(224,0,0))
 *    oder "Sum" blau (ccBLUE = RGB(0,0,224)) — PAusloeser.cpp:744-746
 *  - 3D-Effekt: top +64/Kanal (aufgehellt), side -64/Kanal (abgedunkelt),
 *    depth = STD_BAR_DEPTH=12 — OChartCtrl.cpp:1277-1364
 *  - Wert-Label %6.2f über jedem Balken (m_showBarValue=TRUE) — :650-666
 *  - Kategorie-Label darunter (m_xinfo[x].m_btxt) — :669-675
 *  - Achse 0..nice-gerundetes-Max, 5 Intervalle (%6.0f) — MthChart.cpp:57-128
 *  - Titel = Kennzahl-Name (m_title, PAusloeser.cpp:749-750)
 *
 * Balken-/3D-Farben sind datengetriebene OSim-Farbwerte (nicht UI-Branding),
 * daher inline-style (osim-ui/CLAUDE.md: 1:1-Treue-Ausnahme gilt hier).
 * Alle übrigen Styles über 3FLS-Design-Tokens.
 *
 * Leere Daten → ehrlich leerer Chart, keine erfundenen Balken (T-01-15-02).
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
  /** Titel des Charts = Kennzahl-Name (m_title). */
  title: string;
  /** Geordnete Kategorien (letzter Eintrag = Zusammenfassung ø/Sum). */
  categories: ChartCategory[];
  /**
   * Typ des Zusammenfassungs-Balkens (default: "oe" → rot).
   * "sum" → blau (KnzAnzAusloesungZeitInt etc., §4.2).
   */
  summaryType?: "oe" | "sum";
}

// OSim-Farbkonstanten (MthChart.cpp:403-423)
const COLOR_DEFAULT = { r: 0, g: 224, b: 0 }; // ccDEFAULT grün
const COLOR_RED = { r: 224, g: 0, b: 0 }; // ccRED
const COLOR_BLUE = { r: 0, g: 0, b: 224 }; // ccBLUE
const BAR_DEPTH = 12; // STD_BAR_DEPTH
const BAR_WIDTH = 50; // STD_BAR_WIDTH
const CELL_WIDTH = 100; // STD_CELL_WIDTH

/** Clamp 0..255. */
const clamp = (v: number) => Math.max(0, Math.min(255, v));

/** RGB-String ohne Leerzeichen (inline-style 1:1-Treue). */
const rgb = (r: number, g: number, b: number) => `rgb(${r},${g},${b})`;

/** +64/Kanal (top-Fläche). */
const lighter = (c: { r: number; g: number; b: number }) =>
  rgb(clamp(c.r + 64), clamp(c.g + 64), clamp(c.b + 64));

/** -64/Kanal (side-Fläche). */
const darker = (c: { r: number; g: number; b: number }) =>
  rgb(clamp(c.r - 64), clamp(c.g - 64), clamp(c.b - 64));

/**
 * "Nice" Achsen-Maximum: berechnet das aufgerundete Maximum für 5 Intervalle.
 * 1:1 MthChart.cpp:57-128 (vereinfacht: pot = 10^floor(log10(intv)), dann ceil).
 */
function niceMax(max: number, intervals = 5): number {
  if (max <= 0) return intervals; // Fallback: 5 Einheiten
  const intv = max / intervals;
  const pot = Math.pow(10, Math.floor(Math.log10(intv)));
  const niceIntv = Math.ceil(intv / pot) * pot;
  return niceIntv * intervals;
}

/** Formatiert einen Wert nach %6.2f (min 6 Zeichen, 2 Dezimalstellen). */
function fmt2f(v: number): string {
  return v.toFixed(2);
}

/** Formatiert einen Achsen-Wert nach %6.0f. */
function fmt0f(v: number): string {
  return Math.round(v).toString();
}

/** Ein einzelner 3D-Balken (div-basiert, Top/Side-Flächen als Pseudo-3D). */
function Bar3D({
  value,
  maxValue,
  color,
  barHeight,
  index,
  name,
  isLast,
}: {
  value: number;
  maxValue: number;
  color: { r: number; g: number; b: number };
  barHeight: number;
  index: number;
  name: string;
  isLast: boolean;
}): React.ReactElement {
  const fillH = maxValue > 0 ? (value / maxValue) * barHeight : 0;
  const frontColor = rgb(color.r, color.g, color.b);
  const topColor = lighter(color);
  const sideColor = darker(color);

  return (
    <div
      className="flex flex-col items-center"
      style={{ width: CELL_WIDTH }}
      aria-label={`${name}: ${fmt2f(value)}`}
    >
      {/* Wert-Label über dem Balken (%6.2f, m_showBarValue=TRUE) */}
      <span
        className="mb-0.5 text-[10px] font-medium tabular-nums text-foreground"
        data-testid={`ausw-chart-label-${index}`}
      >
        {fmt2f(value)}
      </span>

      {/* 3D-Balken (front + top + side) */}
      <div
        className="relative"
        style={{ height: fillH + BAR_DEPTH, width: BAR_WIDTH + BAR_DEPTH }}
      >
        {/* Front face */}
        <div
          data-testid={`ausw-chart-bar-${index}`}
          aria-hidden={isLast ? undefined : "true"}
          className="absolute bottom-0 left-0"
          style={{
            width: BAR_WIDTH,
            height: fillH,
            backgroundColor: frontColor,
          }}
        />
        {/* Top face (parallelogram via skewed div) */}
        {fillH > 0 && (
          <div
            className="absolute"
            style={{
              width: BAR_WIDTH,
              height: BAR_DEPTH,
              bottom: fillH,
              left: BAR_DEPTH * 0.5,
              backgroundColor: topColor,
              transform: "skewX(-45deg)",
              transformOrigin: "bottom left",
            }}
            aria-hidden="true"
          />
        )}
        {/* Side face */}
        {fillH > 0 && (
          <div
            className="absolute"
            style={{
              width: BAR_DEPTH,
              height: fillH,
              bottom: 0,
              left: BAR_WIDTH,
              backgroundColor: sideColor,
            }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Kategorie-Label unterhalb */}
      <span
        className="mt-0.5 max-w-[90px] truncate text-center text-[10px] text-muted-foreground"
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
  const chartHeight = 120; // Balken-Höhe in Pixel

  // Zusammenfassungs-Farbe: ø=rot, Sum=blau (§4.2)
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

      {/* Balken + Achse nebeneinander */}
      <div className="flex gap-2">
        {/* Y-Achse links */}
        <div
          className="flex flex-col-reverse justify-between border-r border-border pr-1 text-right text-[10px] tabular-nums text-muted-foreground"
          style={{ height: chartHeight + BAR_DEPTH + 20, width: 50 }}
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

        {/* Balken */}
        <div
          className="flex items-end gap-0 overflow-x-auto"
          style={{ height: chartHeight + BAR_DEPTH + 20 }}
        >
          {categories.map((cat, i) => {
            const isLast = i === categories.length - 1;
            const color = isLast ? summaryColor : COLOR_DEFAULT;
            return (
              <Bar3D
                key={`${cat.name}-${i}`}
                value={cat.value}
                maxValue={axisMax}
                color={color}
                barHeight={chartHeight}
                index={i}
                name={cat.name}
                isLast={isLast}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
