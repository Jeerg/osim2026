/**
 * kennzahlen — OSim2004-treue Kennzahl-Berechnung AUS dem Sim-Stream (UI-seitig).
 *
 * Leitprinzip (KENNZAHLEN-SPEC, vom Nutzer vorgegeben): die Engine loggt Rohdaten,
 * die Kennzahlen werden HIER im UI berechnet. So lassen sich beliebige Kennzahlen
 * nachrüsten, solange die Rohdaten im Stream liegen.
 *
 * Alle Formeln sind 1:1 aus dem OSim2004-C++-Original übernommen; jede Funktion
 * zitiert die Quelle (OSimV01(Fj)/<datei>:<zeile>). Die Architektur spiegelt
 * OSims Trennung: hier wird der Werte-"Cube" gefüllt (analog Ptk*), die Optik
 * (AuswertungChart) dekoriert separat (analog OChartCtrl).
 *
 * Aggregat-Konvention (PAusloeser.cpp): Skalar-KPIs hängen einen ø-Balken an
 * (arithm. Mittel, rot); Tages-Zeitreihen einen Summen-Balken (blau).
 */

import type { Frame } from "./types";

/** Eine Chart-Kategorie (ein Balken). */
export interface KennzahlCategory {
  /** Name der Kategorie (Bezugsobjekt, z.B. Auslöser-/Ressourcen-Name). */
  name: string;
  /** Wert der Kategorie. */
  value: number;
}

/** Der gefüllte Werte-"Cube" einer Kennzahl (analog MthChart vor dem Rendern). */
export interface KennzahlCube {
  /** Chart-Titel (= OSim-Kennzahl-Name). */
  title: string;
  /** Pro-Bezugsobjekt-Balken (in stabiler Reihenfolge). */
  categories: KennzahlCategory[];
  /**
   * Aggregat-Balken (letzte Kategorie im Original). Typ bestimmt Label+Farbe:
   *  - "oe"  → "ø" / rot  (arithm. Mittel der Objekt-Werte)
   *  - "sum" → "Sum" / blau (Summe über den Horizont)
   * null, wenn kein Aggregat sinnvoll ist (z.B. leer).
   */
  summary: { label: string; value: number; kind: "oe" | "sum" } | null;
}

/** Optionen, die die Aggregation verändern (OSim-Profil-Flags). */
export interface KennzahlOptions {
  /**
   * m_PSim_NoZeroInEval (PAusloeser.cpp:675,688): wenn true, teilt der ø-Balken
   * durch die Anzahl der Objekte mit Wert ≠ 0 statt durch die Gesamtanzahl.
   * Der Zähler summiert IMMER alle Werte (inkl. Nullen). Default false.
   */
  noZeroInEval?: boolean;
}

/** Eine abgeschlossene Durchlauf-Instanz (aus gantt_durchlauf start+ende). */
interface DurchlaufInstanz {
  /** Gruppierungs-Schlüssel des Bezugsobjekts (z.B. auftrag_oid). */
  gruppe: string;
  /** Anzeigename des Bezugsobjekts. */
  name: string;
  startTime: number;
  endTime: number;
}

/**
 * Paart gantt_durchlauf start/ende-Frames je Prozess-Instanz zu abgeschlossenen
 * Durchlauf-Instanzen. Offene starts ohne ende werden ignoriert (zählen im
 * Original nicht zur fertiggestellten Menge, PAusloeser.cpp:115-116).
 *
 * Gruppierung über `gruppeKey` (Feld im start-Frame, z.B. "auftrag_oid" für die
 * Auslöser-Sicht; künftig "durchlaufplan_oid" für die Durchlaufplan-Sicht, sobald
 * die Engine es streamt — KENNZAHLEN-SPEC §3).
 *
 * Matching: gantt_durchlauf trägt keine stabile Prozess-OID über start/ende
 * hinweg (gantt.py nutzt id(proz) nur intern). Wir paaren daher FIFO je
 * Betriebsmittel/Auftrag: ein ende schließt das älteste offene start desselben
 * auftrag_id. Das ist für die DLZ-Summe exakt, weil die DLZ einer Instanz
 * end−start ist und die Zuordnung innerhalb eines Auftrags ordnungserhaltend bleibt.
 */
function paareDurchlaeufe(
  frames: Frame[],
  gruppeKey: string,
  nameKey = "auftrag_id",
): DurchlaufInstanz[] {
  // Offene starts je Auftrag (FIFO).
  const offen = new Map<string, { gruppe: string; name: string; startTime: number }[]>();
  const result: DurchlaufInstanz[] = [];

  for (const f of frames) {
    const v = f.v as Record<string, unknown>;
    const kind = v.kind;
    const auftragId = String(v.auftrag_id ?? "");

    if (kind === "start") {
      const gruppeRaw = v[gruppeKey];
      const gruppe =
        gruppeRaw === undefined || gruppeRaw === null
          ? auftragId
          : String(gruppeRaw);
      // Anzeigename aus nameKey (z.B. durchlaufplan_id bei Plan-Gruppierung);
      // Fallback auf den Gruppen-Wert, dann auftrag_id.
      const nameRaw = v[nameKey];
      const name =
        nameRaw !== undefined && nameRaw !== null && String(nameRaw).length > 0
          ? String(nameRaw)
          : gruppe || auftragId;
      const startTime =
        typeof v.start_time === "number" ? v.start_time : f.t;
      const list = offen.get(auftragId) ?? [];
      list.push({ gruppe, name, startTime });
      offen.set(auftragId, list);
    } else if (kind === "ende") {
      const list = offen.get(auftragId);
      if (!list || list.length === 0) continue; // ende ohne offenes start → ignorieren
      const start = list.shift()!;
      const endTime = typeof v.end_time === "number" ? v.end_time : f.t;
      result.push({
        gruppe: start.gruppe,
        name: start.name,
        startTime: start.startTime,
        endTime,
      });
    }
  }
  return result;
}

/** Pro-Gruppe Mittelwert + stabile Reihenfolge (erstes Auftreten). */
interface GruppenMittel {
  gruppe: string;
  name: string;
  /** Mittelwert der Gruppe (0 wenn keine Instanz, OSim-Konvention). */
  mittel: number;
  /** Anzahl abgeschlossener Instanzen der Gruppe. */
  count: number;
}

/**
 * Hängt den ø-Aggregat-Balken an (Mittel-der-Mittel, OSim PtkMittlDlfz).
 *
 * über-alles = (Σ Objekt-Mittel) ÷ N — UNGEWICHTETES Mittel der Objekt-Mittel,
 * NICHT Pool-Mittel über alle Instanzen (PAusloeser.cpp:650-712).
 * N = Objektanzahl (default) oder Anzahl Objekte mit Mittel≠0 wenn noZeroInEval
 * (PAusloeser.cpp:675-692).
 */
function mitOeBalken(
  title: string,
  gruppen: GruppenMittel[],
  options: KennzahlOptions,
): KennzahlCube {
  const categories = gruppen.map((g) => ({ name: g.name, value: g.mittel }));
  let summary: KennzahlCube["summary"] = null;

  if (gruppen.length > 0) {
    const sum = gruppen.reduce((acc, g) => acc + g.mittel, 0);
    const divisor = options.noZeroInEval
      ? gruppen.filter((g) => g.mittel !== 0).length
      : gruppen.length;
    const mittel = divisor > 0 ? sum / divisor : 0;
    summary = { label: "ø", value: mittel, kind: "oe" };
  }
  return { title, categories, summary };
}

/**
 * Mittlere Durchlaufzeit je Bezugsobjekt + ø über alles.
 *
 * Quelle: PAusloeser::GetKnzMittlDlfz (PAusloeser.cpp:149-155):
 *   mittel = Σ(end−start über abgeschlossene Instanzen) ÷ count, 0 wenn count=0.
 * über-alles: PAusloeserLList::PtkMittlDlfz (PAusloeser.cpp:650-712), Mittel der
 * Objekt-Mittel; NoZeroInEval (:675-692).
 * Identische Formel für Durchlaufplan (PDurchlaufplan.cpp:2072-2117) und Knoten
 * (PDlplKnoten.cpp:119-142) — nur die Gruppierung (gruppeKey) unterscheidet sich.
 *
 * @param frames     gantt_durchlauf-Frames (start+ende).
 * @param gruppeKey  start-Frame-Feld für die Gruppierung ("auftrag_oid" =
 *                   Auslöser-Sicht; "durchlaufplan_oid" = Durchlaufplan-Sicht).
 * @param title      Chart-Titel (OSim-Kennzahl-Name).
 */
export function mittlereDurchlaufzeit(
  frames: Frame[],
  gruppeKey: string,
  title = "mittlere Durchlaufzeit",
  options: KennzahlOptions = {},
  nameKey = "auftrag_id",
): KennzahlCube {
  const instanzen = paareDurchlaeufe(frames, gruppeKey, nameKey);

  // Pro Gruppe: Σ Dauer + count, Reihenfolge = erstes Auftreten.
  const order: string[] = [];
  const agg = new Map<string, { name: string; summe: number; count: number }>();
  for (const inst of instanzen) {
    let a = agg.get(inst.gruppe);
    if (!a) {
      a = { name: inst.name, summe: 0, count: 0 };
      agg.set(inst.gruppe, a);
      order.push(inst.gruppe);
    }
    a.summe += inst.endTime - inst.startTime;
    a.count += 1;
  }

  const gruppen: GruppenMittel[] = order.map((g) => {
    const a = agg.get(g)!;
    return {
      gruppe: g,
      name: a.name,
      // count>0 hier immer (Gruppe entsteht nur durch eine Instanz); 0-Schutz dennoch.
      mittel: a.count > 0 ? a.summe / a.count : 0,
      count: a.count,
    };
  });

  return mitOeBalken(title, gruppen, options);
}

/**
 * Anzahl fertiggestellter Auslösungen je Bezugsobjekt + ø über alles.
 *
 * Quelle: PAusloeser::GetKnzAnzAusloesung = m_iPtkAusloesungCount
 * (PAusloeser.cpp:122-125), inkrementiert bei OnDlplBeendet (:115-116).
 * über-alles: PtkAnzAusloesung, letzter Balken = iSumAnz/GetCount(), ø/rot
 * (PAusloeser.cpp:434-476, :508-510).
 */
export function anzahlAusloesungen(
  frames: Frame[],
  gruppeKey: string,
  title = "Anzahl fertiggestellter Auslösungen",
  options: KennzahlOptions = {},
  nameKey = "auftrag_id",
): KennzahlCube {
  const instanzen = paareDurchlaeufe(frames, gruppeKey, nameKey);
  const order: string[] = [];
  const agg = new Map<string, { name: string; count: number }>();
  for (const inst of instanzen) {
    let a = agg.get(inst.gruppe);
    if (!a) {
      a = { name: inst.name, count: 0 };
      agg.set(inst.gruppe, a);
      order.push(inst.gruppe);
    }
    a.count += 1;
  }
  const gruppen: GruppenMittel[] = order.map((g) => {
    const a = agg.get(g)!;
    return { gruppe: g, name: a.name, mittel: a.count, count: a.count };
  });
  // Anzahl ist ganzzahlig je Objekt; der ø-Balken ist das Mittel der Anzahlen.
  return mitOeBalken(title, gruppen, options);
}

/**
 * Ressourcen-Auslastung (Approximation aus Belegungs-Occupancy).
 *
 * EXAKT im Original: GetKnzAuslastung = abgearbBedarf / Kapazitätsbestand
 * (PRessBeleg.cpp:1617-1622), wobei Kapazitätsbestand = Einsatzzeit
 * (Belegungs-Fläche). Der abgearbeitete Bedarf und die theoretische Kapazität
 * (Schichtmodell) sind P5-D/P5-M-abhängig und werden HEUTE noch nicht gestreamt.
 *
 * Approximation bis dahin (ehrlich etikettiert): Auslastung ≈ belegte Zeit /
 * Perioden-Länge, aus gantt_einsatz on/off-Intervallen je Ressource. Das ist die
 * Belegungs-Fläche über der Periode — die korrekte ZÄHLER-Größe, aber mit
 * Perioden-Länge als Nenner statt der (noch fehlenden) theoretischen Kapazität.
 *
 * @param einsatzFrames gantt_einsatz on/off-Frames.
 * @param periodLen     Perioden-Länge in Sekunden (Nenner der Approximation).
 */
export function ressourcenAuslastungApprox(
  einsatzFrames: Frame[],
  periodLen: number,
  title = "Auslastung (Näherung: belegte Zeit / Periode)",
): KennzahlCube {
  // belegte Zeit je Ressource aus on/off-Paaren (FIFO je Ressource).
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
  const gruppen: GruppenMittel[] = order.map((rid) => {
    const b = belegt.get(rid) ?? 0;
    const pct = (b / denom) * 100;
    return { gruppe: rid, name: rid, mittel: pct, count: 1 };
  });
  // ø-Balken = mittlere Auslastung über alle Ressourcen (analog ccRED-ø).
  return mitOeBalken(title, gruppen, {});
}

/**
 * Wandelt einen KennzahlCube in die AuswertungChart-Props (categories inkl.
 * angehängtem Aggregat-Balken). Der Chart färbt den letzten Balken rot/blau
 * gemäß summaryType.
 */
export function cubeToChart(cube: KennzahlCube): {
  title: string;
  categories: KennzahlCategory[];
  summaryType: "oe" | "sum";
} {
  const categories = [...cube.categories];
  if (cube.summary) {
    categories.push({ name: cube.summary.label, value: cube.summary.value });
  }
  return {
    title: cube.title,
    categories,
    summaryType: cube.summary?.kind ?? "oe",
  };
}
