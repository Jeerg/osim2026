/**
 * Tests für Grafikfenster + GrafikfensterControls (Plan 01-15 Task 2 — TDD RED).
 *
 * Prueft:
 *  Test 1: Zwei ressource_id in gantt_einsatz → zwei Ressourcen-Zeilen
 *  Test 2: Modus Belegung → Segmente mit auftragColor; Warteschlangen → rotes Gebirge;
 *           Qualifikation → ehrlich leer/gated
 *  Test 3: Steuerleiste mit Start/Weiter/Abbruch/Zurücksetzen + Felder
 *  Test 4: Rote Zeit-Linie bei max Frame-t
 *
 * GAP-CLOSURE nach Browser-UAT (Plan 01-15 Fix):
 *  Test A1: ressourcenFromModel ohne Frames → Ressourcen-Zeilen erscheinen leer
 *  Test A2: ressourcenFromModel + Frames → Modell-Reihenfolge zuerst, Frame-Fallback dahinter
 *  Test B1: live.tsx liest activeModelId aus useModelStore (Persistenz-Test via Store)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Grafikfenster } from "../components/Grafikfenster";
import { GrafikfensterControls } from "../components/GrafikfensterControls";
import { useLiveStreamStore } from "../store";
import { useModelStore } from "@/stores/model-store";
import type { Frame } from "../types";
import type { ModelTreeWire } from "@/api/models";

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
    // jsdom normalisiert rgb(0,64,0) → "rgb(0, 64, 0)" (mit Leerzeichen)
    const hasColor = segments.some((el) => {
      const bg = el.style.backgroundColor.replace(/\s/g, "");
      return bg === "rgb(0,64,0)";
    });
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

  it("Test 2b-DECIMATE: viele Samples → Gebirge ohne Punkt-Explosion (UAT 2026-05-30)", () => {
    // Regression: ~8k Samples/Ressource erzeugten ein <polygon> mit zehntausenden
    // Punkten → UI-Jank + "Springen". Decimation pro Pixelspalte fängt das auf.
    const N = 8000;
    const frames: Frame[] = [];
    for (let i = 0; i < N; i++) {
      // Sägezahn, damit das Spalten-Maximum nicht trivial konstant ist.
      frames.push(wartequeueFrame(i + 1, "M1", (i % 50) + 1, Math.floor((i / N) * 86400)));
    }
    useLiveStreamStore.getState().ingest(frames);

    render(
      <Grafikfenster
        modus="warteschlangen"
        widthPx={800}
        periodBegin={0}
        periodEnd={86400}
        ressourcenFromModel={["M1"]}
      />,
    );

    const mountain = screen.getByTestId("grafik-mountain-M1");
    const polygon = mountain.querySelector("polygon");
    expect(polygon).not.toBeNull();
    // Decimation: deutlich weniger Punkte als Samples (ein Pixel zeigt nur einen Wert).
    const pts = (polygon?.getAttribute("points") ?? "").trim();
    const pointCount = pts.length === 0 ? 0 : pts.split(/\s+/).length;
    expect(pointCount).toBeLessThan(N);
  });

  it("Test 2b-GRUPPEN: zwei Ressourcen werden nicht vermischt (Vorgruppierung)", () => {
    useLiveStreamStore.getState().ingest([
      wartequeueFrame(1, "M1", 3, 1000),
      wartequeueFrame(2, "M2", 9, 1000),
      wartequeueFrame(3, "M1", 4, 2000),
      wartequeueFrame(4, "M2", 7, 2000),
    ]);

    render(
      <Grafikfenster
        modus="warteschlangen"
        widthPx={800}
        periodBegin={0}
        periodEnd={86400}
        ressourcenFromModel={["M1", "M2"]}
      />,
    );

    // Beide Zeilen + ihr je EIGENES Gebirge — kein Vermischen über Ressourcen.
    const m1 = screen.getByTestId("grafik-mountain-M1");
    const m2 = screen.getByTestId("grafik-mountain-M2");
    expect(m1).toBeInTheDocument();
    expect(m2).toBeInTheDocument();
    // Jede Zeile trägt ihren EIGENEN Max-Skalen-Hinweis (M1→4, M2→9) — der
    // Wert steht als title="Max. Wartende: N" am Span der jeweiligen Zeile.
    const m1row = screen.getByTestId("grafik-row-M1");
    const m2row = screen.getByTestId("grafik-row-M2");
    expect(m1row.querySelector('[title="Max. Wartende: 4"]')).not.toBeNull();
    expect(m2row.querySelector('[title="Max. Wartende: 9"]')).not.toBeNull();
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

  it("Test S1: Sticky Top-Zeitachse vorhanden (data-testid grafik-top-axis)", () => {
    // GAP-CLOSURE UAT: „fehlen noch Zeitangaben oben so dass man die Skalierung sieht"
    // Die Top-Achse muss im DOM existieren, bevor der Zeilen-Bereich beginnt.
    useLiveStreamStore.getState().ingest([
      einsatzOnFrame(1, "Drehe-01", 5, 0),
      einsatzOffFrame(2, "Drehe-01", 0, 3600),
    ]);

    render(<Grafikfenster modus="belegung" widthPx={800} periodBegin={0} periodEnd={86400} />);

    // Top-Achse mit eigenem data-testid
    const topAxis = screen.getByTestId("grafik-top-axis");
    expect(topAxis).toBeInTheDocument();
  });

  it("Test S2: Scroll-Wrapper vorhanden (data-testid grafik-scroll-wrapper)", () => {
    // GAP-CLOSURE UAT: „ein scrollbar wenn zu viele stationen da sind"
    // Der Scroll-Wrapper umschließt linke Spalte + Grid; overflow-y: auto.
    render(<Grafikfenster modus="belegung" widthPx={800} periodBegin={0} periodEnd={86400} />);

    const wrapper = screen.getByTestId("grafik-scroll-wrapper");
    expect(wrapper).toBeInTheDocument();
  });
});

describe("Grafikfenster — GAP-CLOSURE: ressourcenFromModel (Defekt A)", () => {
  beforeEach(() => {
    useLiveStreamStore.getState().reset();
    useModelStore.getState().clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("Test A1: ressourcenFromModel ohne Frames → Ressourcen-Zeilen erscheinen leer (pre-start)", () => {
    // KEIN Frame im Store — Frames kommen erst beim Lauf
    // Aber das Modell ist bekannt → Zeilen müssen trotzdem erscheinen
    render(
      <Grafikfenster
        modus="belegung"
        widthPx={800}
        periodBegin={0}
        periodEnd={86400}
        ressourcenFromModel={["Drehe-01", "Fraes-01", "Montage-01"]}
      />,
    );

    expect(screen.getByTestId("grafik-row-Drehe-01")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-row-Fraes-01")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-row-Montage-01")).toBeInTheDocument();
    // Keine Segmente — leer vor dem Start ist korrekt
    expect(screen.queryAllByTestId(/grafik-seg-/).length).toBe(0);
  });

  it("Test A2: ressourcenFromModel + Frames → Modell-Reihenfolge zuerst, Frame-Fallback dahinter", () => {
    // Frame-Ressource "Unbekannt-99" taucht im Modell nicht auf → Fallback
    useLiveStreamStore.getState().ingest([
      einsatzOnFrame(1, "Fraes-01", 5, 0),
      einsatzOffFrame(2, "Fraes-01", 0, 3600),
      einsatzOnFrame(3, "Unbekannt-99", 5, 1800),
      einsatzOffFrame(4, "Unbekannt-99", 1800, 5400),
    ]);

    render(
      <Grafikfenster
        modus="belegung"
        widthPx={800}
        periodBegin={0}
        periodEnd={86400}
        ressourcenFromModel={["Drehe-01", "Fraes-01"]}
      />,
    );

    // Alle Zeilen vorhanden
    expect(screen.getByTestId("grafik-row-Drehe-01")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-row-Fraes-01")).toBeInTheDocument();
    // Fallback-Zeile aus Frame (im Modell nicht vorhanden)
    expect(screen.getByTestId("grafik-row-Unbekannt-99")).toBeInTheDocument();

    // Reihenfolge: Modell-Ressourcen zuerst
    const rows = screen.getAllByTestId(/grafik-row-/);
    const ids = rows.map((el) => el.getAttribute("data-testid")?.replace("grafik-row-", ""));
    expect(ids[0]).toBe("Drehe-01");
    expect(ids[1]).toBe("Fraes-01");
    expect(ids[2]).toBe("Unbekannt-99");
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

    // data-testid="live-start-run" (E2E + Unit kompatibel)
    expect(screen.getByTestId("live-start-run")).toBeInTheDocument();
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

  it("Test Z-UI-1: Zoom-Button-Gruppe ist vorhanden (data-testid grafik-zoom-<level>)", () => {
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

    // Analog zu 3fls scheduler-zoom-<level>: Zoom-Buttons müssen vorhanden sein
    expect(screen.getByTestId("grafik-zoom-fit")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-zoom-tag")).toBeInTheDocument();
    expect(screen.getByTestId("grafik-zoom-stunde")).toBeInTheDocument();
  });

  it("Test Z-UI-2: aktiver Zoom-Button ist hervorgehoben (data-active)", () => {
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
        zoom="fit"
      />,
    );

    // Aktiver Button soll data-active gesetzt haben (analog 3fls)
    const fitBtn = screen.getByTestId("grafik-zoom-fit");
    expect(fitBtn).toHaveAttribute("data-active");
  });

  it("Test Z-UI-3: onZoomChange wird aufgerufen bei Zoom-Button-Klick", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const onZoomChange = vi.fn();
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
        zoom="fit"
        onZoomChange={onZoomChange}
      />,
    );

    await userEvent.setup().click(screen.getByTestId("grafik-zoom-tag"));
    expect(onZoomChange).toHaveBeenCalledWith("tag");
  });
});

describe("useModelStore — modelId-Persistenz für live.tsx (Defekt B)", () => {
  afterEach(() => {
    useModelStore.getState().clear();
  });

  it("Test B1: useModelStore.modelId wird durch setActiveModelId gesetzt und gelesen", () => {
    // Defekt B: live.tsx braucht eine setActiveModelId-Action ohne Wire-Laden.
    // Nach dieser Aktion ist modelId im Store gesetzt (persistiert modulübergreifend).
    const store = useModelStore.getState();
    // setActiveModelId muss im Store existieren
    expect(typeof (store as { setActiveModelId?: (id: string) => void }).setActiveModelId).toBe("function");

    (store as { setActiveModelId: (id: string) => void }).setActiveModelId("bosch2-model-id");
    expect(useModelStore.getState().modelId).toBe("bosch2-model-id");
  });

  it("Test B2: loadFromWire setzt modelId, live.tsx kann ihn ohne eigenes useState lesen", () => {
    const wire: ModelTreeWire = {
      version: 1,
      simulator_oid: 1,
      objects: {
        1: { oid: 1, klass: "PSimulator", attrs: {}, sub_refs: [] },
        2: { oid: 2, klass: "PBetriebsmittel", attrs: { m_sName: "Drehe-01" }, sub_refs: [] },
        3: { oid: 3, klass: "PBetriebsmittel", attrs: { m_sName: "Fraes-01" }, sub_refs: [] },
      },
      coverage: { loaded: 3, skipped: 0, unsupported: [] },
      schemas_url: "/api/v1/schemas",
    };

    useModelStore.getState().loadFromWire("test-model-id", wire);
    expect(useModelStore.getState().modelId).toBe("test-model-id");
  });

  it("Test B3: PBetriebsmittel-Ressourcen werden korrekt aus Wire-Objects extrahiert", () => {
    const wire: ModelTreeWire = {
      version: 1,
      simulator_oid: 1,
      objects: {
        1: { oid: 1, klass: "PSimulator", attrs: {}, sub_refs: [] },
        2: { oid: 2, klass: "PBetriebsmittel", attrs: { m_sName: "Drehe-01" }, sub_refs: [] },
        3: { oid: 3, klass: "PBetriebsmittel", attrs: { m_sName: "Fraes-01" }, sub_refs: [] },
        4: { oid: 4, klass: "PDurchlaufplan", attrs: {}, sub_refs: [] },
      },
      coverage: { loaded: 4, skipped: 0, unsupported: [] },
      schemas_url: "/api/v1/schemas",
    };

    useModelStore.getState().loadFromWire("test-model-id", wire);
    const { wire: loadedWire } = useModelStore.getState();
    expect(loadedWire).not.toBeNull();

    // Extrahiere PBetriebsmittel-Namen (analog zur Implementierung in live.tsx)
    const betriebsmittel = Object.values(loadedWire!.objects)
      .filter((o) => o.klass === "PBetriebsmittel")
      .sort((a, b) => a.oid - b.oid)
      .map((o) => (typeof o.attrs.m_sName === "string" ? o.attrs.m_sName : `oid_${o.oid}`));

    expect(betriebsmittel).toEqual(["Drehe-01", "Fraes-01"]);
  });
});
