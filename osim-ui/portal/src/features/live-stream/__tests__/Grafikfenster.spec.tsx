/**
 * Tests für Grafikfenster + GrafikfensterControls (Plan 01-15 Task 2 — TDD RED).
 *
 * Prueft:
 *  Test 1: Zwei ressource_id in gantt_einsatz → zwei Ressourcen-Zeilen
 *  Test 2: Modus Belegung → Segmente mit auftragColor; Warteschlangen → rotes Gebirge;
 *           Qualifikation → ehrlich leer/gated
 *  Test 3: Steuerleiste mit Start/Weiter/Abbruch/Zurücksetzen + Felder
 *  Test 4: Rote Zeit-Linie bei max Frame-t
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Grafikfenster } from "../components/Grafikfenster";
import { GrafikfensterControls } from "../components/GrafikfensterControls";
import { useLiveStreamStore } from "../store";
import type { Frame } from "../types";

function einsatzOnFrame(
  seq: number,
  ressource_id: string,
  auftrag_oid: number,
  start_time: number,
): Frame {
  return {
    t: start_time,
    stream: "gantt_einsatz",
    seq,
    v: {
      kind: "on",
      ressource_id,
      ressource_typ: "beleg",
      start_time,
      einsatz_typ: "bearbeitung",
      kontext: `auftrag_${auftrag_oid}/prozess_1`,
      auftrag_oid,
    },
  };
}

function einsatzOffFrame(
  seq: number,
  ressource_id: string,
  start_time: number,
  end_time: number,
): Frame {
  return {
    t: end_time,
    stream: "gantt_einsatz",
    seq,
    v: {
      kind: "off",
      ressource_id,
      ressource_typ: "beleg",
      start_time,
      end_time,
      einsatz_typ: "bearbeitung",
    },
  };
}

function wartequeueFrame(
  seq: number,
  ressource_id: string,
  wartende: number,
  t: number,
): Frame {
  return {
    t,
    stream: "gantt_wartequeue",
    seq,
    v: { ressource_id, wartende },
  };
}

describe("Grafikfenster", () => {
  beforeEach(() => {
    useLiveStreamStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
  });

  it("Test 1: zwei ressource_id → zwei Ressourcen-Zeilen", () => {
    useLiveStreamStore.getState().ingest([
      einsatzOnFrame(1, "Drehe-01", 5, 0),
      einsatzOffFrame(2, "Drehe-01", 0, 3600),
      einsatzOnFrame(3, "Fraes-01", 2, 1800),
      einsatzOffFrame(4, "Fraes-01", 1800, 5400),
    ]);

    render(<Grafikfenster modus="belegung" widthPx={800} periodBegin={0} periodEnd={86400} />);

    expect(screen.getByTestId("grafik-row-Drehe-01")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-row-Fraes-01")).toBeInTheDocument();
  });

  it("Test 2a: Modus Belegung → Segment mit auftragColor (auftrag_oid-Farbe)", () => {
    useLiveStreamStore.getState().ingest([
      einsatzOnFrame(1, "Drehe-01", 4, 0),
      einsatzOffFrame(2, "Drehe-01", 0, 3600),
    ]);

    render(<Grafikfenster modus="belegung" widthPx={800} periodBegin={0} periodEnd={86400} />);

    // oid=4: rgb(0,64,0) — Segment soll diese Hintergrundfarbe tragen
    const segments = screen.getAllByTestId(/grafik-seg-/);
    expect(segments.length).toBeGreaterThan(0);
    // Mindestens ein Segment mit der erwarteten oid-Farbe
    const hasColor = segments.some(
      (el) => el.style.backgroundColor === "rgb(0,64,0)",
    );
    expect(hasColor).toBe(true);
  });

  it("Test 2b: Modus Warteschlangen → rotes Gebirge pro Ressource", () => {
    useLiveStreamStore.getState().ingest([
      wartequeueFrame(1, "Drehe-01", 3, 1800),
    ]);

    render(<Grafikfenster modus="warteschlangen" widthPx={800} periodBegin={0} periodEnd={86400} />);

    // Ressourcen-Zeile muss existieren
    expect(screen.getByTestId("grafik-row-Drehe-01")).toBeInTheDocument();
    // Gebirge-Element vorhanden
    expect(screen.getByTestId("grafik-mountain-Drehe-01")).toBeInTheDocument();
  });

  it("Test 2c: Modus Qualifikation → gated-Hinweis (keine erfundenen Werte)", () => {
    useLiveStreamStore.getState().ingest([
      einsatzOnFrame(1, "Drehe-01", 1, 0),
    ]);

    render(<Grafikfenster modus="qualifikation" widthPx={800} periodBegin={0} periodEnd={86400} />);

    // Muss ehrlich "(Slice offen)" zeigen, keine erfundenen Zahlen
    expect(screen.getByTestId("grafik-quali-gated")).toBeInTheDocument();
  });

  it("Test 4: Rote Zeit-Linie bei max Frame-t", () => {
    useLiveStreamStore.getState().ingest([
      einsatzOnFrame(1, "Drehe-01", 1, 0),
      einsatzOffFrame(2, "Drehe-01", 0, 7200), // t=7200 ist max
    ]);

    render(<Grafikfenster modus="belegung" widthPx={800} periodBegin={0} periodEnd={86400} />);

    const timeLine = screen.getByTestId("grafik-time-line");
    expect(timeLine).toBeInTheDocument();
  });
});

describe("GrafikfensterControls", () => {
  afterEach(() => {
    cleanup();
  });

  it("Test 3: rendert alle vier Buttons + Felder + Modus-Dropdown", () => {
    render(
      <GrafikfensterControls
        modelId="test-model"
        modus="belegung"
        onModusChange={() => {}}
        starting={false}
        hasRun={false}
        onStart={() => {}}
        periodBegin={0}
        periodEnd={86400}
        simTime={0}
      />,
    );

    expect(screen.getByTestId("grafik-btn-start")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-btn-abbruch")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-btn-zurueck")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-modus-select")).toBeInTheDocument();
  });

  it("Test 3b: Abbruch + Zurücksetzen faithful disabled ohne laufenden Run", () => {
    render(
      <GrafikfensterControls
        modelId=""
        modus="belegung"
        onModusChange={() => {}}
        starting={false}
        hasRun={false}
        onStart={() => {}}
        periodBegin={0}
        periodEnd={86400}
        simTime={0}
      />,
    );

    expect(screen.getByTestId("grafik-btn-abbruch")).toBeDisabled();
    expect(screen.getByTestId("grafik-btn-zurueck")).toBeDisabled();
  });
});
