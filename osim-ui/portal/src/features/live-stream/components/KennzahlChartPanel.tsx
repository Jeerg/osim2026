/**
 * KennzahlChartPanel — rendert eine OSim-Kennzahl als 2D-Balken-Chart.
 *
 * Brücke zwischen der UI-seitigen Kennzahl-Berechnung (kennzahlen.ts) und der
 * Darstellung (AuswertungChart). DLZ/Anzahl lesen den `kennzahl_dlz`-Stream
 * (Auslöser-DLZ-Rohdaten, OSim-treu); die Auslastungs-Näherung liest
 * `gantt_einsatz`. Welche Kennzahl + welches Bezugsobjekt: KennzahlSpec
 * (viewer-config).
 */

import * as React from "react";
import { useLiveStreamStore } from "../store";
import type { Frame } from "../types";
import type { KennzahlSpec } from "../viewer-config";
import {
  mittlereDurchlaufzeit,
  anzahlAusloesungen,
  ressourcenAuslastungApprox,
  latestDlzRecords,
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
  const dlzFrames = useLiveStreamStore(
    (s) => s.byStream["kennzahl_dlz"] ?? EMPTY,
  );
  const einsatzFrames = useLiveStreamStore(
    (s) => s.byStream["gantt_einsatz"] ?? EMPTY,
  );

  const cube = React.useMemo(() => {
    switch (spec.fn) {
      case "mittlereDurchlaufzeit":
        return mittlereDurchlaufzeit(
          latestDlzRecords(dlzFrames),
          spec.by ?? "ausloeser",
          spec.title,
        );
      case "anzahlAusloesungen":
        return anzahlAusloesungen(
          latestDlzRecords(dlzFrames),
          spec.by ?? "durchlaufplan",
          spec.title,
        );
      case "ressourcenAuslastungApprox":
        return ressourcenAuslastungApprox(einsatzFrames, periodLen, spec.title);
      default:
        return { title: spec.title, categories: [], summary: null, note: null };
    }
  }, [spec, dlzFrames, einsatzFrames, periodLen]);

  const chart = cubeToChart(cube);

  return (
    <div className="flex flex-col gap-2" data-testid={`kennzahl-panel-${spec.id}`}>
      <AuswertungChart
        title={chart.title}
        categories={chart.categories}
        summaryType={chart.summaryType}
        note={chart.note}
      />
    </div>
  );
}
