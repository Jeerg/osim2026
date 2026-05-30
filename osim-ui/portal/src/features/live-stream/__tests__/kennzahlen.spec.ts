/**
 * EXAKT-ABGLEICH-Test: UI-Kennzahl-Berechnung vs. OSim2004-Original-Formeln.
 *
 * Quelle der DLZ-/Anzahl-Kennzahlen ist jetzt der `kennzahl_dlz`-Stream
 * (ein record je Auslöser mit `dlz_sum` = Σ Durchlaufzeit und `count`). Jeder
 * Erwartungswert ist von Hand aus der OSim-C++-Formel abgeleitet (Quelle im
 * Kommentar). Bestehen die Tests, rechnet das UI wie das Original.
 *
 * Bezug: KENNZAHLEN-SPEC.md §2 + §4 + §5.
 */

import { describe, expect, it } from "vitest";
import {
  mittlereDurchlaufzeit,
  anzahlAusloesungen,
  ressourcenAuslastungApprox,
  latestDlzRecords,
  cubeToChart,
  type DlzRecord,
} from "../kennzahlen";
import type { Frame } from "../types";

function rec(
  ausloeser: string,
  durchlaufplan: string | null,
  dlz_sum: number,
  count: number,
): DlzRecord {
  return { ausloeser, durchlaufplan, dlz_sum, count, ausloeser_oid: -1, durchlaufplan_oid: -1 };
}

let seqCounter = 0;
function dlzFrame(records: DlzRecord[]): Frame {
  return {
    t: 86400,
    stream: "kennzahl_dlz",
    seq: ++seqCounter,
    v: { kind: "period", period_num: 0, records },
  };
}
function einsatzOn(ress: string, t: number): Frame {
  return { t, stream: "gantt_einsatz", seq: ++seqCounter, v: { kind: "on", ressource_id: ress, start_time: t } };
}
function einsatzOff(ress: string, t: number): Frame {
  return { t, stream: "gantt_einsatz", seq: ++seqCounter, v: { kind: "off", ressource_id: ress, end_time: t } };
}

describe("latestDlzRecords", () => {
  it("nimmt die records des ZULETZT gestreamten Frames (jüngste Periode)", () => {
    const frames = [
      dlzFrame([rec("A", "P", 100, 1)]),
      dlzFrame([rec("B", "Q", 200, 1)]),
    ];
    expect(latestDlzRecords(frames)).toEqual([rec("B", "Q", 200, 1)]);
  });
  it("leere Frame-Liste → []", () => {
    expect(latestDlzRecords([])).toEqual([]);
  });
});

describe("mittlereDurchlaufzeit · Auslöser (PAusloeser GetKnzMittlDlfz :149-155)", () => {
  it("Mittel je Auslöser = dlz_sum / count, absteigend sortiert", () => {
    // A: dlz_sum 400, count 2 → 200 ; B: dlz_sum 50, count 1 → 50
    const cube = mittlereDurchlaufzeit(
      [rec("A", "P", 400, 2), rec("B", "Q", 50, 1)],
      "ausloeser",
    );
    expect(cube.categories).toEqual([
      { name: "A", value: 200 },
      { name: "B", value: 50 },
    ]);
  });

  it("ø = MITTEL DER OBJEKT-MITTEL über ALLE Objekte (:650-712)", () => {
    // A: 200, B: 50 → ø = (200+50)/2 = 125 (rot / oe, :744-746)
    const cube = mittlereDurchlaufzeit(
      [rec("A", "P", 400, 2), rec("B", "Q", 50, 1)],
      "ausloeser",
    );
    expect(cube.summary).toEqual({ label: "ø", value: 125, kind: "oe" });
  });

  it("NoZeroInEval: ø teilt durch Objekte mit Mittel≠0 (:675-689)", () => {
    // A 100, B 300, C 0 (DLZ-Summe 0 bei count 1 → mittel 0)
    const recs = [rec("A", "P", 100, 1), rec("B", "P", 300, 1), rec("C", "Q", 0, 1)];
    expect(mittlereDurchlaufzeit(recs, "ausloeser").summary!.value).toBeCloseTo(400 / 3, 6);
    expect(
      mittlereDurchlaufzeit(recs, "ausloeser", "t", { noZeroInEval: true }).summary!.value,
    ).toBe(200);
  });

  it("Top-N: zeigt nur die N größten Balken + ehrlicher Hinweis; ø über ALLE", () => {
    // 5 Objekte mit Mittel 10,20,30,40,50; topN 2 → [50,40] + "Top 2 von 5"
    const recs = [
      rec("A", "P", 10, 1), rec("B", "P", 20, 1), rec("C", "P", 30, 1),
      rec("D", "P", 40, 1), rec("E", "P", 50, 1),
    ];
    const cube = mittlereDurchlaufzeit(recs, "ausloeser", "t", { topN: 2 });
    expect(cube.categories).toEqual([{ name: "E", value: 50 }, { name: "D", value: 40 }]);
    expect(cube.note).toBe("Top 2 von 5");
    // ø bezieht ALLE 5 ein: (10+20+30+40+50)/5 = 30
    expect(cube.summary!.value).toBe(30);
  });

  it("leerer Stream → keine Kategorien, kein Aggregat, kein Hinweis", () => {
    const cube = mittlereDurchlaufzeit([], "ausloeser");
    expect(cube.categories).toEqual([]);
    expect(cube.summary).toBeNull();
    expect(cube.note).toBeNull();
  });
});

describe("mittlereDurchlaufzeit · Durchlaufplan (gepoolt, PDurchlaufplan :2072-2117)", () => {
  it("Plan-Mittel = Σdlz_sum / Σcount über die Auslöser des Plans", () => {
    // P: (100+300)/(1+1) = 200 ; Q: 400/1 = 400 → sortiert [Q 400, P 200]
    const recs = [rec("A", "P", 100, 1), rec("B", "P", 300, 1), rec("C", "Q", 400, 1)];
    const cube = mittlereDurchlaufzeit(recs, "durchlaufplan");
    expect(cube.categories).toEqual([
      { name: "Q", value: 400 },
      { name: "P", value: 200 },
    ]);
    // ø = Mittel der Plan-Mittel = (400+200)/2 = 300
    expect(cube.summary!.value).toBe(300);
  });

  it("records ohne Plan landen unter '(ohne Plan)'", () => {
    const cube = mittlereDurchlaufzeit([rec("A", null, 100, 1)], "durchlaufplan");
    expect(cube.categories).toEqual([{ name: "(ohne Plan)", value: 100 }]);
  });
});

describe("anzahlAusloesungen (m_iPtkAusloesungCount, PAusloeser.cpp:122-125)", () => {
  it("Σcount je Durchlaufplan; ø = Mittel der Anzahlen", () => {
    // P: 2+1 = 3 ; Q: 1 → sortiert [P 3, Q 1] ; ø = (3+1)/2 = 2
    const recs = [rec("A", "P", 100, 2), rec("B", "P", 50, 1), rec("C", "Q", 70, 1)];
    const cube = anzahlAusloesungen(recs, "durchlaufplan");
    expect(cube.categories).toEqual([
      { name: "P", value: 3 },
      { name: "Q", value: 1 },
    ]);
    expect(cube.summary).toEqual({ label: "ø", value: 2, kind: "oe" });
  });
});

describe("ressourcenAuslastungApprox (PRessBeleg.cpp:1617-1622, Näherung)", () => {
  it("belegte Zeit / Perioden-Länge × 100 je Ressource", () => {
    // M1 belegt 7200s über Periode 86400 → 8.333…% ; M2 belegt 43200 → 50%
    const frames: Frame[] = [
      einsatzOn("M1", 0), einsatzOff("M1", 3600),
      einsatzOn("M1", 7200), einsatzOff("M1", 10800),
      einsatzOn("M2", 0), einsatzOff("M2", 43200),
    ];
    const cube = ressourcenAuslastungApprox(frames, 86400);
    // sortiert absteigend: M2 (50%) vor M1 (8.33%)
    expect(cube.categories[0].name).toBe("M2");
    expect(cube.categories[0].value).toBeCloseTo(50, 6);
    expect(cube.categories[1].name).toBe("M1");
    expect(cube.categories[1].value).toBeCloseTo((7200 / 86400) * 100, 6);
    expect(cube.summary!.kind).toBe("oe");
    expect(cube.summary!.value).toBeCloseTo(((7200 / 86400) * 100 + 50) / 2, 6);
  });
});

describe("cubeToChart", () => {
  it("hängt den Aggregat-Balken als letzte Kategorie an + reicht note durch", () => {
    const cube = mittlereDurchlaufzeit(
      [rec("A", "P", 100, 1), rec("B", "P", 300, 1)],
      "ausloeser",
    );
    const chart = cubeToChart(cube);
    expect(chart.categories).toEqual([
      { name: "B", value: 300 },
      { name: "A", value: 100 },
      { name: "ø", value: 200 }, // (300+100)/2
    ]);
    expect(chart.summaryType).toBe("oe");
    expect(chart.note).toBeNull();
  });
});
