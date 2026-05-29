/**
 * Tests für den stream-router (Plan 01-05 Task 1, O-3 / AC-4).
 *
 * Der StreamRouter multiplext anhand des Stream-Tags auf die passende
 * Render-Komponente und isoliert dabei GENAU EINEN Stream (AC-4):
 *   - kpi_auswertung   → KpiTile-Grid
 *   - reporting_record → RecordTable
 *   - gantt_durchlauf  → GanttRow(s)
 *
 * Die Frames werden über den Live-Stream-Store (D-4.2) bereitgestellt; der
 * Router liest sie via Selector — die Tests befüllen den Store per ingest().
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StreamRouter } from "../stream-router";
import { useLiveStreamStore } from "../store";
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

function kpiFrame(seq: number, kind: string, count: number): Frame {
  return {
    t: 86400,
    stream: "kpi_auswertung",
    seq,
    v: { kind, period_num: 0, count_gesamt: count },
  };
}

function recordFrame(seq: number, auftrag: string): Frame {
  return {
    t: 86400,
    stream: "reporting_record",
    seq,
    v: { kind: "auftrag", period_num: 0, auftrag_id: auftrag, art: "fertigung", start: 3600 },
  };
}

describe("StreamRouter", () => {
  beforeEach(() => {
    useLiveStreamStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
  });

  it("rendert KpiTile(s) für den Tag kpi_auswertung", () => {
    useLiveStreamStore
      .getState()
      .ingest([kpiFrame(1, "prod_auftrag", 12), kpiFrame(2, "gesamt", 30)]);
    render(<StreamRouter tag="kpi_auswertung" />);

    expect(screen.getByTestId("kpi-grid")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-tile-prod_auftrag")).toBeInTheDocument();
    // Stream-Isolation (AC-4): KEINE RecordTable / GanttRow sichtbar.
    expect(screen.queryByTestId("record-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gantt-panel")).not.toBeInTheDocument();
  });

  it("rendert die RecordTable für den Tag reporting_record", () => {
    useLiveStreamStore.getState().ingest([recordFrame(1, "FA-001")]);
    render(<StreamRouter tag="reporting_record" />);

    expect(screen.getByTestId("record-table")).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-grid")).not.toBeInTheDocument();
  });

  it("rendert GanttRow(s) für den Tag gantt_durchlauf", () => {
    useLiveStreamStore.getState().ingest([ganttFrame(1, "FA-001")]);
    render(<StreamRouter tag="gantt_durchlauf" />);

    expect(screen.getByTestId("gantt-panel")).toBeInTheDocument();
    expect(screen.getByTestId("gantt-row-FA-001")).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-grid")).not.toBeInTheDocument();
  });
});
