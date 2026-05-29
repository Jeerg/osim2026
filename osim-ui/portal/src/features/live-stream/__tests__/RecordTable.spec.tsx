/**
 * Tests für RecordTable + PartialBanner (Plan 01-05 Task 2).
 *
 * RecordTable: virtualisierte Detail-Tabelle (@tanstack/react-table) über
 * reporting_record-Frames mit Spalten-Sortierung + Text-Filter (§6.3 / §8.3).
 * PartialBanner: partial-Status pro Stream (D-2.2) + gelbes Schema-Mismatch-
 * Warn-Banner (best-effort, KEIN Crash — D-OP-4 / AC-7).
 *
 * Acceptance (Plan):
 *  - 3 Frames → 3 Zeilen; Sortier-Klick ändert Reihenfolge; Filter reduziert.
 *  - meta.streams.reporting_record.status="partial" → Banner mit reason-Text.
 *  - gesetztes Mismatch-Flag → gelbes Banner, KEIN Throw (Render läuft durch).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordTable } from "../components/RecordTable";
import { PartialBanner } from "../components/PartialBanner";
import { useLiveStreamStore } from "../store";
import type { Frame, MetaJson } from "../types";

function recordFrame(
  seq: number,
  auftrag: string,
  menge: number,
  verspaetung: number,
): Frame {
  return {
    t: 86400,
    stream: "reporting_record",
    seq,
    v: {
      kind: "auftrag",
      period_num: 0,
      auftrag_id: auftrag,
      art: "fertigung",
      menge,
      start: 3600,
      ende_ist: 10800,
      ende_soll: 7200,
      verspaetung,
    },
  };
}

describe("RecordTable", () => {
  afterEach(() => cleanup());

  it("rendert eine Zeile pro reporting_record-Frame", () => {
    const frames = [
      recordFrame(1, "FA-001", 100, 3600),
      recordFrame(2, "FA-002", 50, 0),
      recordFrame(3, "FA-003", 75, 1800),
    ];
    render(<RecordTable frames={frames} />);
    expect(screen.getAllByTestId("record-row")).toHaveLength(3);
  });

  it("sortiert die Zeilen per Klick auf einen Spalten-Header", () => {
    const frames = [
      recordFrame(1, "FA-003", 75, 0),
      recordFrame(2, "FA-001", 100, 0),
      recordFrame(3, "FA-002", 50, 0),
    ];
    render(<RecordTable frames={frames} />);

    // Vor Sortierung: Reihenfolge wie eingespeist (FA-003, FA-001, FA-002).
    const before = screen
      .getAllByTestId("record-row")
      .map((r) => within(r).getByText(/FA-\d+/).textContent);
    expect(before).toEqual(["FA-003", "FA-001", "FA-002"]);

    // Klick auf "Auftrag" sortiert aufsteigend.
    fireEvent.click(screen.getByTestId("record-sort-auftrag_id"));
    const after = screen
      .getAllByTestId("record-row")
      .map((r) => within(r).getByText(/FA-\d+/).textContent);
    expect(after).toEqual(["FA-001", "FA-002", "FA-003"]);
  });

  it("reduziert die sichtbaren Zeilen über den Text-Filter", async () => {
    const user = userEvent.setup();
    const frames = [
      recordFrame(1, "FA-001", 100, 0),
      recordFrame(2, "FA-002", 50, 0),
      recordFrame(3, "XY-999", 75, 0),
    ];
    render(<RecordTable frames={frames} />);
    expect(screen.getAllByTestId("record-row")).toHaveLength(3);

    await user.type(screen.getByTestId("record-table-filter"), "FA-");
    expect(screen.getAllByTestId("record-row")).toHaveLength(2);
  });
});

describe("PartialBanner", () => {
  beforeEach(() => useLiveStreamStore.getState().reset());
  afterEach(() => cleanup());

  function setMeta(partial: Partial<MetaJson>): void {
    useLiveStreamStore.getState().setMeta({
      run_id: "test",
      schema_version: "1.0",
      streams: {},
      ...partial,
    });
  }

  it("zeigt ein Banner mit reason-Text bei status='partial'", () => {
    setMeta({
      streams: {
        reporting_record: {
          status: "partial",
          missing_slices: ["P5-D"],
          reason: "Detail-Records ohne ende_ist/ende_soll/verspaetung",
        },
      },
    });
    render(<PartialBanner tag="reporting_record" />);
    const banner = screen.getByTestId("partial-status-reporting_record");
    expect(banner).toHaveTextContent("Stream unvollständig");
    expect(banner).toHaveTextContent("P5-D");
    expect(banner).toHaveTextContent("ende_ist");
  });

  it("rendert KEIN Banner wenn der Stream full und kein Mismatch ist", () => {
    setMeta({
      schema_version: "1.0",
      streams: { reporting_record: { status: "full" } },
    });
    render(<PartialBanner tag="reporting_record" />);
    expect(
      screen.queryByTestId("partial-banner-reporting_record"),
    ).not.toBeInTheDocument();
  });

  it("rendert bei Schema-Mismatch ein gelbes Warn-Banner OHNE Crash (AC-7, D-OP-4)", () => {
    // Major-Mismatch (2.0 statt erwartet 1.x) → best-effort, KEIN Throw.
    expect(() =>
      setMeta({ schema_version: "2.0", streams: {} }),
    ).not.toThrow();
    expect(useLiveStreamStore.getState().schemaMismatch).toBe(true);

    expect(() =>
      render(<PartialBanner tag="reporting_record" />),
    ).not.toThrow();
    expect(screen.getByTestId("schema-mismatch-banner")).toBeInTheDocument();
    expect(screen.getByTestId("schema-mismatch-banner")).toHaveTextContent(
      "möglicherweise unvollständig",
    );
  });
});
