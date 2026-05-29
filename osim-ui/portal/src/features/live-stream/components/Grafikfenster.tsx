/**
 * Grafikfenster — faithfull OSim2004-Grafikfenster (Plan 01-15 Task 2).
 *
 * 1:1-Port des OGfxModeRow-Layouts (OSimBase/OGfxRow.cpp):
 *  - Top-Bar: Modus-Titel zentriert (OGfxRowTopBar)
 *  - Left-Bar: "Ressourcen"-Header + per-Ressource-Labels rechtsbündig
 *    (OGfxRowLeftBar + PGfxRowObjProzRessBeleg::Draw)
 *  - Grid: gepunktete vertikale Zeitachsen-Linien + gepunktete Baselines
 *    je Zeile + rote aktuelle-Zeit-Linie (OGfxRowGrid §2.6)
 *  - Drei Modi (Modus-Dropdown-Registry):
 *      - Belegung: OID-gefärbte Segmente aus gantt_einsatz (§3.1)
 *      - Warteschlangen: rotes Gebirge aus gantt_wartequeue (§3.2)
 *      - Qualifikation: ehrlich leer/gated — "(Slice offen)" (§3.3)
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
import { time2client, timeAxisScale, GRAFIKFENSTER_MODES } from "./grafikfenster-modes";

/** Höhe einer Ressourcen-Zeile in Pixel (PGfxModeRessBeleg m_rowHeight=20, §3.1). */
const ROW_HEIGHT_PX = 24;
/** Höhe eines Belegungs-Segments in Pixel (analog BAR_HEIGHT_PX in GanttRow). */
const SEG_HEIGHT_PX = 16;
/** Breite der linken Ressourcen-Leiste in Pixel (§2.1: 15 * charWidth ≈ 120px). */
const LEFT_BAR_WIDTH_PX = 120;
/** Höhe der Zeit-Achsen-Leiste am Fuß. */
const AXIS_HEIGHT_PX = 20;
/** Modus-Schlüssel-Typ. */
export type GrafikModus = "belegung" | "warteschlangen" | "qualifikation";

export interface GrafikfensterProps {
  /** Aktiver Modus (bestimmt die Render-Logik der Zeilen). */
  modus: GrafikModus;
  /** Pixel-Breite des Grafik-Bereichs (ohne Left-Bar). */
  widthPx: number;
  /** Perioden-Beginn in Sekunden (Zeit-Achse, Time2Client-Basis). */
  periodBegin: number;
  /** Perioden-Ende in Sekunden (Zeit-Achse). */
  periodEnd: number;
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
 * Extrahiert Ressourcen-IDs (distinct, in Reihenfolge des ersten Auftretens).
 * Defensiv — fehlende ressource_id wird ignoriert (T-01-15-01).
 */
function extractRessourcen(
  einsatzFrames: Frame[],
  queueFrames: Frame[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const f of [...einsatzFrames, ...queueFrames]) {
    const id = (f.v as { ressource_id?: string }).ressource_id;
    if (typeof id === "string" && id.length > 0 && !seen.has(id)) {
      seen.add(id);
      result.push(id);
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
  begin: number,
  end: number,
  widthPx: number,
): { left: number; width: number } {
  const x = Math.round(time2client(seg.start_time, begin, end, widthPx));
  const xEnd = Math.round(time2client(seg.end_time, begin, end, widthPx));
  const go = new GObject();
  go.SetPosition(cpoint(x, 0));
  go.SetSize(csize(Math.max(1, xEnd - x), SEG_HEIGHT_PX));
  const rect = crectEmpty();
  go.GetRect(rect);
  return { left: rect.left, width: crectWidth(rect) };
}

/** Belegungs-Zeile: gefüllte Segmente nach auftrag_oid-Farbe. */
function BelegungsRow({
  ressource_id,
  segments,
  periodBegin,
  periodEnd,
  widthPx,
}: {
  ressource_id: string;
  segments: EinsatzSegment[];
  periodBegin: number;
  periodEnd: number;
  widthPx: number;
}): React.ReactElement {
  const mySegs = segments.filter((s) => s.ressource_id === ressource_id);
  return (
    <div
      className="relative border-b border-dashed border-border"
      style={{ height: ROW_HEIGHT_PX }}
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
        const geo = segmentGeometry(seg, periodBegin, periodEnd, widthPx);
        const color = auftragColor(seg.auftrag_oid);
        return (
          <div
            key={`${seg.ressource_id}-${i}`}
            data-testid={`grafik-seg-${ressource_id}-${i}`}
            title={`Auftrag OID ${seg.auftrag_oid}`}
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

/** Warteschlangen-Zeile: rotes Gebirge als Treppenfunktion (§3.2). */
function WarteschlangenRow({
  ressource_id,
  samples,
  periodBegin,
  periodEnd,
  widthPx,
  maxWartende,
}: {
  ressource_id: string;
  samples: QueueSample[];
  periodBegin: number;
  periodEnd: number;
  widthPx: number;
  maxWartende: number;
}): React.ReactElement {
  const mySamples = samples
    .filter((s) => s.ressource_id === ressource_id)
    .sort((a, b) => a.t - b.t);

  // Treppenfunktion: SVG-Polygon bottom-aligned (vmSolid, vaBottom, §3.2).
  const h = ROW_HEIGHT_PX;
  const scaleY = maxWartende > 0 ? (h * 0.8) / maxWartende : 1;

  const buildPolygon = (): string => {
    if (mySamples.length === 0) return "";
    const pts: string[] = [];
    // Start: linker Boden
    pts.push(`0,${h}`);
    for (let i = 0; i < mySamples.length; i++) {
      const s = mySamples[i];
      const x = time2client(s.t, periodBegin, periodEnd, widthPx);
      const barH = Math.max(2, s.wartende * scaleY);
      const y = h - barH;
      // Treppenfunktion: zuerst horizontal auf x, dann vertikal auf y
      if (i > 0) {
        const prevX = time2client(mySamples[i - 1].t, periodBegin, periodEnd, widthPx);
        pts.push(`${prevX},${y}`); // horizontale Stufe
      }
      pts.push(`${x},${y}`);
    }
    // Rechter Boden
    const lastX = time2client(mySamples[mySamples.length - 1].t, periodBegin, periodEnd, widthPx);
    pts.push(`${lastX},${h}`);
    return pts.join(" ");
  };

  const polygonPts = buildPolygon();

  return (
    <div
      className="relative border-b border-border"
      style={{ height: ROW_HEIGHT_PX }}
      data-testid={`grafik-row-${ressource_id}`}
      aria-label={`Warteschlange Ressource ${ressource_id}`}
    >
      <svg
        width={widthPx}
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
      </svg>
    </div>
  );
}

/** Zeitachsen-Leiste mit gepunkteten Rasterlinien. */
function ZeitachsBar({
  periodBegin,
  periodEnd,
  widthPx,
  currentTimePx,
}: {
  periodBegin: number;
  periodEnd: number;
  widthPx: number;
  currentTimePx: number;
}): React.ReactElement {
  const { intervals, unit } = timeAxisScale(periodEnd - periodBegin);
  const span = periodEnd - periodBegin;

  const ticks = Array.from({ length: intervals + 1 }, (_, i) => {
    const t = periodBegin + (i / intervals) * span;
    const x = time2client(t, periodBegin, periodEnd, widthPx);
    const value = periodBegin / (unit === "h" ? 3600 : unit === "d" ? 86400 : 1) + (i / intervals) * (span / (unit === "h" ? 3600 : unit === "d" ? 86400 : 1));
    const label = `${Math.round(value)}${unit}`;
    return { x, label };
  });

  return (
    <div
      className="relative border-t border-border"
      style={{ height: AXIS_HEIGHT_PX, width: widthPx }}
      aria-label="Zeitachse"
    >
      {ticks.map((tick, i) => (
        <React.Fragment key={i}>
          <div
            className="absolute top-0 border-l border-dashed border-muted-foreground/40"
            style={{ left: tick.x, height: AXIS_HEIGHT_PX }}
            aria-hidden="true"
          />
          <span
            className="absolute top-1 text-[10px] text-muted-foreground"
            style={{ left: tick.x + 2 }}
          >
            {tick.label}
          </span>
        </React.Fragment>
      ))}
      {/* Rote Zeit-Linie (§2.6) */}
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
  );
}

export function Grafikfenster({
  modus,
  widthPx,
  periodBegin,
  periodEnd,
}: GrafikfensterProps): React.ReactElement {
  const byStream = useLiveStreamStore((s) => s.byStream);
  const einsatzFrames = byStream["gantt_einsatz"] ?? [];
  const queueFrames = byStream["gantt_wartequeue"] ?? [];

  const ressourcen = React.useMemo(
    () => extractRessourcen(einsatzFrames, queueFrames),
    [einsatzFrames, queueFrames],
  );

  const segments = React.useMemo(
    () => buildSegments(einsatzFrames),
    [einsatzFrames],
  );

  const queueSamples = React.useMemo((): QueueSample[] => {
    return queueFrames.map((f) => ({
      ressource_id: String((f.v as { ressource_id?: string }).ressource_id ?? ""),
      wartende: typeof (f.v as { wartende?: number }).wartende === "number"
        ? ((f.v as { wartende: number }).wartende)
        : 0,
      t: f.t,
    })).filter((s) => s.ressource_id.length > 0);
  }, [queueFrames]);

  // Max wartende für Gebirge-Skalierung
  const maxWartende = React.useMemo(
    () => Math.max(1, ...queueSamples.map((s) => s.wartende)),
    [queueSamples],
  );

  // Aktuelle Zeit = max t aller relevanten Frames (§2.6)
  const maxT = React.useMemo(() => {
    let t = periodBegin;
    for (const f of [...einsatzFrames, ...queueFrames]) {
      if (f.t > t) t = f.t;
    }
    return t;
  }, [einsatzFrames, queueFrames, periodBegin]);

  const currentTimePx = time2client(maxT, periodBegin, periodEnd, widthPx);

  // Modus-Name für Top-Bar
  const modeObj = GRAFIKFENSTER_MODES.find((m) => m.key === modus);
  const modeTitle = modeObj?.name ?? "";

  return (
    <div
      className="flex flex-col rounded-md border border-border bg-background font-mono text-xs"
      data-testid="grafikfenster"
      aria-label={`Grafikfenster — ${modeTitle}`}
    >
      {/* Top-Bar: Modus-Titel (OGfxRowTopBar §2.3) */}
      <div className="border-b border-border bg-muted px-2 py-1 text-center text-sm font-semibold text-foreground">
        {modeTitle}
      </div>

      {/* Hauptbereich: Left-Bar + Grid */}
      <div className="flex">
        {/* Left-Bar: "Ressourcen"-Header + Labels (§2.2) */}
        <div
          className="shrink-0 border-r border-border"
          style={{ width: LEFT_BAR_WIDTH_PX }}
          aria-label="Ressourcen-Liste"
        >
          <div className="border-b border-border bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
            Ressourcen
          </div>
          {ressourcen.map((rid) => (
            <div
              key={rid}
              className="flex items-center justify-end border-b border-dashed border-border px-2 text-right text-xs text-foreground"
              style={{ height: ROW_HEIGHT_PX }}
              aria-label={rid}
            >
              {rid}
            </div>
          ))}
        </div>

        {/* Grid-Bereich */}
        <div className="relative flex-1 overflow-hidden" style={{ minWidth: 0 }}>
          {/* Qualifikation-Gated-Hinweis (§3.3, T-01-15-02) */}
          {modus === "qualifikation" && (
            <div
              className="flex h-full min-h-[60px] items-center justify-center p-4 text-muted-foreground italic"
              data-testid="grafik-quali-gated"
              aria-label="Qualifikations-Stream noch nicht verfügbar (Slice offen)"
            >
              <span>
                (Slice offen) — Qualifikations-Stream wird in einem späteren Slice
                implementiert.
              </span>
            </div>
          )}

          {/* Ressourcen-Zeilen (Belegung / Warteschlangen) */}
          {modus !== "qualifikation" && (
            <div style={{ width: widthPx, position: "relative" }}>
              {/* Gepunktete vertikale Rasterlinien (§2.4) */}
              {(() => {
                const { intervals } = timeAxisScale(periodEnd - periodBegin);
                return Array.from({ length: intervals + 1 }, (_, i) => {
                  const x = (i / intervals) * widthPx;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 border-l border-dashed border-muted-foreground/20"
                      style={{ left: x, bottom: 0 }}
                      aria-hidden="true"
                    />
                  );
                });
              })()}

              {/* Rote aktuelle-Zeit-Linie (§2.6) */}
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

              {/* Per-Ressource-Zeilen */}
              {modus === "belegung" &&
                ressourcen.map((rid) => (
                  <BelegungsRow
                    key={rid}
                    ressource_id={rid}
                    segments={segments}
                    periodBegin={periodBegin}
                    periodEnd={periodEnd}
                    widthPx={widthPx}
                  />
                ))}

              {modus === "warteschlangen" &&
                ressourcen.map((rid) => (
                  <WarteschlangenRow
                    key={rid}
                    ressource_id={rid}
                    samples={queueSamples}
                    periodBegin={periodBegin}
                    periodEnd={periodEnd}
                    widthPx={widthPx}
                    maxWartende={maxWartende}
                  />
                ))}
            </div>
          )}

          {/* Zeitachse am Fuß (nur bei nicht-gated Modi) */}
          {modus !== "qualifikation" && (
            <ZeitachsBar
              periodBegin={periodBegin}
              periodEnd={periodEnd}
              widthPx={widthPx}
              currentTimePx={currentTimePx}
            />
          )}
        </div>
      </div>
    </div>
  );
}
