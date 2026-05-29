/**
 * Tests für die GanttRow-Komponente (Plan 01-02 Task 3).
 *
 * GanttRow rendert die gantt_durchlauf-Frames EINES Auftrags als Zeit-Balken-
 * Spur über die @osim/graphobject-Geometrie (D-4.3). Ein start-Frame öffnet
 * einen Balken, der zugehörige ende-Frame schließt ihn (start_time→end_time).
 *
 * Acceptance (Plan): gerendert mit start- + ende-Frame (start_time=3600,
 * end_time=10800) zeigt die Komponente einen Balken mit intervall-konformer
 * Geometrie (Breite > 0, Element existiert).
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GanttRow } from "../components/GanttRow";
import type { Frame } from "../types";

function startFrame(auftrag: string, start: number): Frame {
  return {
    t: start,
    stream: "gantt_durchlauf",
    seq: 1,
    v: {
      kind: "start",
      auftrag_id: auftrag,
      prozess_id: "P1.OP10",
      start_time: start,
      betriebsmittel_id: "BM-Drehe-01",
      dauer_geplant: 7200,
    },
  };
}

function endeFrame(auftrag: string, start: number, end: number): Frame {
  return {
    t: end,
    stream: "gantt_durchlauf",
    seq: 2,
    v: {
      kind: "ende",
      auftrag_id: auftrag,
      prozess_id: "P1.OP10",
      start_time: start,
      end_time: end,
      dauer_ist: end - start,
      status: "abgeschlossen",
    },
  };
}

describe("GanttRow", () => {
  it("rendert einen Balken für ein abgeschlossenes Intervall (start+ende)", () => {
    const frames = [
      startFrame("FA-001", 3600),
      endeFrame("FA-001", 3600, 10800),
    ];
    render(
      <GanttRow auftragId="FA-001" frames={frames} pxPerSecond={0.01} />,
    );

    const bar = screen.getByTestId("gantt-bar-FA-001-P1.OP10");
    expect(bar).toBeInTheDocument();
    // Intervall 3600..10800 = 7200s; bei 0.01 px/s → 72px Breite.
    const width = bar.style.width;
    expect(parseFloat(width)).toBeCloseTo(72, 0);
  });

  it("zeigt die Auftrags-Kennung als Label", () => {
    render(
      <GanttRow
        auftragId="FA-001"
        frames={[startFrame("FA-001", 3600), endeFrame("FA-001", 3600, 10800)]}
        pxPerSecond={0.01}
      />,
    );
    expect(screen.getByText("FA-001")).toBeInTheDocument();
  });

  it("rendert auch einen noch laufenden (nur start, kein ende) Balken", () => {
    render(
      <GanttRow
        auftragId="FA-002"
        frames={[startFrame("FA-002", 3600)]}
        pxPerSecond={0.01}
        nowSeconds={7200}
      />,
    );
    const bar = screen.getByTestId("gantt-bar-FA-002-P1.OP10");
    expect(bar).toBeInTheDocument();
    // Laufend: von start_time (3600) bis nowSeconds (7200) = 3600s → 36px.
    expect(parseFloat(bar.style.width)).toBeCloseTo(36, 0);
  });
});
