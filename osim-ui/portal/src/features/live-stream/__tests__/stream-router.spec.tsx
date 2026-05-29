/**
 * Tests für den stream-router (Plan 01-05 Task 1 → 01-12 Task 2, O-2 / O-3 / AC-4).
 *
 * GAP-CLOSURE 01-12: der StreamRouter multiplext jetzt auf die ECHTEN
 * OSim-Viewer (über ein ViewerTab aus viewer-config) statt auf rohe Stream-Tags:
 *   - Durchlaufplan (gantt_durchlauf)       → DurchlaufplanGantt (GanttRow/GObject)
 *   - Schicht (gantt_schicht)               → SchichtTable
 *   - Auswertungs-Tab (kpi_auswertung+kind) → AuswertungTable für sein kind
 *
 * Stream-Isolation (AC-4): genau ein Panel je aktivem Tab. Die Frames werden
 * über den Live-Stream-Store (D-4.2) bereitgestellt; der Router liest sie via
 * Selector — die Tests befüllen den Store per ingest().
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StreamRouter } from "../stream-router";
import { useLiveStreamStore } from "../store";
import { viewerTabById } from "../viewer-config";
import type { Frame } from "../types";

function ganttFrame(seq: number, auftrag: string): Frame {
  return {
    t: 3600,
    stream: "gantt_durchlauf",
    seq,
    v: {
      kind: "start",
      auftrag_id: auftrag,
      prozess_id: "P1.OP10",
      start_time: 3600,
    },
  };
}

function kpiFrame(seq: number, kind: string, v: Record<string, unknown>): Frame {
  return {
    t: 86400,
    stream: "kpi_auswertung",
    seq,
    v: { kind, period_num: 0, ...v },
  };
}

describe("StreamRouter (OSim-Viewer-Tabs)", () => {
  beforeEach(() => {
    useLiveStreamStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
  });

  it("rendert den DurchlaufplanGantt für den Durchlaufplan-Tab", () => {
    useLiveStreamStore.getState().ingest([ganttFrame(1, "FA-001")]);
    render(<StreamRouter tab={viewerTabById("durchlaufplan")!} />);

    expect(screen.getByTestId("gantt-panel")).toBeInTheDocument();
    expect(screen.getByTestId("gantt-row-FA-001")).toBeInTheDocument();
    // Isolation (AC-4): keine Auswertungs-Tabelle sichtbar.
    expect(screen.queryByTestId("ausw-table-prod_auftrag")).not.toBeInTheDocument();
  });

  it("rendert die AuswertungTable mit kind-Header für einen Auswertungs-Tab", () => {
    useLiveStreamStore
      .getState()
      .ingest([
        kpiFrame(1, "prod_auftrag", {
          records: [
            { teil: "Erzeugnis-1", menge: 2, soll_beginn_tag: 50, beschreibung: "X" },
          ],
        }),
      ]);
    render(<StreamRouter tab={viewerTabById("ausw-prod_auftrag")!} />);

    // kind-spezifischer OSim-Header sichtbar.
    expect(screen.getByText("Soll-Beginntermin (Tag)")).toBeInTheDocument();
    expect(screen.getByTestId("ausw-table-prod_auftrag")).toBeInTheDocument();
    // Isolation (AC-4): kein Gantt-Panel, keine andere Auswertung.
    expect(screen.queryByTestId("gantt-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ausw-table-pers")).not.toBeInTheDocument();
  });

  it("filtert die kpi_auswertung-Frames auf das kind des Tabs (Isolation)", () => {
    useLiveStreamStore.getState().ingest([
      kpiFrame(1, "prod_auftrag", {
        records: [{ teil: "P-1", menge: 1, soll_beginn_tag: 10, beschreibung: "A" }],
      }),
      kpiFrame(2, "pers", {
        name: null,
        schichten: null,
        ueberstunden_pct: null,
        kann_kap_pct: null,
        auslastung_pct: null,
        kosten_pro_arbeitsstd: null,
        kalk_stundensatz: null,
        gesamtkosten_periode: null,
        missing_slice: "P5-L",
      }),
    ]);
    // Der pers-Tab sieht NUR seine pers-Frames (gated), nicht die prod-Records.
    render(<StreamRouter tab={viewerTabById("ausw-pers")!} />);

    expect(screen.getByTestId("ausw-table-pers")).toBeInTheDocument();
    expect(screen.queryByText("P-1")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("ausw-cell-gated").length).toBeGreaterThan(0);
  });

  it("rendert die SchichtTable für den Schicht-Tab", () => {
    useLiveStreamStore.getState().ingest([
      {
        t: 86400,
        stream: "gantt_schicht",
        seq: 1,
        v: { period_num: 0, person: "B-1", schichten: 2, ueberstunden: 0, einheiten: 10 },
      },
    ]);
    render(<StreamRouter tab={viewerTabById("schicht")!} />);

    expect(screen.getByTestId("schicht-table")).toBeInTheDocument();
    expect(screen.queryByTestId("gantt-panel")).not.toBeInTheDocument();
  });
});
