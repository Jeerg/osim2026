/**
 * stream-router — multiplext den aktiven Stream-Tag auf seine Render-Komponente
 * (Plan 01-05 Task 1, O-3 / AC-4 / SPEC §8.1).
 *
 * Der `StreamRouter` liest die Frames des angegebenen (bzw. des aktiven)
 * Stream-Tags aus dem Live-Stream-Store (D-4.2) und rendert GENAU EINEN Stream
 * (Isolation, AC-4):
 *
 *   - gantt_durchlauf  → pro Auftrag eine GanttRow (Geometrie via GObject)
 *   - kpi_auswertung   → ein KpiTile-Grid (eine Kachel pro kind, Trend N/N-1)
 *   - reporting_record → eine virtualisierte RecordTable (Filter/Sort)
 *   - gantt_einsatz / gantt_schicht → einfache Status-Liste (partial-Streams)
 *   - lifecycle        → einfache Status-Liste der Lifecycle-Events
 *
 * Über jedem Panel rendert der Router den {@link PartialBanner} des Tags
 * (partial-Status + Schema-Mismatch, D-2.2 / D-OP-4 / AC-7).
 *
 * Styling strikt über Design-Tokens (3FLS-Guide), keine ad-hoc Hex-Werte.
 */

import * as React from "react";
import { useLiveStreamStore } from "./store";
import type { Frame, StreamTag } from "./types";
import { GanttRow } from "./components/GanttRow";
import { KpiTile } from "./components/KpiTile";
import { RecordTable } from "./components/RecordTable";
import { PartialBanner } from "./components/PartialBanner";

/** Pixel pro Sim-Sekunde für die Gantt-Zeit-Achse (analog /live-Route). */
const PX_PER_SECOND = 0.01;

export interface StreamRouterProps {
  /**
   * Zu rendernder Stream-Tag. Default: der aktive Tag aus dem Store
   * (Tab-Auswahl). Explizit gesetzt für Tests/embeddings.
   */
  tag?: StreamTag;
}

export function StreamRouter({ tag }: StreamRouterProps): React.ReactElement {
  const activeStream = useLiveStreamStore((s) => s.activeStream);
  const byStream = useLiveStreamStore((s) => s.byStream);
  const effectiveTag = tag ?? activeStream;

  if (effectiveTag === null) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="stream-router-empty">
        Kein Stream ausgewählt.
      </p>
    );
  }

  const frames = byStream[effectiveTag] ?? [];

  return (
    <div className="flex flex-col gap-3" data-testid={`stream-router-${effectiveTag}`}>
      <PartialBanner tag={effectiveTag} />
      <StreamPanel tag={effectiveTag} frames={frames} />
    </div>
  );
}

function StreamPanel({
  tag,
  frames,
}: {
  tag: StreamTag;
  frames: Frame[];
}): React.ReactElement {
  switch (tag) {
    case "gantt_durchlauf":
      return <GanttPanel frames={frames} />;
    case "kpi_auswertung":
      return <KpiPanel frames={frames} />;
    case "reporting_record":
      return <RecordTable frames={frames} />;
    case "gantt_einsatz":
    case "gantt_schicht":
    case "lifecycle":
      return <StatusList tag={tag} frames={frames} />;
    default:
      return (
        <p className="p-4 text-sm text-muted-foreground" data-testid="stream-router-unknown">
          Unbekannter Stream.
        </p>
      );
  }
}

/** gantt_durchlauf → pro Auftrag eine GanttRow. */
function GanttPanel({ frames }: { frames: Frame[] }): React.ReactElement {
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
      <p className="p-4 text-sm text-muted-foreground" data-testid="gantt-empty">
        Noch keine Durchlauf-Daten.
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

/** kpi_auswertung → eine KpiTile pro kind, Trend gegen die Vorperiode. */
function KpiPanel({ frames }: { frames: Frame[] }): React.ReactElement {
  // Pro kind den jüngsten (current) und zweitjüngsten (previous) Frame finden.
  const tilesByKind = React.useMemo(() => {
    const byKind = new Map<string, Frame[]>();
    for (const f of frames) {
      const kind = String((f.v as { kind?: string }).kind ?? "unbekannt");
      const list = byKind.get(kind);
      if (list) list.push(f);
      else byKind.set(kind, [f]);
    }
    return byKind;
  }, [frames]);

  if (tilesByKind.size === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="kpi-empty">
        Noch keine Auswertungs-Daten.
      </p>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      data-testid="kpi-grid"
    >
      {[...tilesByKind.entries()].map(([kind, kindFrames]) => {
        const current = kindFrames[kindFrames.length - 1];
        const previous = kindFrames[kindFrames.length - 2];
        return (
          <KpiTile
            key={kind}
            kind={kind}
            current={current.v}
            previous={previous?.v}
          />
        );
      })}
    </div>
  );
}

/** Einfache Status-Liste (lifecycle + partial-Gantt-Streams). */
function StatusList({
  tag,
  frames,
}: {
  tag: StreamTag;
  frames: Frame[];
}): React.ReactElement {
  if (frames.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid={`status-empty-${tag}`}>
        Noch keine Daten.
      </p>
    );
  }
  // Nur die jüngsten Einträge zeigen (Status-Liste, kein Voll-Log).
  const recent = frames.slice(-50);
  return (
    <ul className="flex flex-col gap-1 text-sm" data-testid={`status-list-${tag}`}>
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
