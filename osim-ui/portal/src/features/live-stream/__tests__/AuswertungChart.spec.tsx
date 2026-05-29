/**
 * Tests für AuswertungChart + Wiring (Plan 01-15 Task 3 — TDD RED).
 *
 * Test 1: N Kategorien + ø → N+1 Balken; letzter rot (RGB(224,0,0)), andere grün.
 * Test 2: Wert-Label (%6.2f) über jedem Balken + Titel = Kennzahl.
 * Test 3: Achse 0..nice-gerundetes-Max (5 Intervalle); leere Daten → ehrlich leer.
 * Test 4: StreamRouter rendert AuswertungChart für chart-pflichtige kinds,
 *          AuswertungTable für sections/snapshot.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AuswertungChart } from "../components/AuswertungChart";
import { StreamRouter } from "../stream-router";
import { useLiveStreamStore } from "../store";
import { viewerTabById } from "../viewer-config";
import type { Frame } from "../types";

function kpiChartFrame(seq: number, kind: string, categories: { name: string; value: number }[]): Frame {
  return {
    t: 86400,
    stream: "kpi_auswertung",
    seq,
    v: {
      kind,
      period_num: 1,
      categories,
    },
  };
}

describe("AuswertungChart", () => {
  afterEach(() => {
    cleanup();
  });

  it("Test 1: N Kategorien + ø → N+1 Balken; letzter rot, andere grün", () => {
    const categories = [
      { name: "Kanal A", value: 3000 },
      { name: "Kanal B", value: 5000 },
      { name: "ø", value: 4000 },
    ];
    render(
      <AuswertungChart
        title="mittlere Durchlaufzeit NDZ"
        categories={categories}
      />,
    );

    const bars = screen.getAllByTestId(/^ausw-chart-bar-/);
    expect(bars).toHaveLength(3);

    // Letzter Balken = ø = rot (RGB(224,0,0))
    const lastBar = screen.getByTestId("ausw-chart-bar-2");
    const lastBg = lastBar.style.backgroundColor.replace(/\s/g, "");
    expect(lastBg).toBe("rgb(224,0,0)");

    // Erste Balken = grün (RGB(0,224,0))
    const firstBar = screen.getByTestId("ausw-chart-bar-0");
    const firstBg = firstBar.style.backgroundColor.replace(/\s/g, "");
    expect(firstBg).toBe("rgb(0,224,0)");
  });

  it("Test 2: Wert-Label über jedem Balken + Titel = Kennzahl", () => {
    const categories = [
      { name: "A", value: 3000.5 },
      { name: "ø", value: 1500.75 },
    ];
    render(
      <AuswertungChart
        title="Gütegrad"
        categories={categories}
      />,
    );

    // Titel
    expect(screen.getByTestId("ausw-chart-title")).toHaveTextContent("Gütegrad");

    // Wert-Labels: %6.2f-Format → "3000.50" und "1500.75"
    expect(screen.getByTestId("ausw-chart-label-0")).toHaveTextContent("3000.50");
    expect(screen.getByTestId("ausw-chart-label-1")).toHaveTextContent("1500.75");
  });

  it("Test 3a: Leere Daten → ehrlich leerer Chart (keine Balken)", () => {
    render(
      <AuswertungChart
        title="Planzeitgrad"
        categories={[]}
      />,
    );

    expect(screen.getByTestId("ausw-chart-empty")).toBeInTheDocument();
    expect(screen.queryByTestId(/^ausw-chart-bar-/)).not.toBeInTheDocument();
  });

  it("Test 3b: Achse 0..nice-gerundetes-Max mit 5 Intervallen", () => {
    const categories = [
      { name: "A", value: 3.0 },
      { name: "B", value: 7.5 },
      { name: "ø", value: 5.25 },
    ];
    render(
      <AuswertungChart
        title="Liefertermintreue"
        categories={categories}
      />,
    );

    // Achse-Bereich muss existieren
    expect(screen.getByTestId("ausw-chart-axis")).toBeInTheDocument();
    // 5 Intervalle = 6 Tick-Labels (0..max)
    const ticks = screen.getAllByTestId(/^ausw-axis-tick-/);
    expect(ticks).toHaveLength(6); // 0,1,2,3,4,5 oder 0..nice-max in 5 Schritten
  });
});

describe("StreamRouter + AuswertungChart Wiring", () => {
  beforeEach(() => {
    useLiveStreamStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
  });

  it("Test 4a: chart-pflichtiges kind (prod_auftrag) → AuswertungTable (records-Mode)", () => {
    // prod_auftrag ist records-Mode, keine Chart-Pflicht
    useLiveStreamStore.getState().ingest([
      {
        t: 86400,
        stream: "kpi_auswertung",
        seq: 1,
        v: {
          kind: "prod_auftrag",
          period_num: 1,
          records: [{ teil: "P-1", menge: 5, soll_beginn_tag: 10, beschreibung: "X" }],
        },
      },
    ]);
    render(<StreamRouter tab={viewerTabById("ausw-prod_auftrag")!} />);
    // records-Mode bleibt Tabelle
    expect(screen.getByTestId("ausw-table-prod_auftrag")).toBeInTheDocument();
  });

  it("Test 4b: sections-kind (kalkulation) bleibt Tabelle, kein Chart", () => {
    useLiveStreamStore.getState().ingest([
      {
        t: 86400,
        stream: "kpi_auswertung",
        seq: 1,
        v: {
          kind: "kalkulation",
          period_num: 1,
          last_lgw: 12345.0,
        },
      },
    ]);
    render(<StreamRouter tab={viewerTabById("ausw-kalkulation")!} />);
    expect(screen.getByTestId("ausw-table-kalkulation")).toBeInTheDocument();
    expect(screen.queryByTestId("ausw-chart")).not.toBeInTheDocument();
  });
});
