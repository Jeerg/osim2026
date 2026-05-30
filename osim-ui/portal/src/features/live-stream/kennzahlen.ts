/**
 * kennzahlen — OSim2004-treue Kennzahl-Berechnung AUS dem Sim-Stream (UI-seitig).
 *
 * Leitprinzip (KENNZAHLEN-SPEC, vom Nutzer vorgegeben): die Engine loggt Rohdaten,
 * die Kennzahlen werden HIER im UI berechnet. So lassen sich beliebige Kennzahlen
 * nachrüsten, solange die Rohdaten im Stream liegen.
 *
 * Durchlaufzeit (DLZ) / Anzahl Auslösungen:
 *   Quelle ist der `kennzahl_dlz`-Stream (ein Frame je Periode, `v.records[]`).
 *   Jeder record ist EIN Auslöser mit `dlz_sum` (Σ Durchlaufzeit über die
 *   abgeschlossenen Auslösungen der Periode) und `count`. Das ist die OSim-treue
 *   Auslösungs-DLZ (PAusloeser GetKnzMittlDlfz, m_dPtkDurchlaufzeit/
 *   m_iPtkAusloesungCount) — NICHT die frühere, semantisch falsche
 *   Operations-Paarung aus `gantt_durchlauf` start/ende.
 *
 * Gruppierung: je Auslöser ODER je Durchlaufplan (records tragen beide Schlüssel).
 * Da Modelle heute auf Instanzenebene liegen (viele Auslöser/Pläne, siehe
 * IDEAS-BACKLOG „ERP-nahes Instanz-Modell"), zeigen die Charts die Top-N nach
 * Wert + einen ø-Balken ÜBER ALLE Objekte (kein stiller Cap: `note` nennt „N von
 * M"). ø = Mittel der Objekt-Mittel (PAusloeser.cpp:650-712).
 *
 * Auslastung: unverändert Näherung aus `gantt_einsatz` on/off.
 */

import type { Frame } from "./types";

/** Eine Chart-Kategorie (ein Balken). */
export interface KennzahlCategory {
  /** Name der Kategorie (Bezugsobjekt, z.B. Auslöser-/Durchlaufplan-/Ressourcen-Name). */
  name: string;
  /** Wert der Kategorie. */
  value: number;
}

/** Der gefüllte Werte-"Cube" einer Kennzahl (analog MthChart vor dem Rendern). */
export interface KennzahlCube {
  /** Chart-Titel (= OSim-Kennzahl-Name). */
  title: string;
  /** Pro-Bezugsobjekt-Balken (geordnet, absteigend nach Wert; ggf. Top-N). */
  categories: KennzahlCategory[];
  /**
   * Aggregat-Balken (letzte Kategorie im Original). Typ bestimmt Label+Farbe:
   *  - "oe"  → "ø" / rot  (arithm. Mittel der Objekt-Werte ÜBER ALLE Objekte)
   *  - "sum" → "Sum" / blau (Summe über den Horizont)
   * null, wenn kein Aggregat sinnvoll ist (z.B. leer).
   */
  summary: { label: string; value: number; kind: "oe" | "sum" } | null;
  /**
   * Ehrlicher Hinweis, wenn nur eine Teilmenge der Objekte als Balken gezeigt
   * wird (Top-N). Beispiel: "Top 30 von 364". null = alle Objekte gezeigt.
   */
  note: string | null;
}

/** Optionen, die die Aggregation/Anzeige verändern. */
export interface KennzahlOptions {
  /**
   * m_PSim_NoZeroInEval (PAusloeser.cpp:675,688): wenn true, teilt der ø-Balken
   * durch die Anzahl der Objekte mit Wert ≠ 0 statt durch die Gesamtanzahl.
   * Default false.
   */
  noZeroInEval?: boolean;
  /**
   * Maximale Anzahl gezeigter Balken (Top-N nach Wert). Der ø-Balken bezieht
   * IMMER alle Objekte ein. Default 30. 0/undefined → alle.
   */
  topN?: number;
}

/** Default-Anzahl gezeigter Balken (Instanz-Modelle haben hunderte Objekte). */
export const DEFAULT_TOP_N = 30;

/** Ein Durchlaufzeit-Rohdaten-Record aus dem kennzahl_dlz-Stream (ein Auslöser). */
export interface DlzRecord {
  /** Auslöser-Name (Kategorie-Name in der Auslöser-Sicht). */
  ausloeser: string;
  /** Stabile Auslöser-OID (-1 = kein OID). */
  ausloeser_oid?: number;
  /** Durchlaufplan-Name (Kategorie-Name in der Plan-Sicht; null = ohne Plan). */
  durchlaufplan: string | null;
  /** Durchlaufplan-OID (-1, solange Loader keine Plan-OID setzt). */
  durchlaufplan_oid?: number;
  /** Σ Durchlaufzeit über die abgeschlossenen Auslösungen der Periode (Sekunden). */
  dlz_sum: number;
  /** Anzahl abgeschlossener Auslösungen der Periode. */
  count: number;
}

/** Gruppierungs-Bezugsobjekt der DLZ-/Anzahl-Kennzahlen. */
export type DlzGroupBy = "ausloeser" | "durchlaufplan";

/** Label für Records ohne zugeordneten Durchlaufplan. */
const OHNE_PLAN = "(ohne Plan)";

/**
 * Liest die records des ZULETZT gestreamten kennzahl_dlz-Frames (die jüngste
 * Periode). Frühere Perioden-Frames werden ignoriert — die Auslöser-
 * Akkumulatoren sind period-scoped (on_rec_init-Reset), der letzte Frame trägt
 * den aktuellsten Stand.
 */
export function latestDlzRecords(frames: Frame[]): DlzRecord[] {
  for (let i = frames.length - 1; i >= 0; i--) {
    const v = frames[i].v as Record<string, unknown>;
    if (Array.isArray(v.records)) return v.records as DlzRecord[];
  }
  return [];
}

/** Pro-Gruppe akkumulierte Σdlz + Σcount, in stabiler Auftritts-Reihenfolge. */
interface Gruppe {
  name: string;
  sum: number;
  count: number;
}

function gruppiere(records: DlzRecord[], by: DlzGroupBy): Gruppe[] {
  const order: string[] = [];
  const map = new Map<string, Gruppe>();
  for (const r of records) {
    const name =
      by === "durchlaufplan" ? r.durchlaufplan ?? OHNE_PLAN : r.ausloeser;
    let g = map.get(name);
    if (!g) {
      g = { name, sum: 0, count: 0 };
      map.set(name, g);
      order.push(name);
    }
    g.sum += r.dlz_sum;
    g.count += r.count;
  }
  return order.map((n) => map.get(n)!);
}

/**
 * Baut den Cube aus den Objekt-Werten: ø (Mittel-der-Werte über ALLE Objekte) +
 * Top-N-Kategorien (absteigend nach Wert) + ehrlicher "N von M"-Hinweis.
 *
 * @param werte   je Objekt {name, value} über ALLE Objekte.
 * @param topN    max. gezeigte Balken (0/undefined → alle).
 * @param noZero  ø teilt durch Objekte mit Wert ≠ 0 (NoZeroInEval).
 */
function baueCube(
  title: string,
  werte: KennzahlCategory[],
  topN: number,
  noZero: boolean,
): KennzahlCube {
  let summary: KennzahlCube["summary"] = null;
  if (werte.length > 0) {
    const sum = werte.reduce((acc, w) => acc + w.value, 0);
    const divisor = noZero ? werte.filter((w) => w.value !== 0).length : werte.length;
    summary = { label: "ø", value: divisor > 0 ? sum / divisor : 0, kind: "oe" };
  }

  const sorted = [...werte].sort((a, b) => b.value - a.value);
  const limit = topN > 0 ? topN : sorted.length;
  const categories = sorted.slice(0, limit);
  const note =
    sorted.length > limit ? `Top ${limit} von ${sorted.length}` : null;

  return { title, categories, summary, note };
}

/**
 * Mittlere Durchlaufzeit je Bezugsobjekt + ø über alle (Top-N).
 *
 * Quelle: kennzahl_dlz-records. Pro Gruppe (Auslöser/Durchlaufplan) gepoolt:
 *   Mittel = Σdlz_sum / Σcount  (= PAusloeser/PDurchlaufplan GetKnzMittlDlfz,
 *   m_dPtkDurchlaufzeit/m_iPtkAusloesungCount, PAusloeser.cpp:149-155).
 * ø über alles: Mittel der Objekt-Mittel (PAusloeser.cpp:650-712);
 * NoZeroInEval (:675-692).
 */
export function mittlereDurchlaufzeit(
  records: DlzRecord[],
  by: DlzGroupBy,
  title = "mittlere Durchlaufzeit",
  options: KennzahlOptions = {},
): KennzahlCube {
  const gruppen = gruppiere(records, by);
  const werte: KennzahlCategory[] = gruppen.map((g) => ({
    name: g.name,
    value: g.count > 0 ? g.sum / g.count : 0,
  }));
  return baueCube(
    title,
    werte,
    options.topN ?? DEFAULT_TOP_N,
    options.noZeroInEval ?? false,
  );
}

/**
 * Anzahl fertiggestellter Auslösungen je Bezugsobjekt + ø über alle (Top-N).
 *
 * Quelle: kennzahl_dlz-records, Σcount je Gruppe (= m_iPtkAusloesungCount,
 * PAusloeser.cpp:122-125). ø/rot = Mittel der Anzahlen (:508-510).
 */
export function anzahlAusloesungen(
  records: DlzRecord[],
  by: DlzGroupBy,
  title = "Anzahl fertiggestellter Auslösungen",
  options: KennzahlOptions = {},
): KennzahlCube {
  const gruppen = gruppiere(records, by);
  const werte: KennzahlCategory[] = gruppen.map((g) => ({
    name: g.name,
    value: g.count,
  }));
  return baueCube(title, werte, options.topN ?? DEFAULT_TOP_N, false);
}

/**
 * Ressourcen-Auslastung (Approximation aus Belegungs-Occupancy).
 *
 * EXAKT im Original: GetKnzAuslastung = abgearbBedarf / Kapazitätsbestand
 * (PRessBeleg.cpp:1617-1622). Der Kapazitätsbestand (Schichtmodell) ist
 * P5-D/P5-M-abhängig und wird HEUTE noch nicht gestreamt.
 *
 * Approximation (ehrlich etikettiert): Auslastung ≈ belegte Zeit /
 * Perioden-Länge, aus gantt_einsatz on/off-Intervallen je Ressource.
 */
export function ressourcenAuslastungApprox(
  einsatzFrames: Frame[],
  periodLen: number,
  title = "Auslastung (Näherung: belegte Zeit / Periode)",
): KennzahlCube {
  const offen = new Map<string, number[]>(); // ressource_id → start_times
  const order: string[] = [];
  const belegt = new Map<string, number>();

  for (const f of einsatzFrames) {
    const v = f.v as Record<string, unknown>;
    const rid = String(v.ressource_id ?? "");
    if (!rid) continue;
    if (v.kind === "on") {
      if (!belegt.has(rid)) {
        belegt.set(rid, 0);
        order.push(rid);
      }
      const st = typeof v.start_time === "number" ? v.start_time : f.t;
      const list = offen.get(rid) ?? [];
      list.push(st);
      offen.set(rid, list);
    } else if (v.kind === "off") {
      const list = offen.get(rid);
      if (!list || list.length === 0) continue;
      const st = list.shift()!;
      const end = typeof v.end_time === "number" ? v.end_time : f.t;
      belegt.set(rid, (belegt.get(rid) ?? 0) + Math.max(0, end - st));
    }
  }

  const denom = periodLen > 0 ? periodLen : 1;
  const werte: KennzahlCategory[] = order.map((rid) => ({
    name: rid,
    value: (belegt.get(rid) ?? 0) / denom * 100,
  }));
  // Ressourcen sind überschaubar → alle zeigen (topN 0), ø über alle.
  return baueCube(title, werte, 0, false);
}

/**
 * Wandelt einen KennzahlCube in die AuswertungChart-Props (categories inkl.
 * angehängtem Aggregat-Balken + Hinweis). Der Chart färbt den letzten Balken
 * rot/blau gemäß summaryType.
 */
export function cubeToChart(cube: KennzahlCube): {
  title: string;
  categories: KennzahlCategory[];
  summaryType: "oe" | "sum";
  note: string | null;
} {
  const categories = [...cube.categories];
  if (cube.summary) {
    categories.push({ name: cube.summary.label, value: cube.summary.value });
  }
  return {
    title: cube.title,
    categories,
    summaryType: cube.summary?.kind ?? "oe",
    note: cube.note,
  };
}
