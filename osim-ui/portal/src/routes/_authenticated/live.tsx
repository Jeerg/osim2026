/**
 * /live — Live-Viewer-Route (Plan 01-02 Task 3, D-4.1).
 *
 * Eigene Top-Level-Seite („jetzt schau ich der Sim zu"). Tab-Leiste pro
 * Stream-Kategorie; der aktive Tab setzt `setActiveStream` im eigenen
 * Live-Stream-Store (D-4.2). Ein 200ms-Polling-Tick treibt den Tail-Reader
 * (D-4.4, AC-3-Basis); Re-Renders werden auf max ~30 Hz gethrottled
 * (Frame-Coalescing, T-01-05). Beim gantt_durchlauf-Tab wird pro Auftrag eine
 * GanttRow gerendert.
 *
 * M1-Grenze: die Read-Quelle (stream.jsonl-Byte-Range) wird in einer Folge-
 * Welle an das Backend gewired. Diese Route ist read-quellen-agnostisch
 * (akzeptiert eine injizierbare ReadFn) und degradiert sauber, solange kein
 * aktiver Run gewählt ist — der Tick liefert dann leere Steps.
 *
 * Styling strikt über Design-Tokens (3FLS-Guide), keine ad-hoc Hex-Werte.
 */

import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  createTailReader,
  type ReadFn,
} from "@/features/live-stream/tail-reader";
import { useLiveStreamStore } from "@/features/live-stream/store";
import { GanttRow } from "@/features/live-stream/components/GanttRow";
import { STREAM_TAGS, type Frame, type StreamTag } from "@/features/live-stream/types";

/** Polling-Intervall des Tail-Readers (D-4.4). */
const POLL_INTERVAL_MS = 200;
/** Render-Throttle: max ~30 Hz (D-4.4 Frame-Coalescing). */
const RENDER_THROTTLE_MS = Math.floor(1000 / 30);
/** Pixel pro Sim-Sekunde für die Gantt-Zeit-Achse. */
const PX_PER_SECOND = 0.01;

/** Deutsche Tab-Labels pro Stream-Tag (Reihenfolge Discretion D-4.1). */
const STREAM_LABELS: Record<StreamTag, string> = {
  lifecycle: "Lebenszyklus",
  gantt_durchlauf: "Durchlauf",
  gantt_einsatz: "Einsatz",
  gantt_schicht: "Schicht",
  kpi_auswertung: "Auswertung",
  reporting_record: "Records",
};

export const Route = createFileRoute("/_authenticated/live")({
  component: LivePage,
});

/**
 * No-op-Read solange kein aktiver Run gewählt ist. Liefert leere Steps, damit
 * der Tail-Reader-Tick ohne Backend sauber läuft (Walking-Skeleton).
 */
const noopRead: ReadFn = async () => ({ text: "", nextOffset: 0 });

interface LivePageProps {
  /** Injizierbar für Tests/Backend-Wire. Default: no-op (kein Run). */
  read?: ReadFn;
}

function LivePage({ read = noopRead }: LivePageProps): React.ReactElement {
  const activeStream = useLiveStreamStore((s) => s.activeStream);
  const setActiveStream = useLiveStreamStore((s) => s.setActiveStream);
  const ingest = useLiveStreamStore((s) => s.ingest);
  const hasGap = useLiveStreamStore((s) => s.hasGap);

  // Default-Tab beim ersten Mount setzen.
  React.useEffect(() => {
    if (activeStream === null) setActiveStream("gantt_durchlauf");
  }, [activeStream, setActiveStream]);

  // 200ms-Polling-Tick mit 30Hz-Coalescing: gelesene Frames werden gepuffert
  // und höchstens alle RENDER_THROTTLE_MS in den Store geflusht.
  React.useEffect(() => {
    const reader = createTailReader(read);
    const pending: Frame[] = [];
    let lastFlush = 0;
    let cancelled = false;

    const flush = () => {
      if (pending.length === 0) return;
      ingest(pending.splice(0, pending.length));
      lastFlush = Date.now();
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const frames = await reader.step();
        if (frames.length > 0) pending.push(...frames);
      } catch (err) {
        console.warn("[live-stream] Tail-Step fehlgeschlagen:", err);
      }
      if (Date.now() - lastFlush >= RENDER_THROTTLE_MS) flush();
    };

    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      flush();
    };
  }, [read, ingest]);

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-4">
        <h2 className="text-2xl font-semibold text-foreground">Live-Sicht</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Echtzeit-Darstellung eines laufenden Simulationslaufs aus dem
          JSONL-Stream. Wählen Sie eine Stream-Kategorie.
        </p>
        {hasGap && (
          <p
            role="status"
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive"
            data-testid="live-gap-banner"
          >
            Lücke im Stream erkannt — einige Frames fehlen möglicherweise.
          </p>
        )}
      </header>

      <Tabs
        value={activeStream ?? "gantt_durchlauf"}
        onValueChange={(v) => setActiveStream(v as StreamTag)}
        className="flex flex-1 flex-col"
      >
        <TabsList>
          {STREAM_TAGS.map((tag) => (
            <TabsTrigger key={tag} value={tag} data-testid={`live-tab-${tag}`}>
              {STREAM_LABELS[tag]}
            </TabsTrigger>
          ))}
        </TabsList>

        {STREAM_TAGS.map((tag) => (
          <TabsContent key={tag} value={tag} className="flex-1">
            {tag === "gantt_durchlauf" ? (
              <GanttDurchlaufPanel />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                {STREAM_LABELS[tag]}: Renderer folgt in Wave 3.
              </p>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * Rendert pro Auftrag eine GanttRow aus den aktuell gepufferten
 * gantt_durchlauf-Frames. Gruppiert über `auftrag_id`.
 */
function GanttDurchlaufPanel(): React.ReactElement {
  const frames = useLiveStreamStore((s) => s.byStream.gantt_durchlauf);

  const byAuftrag = React.useMemo(() => {
    const map = new Map<string, Frame[]>();
    for (const f of frames) {
      const auftrag = String(
        (f.v as { auftrag_id?: string }).auftrag_id ?? "?",
      );
      const list = map.get(auftrag);
      if (list) list.push(f);
      else map.set(auftrag, [f]);
    }
    return map;
  }, [frames]);

  if (byAuftrag.size === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="live-empty">
        Noch keine Durchlauf-Daten — Stream wartet auf einen aktiven Lauf.
      </p>
    );
  }

  return (
    <div className="mt-2 overflow-auto" data-testid="live-gantt">
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
