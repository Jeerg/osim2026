/**
 * Grafikfenster — faithfull OSim2004-Grafikfenster (Plan 01-15 Task 2
 * + GAP-CLOSURE Sim-Zeit-Zoom + GAP-CLOSURE Sticky-Top-Achse + Vertikaler-Scroll).
 *
 * 1:1-Port des OGfxModeRow-Layouts (OSimBase/OGfxRow.cpp):
 *  - Top-Bar: Modus-Titel zentriert (OGfxRowTopBar)
 *  - Left-Bar: "Ressourcen"-Header + per-Ressource-Labels rechtsbündig
 *    (OGfxRowLeftBar + PGfxRowObjProzRessBeleg::Draw)
 *  - Grid: scrollbarer Content-Bereich mit gepunkteten vertikalen Zeitachsen-
 *    Linien + gepunkteten Baselines je Zeile + roter Zeit-Linie (§2.6)
 *  - Drei Modi (Modus-Dropdown-Registry):
 *      - Belegung: OID-gefärbte Segmente aus gantt_einsatz (§3.1)
 *      - Warteschlangen: rotes Gebirge aus gantt_wartequeue (§3.2)
 *      - Qualifikation: ehrlich leer/gated — "(Slice offen)" (§3.3)
 *
 * ZOOM (GAP-CLOSURE, analog 3fls scheduler-widget):
 *  - SimZoomLevel: fit | tag | stunde | viertelstunde
 *  - x(t) = (t - windowBegin) * pxProSekunde, pxProSekunde aus Zoom-Stufe
 *  - "fit" = dynamisches Zeitfenster passt in Container-Breite (bisheriges Verhalten)
 *  - Content-Breite = span * pxProSekunde → overflow-x-auto scrollbar
 *  - Linke "Ressourcen"-Spalte bleibt sticky/fix (position: sticky left: 0)
 *  - EINHEITLICHE x(t)-Abbildung für Segmente, Gebirge, Rasterlinien, rote Linie
 *  - Mausrad-Zoom (Ctrl+Wheel) für stufenlosen zoomFactor-Multiplikator
 *
 * 2D-STICKY (GAP-CLOSURE UAT: Zeitangaben oben + Scrollbar viele Stationen):
 *  - Gemeinsamer Scroll-Container (overflow auto in beide Richtungen, begrenzte Höhe)
 *  - Ecke oben-links: sticky top+left (höchster z-index) = "Ressourcen"-Header
 *  - Top-Zeitachse: sticky top (z über Body) — scrollt horizontal mit, bleibt vertikal fix
 *  - Body-Labels-Spalte: sticky left (z über Grid) — scrollt vertikal mit, bleibt horizontal fix
 *  - Grid-Body: normal scrollbar in beide Richtungen
 *
 * WARTESCHLANGEN-ZUORDNUNG (GAP-CLOSURE):
 *  - Pro Warteschlangen-Zeile: Skalen-Hinweis (max Wartende) links an der Zeile
 *  - Tooltip pro Segment/Sample mit (Sim-Zeit, Wert)
 *
 * Geometrie über GObject/@osim/graphobject (D-4.3) — keine eigene Geometrie.
 * Store-Daten kommen gecappt (MAX_FRAMES_PER_STREAM, T-01-15-03).
 *
 * Inline-style nur für datengetriebene OSim-Farben (OID-Segmente, Gebirge):
 * Das ist 1:1-Treue, kein UI-Branding — explizit begründet (osim-ui/CLAUDE.md).
 * Alle übrigen Styles über 3FLS-Design-Tokens.
 *
 * A11y: Status nie nur über Farbe (T-01-15-02, osim-ui/CLAUDE.md §5).
 * Defensive Lesung: fehlende Felder crashen nicht (T-01-15-01).
 */

import * as React from "react";
import { GObject } from "@osim/graphobject";
import { cpoint, csize, crectWidth, crectEmpty } from "@osim/graphobject";
import { useLiveStreamStore } from "../store";
import type { Frame } from "../types";
import { auftragColor } from "./AuftragColor";
import { GRAFIKFENSTER_MODES } from "./grafikfenster-modes";
import {
  type SimZoomLevel,
  makeSimTimeToX,
  contentWidthPx as calcContentWidthPx,
  simTimeTicks,
} from "./grafikfenster-coords";

/** Höhe einer Ressourcen-Zeile in Pixel (PGfxModeRessBeleg m_rowHeight=20, §3.1). */
const ROW_HEIGHT_PX = 20;
/** Höhe eines Belegungs-Segments: füllt die Zeile fast ganz (solide OSim-Balken,
 * 1px Rand oben/unten) statt eines dünnen Streifens. */
const SEG_HEIGHT_PX = 18;
/** Breite der linken Ressourcen-Leiste in Pixel (§2.1: 15 * charWidth). Die
 * OSim-Ressourcennamen (z.B. "WAR P10 (Warein.)", Person + Schicht-Suffix) sind
 * lang und rechtsbündig — 120px schnitten sie ab; 210px gibt ihnen Platz. */
const LEFT_BAR_WIDTH_PX = 210;
/** Höhe der Zeit-Achsen-Leiste (Top + ehemals Bottom, gleicher Wert). */
const AXIS_HEIGHT_PX = 28;
/** Minimalbreite des Grid-Bereichs damit der Scroll-Container einen vernünftigen
 * Startwert hat (JSDOM liefert 0 für offsetWidth). */
const MIN_GRID_WIDTH_PX = 400;
/**
 * Maximale Höhe des 2D-Scroll-Wrappers (Körper-Bereich ohne Modus-Titel-Bar).
 * Wenn viele Ressourcen-Zeilen vorhanden sind, wird ein vertikaler Scrollbalken
 * gezeigt. Fallback-Wert wenn keine Eltern-Höhe messbar ist (z.B. JSDOM-Tests).
 */
const MAX_BODY_HEIGHT_PX = 480;

/** Modus-Schlüssel-Typ. */
export type GrafikModus = "belegung" | "warteschlangen" | "qualifikation";

export interface GrafikfensterProps {
  /** Aktiver Modus (bestimmt die Render-Logik der Zeilen). */
  modus: GrafikModus;
  /** Pixel-Breite des Grafik-Bereichs (Startwert/Fallback für JSDOM-Tests). */
  widthPx: number;
  /** Perioden-Beginn in Sekunden (Zeit-Achse, Time2Client-Basis). */
  periodBegin: number;
  /** Perioden-Ende in Sekunden (Zeit-Achse). */
  periodEnd: number;
  /**
   * Ressourcen-IDs aus dem geladenen Modell (PBetriebsmittel.m_sName).
   * Diese erscheinen als Zeilen SCHON VOR dem Lauf (leere Lanes).
   * Frame-Ressourcen (die im Lauf auftauchen) werden als Fallback hinten angehängt.
   */
  ressourcenFromModel?: string[];
  /**
   * Aktive Zoom-Stufe (analog 3fls ZoomLevel, Default 'fit').
   * "fit" = Inhalt passt genau in Container (bisheriges Verhalten).
   * "tag" / "stunde" / "viertelstunde" = feste px/s-Skalierung, dann scrollbar.
   */
  zoom?: SimZoomLevel;
  /**
   * Kontinuierlicher Zoom-Multiplikator (Default 1.0), analog 3fls zoomFactor.
   * effectivePxPerSecond = PX_PER_SECOND_BY_ZOOM[level] * zoomFactor.
   */
  zoomFactor?: number;
  /** Callback wenn sich zoomFactor durch Ctrl+Wheel ändert. */
  onZoomFactorChange?: (nextFactor: number) => void;
}

/** on/off-Paar-Segment für Belegungs-Render. */
interface EinsatzSegment {
  ressource_id: string;
  start_time: number;
  end_time: number;
  auftrag_oid: number;
}

/** Warteschlangen-Sample für Queue-Gebirge. */
interface QueueSample {
  ressource_id: string;
  wartende: number;
  t: number;
}

/**
 * Extrahiert Ressourcen-IDs (distinct, in OSim-treuer Reihenfolge).
 *
 * Reihenfolge-Semantik (FSimulatorViewerGfx/PGfxModeRessBeleg):
 *  1. Modell-Ressourcen (aus PBetriebsmittel, autoritativ, pre-start) — kommen zuerst
 *  2. Frame-Ressourcen (Fallback: auftauchen im Lauf, nicht im Modell) — werden angehängt
 *
 * Defensiv — fehlende ressource_id wird ignoriert (T-01-15-01).
 */
function extractRessourcen(
  einsatzFrames: Frame[],
  queueFrames: Frame[],
  ressourcenFromModel?: string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // Schritt 1: Modell-Ressourcen zuerst (autoritativ, OSim-Reihenfolge)
  if (ressourcenFromModel && ressourcenFromModel.length > 0) {
    for (const rid of ressourcenFromModel) {
      if (typeof rid === "string" && rid.length > 0 && !seen.has(rid)) {
        seen.add(rid);
        result.push(rid);
      }
    }
  }

  // Schritt 2: Frame-Ressourcen als Fallback (im Modell nicht enthaltene).
  // Beide Arrays getrennt iterieren statt [...a, ...b] — der Spread würde bei
  // ~600k Frames jede Render-Runde ein Riesen-Array allokieren.
  for (const arr of [einsatzFrames, queueFrames]) {
    for (const f of arr) {
      const id = (f.v as { ressource_id?: string }).ressource_id;
      if (typeof id === "string" && id.length > 0 && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
  }
  return result;
}

/**
 * Konvertiert on/off-Frame-Paare zu Segmenten.
 * Offene on-Frames (kein off-Partner) werden ignoriert.
 * Defensiv — fehlende auftrag_oid → 0 (T-01-15-01).
 */
function buildSegments(frames: Frame[]): EinsatzSegment[] {
  const openMap = new Map<string, { start_time: number; auftrag_oid: number }>();
  const segments: EinsatzSegment[] = [];

  for (const f of frames) {
    const v = f.v as {
      kind?: string;
      ressource_id?: string;
      start_time?: number;
      end_time?: number;
      auftrag_oid?: number;
    };
    if (typeof v.ressource_id !== "string") continue;
    const rid = v.ressource_id;

    if (v.kind === "on") {
      openMap.set(rid, {
        start_time: typeof v.start_time === "number" ? v.start_time : f.t,
        auftrag_oid: typeof v.auftrag_oid === "number" ? v.auftrag_oid : 0,
      });
    } else if (v.kind === "off") {
      const open = openMap.get(rid);
      if (open && typeof v.end_time === "number") {
        segments.push({
          ressource_id: rid,
          start_time: open.start_time,
          end_time: v.end_time,
          auftrag_oid: open.auftrag_oid,
        });
        openMap.delete(rid);
      }
    }
  }
  return segments;
}

/** Berechnet Pixel-Left + Pixel-Width eines Segments über GObject (D-4.3). */
function segmentGeometry(
  seg: { start_time: number; end_time: number },
  toX: (t: number) => number,
): { left: number; width: number } {
  const x = Math.round(toX(seg.start_time));
  const xEnd = Math.round(toX(seg.end_time));
  const go = new GObject();
  go.SetPosition(cpoint(x, 0));
  go.SetSize(csize(Math.max(1, xEnd - x), SEG_HEIGHT_PX));
  const rect = crectEmpty();
  go.GetRect(rect);
  return { left: rect.left, width: crectWidth(rect) };
}

/** Belegungs-Zeile: gefüllte Segmente nach auftrag_oid-Farbe.
 * `segments` sind bereits NACH dieser Ressource vorgruppiert (O(n)-Map im
 * Eltern-Memo statt O(n×Zeilen)-filter je Zeile). */
function BelegungsRow({
  ressource_id,
  segments: mySegs,
  toX,
  contentW,
}: {
  ressource_id: string;
  segments: EinsatzSegment[];
  toX: (t: number) => number;
  contentW: number;
}): React.ReactElement {
  return (
    <div
      className="relative border-b border-dashed border-border"
      style={{ height: ROW_HEIGHT_PX, width: contentW }}
      data-testid={`grafik-row-${ressource_id}`}
      aria-label={`Belegung Ressource ${ressource_id}`}
    >
      {/* Gepunktete Baseline (§2.5) */}
      <div
        className="absolute left-0 right-0 border-t border-dashed border-muted-foreground/30"
        style={{ top: ROW_HEIGHT_PX / 2 }}
        aria-hidden="true"
      />
      {mySegs.map((seg, i) => {
        const geo = segmentGeometry(seg, toX);
        const color = auftragColor(seg.auftrag_oid);
        const startH = Math.floor(seg.start_time / 3600);
        const endH = Math.floor(seg.end_time / 3600);
        return (
          <div
            key={`${seg.ressource_id}-${i}`}
            data-testid={`grafik-seg-${ressource_id}-${i}`}
            title={`Auftrag OID ${seg.auftrag_oid} | ${startH}h – ${endH}h`}
            className="absolute rounded-sm"
            style={{
              left: geo.left,
              width: geo.width,
              height: SEG_HEIGHT_PX,
              top: (ROW_HEIGHT_PX - SEG_HEIGHT_PX) / 2,
              backgroundColor: color,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Dezimiert eine (zeitlich sortierte) Sample-Folge auf höchstens ein Sample je
 * Pixelspalte — pro Spalte das MAXIMUM (das Warteschlangen-Gebirge soll seine
 * Spitzen behalten, nicht wegmitteln). Reduziert 8.000+ Samples auf ≤ contentW
 * Punkte, ohne die sichtbare Form zu verändern (ein Pixel kann nur einen Wert
 * zeigen). Ohne diese Dezimation rendert ein <polygon> mit zehntausenden
 * Punkten je Zeile × Dutzenden Zeilen → UI-Jank (Browser-UAT 2026-05-30).
 *
 * Behält den zeitlich ERSTEN und LETZTEN Punkt der jeweiligen Spalte bei (für
 * korrekte Treppen-Kanten) sowie den Spalten-Maximalwert.
 */
function decimateByColumn(
  samples: QueueSample[],
  toX: (t: number) => number,
): QueueSample[] {
  if (samples.length <= 2) return samples;
  const out: QueueSample[] = [];
  let colPx = Number.NaN;
  let colMax: QueueSample | null = null;
  for (const s of samples) {
    const px = Math.round(toX(s.t));
    if (px !== colPx) {
      // Neue Pixelspalte → vorheriges Spalten-Maximum festschreiben.
      if (colMax) out.push(colMax);
      colPx = px;
      colMax = s;
    } else if (s.wartende > (colMax?.wartende ?? -1)) {
      colMax = s;
    }
  }
  if (colMax) out.push(colMax);
  return out;
}

/** Warteschlangen-Zeile: rotes Gebirge als Treppenfunktion (§3.2).
 * Mit Skalen-Hinweis (max Wartende) für Zuordenbarkeit (GAP-CLOSURE).
 * `samples` sind bereits NACH dieser Ressource vorgruppiert + zeitlich sortiert
 * (O(n)-Vorgruppierung im Eltern-Memo statt O(n×Zeilen)-filter je Zeile). */
function WarteschlangenRow({
  ressource_id,
  samples,
  toX,
  contentW,
}: {
  ressource_id: string;
  samples: QueueSample[];
  toX: (t: number) => number;
  contentW: number;
}): React.ReactElement {
  // Vorgruppiert + sortiert vom Eltern-Memo. Hier nur noch pro-Pixel dezimieren.
  const mySamples = React.useMemo(
    () => decimateByColumn(samples, toX),
    [samples, toX],
  );

  const myMax = mySamples.length > 0 ? Math.max(...mySamples.map((s) => s.wartende)) : 0;

  // Treppenfunktion: SVG-Polygon bottom-aligned (vmSolid, vaBottom, §3.2).
  const h = ROW_HEIGHT_PX;
  const scaleY = myMax > 0 ? (h * 0.8) / myMax : 1;

  const buildPolygon = (): string => {
    if (mySamples.length === 0) return "";
    const pts: string[] = [];
    // Boden am ERSTEN Sample (nicht bei x=0 — sonst diagonale Rampe vom linken
    // Rand, die den Berg zeitlich verzerrt).
    const x0 = toX(mySamples[0].t);
    pts.push(`${x0},${h}`);
    // Treppe VORWÄRTS: Wert w_i gilt AB t_i bis zum nächsten Sample t_{i+1}
    // (Queue-Länge ist eine Halte-Funktion). Der alte Code zeichnete w_i über
    // das VORHERIGE Intervall [t_{i-1}, t_i] → Werte wurden zeitlich nach links
    // gezogen/gestreckt (Browser-UAT: "plötzlich ziehst du sie in die Länge").
    for (let i = 0; i < mySamples.length; i++) {
      const xi = toX(mySamples[i].t);
      const barH = Math.max(2, mySamples[i].wartende * scaleY);
      const yi = h - barH;
      const xNext =
        i + 1 < mySamples.length ? toX(mySamples[i + 1].t) : xi;
      pts.push(`${xi},${yi}`); // Stufe an t_i
      pts.push(`${xNext},${yi}`); // Wert halten bis t_{i+1}
    }
    // Rechter Boden am letzten Sample
    const lastX = toX(mySamples[mySamples.length - 1].t);
    pts.push(`${lastX},${h}`);
    return pts.join(" ");
  };

  const polygonPts = buildPolygon();

  return (
    <div
      className="relative border-b border-border"
      style={{ height: ROW_HEIGHT_PX, width: contentW }}
      data-testid={`grafik-row-${ressource_id}`}
      aria-label={`Warteschlange Ressource ${ressource_id}`}
    >
      {/* Skalen-Hinweis: max Wartende rechts an der Zeile (GAP-CLOSURE Zuordenbarkeit) */}
      {myMax > 0 && (
        <span
          className="absolute right-1 top-0 z-10 text-[9px] font-mono tabular-nums text-muted-foreground"
          title={`Max. Wartende: ${myMax}`}
          aria-label={`Maximale Wartende: ${myMax}`}
          style={{ lineHeight: `${h}px` }}
        >
          {myMax}
        </span>
      )}
      <svg
        width={contentW}
        height={h}
        className="absolute left-0 top-0"
        aria-hidden="true"
        data-testid={`grafik-mountain-${ressource_id}`}
      >
        {polygonPts && (
          <polygon
            points={polygonPts}
            fill="rgb(255,0,0)"
            opacity={0.8}
          />
        )}
        {/* Tooltip-Interaktionsflächen pro Sample (SVG <title>) */}
        {mySamples.map((s, i) => {
          const x = toX(s.t);
          const barH = Math.max(2, s.wartende * (myMax > 0 ? (h * 0.8) / myMax : 1));
          const simH = Math.floor(s.t / 3600);
          return (
            <rect
              key={i}
              x={x - 4}
              y={h - barH}
              width={8}
              height={barH}
              fill="transparent"
              aria-label={`t=${simH}h, wartende=${s.wartende}`}
            >
              <title>{`t=${simH}h | Wartende: ${s.wartende}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

/** Leeres Array als stabile Referenz für nicht vorhandene Streams. */
const EMPTY_FRAMES: Frame[] = [];
/** Stabile Leer-Referenzen für Ressourcen ohne Segmente/Samples (kein Re-Render). */
const EMPTY_SEGMENTS: EinsatzSegment[] = [];
const EMPTY_SAMPLES: QueueSample[] = [];

export function Grafikfenster({
  modus,
  widthPx,
  periodBegin: periodBeginProp,
  periodEnd: periodEndProp,
  ressourcenFromModel,
  zoom = "fit",
  zoomFactor = 1,
  onZoomFactorChange,
}: GrafikfensterProps): React.ReactElement {
  const einsatzFrames = useLiveStreamStore(
    (s) => s.byStream["gantt_einsatz"] ?? EMPTY_FRAMES,
  );
  const queueFrames = useLiveStreamStore(
    (s) => s.byStream["gantt_wartequeue"] ?? EMPTY_FRAMES,
  );

  // Zeitfenster = FESTE Perioden-Grenzen [period_begin, period_begin+period_len]
  // aus dem lifecycle-Stream (via Props). 1:1 OSim FSimulatorViewerGfx: die Achse
  // zeigt IMMER die ganze aktuelle Periode (Bild 1: 0–31d Monat; Bild 3: 0–24h
  // Tag) und reskaliert NICHT, während Frames eintreffen — sie wird NUR durch
  // User-Zoom verändert (Browser-UAT: "die skalierung ändert sich nur wenn der
  // user den zoom betätigt, nicht dynamisch während der simulation"). Die Frames
  // füllen das feste Fenster von links bis zur aktuellen Sim-Zeit (rote Linie).
  const periodBegin = periodBeginProp;
  const periodEnd =
    periodEndProp > periodBeginProp ? periodEndProp : periodBeginProp + 86400;

  const ressourcen = React.useMemo(
    () => extractRessourcen(einsatzFrames, queueFrames, ressourcenFromModel),
    [einsatzFrames, queueFrames, ressourcenFromModel],
  );

  // Belegungs-Segmente EINMAL bauen und nach Ressource gruppieren — die Zeilen
  // greifen per Map-Lookup zu (O(1) je Zeile) statt jede Zeile über alle
  // Segmente zu filtern (O(n×Zeilen) → bei ~93k Einsatz-Frames × Dutzenden
  // Zeilen spürbarer Jank).
  const segmentsByRes = React.useMemo((): Map<string, EinsatzSegment[]> => {
    const map = new Map<string, EinsatzSegment[]>();
    for (const seg of buildSegments(einsatzFrames)) {
      const arr = map.get(seg.ressource_id);
      if (arr) arr.push(seg);
      else map.set(seg.ressource_id, [seg]);
    }
    return map;
  }, [einsatzFrames]);

  // Warteschlangen-Samples EINMAL nach Ressource gruppieren + je Gruppe zeitlich
  // sortieren. Die Zeilen dezimieren danach nur noch ihre eigene (kurze) Gruppe
  // pro Pixelspalte — kein O(n×Zeilen)-filter + kein 8k-Punkt-Polygon mehr
  // (Browser-UAT 2026-05-30: Sprung/Jank bei ~495k Queue-Frames).
  const samplesByRes = React.useMemo((): Map<string, QueueSample[]> => {
    const map = new Map<string, QueueSample[]>();
    for (const f of queueFrames) {
      const rid = String((f.v as { ressource_id?: string }).ressource_id ?? "");
      if (rid.length === 0) continue;
      const w = (f.v as { wartende?: number }).wartende;
      const sample: QueueSample = {
        ressource_id: rid,
        wartende: typeof w === "number" ? w : 0,
        t: f.t,
      };
      const arr = map.get(rid);
      if (arr) arr.push(sample);
      else map.set(rid, [sample]);
    }
    // Frames kommen seq-/zeitlich geordnet an; defensiv dennoch je Gruppe sortieren.
    for (const arr of map.values()) arr.sort((a, b) => a.t - b.t);
    return map;
  }, [queueFrames]);

  // Container-Breite per ResizeObserver (der Grid-Scroll-Container).
  // widthPx ist nur Startwert/Fallback für JSDOM-Tests ohne ResizeObserver.
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = React.useState<number>(
    Math.max(widthPx, MIN_GRID_WIDTH_PX),
  );
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number" && w > 0) setContainerW(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Span und Content-Breite je Zoom-Stufe.
  // "fit" → Inhalt füllt Container (effektiv wie bisheriges Verhalten).
  // Andere Stufen → feste px/s, Content kann breiter als Container sein → scrollbar.
  const span = Math.max(1, periodEnd - periodBegin);
  const contentW = React.useMemo(() => {
    if (zoom === "fit") return Math.max(containerW, MIN_GRID_WIDTH_PX);
    return Math.max(
      MIN_GRID_WIDTH_PX,
      Math.round(calcContentWidthPx(span, zoom, zoomFactor, containerW)),
    );
  }, [zoom, zoomFactor, span, containerW]);

  // EINHEITLICHE x(t)-Abbildung — eine Closure für Segmente, Gebirge, Raster, rote Linie.
  // effectivePxPerSecond + makeSimTimeToX werden mit denselben Parametern aufgerufen;
  // makeSimTimeToX verwendet effectivePxPerSecond intern. Eine separate Bindung
  // an pxPerSec ist nicht nötig.
  const toX = React.useMemo(
    () => makeSimTimeToX(periodBegin, zoom, zoomFactor, containerW, span),
    [zoom, zoomFactor, containerW, span, periodBegin],
  );

  // Aktuelle Zeit = max t aller relevanten Frames (§2.6). Frames sind zeitlich
  // geordnet → nur das jeweils letzte Element prüfen (kein Spread über ~600k
  // Frames, der den Call-Stack sprengen würde).
  const maxT = React.useMemo(() => {
    let t = periodBegin;
    const lastE = einsatzFrames[einsatzFrames.length - 1];
    const lastQ = queueFrames[queueFrames.length - 1];
    if (lastE && lastE.t > t) t = lastE.t;
    if (lastQ && lastQ.t > t) t = lastQ.t;
    return t;
  }, [einsatzFrames, queueFrames, periodBegin]);

  const currentTimePx = toX(maxT);

  // Ctrl+Wheel → stufenloser zoomFactor-Multiplikator (analog 3fls onZoomFactorChange).
  const handleWheel = React.useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.85 : 1 / 0.85;
      const nextFactor = Math.min(10, Math.max(0.1, zoomFactor * delta));
      onZoomFactorChange?.(Math.round(nextFactor * 100) / 100);
    },
    [zoomFactor, onZoomFactorChange],
  );

  // Modus-Name für Top-Bar
  const modeObj = GRAFIKFENSTER_MODES.find((m) => m.key === modus);
  const modeTitle = modeObj?.name ?? "";

  // Ticks einmal berechnen — geteilt zwischen Top-Achse und vertikalen Rasterlinien.
  const ticks = React.useMemo(
    () => simTimeTicks(periodBegin, periodBegin + span, zoom, zoomFactor, containerW),
    [periodBegin, span, zoom, zoomFactor, containerW],
  );

  return (
    <div
      className="flex flex-col rounded-md border border-border bg-background font-mono text-xs"
      data-testid="grafikfenster"
      aria-label={`Grafikfenster — ${modeTitle}`}
      onWheel={handleWheel}
    >
      {/* Top-Bar: Modus-Titel (OGfxRowTopBar §2.3) */}
      <div className="border-b border-border bg-muted px-2 py-1 text-center text-sm font-semibold text-foreground">
        {modeTitle}
      </div>

      {/*
        2D-STICKY Scroll-Wrapper (GAP-CLOSURE UAT):
        - overflow: auto in beide Richtungen → vertikaler + horizontaler Scrollbalken
        - Begrenzte max-height → Scrollbalken bei vielen Ressourcen
        - Darin: Ecke (sticky top+left), Top-Achse (sticky top), Labels (sticky left), Body

        Layout als CSS-Grid mit zwei Spalten:
          LEFT_BAR_WIDTH_PX | auto (flex-1 / contentW)

        Z-Index-Hierarchie:
          30 = Ecke (top+left sticky, höchster Index)
          20 = Top-Achse (top sticky, über Body, unter Ecke)
          10 = Labels-Spalte (left sticky, über Grid-Body)
           0 = Grid-Body
      */}
      <div
        ref={scrollContainerRef}
        data-testid="grafik-scroll-wrapper"
        className="overflow-auto"
        style={{ maxHeight: MAX_BODY_HEIGHT_PX }}
        aria-label="Grafikfenster Scroll-Bereich"
      >
        {/*
          Innerer Wrapper: mindestens so breit wie LEFT_BAR_WIDTH_PX + contentW,
          damit sticky-left korrekt funktioniert (position:sticky braucht einen
          scrollbaren Eltern-Container dessen Inhalt breiter ist als er selbst).
        */}
        <div style={{ minWidth: LEFT_BAR_WIDTH_PX + contentW }}>

          {/* ── Zeile 1: Top-Achse-Leiste ── */}
          {modus !== "qualifikation" && (
            <div
              className="flex"
              style={{ position: "sticky", top: 0, zIndex: 20 }}
            >
              {/* Ecke oben-links: "Ressourcen"-Header — sticky top+left */}
              <div
                className="shrink-0 border-b border-r border-border bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                style={{
                  width: LEFT_BAR_WIDTH_PX,
                  position: "sticky",
                  left: 0,
                  zIndex: 30,
                }}
                aria-hidden="true"
              >
                Ressourcen
              </div>

              {/* Top-Zeitachse (sticky top, scrollt horizontal mit) */}
              <div
                data-testid="grafik-top-axis"
                className="relative border-b border-border bg-muted/30"
                style={{ height: AXIS_HEIGHT_PX, width: contentW, flexShrink: 0 }}
                aria-label="Zeitachse"
              >
                {ticks.map((tick, i) => (
                  <React.Fragment key={i}>
                    <div
                      className="absolute top-0 border-l border-dashed border-muted-foreground/50"
                      style={{ left: tick.x, height: AXIS_HEIGHT_PX }}
                      aria-hidden="true"
                    />
                    <span
                      className="absolute top-1 text-[11px] font-medium tabular-nums text-foreground"
                      style={{ left: tick.x + 3 }}
                    >
                      {tick.label}
                    </span>
                  </React.Fragment>
                ))}
                {/* Rote Zeit-Linie in der Achse */}
                <div
                  className="absolute top-0"
                  style={{
                    left: currentTimePx,
                    width: 1,
                    height: AXIS_HEIGHT_PX,
                    backgroundColor: "rgb(255,0,0)",
                  }}
                  aria-hidden="true"
                />
              </div>
            </div>
          )}

          {/* ── Zeile 2: Body (Labels sticky-left + Grid) ── */}
          <div className="flex">
            {/* Left-Labels-Spalte: sticky left (bleibt beim horizontalen Scrollen fix) */}
            {modus !== "qualifikation" && (
              <div
                className="shrink-0 border-r border-border bg-background"
                style={{
                  width: LEFT_BAR_WIDTH_PX,
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                }}
                aria-label="Ressourcen-Liste"
              >
                {ressourcen.map((rid) => (
                  <div
                    key={rid}
                    className="flex items-center justify-end overflow-hidden whitespace-nowrap border-b border-dashed border-border px-2 text-right text-xs text-foreground"
                    style={{ height: ROW_HEIGHT_PX }}
                    aria-label={rid}
                    title={rid}
                  >
                    {rid}
                  </div>
                ))}
              </div>
            )}

            {/* Grid-Body: scrollbarer Content */}
            <div
              style={{ width: contentW, flexShrink: 0, position: "relative" }}
              aria-label="Grafikfenster Grid"
            >
              {/* Qualifikation-Gated-Hinweis (§3.3, T-01-15-02) */}
              {modus === "qualifikation" && (
                <div
                  className="flex min-h-[60px] items-center justify-center p-4 text-muted-foreground italic"
                  data-testid="grafik-quali-gated"
                  aria-label="Qualifikations-Stream noch nicht verfügbar (Slice offen)"
                >
                  <span>
                    (Slice offen) — Qualifikations-Stream wird in einem späteren Slice
                    implementiert.
                  </span>
                </div>
              )}

              {modus !== "qualifikation" && (
                <>
                  {/* Gepunktete vertikale Rasterlinien (§2.4) — EINHEITLICHE toX-Abbildung */}
                  {ticks.map((tick, i) => (
                    <div
                      key={i}
                      className="absolute top-0 border-l border-dashed border-muted-foreground/30"
                      style={{ left: tick.x, bottom: 0 }}
                      aria-hidden="true"
                    />
                  ))}

                  {/* Rote aktuelle-Zeit-Linie (§2.6) — EINHEITLICHE toX-Abbildung */}
                  <div
                    data-testid="grafik-time-line"
                    className="absolute top-0 bottom-0 z-10"
                    style={{
                      left: currentTimePx,
                      width: 2,
                      backgroundColor: "rgb(255,0,0)",
                    }}
                    aria-hidden="true"
                  />

                  {/* Per-Ressource-Zeilen (Belegung) — vorgruppierte Segmente */}
                  {modus === "belegung" &&
                    ressourcen.map((rid) => (
                      <BelegungsRow
                        key={rid}
                        ressource_id={rid}
                        segments={segmentsByRes.get(rid) ?? EMPTY_SEGMENTS}
                        toX={toX}
                        contentW={contentW}
                      />
                    ))}

                  {/* Per-Ressource-Zeilen (Warteschlangen) — vorgruppierte Samples */}
                  {modus === "warteschlangen" &&
                    ressourcen.map((rid) => (
                      <WarteschlangenRow
                        key={rid}
                        ressource_id={rid}
                        samples={samplesByRes.get(rid) ?? EMPTY_SAMPLES}
                        toX={toX}
                        contentW={contentW}
                      />
                    ))}
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
