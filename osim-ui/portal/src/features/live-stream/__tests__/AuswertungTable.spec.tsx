/**
 * Tests für AuswertungTable + SchichtTable (Plan 01-12 Task 1, O-2 / O-3).
 *
 * Verbindlich (Plan must_haves):
 *  - Jede Auswertung rendert mit den EXAKTEN deutschen OSim-Spalten-Headern
 *    (1:1 aus den ISimulatorViewerAusw*.cpp, an die 01-11-Feldnamen gebunden).
 *  - Now-buildable kinds (records[]) → eine Zeile je Record mit echten Werten.
 *  - Slice-gated kinds (null + missing_slice) → "(Slice offen)", NIE 0 oder
 *    erfundene Zahlen (Threat T-01-12A: Information Disclosure).
 *  - SchichtTable rendert die 4 Schicht-Header.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AuswertungTable } from "../components/AuswertungTable";
import { SchichtTable } from "../components/SchichtTable";
import type { Frame } from "../types";

function kpiFrame(kind: string, v: Record<string, unknown>): Frame {
  return {
    t: 86400,
    stream: "kpi_auswertung",
    seq: 1,
    v: { kind, period_num: 0, ...v },
  };
}

afterEach(() => cleanup());

describe("AuswertungTable — prod_auftrag (now-buildable)", () => {
  it("zeigt die 4 exakten OSim-Header und eine Record-Zeile mit echten Werten", () => {
    const frame = kpiFrame("prod_auftrag", {
      records: [
        {
          teil: "Erzeugnis-1",
          menge: 1,
          soll_beginn_tag: 100,
          beschreibung: "Bearbeitung",
        },
      ],
    });
    render(<AuswertungTable kind="prod_auftrag" frames={[frame]} />);

    expect(screen.getByText("Teil")).toBeInTheDocument();
    expect(screen.getByText("Menge")).toBeInTheDocument();
    expect(screen.getByText("Soll-Beginntermin (Tag)")).toBeInTheDocument();
    expect(screen.getByText("Beschreibung")).toBeInTheDocument();

    const rows = screen.getAllByTestId("ausw-row-prod_auftrag");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(within(row).getByText("Erzeugnis-1")).toBeInTheDocument();
    expect(within(row).getByText("100")).toBeInTheDocument();
    expect(within(row).getByText("Bearbeitung")).toBeInTheDocument();
    // Kein Gated-Marker in einer now-buildable Zeile mit echten Werten.
    expect(within(row).queryByText("(Slice offen)")).not.toBeInTheDocument();
  });
});

describe("AuswertungTable — pers (slice-gated)", () => {
  it("zeigt die 8 exakten OSim-Header und '(Slice offen)' in den gated-Zellen", () => {
    const frame = kpiFrame("pers", {
      name: null,
      schichten: null,
      ueberstunden_pct: null,
      kann_kap_pct: null,
      auslastung_pct: null,
      kosten_pro_arbeitsstd: null,
      kalk_stundensatz: null,
      gesamtkosten_periode: null,
      missing_slice: "P5-L Personal-Slice",
    });
    render(<AuswertungTable kind="pers" frames={[frame]} />);

    for (const header of [
      "Personal",
      "Anzahl Schichten",
      "Überstunden",
      "verfügbare Kapazität",
      "Auslastung",
      "Kosten pro Arbeitsstd.",
      "kalkulator. Stundensatz",
      "Gesamtkosten der Periode",
    ]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }

    // Alle gated-Zellen zeigen "(Slice offen)" — KEINE 0 / erfundene Zahl.
    const gated = screen.getAllByTestId("ausw-cell-gated");
    expect(gated.length).toBe(8);
    for (const cell of gated) {
      expect(cell).toHaveTextContent("(Slice offen)");
    }
    // Threat T-01-12A: in einer voll-gated Zeile darf keine "0" als Wert stehen.
    const row = screen.getByTestId("ausw-row-pers");
    expect(within(row).queryByText("0")).not.toBeInTheDocument();
  });
});

describe("AuswertungTable — best_auftrag (gated, leere records)", () => {
  it("zeigt die Header und eine (Slice offen)-Hinweiszeile bei leeren records + missing_slice", () => {
    const frame = kpiFrame("best_auftrag", {
      records: [],
      missing_slice: "Bestell-/Lager-Slice",
    });
    render(<AuswertungTable kind="best_auftrag" frames={[frame]} />);

    expect(screen.getByText("Bestelltermin (Tag)")).toBeInTheDocument();
    expect(screen.getByText("Auftragstyp")).toBeInTheDocument();
    expect(screen.getByTestId("ausw-cell-gated")).toHaveTextContent(
      "(Slice offen)",
    );
  });
});

describe("AuswertungTable — kalkulation (sections)", () => {
  it("zeigt die Block-Titel + Label-Wert-Zeilen, gated als '(Slice offen)'", () => {
    const frame = kpiFrame("kalkulation", {
      last_lgw: null,
      betr_kost: null,
      pers_kost: null,
      lager_kost: null,
      kapit_kost: null,
      besch_kost: null,
      teile_kost: null,
      lagerwertabgang_p1: null,
      lagerwertabgang_p2: null,
      lagerwertabgang_p3: null,
      berechneter_lagerwert: null,
      last_lgw_k: null,
      last_lgw_e: null,
      last_lgw_p: null,
      lga_k_teile: null,
      lga_e_teile: null,
      lga_p_teile: null,
      lgz_k_teile: null,
      lgz_e_teile: null,
      lgz_p_teile: null,
      lgw_k_teile: null,
      lgw_e_teile: null,
      lgw_p_teile: null,
      lgw_fertig: null,
      lgw_aktuell: null,
      missing_slice: "P5-N Kalkulations-Slice",
    });
    render(<AuswertungTable kind="kalkulation" frames={[frame]} />);

    expect(screen.getByText("Kostenkalkulation")).toBeInTheDocument();
    expect(screen.getByText("Betriebsmittelkosten")).toBeInTheDocument();
    expect(screen.getByText("Kapitalbindungskosten")).toBeInTheDocument();
    // Mindestens ein gated-Marker vorhanden.
    expect(screen.getAllByTestId("ausw-cell-gated").length).toBeGreaterThan(0);
  });
});

describe("AuswertungTable — gesamt (sections + Verkaufsergebnisse)", () => {
  it("zeigt echte Werte wo vorhanden und gated wo missing_slice", () => {
    const frame = kpiFrame("gesamt", {
      verkaufserloes: 12500,
      verkaufsergebnisse: [
        {
          produkt: 1,
          vertriebswunsch: 10,
          absatz: 8,
          herstellkosten: 1200,
          verkaufspreis: 2000,
          erloes: 16000,
        },
      ],
      verf_kapazitaet_pct: null,
      auslastung_pct: null,
      lieferfaehigkeit_pct: null,
      mittl_herstellkosten: null,
      mittlerer_lagerwert: null,
      missing_slice: "P5-N Gesamt-Kennzahlen",
      count_auftraege_gesamt: 5,
      count_auftraege_fertig: 3,
      count_auftraege_offen: 2,
    });
    render(<AuswertungTable kind="gesamt" frames={[frame]} />);

    expect(screen.getByText("Gesamtergebnis")).toBeInTheDocument();
    expect(screen.getByText("Verkaufserlös")).toBeInTheDocument();
    // Echter Wert wird gerendert (kein gated-Marker dafür).
    expect(screen.getByText("12500")).toBeInTheDocument();
    // Kennzahlen sind gated.
    expect(screen.getByText("Lieferfähigkeit")).toBeInTheDocument();
    expect(screen.getAllByTestId("ausw-cell-gated").length).toBeGreaterThan(0);
  });
});

describe("SchichtTable", () => {
  function schichtFrame(v: Record<string, unknown>): Frame {
    return { t: 86400, stream: "gantt_schicht", seq: 1, v: { period_num: 0, ...v } };
  }

  it("zeigt die 4 Schicht-Header", () => {
    const frame = schichtFrame({
      person: "Bediener-1",
      schichten: 2,
      ueberstunden: 1.5,
      einheiten: 40,
    });
    render(<SchichtTable frames={[frame]} />);

    expect(screen.getByText("Person")).toBeInTheDocument();
    expect(screen.getByText("Schichten")).toBeInTheDocument();
    expect(screen.getByText("Überstunden")).toBeInTheDocument();
    expect(screen.getByText("Einheiten")).toBeInTheDocument();
    const row = screen.getByTestId("schicht-row");
    expect(within(row).getByText("Bediener-1")).toBeInTheDocument();
  });

  it("zeigt '(Slice offen)' bei gated Schicht-Feldern", () => {
    const frame = schichtFrame({
      person: null,
      schichten: null,
      ueberstunden: null,
      einheiten: null,
      missing_slice: "P5-M",
    });
    render(<SchichtTable frames={[frame]} />);
    expect(screen.getAllByTestId("ausw-cell-gated").length).toBe(4);
  });
});
