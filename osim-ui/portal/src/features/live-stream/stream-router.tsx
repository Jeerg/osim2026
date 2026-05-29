/**
 * stream-router — multiplext einen OSim-Viewer-Tab auf seine Render-Komponente
 * (Plan 01-05 Task 1 → GAP-CLOSURE 01-12 Task 2, O-2 / O-3 / AC-4 / SPEC §8.1).
 *
 * Der `StreamRouter` bekommt einen {@link ViewerTab} aus der viewer-config
 * (echter OSim-Viewer statt rohem Stream-Tag), liest die Frames seines
 * source-Tags aus dem Live-Stream-Store (D-4.2) und rendert GENAU EINEN Viewer
 * (Stream-Isolation, AC-4):
 *
 *   - Durchlaufplan (gantt_durchlauf)        → DurchlaufplanGantt (GanttRow/GObject)
 *   - Einsatzzeit (gantt_einsatz)            → StatusList (partial-Stream)
 *   - Schicht (gantt_schicht)                → SchichtTable
 *   - Auswertungs-Tab (kpi_auswertung+kind)  → AuswertungTable, gefiltert auf
 *                                              die Frames dieses kinds
 *
 * Über jedem Panel rendert der Router den {@link PartialBanner} des source-Tags
 * (partial-Status + Schema-Mismatch, D-2.2 / D-OP-4 / AC-7).
 *
 * Der generische KpiTile-Grid-Pfad der Auswertungen entfällt (durch die echten
 * OSim-Tabellen ersetzt).
 *
 * Styling strikt über Design-Tokens (3FLS-Guide), keine ad-hoc Hex-Werte.
 */

import * as React from "react";
import { useLiveStreamStore } from "./store";
import type { Frame, StreamTag } from "./types";
import type { ViewerTab } from "./viewer-config";
import { DurchlaufplanGantt } from "./components/DurchlaufplanGantt";
import { AuswertungTable } from "./components/AuswertungTable";
import { SchichtTable } from "./components/SchichtTable";
import { PartialBanner } from "./components/PartialBanner";

export interface StreamRouterProps {
  /** Zu rendernder OSim-Viewer-Tab (aus viewer-config). */
  tab: ViewerTab;
}

export function StreamRouter({ tab }: StreamRouterProps): React.ReactElement {
  const byStream = useLiveStreamStore((s) => s.byStream);
  const frames = byStream[tab.source] ?? [];

  return (
    <div className="flex flex-col gap-3" data-testid={`stream-router-${tab.id}`}>
      <PartialBanner tag={tab.source} />
      <ViewerPanel tab={tab} frames={frames} />
    </div>
  );
}

function ViewerPanel({
  tab,
  frames,
}: {
  tab: ViewerTab;
  frames: Frame[];
}): React.ReactElement {
  // Auswertungs-Tab: die kpi_auswertung-Frames auf das kind dieses Tabs filtern
  // (Isolation, AC-4) und an die kind-spezifische AuswertungTable reichen.
  if (tab.source === "kpi_auswertung" && tab.kind) {
    const kindFrames = frames.filter(
      (f) => (f.v as { kind?: string }).kind === tab.kind,
    );
    return <AuswertungTable kind={tab.kind} frames={kindFrames} />;
  }

  switch (tab.source) {
    case "gantt_durchlauf":
      return <DurchlaufplanGantt frames={frames} />;
    case "gantt_schicht":
      return <SchichtTable frames={frames} />;
    case "gantt_einsatz":
    case "gantt_wartequeue":
    case "lifecycle":
    case "reporting_record":
      return <StatusList tag={tab.source} frames={frames} />;
    default:
      return (
        <p
          className="p-4 text-sm text-muted-foreground"
          data-testid="stream-router-unknown"
        >
          Unbekannter Viewer.
        </p>
      );
  }
}

/** Einfache Status-Liste für die partial-/Zeit-Streams (Einsatzzeit etc.). */
function StatusList({
  tag,
  frames,
}: {
  tag: StreamTag;
  frames: Frame[];
}): React.ReactElement {
  if (frames.length === 0) {
    return (
      <p
        className="p-4 text-sm text-muted-foreground"
        data-testid={`status-empty-${tag}`}
      >
        Noch keine Daten.
      </p>
    );
  }
  // Nur die jüngsten Einträge zeigen (Status-Liste, kein Voll-Log).
  const recent = frames.slice(-50);
  return (
    <ul
      className="flex flex-col gap-1 text-sm"
      data-testid={`status-list-${tag}`}
    >
      {recent.map((f) => {
        const kind = String((f.v as { kind?: string }).kind ?? "");
        return (
          <li
            key={f.seq}
            className="flex items-center gap-2 border-b border-border py-1 font-mono text-xs text-foreground"
          >
            <span className="text-muted-foreground tabular-nums">t={f.t}</span>
            <span>{kind}</span>
          </li>
        );
      })}
    </ul>
  );
}
