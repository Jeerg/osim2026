/**
 * Tests für die KpiTile-Komponente (Plan 01-05 Task 1).
 *
 * KpiTile rendert eine KPI-Kachel des kpi_auswertung-Streams: Titel (kind),
 * den aktuellen Zahlenwert (Primär-Feld je kind, 01-03-Mapping) und einen
 * Trend-Indikator gegen die Vorperiode. Der Trend ist NICHT nur über Farbe
 * kodiert (A11y) — Symbol + Text-Label sind verpflichtend.
 *
 * Acceptance (Plan): current count_gesamt=12, previous=10 → zeigt "12" und
 * einen Aufwärts-Trend-Indikator (Icon/Text, nicht nur Farbe).
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiTile } from "../components/KpiTile";

describe("KpiTile", () => {
  it("zeigt den aktuellen Wert + einen Aufwärts-Trend (Symbol/Text)", () => {
    render(
      <KpiTile
        kind="prod_auftrag"
        current={{ kind: "prod_auftrag", period_num: 1, count_gesamt: 12 }}
        previous={{ kind: "prod_auftrag", period_num: 0, count_gesamt: 10 }}
      />,
    );

    expect(screen.getByTestId("kpi-value-prod_auftrag")).toHaveTextContent("12");

    const trend = screen.getByTestId("kpi-trend-prod_auftrag");
    // Trend muss als data-Attribut UND als Text/Symbol vorliegen (nicht nur Farbe).
    expect(trend).toHaveAttribute("data-trend", "up");
    expect(trend).toHaveTextContent("↑");
    expect(trend).toHaveTextContent("Anstieg");
    expect(trend).toHaveTextContent("+2");
  });

  it("zeigt einen Abwärts-Trend bei sinkendem Wert", () => {
    render(
      <KpiTile
        kind="prod_auftrag"
        current={{ kind: "prod_auftrag", period_num: 1, count_gesamt: 7 }}
        previous={{ kind: "prod_auftrag", period_num: 0, count_gesamt: 10 }}
      />,
    );
    const trend = screen.getByTestId("kpi-trend-prod_auftrag");
    expect(trend).toHaveAttribute("data-trend", "down");
    expect(trend).toHaveTextContent("↓");
    expect(trend).toHaveTextContent("Rückgang");
  });

  it("zeigt 'kein Vergleich' wenn keine Vorperiode vorhanden ist", () => {
    render(
      <KpiTile
        kind="betr"
        current={{ kind: "betr", period_num: 0, auslastung_pct: 78.4 }}
      />,
    );
    expect(screen.getByTestId("kpi-value-betr")).toHaveTextContent("78.4");
    const trend = screen.getByTestId("kpi-trend-betr");
    expect(trend).toHaveAttribute("data-trend", "none");
    expect(trend).toHaveTextContent("kein Vergleich");
  });
});
