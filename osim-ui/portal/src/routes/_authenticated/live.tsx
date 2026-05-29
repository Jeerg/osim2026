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
import { toast } from "sonner";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/error-message";
import { useModels } from "@/api/models";
import {
  buildStreamReadFn,
  fetchRunMeta,
  startRun,
} from "@/api/runs";
import {
  createTailReader,
  type ReadFn,
} from "@/features/live-stream/tail-reader";
import { useLiveStreamStore } from "@/features/live-stream/store";
import { StreamRouter } from "@/features/live-stream/stream-router";
import {
  STREAM_TAGS,
  type Frame,
  type MetaJson,
  type StreamTag,
} from "@/features/live-stream/types";

/** Polling-Intervall des Tail-Readers (D-4.4). */
const POLL_INTERVAL_MS = 200;
/** Render-Throttle: max ~30 Hz (D-4.4 Frame-Coalescing). */
const RENDER_THROTTLE_MS = Math.floor(1000 / 30);

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
  /**
   * Injizierbar für Tests/Backend-Wire. Wenn gesetzt, überschreibt diese ReadFn
   * den intern aus dem gestarteten Run abgeleiteten Pfad (Test-Override). Im
   * Normalbetrieb bleibt sie undefined und die Route baut die HTTP-ReadFn selbst
   * aus der gestarteten run_id.
   */
  read?: ReadFn;
  /**
   * Optionaler meta.json-Snapshot (Test-Override). Wird, falls gesetzt, beim
   * Mount in den Store gespiegelt (Schema-Mismatch-Banner + partial-Status,
   * D-2.2 / D-OP-4 / AC-7). Im Normalbetrieb lädt die Route die meta.json nach
   * dem Run-Start selbst.
   */
  meta?: MetaJson;
}

function LivePage({
  read: readOverride,
  meta: metaOverride,
}: LivePageProps): React.ReactElement {
  const activeStream = useLiveStreamStore((s) => s.activeStream);
  const setActiveStream = useLiveStreamStore((s) => s.setActiveStream);
  const ingest = useLiveStreamStore((s) => s.ingest);
  const setMeta = useLiveStreamStore((s) => s.setMeta);
  const hasGap = useLiveStreamStore((s) => s.hasGap);

  const { data: models, isLoading: modelsLoading } = useModels();

  // Run-Setup-State: ausgewähltes Modell, aktive run_id, geladene meta + die
  // coverage_ratio des Starts (partielles Modell surfacen, D-2.2).
  const [modelId, setModelId] = React.useState<string>("");
  const [runId, setRunId] = React.useState<string | null>(null);
  const [meta, setRunMeta] = React.useState<MetaJson | undefined>(metaOverride);
  const [coverageRatio, setCoverageRatio] = React.useState<number | null>(null);
  const [starting, setStarting] = React.useState(false);

  // read-Prop-Ableitung: ein expliziter Test-Override gewinnt; sonst solange
  // kein Run gestartet ist → noopRead (run-loser Default), und sobald runId
  // gesetzt ist → echte HTTP-ReadFn gegen GET /runs/{id}/stream. useMemo, damit
  // der Tail-Tick-useEffect (read in Dependency-Liste) nur bei Run-Wechsel
  // re-initialisiert, nicht bei jedem Render.
  const read = React.useMemo<ReadFn>(() => {
    if (readOverride) return readOverride;
    if (runId === null) return noopRead;
    return buildStreamReadFn(runId);
  }, [readOverride, runId]);

  async function handleStartRun(): Promise<void> {
    if (!modelId || starting) return;
    setStarting(true);
    // Bei Run-(Re-)Start den Store leeren, damit Frames eines vorigen Laufs
    // nicht mit dem neuen vermischt werden (T-LIVE-FE-03, Reproduzierbarkeit).
    useLiveStreamStore.getState().reset();
    setActiveStream("gantt_durchlauf");
    setRunMeta(undefined);
    setCoverageRatio(null);
    try {
      const resp = await startRun(modelId);
      setCoverageRatio(resp.coverage_ratio);
      setRunId(resp.run_id);
      // meta.json nachladen — speist den partial-/Schema-Mismatch-Banner-Pfad.
      try {
        const loaded = await fetchRunMeta(resp.run_id);
        setRunMeta(loaded);
      } catch (metaErr) {
        // meta-Read ist best-effort: der Stream läuft auch ohne meta weiter.
        console.warn("[live] meta.json konnte nicht geladen werden:", metaErr);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Lauf konnte nicht gestartet werden"));
    } finally {
      setStarting(false);
    }
  }

  // Default-Tab beim ersten Mount setzen.
  React.useEffect(() => {
    if (activeStream === null) setActiveStream("gantt_durchlauf");
  }, [activeStream, setActiveStream]);

  // meta.json (falls vorhanden) in den Store spiegeln — speist den
  // partial-/Schema-Mismatch-Banner-Pfad des StreamRouter (D-2.2 / D-OP-4).
  React.useEffect(() => {
    if (meta) setMeta(meta);
  }, [meta, setMeta]);

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
          JSONL-Stream. Modell wählen, Lauf starten und live zusehen.
        </p>

        {/* Run-Setup: Modell-Picker + „Lauf starten". E2E-Modelle (Prefix
            „E2E-") werden hier NICHT herausgefiltert — der 01-10-E2E braucht
            sein eigenes Modell (anders als models/index.tsx). */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="live-model-select"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Modell
            </label>
            <select
              id="live-model-select"
              data-testid="live-model-select"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={modelsLoading || starting}
              className="h-9 min-w-[16rem] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                {modelsLoading ? "Lade Modelle…" : "Modell auswählen…"}
              </option>
              {(models ?? []).map((m) => (
                <option
                  key={m.id}
                  value={m.id}
                  data-testid={`live-model-option-${m.id}`}
                >
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            data-testid="live-start-run"
            onClick={() => void handleStartRun()}
            disabled={!modelId || starting}
          >
            {starting ? "Lauf startet…" : "Lauf starten"}
          </Button>

          {runId && (
            <span
              data-testid="live-active-run-id"
              className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground"
            >
              <span className="font-sans font-medium not-italic text-foreground">
                Aktiver Lauf
              </span>
              {runId}
            </span>
          )}
        </div>

        {coverageRatio !== null && coverageRatio < 1 && (
          <p
            role="status"
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-200"
            data-testid="live-coverage-hint"
          >
            Partielles Modell: nur {Math.round(coverageRatio * 100)} % der
            Objekte geladen — einige Streams können unvollständig sein.
          </p>
        )}

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
            {/* Jeder Tab rendert genau seinen Stream über den StreamRouter
                (Stream-Isolation, AC-4). Der Router liest die Frames des Tags
                aus dem Store und multiplext auf Gantt / KPI-Grid / RecordTable
                / Status-Liste; darüber rendert er den partial-/Schema-Mismatch-
                Banner (D-2.2 / D-OP-4 / AC-7). */}
            <StreamRouter tag={tag} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
