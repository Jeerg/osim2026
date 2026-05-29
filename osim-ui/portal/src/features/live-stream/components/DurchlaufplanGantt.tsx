/**
 * DurchlaufplanGantt — der primäre Grafik-Viewer der /live-Sicht (Plan 01-12
 * Task 2, O-2 / O-3).
 *
 * Faithful Durchlaufplan-Gantt über die bestehende GanttRow/GObject-Pipeline
 * (D-4.3 — dieselbe Design/Grafik-Foundation wie die Modellierungs-Viewer, NICHT
 * eine generische „Standard"-Fläche). Prinzip = OSim2004 PDlplViewerStd:
 * Zeilen = Aufträge/Prozesse, X = Zeit. Die gantt_durchlauf-Frames werden nach
 * Auftrag gruppiert; je Auftrag rendert eine GanttRow ihre Balken über das
 * GObject (SetPosition/SetSize → GetRect). Read-only Live-Render (M1, SPEC §8.3).
 *
 * Dies ist der Default-/Primär-Viewer, von dem aus der Lauf gesteuert und live
 * dargestellt wird (FSimulatorViewerGfx-treu: Start/Pause/Reset-Controls leben
 * über diesem Canvas in der /live-Route).
 *
 * Styling strikt über Design-Tokens (3FLS-Guide), keine ad-hoc Hex-Werte.
 */

import * as React from "react";
import { GanttRow } from "./GanttRow";
import type { Frame } from "../types";

/** Pixel pro Sim-Sekunde für die Gantt-Zeit-Achse. */
const PX_PER_SECOND = 0.01;

export interface DurchlaufplanGanttProps {
  /** gantt_durchlauf-Frames (start/ende je Prozess je Auftrag). */
  frames: Frame[];
}

export function DurchlaufplanGantt({
  frames,
}: DurchlaufplanGanttProps): React.ReactElement {
  // Frames nach Auftrag gruppieren (Zeilen = Aufträge, faithful PDlplViewerStd).
  const byAuftrag = React.useMemo(() => {
    const map = new Map<string, Frame[]>();
    for (const f of frames) {
      const auftrag = String((f.v as { auftrag_id?: string }).auftrag_id ?? "?");
      const list = map.get(auftrag);
      if (list) list.push(f);
      else map.set(auftrag, [f]);
    }
    return map;
  }, [frames]);

  if (byAuftrag.size === 0) {
    return (
      <p
        className="p-4 text-sm text-muted-foreground"
        data-testid="gantt-empty"
      >
        Noch keine Durchlauf-Daten — Lauf starten, um den Durchlaufplan live zu
        sehen.
      </p>
    );
  }

  return (
    <div className="overflow-auto" data-testid="gantt-panel">
      {[...byAuftrag.entries()].map(([auftrag, rowFrames]) => (
        <GanttRow
          key={auftrag}
          auftragId={auftrag}
          frames={rowFrames}
          pxPerSecond={PX_PER_SECOND}
        />
      ))}
    </div>
  );
}
