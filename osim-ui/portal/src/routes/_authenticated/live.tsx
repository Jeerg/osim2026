/**
 * /live — Live-Viewer-Route (Plan 01-02 Task 3 → GAP-CLOSURE 01-12 Task 2
 * → GAP-CLOSURE 01-15 Task 3).
 *
 * Eigene Top-Level-Seite („jetzt schau ich der Sim zu"). Die Tab-Leiste trägt
 * die ECHTEN OSim2004-Viewer-Namen aus der viewer-config (Durchlaufplan,
 * Einsatzzeit, Schicht + die Auswertungen Gesamt/Produktionsaufträge/… ) — NICHT
 * mehr die rohen Stream-Tags. Der Durchlaufplan ist der PRIMÄRE Grafik-Viewer
 * (FSimulatorViewerGfx-treu) und der Default-Tab: von ihm aus wird der Lauf
 * gesteuert (GrafikfensterControls leben IN diesem Grafik-Viewer, über dem
 * Grafikfenster-Canvas) und live über das faithful Grafikfenster (3 Modi,
 * OID-Belegung, Warteschlangen-Gebirge, gated Qualifikation) gerendert.
 *
 * Ein 200ms-Polling-Tick treibt den Tail-Reader (D-4.4, AC-3-Basis);
 * Re-Renders werden auf max ~30 Hz gethrottled (Frame-Coalescing, T-01-05). Die
 * Read-Quelle wird aus der gestarteten run_id abgeleitet (01-09-Wiring).
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
import { useModelStore } from "@/stores/model-store";
import { StreamRouter } from "@/features/live-stream/stream-router";
import {
  DEFAULT_VIEWER_TAB_ID,
  VIEWER_TABS,
} from "@/features/live-stream/viewer-config";
import type {
  Frame,
  MetaJson,
} from "@/features/live-stream/types";
import { Grafikfenster } from "@/features/live-stream/components/Grafikfenster";
import type { GrafikModus } from "@/features/live-stream/components/Grafikfenster";
import { GrafikfensterControls } from "@/features/live-stream/components/GrafikfensterControls";

/** Polling-Intervall des Tail-Readers (D-4.4). */
const POLL_INTERVAL_MS = 200;
/** Render-Throttle: max ~30 Hz (D-4.4 Frame-Coalescing). */
const RENDER_THROTTLE_MS = Math.floor(1000 / 30);

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
   * Mount in den Store gespiegelt (Schema-Mismatch-Banner + partial-Status).
   */
  meta?: MetaJson;
}

function LivePage({
  read: readOverride,
  meta: metaOverride,
}: LivePageProps): React.ReactElement {
  const ingest = useLiveStreamStore((s) => s.ingest);
  const setMeta = useLiveStreamStore((s) => s.setMeta);
  const hasGap = useLiveStreamStore((s) => s.hasGap);

  // Aktive Modell-ID aus dem gemeinsamen ModelStore (modulübergreifend persistent).
  // Wenn der User ein Modell in /models/$id öffnet, setzt loadFromWire() die ID.
  // Wenn der User auf /live ein Modell wählt, setzt setActiveModelId() die ID.
  // Bleibt erhalten bis der User explizit wechselt (kein lokales useState mehr).
  const storeModelId = useModelStore((s) => s.modelId);
  const storeWire = useModelStore((s) => s.wire);
  const setActiveModelId = useModelStore((s) => s.setActiveModelId);

  // Abgeleitete Betriebsmittel-Liste aus dem Wire (PBetriebsmittel.m_sName).
  // Erscheinen als leere Lanes SCHON VOR dem Start (FSimulatorViewerGfx-treu).
  // Nach OID sortiert (OSim-Reihenfolge).
  const ressourcenFromModel = React.useMemo((): string[] => {
    if (!storeWire) return [];
    return Object.values(storeWire.objects)
      .filter((o) => o.klass === "PBetriebsmittel")
      .sort((a, b) => a.oid - b.oid)
      .map((o) =>
        typeof o.attrs.m_sName === "string" ? o.attrs.m_sName : `oid_${o.oid}`,
      );
  }, [storeWire]);

  // Effektive modelId: aus Store (Picker-Änderung schreibt zurück)
  const modelId = storeModelId ?? "";

  const { data: models, isLoading: modelsLoading } = useModels();

  // Aktiver OSim-Viewer-Tab (Default = der primäre Grafik-Viewer Durchlaufplan).
  const [activeTabId, setActiveTabId] = React.useState<string>(
    DEFAULT_VIEWER_TAB_ID,
  );

  // Grafikfenster-Modus (Belegung / Warteschlangen / Qualifikation).
  const [grafikModus, setGrafikModus] = React.useState<GrafikModus>("belegung");

  // Run-Setup-State (modelId kommt jetzt aus dem Store, nicht aus useState).
  const [runId, setRunId] = React.useState<string | null>(null);
  const [meta, setRunMeta] = React.useState<MetaJson | undefined>(metaOverride);
  const [coverageRatio, setCoverageRatio] = React.useState<number | null>(null);
  const [starting, setStarting] = React.useState(false);

  // read-Prop-Ableitung: Test-Override gewinnt; sonst noopRead bis ein Run läuft,
  // dann echte HTTP-ReadFn. useMemo, damit der Tail-Tick nur bei Run-Wechsel
  // re-initialisiert.
  const read = React.useMemo<ReadFn>(() => {
    if (readOverride) return readOverride;
    if (runId === null) return noopRead;
    return buildStreamReadFn(runId);
  }, [readOverride, runId]);

  async function handleStartRun(): Promise<void> {
    if (!modelId || starting) return;
    setStarting(true);
    // Bei Run-(Re-)Start den Store leeren (T-LIVE-FE-03, Reproduzierbarkeit)
    // und auf den primären Grafik-Viewer (Durchlaufplan) springen — der Lauf
    // zeigt sich im Grafik-Viewer, nicht in einer generischen Standard-Fläche.
    useLiveStreamStore.getState().reset();
    setActiveTabId(DEFAULT_VIEWER_TAB_ID);
    setRunMeta(undefined);
    setCoverageRatio(null);
    try {
      const resp = await startRun(modelId);
      setCoverageRatio(resp.coverage_ratio);
      setRunId(resp.run_id);
      try {
        const loaded = await fetchRunMeta(resp.run_id);
        setRunMeta(loaded);
      } catch (metaErr) {
        console.warn("[live] meta.json konnte nicht geladen werden:", metaErr);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Lauf konnte nicht gestartet werden"));
    } finally {
      setStarting(false);
    }
  }

  // meta.json (falls vorhanden) in den Store spiegeln (partial-/Schema-Mismatch).
  React.useEffect(() => {
    if (meta) setMeta(meta);
  }, [meta, setMeta]);

  // 200ms-Polling-Tick mit 30Hz-Coalescing.
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
          Echtzeit-Darstellung eines laufenden Simulationslaufs. Modell wählen,
          dann den Lauf aus dem Durchlaufplan-Grafik-Viewer starten.
        </p>

        {/* Modell-Picker. E2E-Modelle (Prefix „E2E-") werden hier NICHT
            herausgefiltert — der 01-10-E2E braucht sein eigenes Modell. Der
            Lauf-START liegt bewusst NICHT hier, sondern IM Durchlaufplan-Grafik-
            Viewer (FSimulatorViewerGfx-treu). */}
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
              onChange={(e) => setActiveModelId(e.target.value)}
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
            className="mt-2 inline-flex items-center gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-1 text-sm font-medium text-foreground"
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
        value={activeTabId}
        onValueChange={setActiveTabId}
        className="flex flex-1 flex-col"
      >
        <TabsList>
          {VIEWER_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-testid={`live-tab-${tab.id}`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {VIEWER_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="flex-1">
            {/* Der Durchlaufplan ist der primäre Grafik-Viewer (01-15):
                GrafikfensterControls + das faithful OSim-Grafikfenster
                (3 Modi: Belegung/Warteschlangen/Qualifikation).
                Die übrigen Viewer rendern direkt ihren Stream (Isolation, AC-4). */}
            {tab.id === DEFAULT_VIEWER_TAB_ID ? (
              <div className="flex flex-col gap-3">
                <GrafikfensterControls
                  modelId={modelId}
                  modus={grafikModus}
                  onModusChange={(m) => setGrafikModus(m as GrafikModus)}
                  starting={starting}
                  hasRun={runId !== null}
                  onStart={() => void handleStartRun()}
                  periodBegin={0}
                  periodEnd={86400}
                  simTime={0}
                />
                <Grafikfenster
                  modus={grafikModus}
                  widthPx={800}
                  periodBegin={0}
                  periodEnd={86400}
                  ressourcenFromModel={ressourcenFromModel}
                />
              </div>
            ) : (
              <StreamRouter tab={tab} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// GrafikViewerControls ersetzt durch GrafikfensterControls (01-15 Task 3).
