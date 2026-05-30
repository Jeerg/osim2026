/**
 * EXAKT-ABGLEICH-Test: UI-Kennzahl-Berechnung vs. OSim2004-Original-Formeln.
 *
 * Strategie (Test-Conventions: Hand-Trace-Tabelle): ein kleines, vollständig von
 * Hand durchgerechnetes Szenario. Jeder Erwartungswert ist direkt aus der
 * OSim-C++-Formel abgeleitet und mit der Quelle (OSimV01(Fj)/<datei>:<zeile>)
 * kommentiert. Bestehen die Tests, rechnet das UI bit-genau wie das Original.
 *
 * Bezug: KENNZAHLEN-SPEC.md §2 + §4 + §5.
 */

import { describe, expect, it } from "vitest";
import {
  mittlereDurchlaufzeit,
  anzahlAusloesungen,
  ressourcenAuslastungApprox,
  cubeToChart,
} from "../kennzahlen";
import type { Frame } from "../types";

let seqCounter = 0;
function start(auftrag: string, oid: number, t: number): Frame {
  return {
    t,
    stream: "gantt_durchlauf",
    seq: ++seqCounter,
    v: {
      kind: "start",
      auftrag_id: auftrag,
      auftrag_oid: oid,
      prozess_id: `${auftrag}-P`,
      start_time: t,
    },
  };
}
function ende(auftrag: string, t: number): Frame {
  return {
    t,
    stream: "gantt_durchlauf",
    seq: ++seqCounter,
    v: { kind: "ende", auftrag_id: auftrag, end_time: t },
  };
}
function einsatzOn(ress: string, t: number): Frame {
  return {
    t,
    stream: "gantt_einsatz",
    seq: ++seqCounter,
    v: { kind: "on", ressource_id: ress, start_time: t },
  };
}
function einsatzOff(ress: string, t: number): Frame {
  return {
    t,
    stream: "gantt_einsatz",
    seq: ++seqCounter,
    v: { kind: "off", ressource_id: ress, end_time: t },
  };
}

describe("mittlereDurchlaufzeit (PAusloeser.cpp:149-155 + PtkMittlDlfz :650-712)", () => {
  it("Mittel je Auslöser = Σ(end−start) / count abgeschlossener Instanzen", () => {
    // Auslöser A (oid 1): zwei Auslösungen, DLZ 100 und 300 → Mittel 200.
    // Auslöser B (oid 2): eine Auslösung, DLZ 50 → Mittel 50.
    // Hand-Trace:
    //   A: (1100-1000)=100, (1700-1400)=300 → (100+300)/2 = 200
    //   B: (2200-2150)=50                      → 50/1        = 50
    const frames: Frame[] = [
      start("A", 1, 1000), ende("A", 1100),
      start("A", 1, 1400), ende("A", 1700),
      start("B", 2, 2150), ende("B", 2200),
    ];
    const cube = mittlereDurchlaufzeit(frames, "auftrag_oid");
    expect(cube.categories).toEqual([
      { name: "A", value: 200 },
      { name: "B", value: 50 },
    ]);
  });

  it("über-alles = MITTEL DER OBJEKT-MITTEL, nicht Pool-Mittel (PAusloeser.cpp:689-692)", () => {
    // Gegenprobe: beide Maße unterscheiden sich deutlich.
    //   A: 2 Instanzen je DLZ 100 → Objekt-Mittel 100
    //   B: 1 Instanz   DLZ 400    → Objekt-Mittel 400
    // Mittel-der-Mittel (OSim ø) = (100 + 400) / 2 = 250
    // Pool-Mittel (FALSCH)       = (100+100+400)/3 ≈ 200  → darf NICHT herauskommen
    const frames: Frame[] = [
      start("A", 1, 0), ende("A", 100),
      start("A", 1, 200), ende("A", 300),
      start("B", 2, 0), ende("B", 400),
    ];
    const cube = mittlereDurchlaufzeit(frames, "auftrag_oid");
    expect(cube.summary).not.toBeNull();
    expect(cube.summary!.kind).toBe("oe"); // ø / rot (PAusloeser.cpp:744-746)
    expect(cube.summary!.label).toBe("ø");
    expect(cube.summary!.value).toBe(250); // Mittel-der-Mittel
    expect(cube.summary!.value).not.toBe(200); // NICHT Pool-Mittel
  });

  it("count=0 für ein Objekt → Objekt-Mittel 0.0 (PAusloeser.cpp:150-151)", () => {
    // Ein offener start ohne ende (Instanz nicht fertiggestellt) zählt NICHT
    // (PAusloeser.cpp:115-116: count++ nur bei OnDlplBeendet).
    const frames: Frame[] = [
      start("A", 1, 0), ende("A", 100), // A: Mittel 100
      start("B", 2, 50),                 // B: offen → keine fertige Instanz
    ];
    const cube = mittlereDurchlaufzeit(frames, "auftrag_oid");
    // B taucht NICHT als Kategorie auf (keine abgeschlossene Instanz).
    expect(cube.categories).toEqual([{ name: "A", value: 100 }]);
    expect(cube.summary!.value).toBe(100);
  });

  it("NoZeroInEval: ø teilt durch Objekte mit Mittel≠0 (PAusloeser.cpp:675-689)", () => {
    // Drei Objekte, eines mit Mittel 0:
    //   A: DLZ 100 → 100 ; B: DLZ 300 → 300 ; C: DLZ 0 (start==ende) → 0
    // default     : (100+300+0)/3 = 133.33…  (durch GetCount, :692)
    // NoZeroInEval: (100+300+0)/2 = 200       (durch #(≠0), :689)
    const frames: Frame[] = [
      start("A", 1, 0), ende("A", 100),
      start("B", 2, 0), ende("B", 300),
      start("C", 3, 500), ende("C", 500), // DLZ 0
    ];
    const def = mittlereDurchlaufzeit(frames, "auftrag_oid");
    expect(def.summary!.value).toBeCloseTo(400 / 3, 6);

    const nz = mittlereDurchlaufzeit(frames, "auftrag_oid", "mittlere Durchlaufzeit", {
      noZeroInEval: true,
    });
    expect(nz.summary!.value).toBe(200);
  });

  it("leerer Stream → keine Kategorien, kein Aggregat", () => {
    const cube = mittlereDurchlaufzeit([], "auftrag_oid");
    expect(cube.categories).toEqual([]);
    expect(cube.summary).toBeNull();
  });
});

describe("anzahlAusloesungen (PAusloeser.cpp:122-125 + PtkAnzAusloesung :434-476)", () => {
  it("zählt fertiggestellte Instanzen je Objekt; ø = Mittel der Anzahlen", () => {
    // A: 2 fertige + 1 offen → 2 ; B: 1 fertig → 1
    // offener start zählt NICHT (count++ nur bei Ende, :115-116)
    const frames: Frame[] = [
      start("A", 1, 0), ende("A", 100),
      start("A", 1, 200), ende("A", 300),
      start("A", 1, 400), // offen
      start("B", 2, 0), ende("B", 50),
    ];
    const cube = anzahlAusloesungen(frames, "auftrag_oid");
    expect(cube.categories).toEqual([
      { name: "A", value: 2 },
      { name: "B", value: 1 },
    ]);
    // ø = (2+1)/2 = 1.5, rot (PAusloeser.cpp:459, :508-510)
    expect(cube.summary).toEqual({ label: "ø", value: 1.5, kind: "oe" });
  });
});

describe("ressourcenAuslastungApprox (PRessBeleg.cpp:1617-1622, Näherung)", () => {
  it("belegte Zeit / Perioden-Länge × 100 je Ressource", () => {
    // M1 belegt [0..3600]+[7200..10800] = 7200s über Periode 86400 → 8.333…%
    // M2 belegt [0..43200] = 43200s → 50%
    const frames: Frame[] = [
      einsatzOn("M1", 0), einsatzOff("M1", 3600),
      einsatzOn("M1", 7200), einsatzOff("M1", 10800),
      einsatzOn("M2", 0), einsatzOff("M2", 43200),
    ];
    const cube = ressourcenAuslastungApprox(frames, 86400);
    expect(cube.categories[0].name).toBe("M1");
    expect(cube.categories[0].value).toBeCloseTo((7200 / 86400) * 100, 6);
    expect(cube.categories[1].value).toBeCloseTo(50, 6);
    // ø über beide Ressourcen
    expect(cube.summary!.kind).toBe("oe");
    expect(cube.summary!.value).toBeCloseTo(
      ((7200 / 86400) * 100 + 50) / 2,
      6,
    );
  });
});

describe("cubeToChart", () => {
  it("hängt den Aggregat-Balken als letzte Kategorie an", () => {
    const frames: Frame[] = [
      start("A", 1, 0), ende("A", 100),
      start("B", 2, 0), ende("B", 300),
    ];
    const chart = cubeToChart(mittlereDurchlaufzeit(frames, "auftrag_oid"));
    expect(chart.categories).toEqual([
      { name: "A", value: 100 },
      { name: "B", value: 300 },
      { name: "ø", value: 200 }, // (100+300)/2
    ]);
    expect(chart.summaryType).toBe("oe");
  });
});
