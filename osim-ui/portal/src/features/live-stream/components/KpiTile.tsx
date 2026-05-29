/**
 * KpiTile — eine KPI-Kachel des kpi_auswertung-Streams (Plan 01-05 Task 1,
 * D-4.3, SPEC §8.3).
 *
 * Karte (Card-Layout über Design-Tokens) mit Titel (kind), aktuellem
 * Zahlenwert und einem Trend-Indikator gegen die Vorperiode (Periode N vs.
 * N-1). Der Trend wird NICHT nur über Farbe transportiert (A11y, 3FLS-Guide):
 * neben der Token-Farbe trägt jeder Trend ein Richtungs-Symbol (↑/↓/→) plus
 * einen Text-Label und die absolute Differenz.
 *
 * Die 11 kind-Diskriminatoren und ihre v-Felder kommen aus 01-03-SUMMARY.md.
 * Pro kind ist ein „Primär-Feld" definiert (die Leitzahl der Kachel) — z.B.
 * `count_gesamt` für die Auftrags-kinds oder `auslastung_pct` für `betr`.
 *
 * Styling strikt über Tokens (keine ad-hoc Hex-Werte) — der Trend nutzt die
 * semantischen Tokens (foreground/muted/destructive) + Symbol/Text.
 */

import * as React from "react";

/**
 * Primär-Feld (Leitzahl) je kpi_auswertung-kind. Quelle: 01-03-SUMMARY.md
 * (kind→v-Feld-Mapping). Fallback `count_gesamt`, dann erstes numerisches Feld.
 */
const PRIMARY_FIELD_BY_KIND: Record<string, string> = {
  prod_auftrag: "count_gesamt",
  best_auftrag: "count_gesamt",
  betr: "auslastung_pct",
  pers: "auslastung_pct",
  schicht: "iststunden",
  kalkulation: "kosten_sum",
  wschlange: "warte_aktuell",
  nbearbeit: "warte_aktuell",
  kauf: "count_gesamt",
  eigen: "count_gesamt",
  gesamt: "count_auftraege_gesamt",
};

/** Deutsche Anzeige-Labels je kind. */
const LABEL_BY_KIND: Record<string, string> = {
  prod_auftrag: "Fertigungsaufträge",
  best_auftrag: "Bestellaufträge",
  betr: "Betriebsmittel",
  pers: "Personal",
  schicht: "Schicht",
  kalkulation: "Kalkulation",
  wschlange: "Warteschlange",
  nbearbeit: "Nicht-Bearbeitung",
  kauf: "Kaufaufträge",
  eigen: "Eigenfertigung",
  gesamt: "Gesamt",
};

export interface KpiTileProps {
  /** kpi_auswertung-kind-Diskriminator (z.B. "prod_auftrag"). */
  kind: string;
  /** Payload (`Frame.v`) der aktuellen Periode. */
  current: Record<string, unknown>;
  /** Payload (`Frame.v`) der Vorperiode, falls vorhanden. */
  previous?: Record<string, unknown>;
}

type TrendDirection = "up" | "down" | "flat" | "none";

interface Trend {
  direction: TrendDirection;
  /** Symbol für den Trend (A11y: Information nicht nur über Farbe). */
  symbol: string;
  /** Text-Label des Trends (A11y). */
  label: string;
  /** Absolute Differenz current − previous (gerundet auf 2 Stellen). */
  delta: number;
}

/** Wählt das Primär-Feld eines kind und liest seinen numerischen Wert. */
function primaryFieldName(kind: string, v: Record<string, unknown>): string {
  const mapped = PRIMARY_FIELD_BY_KIND[kind];
  if (mapped && typeof v[mapped] === "number") return mapped;
  if (mapped && mapped in v) return mapped;
  const firstNumeric = Object.keys(v).find(
    (k) => k !== "period_num" && typeof v[k] === "number",
  );
  return mapped ?? firstNumeric ?? "value";
}

function numericValue(v: Record<string, unknown>, field: string): number | null {
  const raw = v[field];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function computeTrend(
  current: number | null,
  previous: number | null | undefined,
): Trend {
  if (current === null || previous === null || previous === undefined) {
    return { direction: "none", symbol: "–", label: "kein Vergleich", delta: 0 };
  }
  const delta = Math.round((current - previous) * 100) / 100;
  if (delta > 0) {
    return { direction: "up", symbol: "↑", label: "Anstieg", delta };
  }
  if (delta < 0) {
    return { direction: "down", symbol: "↓", label: "Rückgang", delta };
  }
  return { direction: "flat", symbol: "→", label: "unverändert", delta: 0 };
}

const TREND_TONE: Record<TrendDirection, string> = {
  up: "text-primary",
  down: "text-destructive",
  flat: "text-muted-foreground",
  none: "text-muted-foreground",
};

function formatValue(value: number | null): string {
  if (value === null) return "–";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function KpiTile({
  kind,
  current,
  previous,
}: KpiTileProps): React.ReactElement {
  const field = primaryFieldName(kind, current);
  const currentValue = numericValue(current, field);
  const previousValue =
    previous !== undefined ? numericValue(previous, field) : undefined;
  const trend = computeTrend(currentValue, previousValue);
  const label = LABEL_BY_KIND[kind] ?? kind;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm"
      data-testid={`kpi-tile-${kind}`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className="text-2xl font-semibold tabular-nums text-foreground"
        data-testid={`kpi-value-${kind}`}
      >
        {formatValue(currentValue)}
      </span>
      <span
        className={`inline-flex items-center gap-1 text-sm font-medium ${TREND_TONE[trend.direction]}`}
        data-testid={`kpi-trend-${kind}`}
        data-trend={trend.direction}
        aria-label={`Trend gegen Vorperiode: ${trend.label}`}
      >
        <span aria-hidden="true">{trend.symbol}</span>
        <span>{trend.label}</span>
        {trend.direction !== "none" && trend.direction !== "flat" && (
          <span className="tabular-nums">
            ({trend.delta > 0 ? "+" : ""}
            {formatValue(trend.delta)})
          </span>
        )}
      </span>
    </div>
  );
}
