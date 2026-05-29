/**
 * GanttRow — eine Zeit-Balken-Spur eines Auftrags aus gantt_durchlauf-Frames
 * (Plan 01-02 Task 3, D-4.3).
 *
 * Die Balken-Geometrie wird über die `@osim/graphobject`-Schicht berechnet
 * (D-4.3 — Reuse der GObject/cpoint-Pipeline statt eigener Geometrie). Pro
 * Prozess eines Auftrags öffnet ein `kind:"start"`-Frame einen Balken am
 * `start_time`; das zugehörige `kind:"ende"`-Frame schließt ihn am `end_time`.
 * Solange kein ende-Frame da ist, läuft der Balken bis `nowSeconds` (Live-
 * Sicht). Read-only — keine Drag-Interaktion in M1 (SPEC §8.3).
 *
 * Styling strikt über Design-Tokens (3FLS-Guide) — keine ad-hoc Hex-Werte im
 * DOM. Die GObject-Farbfelder (m_BackColor) sind interne Geometrie-Defaults
 * und fließen NICHT in das gerenderte Styling.
 */

import * as React from "react";
import { GObject } from "@osim/graphobject";
import { csize, cpoint, crectWidth, crectEmpty } from "@osim/graphobject";
import type { Frame } from "../types";

const ROW_HEIGHT_PX = 24;
const BAR_HEIGHT_PX = 16;

export interface GanttRowProps {
  /** Auftrags-Kennung (Label + Test-ID-Basis). */
  auftragId: string;
  /** gantt_durchlauf-Frames dieses Auftrags (start + ende). */
  frames: Frame[];
  /** Pixel pro Sim-Sekunde (Zeit-Achsen-Skalierung). */
  pxPerSecond: number;
  /** Aktuelle Sim-Zeit für noch laufende (offene) Balken. */
  nowSeconds?: number;
}

interface BarGeometry {
  prozessId: string;
  left: number;
  width: number;
  laufend: boolean;
}

/**
 * Aggregiert die start/ende-Frames pro Prozess zu Balken-Intervallen und
 * berechnet die Pixel-Geometrie über ein GObject (D-4.3). Das GObject ist der
 * Geometrie-Träger: SetPosition/SetSize aktualisieren m_VirtRect, GetRect +
 * crectWidth liefern die abgeleitete Breite — dieselbe Pipeline wie die
 * Modellierungs-Viewer.
 */
function computeBars(
  frames: Frame[],
  pxPerSecond: number,
  nowSeconds: number | undefined,
): BarGeometry[] {
  // Pro Prozess das jüngste start_time + (falls vorhanden) end_time sammeln.
  const byProzess = new Map<
    string,
    { start: number; end: number | null }
  >();

  for (const f of frames) {
    const v = f.v as {
      kind?: string;
      prozess_id?: string;
      start_time?: number;
      end_time?: number;
    };
    const prozessId = v.prozess_id ?? "?";
    const start = typeof v.start_time === "number" ? v.start_time : f.t;
    const existing = byProzess.get(prozessId);
    if (v.kind === "ende" && typeof v.end_time === "number") {
      byProzess.set(prozessId, {
        start: existing?.start ?? start,
        end: v.end_time,
      });
    } else if (!existing) {
      byProzess.set(prozessId, { start, end: null });
    }
  }

  const bars: BarGeometry[] = [];
  for (const [prozessId, span] of byProzess) {
    const end = span.end ?? nowSeconds ?? span.start;
    const durationSec = Math.max(0, end - span.start);

    // Geometrie über GObject berechnen (D-4.3).
    const go = new GObject();
    go.SetPosition(cpoint(Math.round(span.start * pxPerSecond), 0));
    go.SetSize(csize(Math.round(durationSec * pxPerSecond), BAR_HEIGHT_PX));
    const rect = crectEmpty();
    go.GetRect(rect);

    bars.push({
      prozessId,
      left: rect.left,
      width: crectWidth(rect),
      laufend: span.end === null,
    });
  }
  return bars;
}

export function GanttRow({
  auftragId,
  frames,
  pxPerSecond,
  nowSeconds,
}: GanttRowProps): React.ReactElement {
  const bars = React.useMemo(
    () => computeBars(frames, pxPerSecond, nowSeconds),
    [frames, pxPerSecond, nowSeconds],
  );

  return (
    <div
      className="flex items-center gap-3 border-b border-border"
      style={{ height: ROW_HEIGHT_PX }}
      data-testid={`gantt-row-${auftragId}`}
    >
      <span className="w-28 shrink-0 truncate font-mono text-xs text-foreground">
        {auftragId}
      </span>
      <div className="relative flex-1" style={{ height: BAR_HEIGHT_PX }}>
        {bars.map((bar) => (
          <div
            key={bar.prozessId}
            data-testid={`gantt-bar-${auftragId}-${bar.prozessId}`}
            title={`${auftragId} / ${bar.prozessId}`}
            className={
              bar.laufend
                ? "absolute rounded-sm bg-primary/60 ring-1 ring-primary"
                : "absolute rounded-sm bg-primary"
            }
            style={{
              left: bar.left,
              width: bar.width,
              height: BAR_HEIGHT_PX,
            }}
          />
        ))}
      </div>
    </div>
  );
}
