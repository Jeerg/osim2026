/**
 * KennzahlChartPanel — rendert eine OSim-Kennzahl als 3D-Balken-Chart.
 *
 * Brücke zwischen der UI-seitigen Kennzahl-Berechnung (kennzahlen.ts, 1:1 zu den
 * OSim-Formeln) und der Darstellung (AuswertungChart, OChartCtrl-treu). Liest die
 * Rohdaten-Frames aus dem Live-Store, füllt den Werte-Cube und dekoriert.
 *
 * Welche Kennzahl + welches Bezugsobjekt: über die KennzahlSpec (viewer-config).
 */

import * as React from "react";
import { useLiveStreamStore } from "../store";
import type { Frame } from "../types";
import type { KennzahlSpec } from "../viewer-config";
import {
  mittlereDurchlaufzeit,
  anzahlAusloesungen,
  ressourcenAuslastungApprox,
  cubeToChart,
} from "../kennzahlen";
import { AuswertungChart } from "./AuswertungChart";

const EMPTY: Frame[] = [];

export interface KennzahlChartPanelProps {
  spec: KennzahlSpec;
  /** Perioden-Länge in Sekunden (Nenner der Auslastungs-Näherung). */
  periodLen: number;
}

export function KennzahlChartPanel({
  spec,
  periodLen,
}: KennzahlChartPanelProps): React.ReactElement {
  const durchlaufFrames = useLiveStreamStore(
    (s) => s.byStream["gantt_durchlauf"] ?? EMPTY,
  );
  const einsatzFrames = useLiveStreamStore(
    (s) => s.byStream["gantt_einsatz"] ?? EMPTY,
  );

  const cube = React.useMemo(() => {
    switch (spec.fn) {
      case "mittlereDurchlaufzeit":
        return mittlereDurchlaufzeit(
          durchlaufFrames,
          spec.gruppeKey ?? "auftrag_oid",
          spec.title,
          {},
          spec.nameKey,
        );
      case "anzahlAusloesungen":
        return anzahlAusloesungen(
          durchlaufFrames,
          spec.gruppeKey ?? "auftrag_oid",
          spec.title,
          {},
          spec.nameKey,
        );
      case "ressourcenAuslastungApprox":
        return ressourcenAuslastungApprox(einsatzFrames, periodLen, spec.title);
      default:
        return { title: spec.title, categories: [], summary: null };
    }
  }, [spec, durchlaufFrames, einsatzFrames, periodLen]);

  const chart = cubeToChart(cube);

  return (
    <div className="flex flex-col gap-2" data-testid={`kennzahl-panel-${spec.id}`}>
      <AuswertungChart
        title={chart.title}
        categories={chart.categories}
        summaryType={chart.summaryType}
      />
    </div>
  );
}
