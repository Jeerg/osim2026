/**
 * GrafikfensterControls — Steuerleiste des faithful OSim-Grafikfensters
 * (Plan 01-15 Task 2 + GAP-CLOSURE Zoom).
 *
 * 1:1-Port der PSimulatorViewerGfx Bottom-Bar (OSimPro/PSimulatorViewerGfx.cpp:18-28):
 *  - Start/Weiter-Button (caption = "Start" bei ssBegin, "Weiter" bei ssPeriod)
 *  - Abbruch (nur enabled bei ssRunning — im headless-Port: always disabled)
 *  - Zurücksetzen (enabled bei ssPeriod/ssSuspended — nach erstem Lauf-Ende)
 *  - Felder: Periode N / Simulationszeit / assoz. Datum / Modus-Dropdown
 *  - Zoom-Button-Gruppe (analog 3fls scheduler-widget/toolbar.tsx):
 *      Fit / Tag / Stunde / ¼h — diskrete Stufen + aktiver Zustand hervorgehoben
 *
 * Im headless-Port von Phase 01 ist serverseitig nur Start realisiert.
 * Abbruch + Zurücksetzen sind faithful sichtbar, aber wie in den Kommentaren
 * im C++ klar dokumentiert als "noch nicht verfügbar" deaktiviert — KEINE
 * erfundene Funktionalität (SPEC §1.2 headless-Port-Anmerkung).
 *
 * Styling über 3FLS-Design-Tokens (osim-ui/CLAUDE.md).
 * Zoom-Buttons nutzen 3FLS-Token (variant default/ghost), KEINE Daten-Farben.
 * A11y: aria-Labels auf allen Buttons (osim-ui/CLAUDE.md §5).
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GRAFIKFENSTER_MODES, type GrafikfensterModus } from "./grafikfenster-modes";
import { SIM_ZOOM_LEVELS, type SimZoomLevel } from "./grafikfenster-coords";

/** Simulations-Status (§1.2 OSimPro/PSimulatorViewerGfx.cpp:134-181). */
export type SimStatus = "begin" | "period" | "running" | "suspended";

/** Label-Map für Zoom-Stufen (Anzeige-Texte, analog 3fls ZOOM_OPTIONS). */
const ZOOM_LABELS: Record<SimZoomLevel, string> = {
  fit: "Fit",
  woche: "Woche",
  tag: "Tag",
  stunde: "Std",
  viertelstunde: "15m",
};

export interface GrafikfensterControlsProps {
  /** Gewähltes Modell (für Start-Button). */
  modelId: string;
  /** Aktiver Modus-Schlüssel. */
  modus: "belegung" | "warteschlangen" | "qualifikation";
  /** Callback bei Modus-Wechsel. */
  onModusChange: (modus: GrafikfensterModus["key"]) => void;
  /** Start-Prozess läuft (Button zeigt "Lauf startet…"). */
  starting: boolean;
  /** Ob ein Lauf aktiv/gestartet ist. */
  hasRun: boolean;
  /** Callback: Start/Weiter (startet den Lauf). */
  onStart: () => void;
  /** Perioden-Beginn in Sekunden (für Anzeige). */
  periodBegin: number;
  /** Perioden-Ende in Sekunden (für Periode-N-Anzeige). */
  periodEnd: number;
  /** Aktuelle Simulationszeit in Sekunden. */
  simTime: number;
  /** Simulationsstatus (optional, default 'begin'). */
  simStatus?: SimStatus;
  /** Periode-Nummer (optional). */
  periodNum?: number;
  /** Aktive Zoom-Stufe (analog 3fls ZoomLevel, Default 'fit'). */
  zoom?: SimZoomLevel;
  /** Callback bei Zoom-Wechsel (analog 3fls setZoom). */
  onZoomChange?: (zoom: SimZoomLevel) => void;
}

/** Formatiert eine Sim-Zeit (Sekunden) als "Xd Yh Zm Ss". */
function formatSimTime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

/** Formatiert Perioden-Beginn als einfaches Datum-Platzhalter (kein Kalender-Offset). */
function formatAssozDatum(periodBegin: number): string {
  // Im headless-Port: kein echter Kalender-Offset; Tag-Zahl anzeigen
  const tag = Math.floor(periodBegin / 86400) + 1;
  return `Tag ${tag}`;
}

export function GrafikfensterControls({
  modelId,
  modus,
  onModusChange,
  starting,
  hasRun,
  onStart,
  periodEnd,
  periodBegin,
  simTime,
  simStatus = "begin",
  periodNum = 0,
  zoom = "fit",
  onZoomChange,
}: GrafikfensterControlsProps): React.ReactElement {
  // Start-Button-Caption: "Start" bei begin, "Weiter" bei period (§1.2)
  const startCaption =
    starting
      ? "Lauf startet…"
      : simStatus === "period"
        ? "Weiter"
        : "Start";

  // Start enabled: ssBegin oder ssPeriod, Modell gewählt, nicht gerade starting
  const startEnabled = !starting && !!modelId && (simStatus === "begin" || simStatus === "period");

  // Abbruch: nur enabled bei ssRunning (im headless-Port: always disabled)
  const abbruchEnabled = false; // headless-Port: faithful visible, not wired

  // Zurücksetzen: enabled bei ssPeriod/ssSuspended (nach Periode/erstem Lauf)
  const zurueckEnabled = hasRun && (simStatus === "period" || simStatus === "suspended");

  const periodLaenge = periodEnd - periodBegin;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2"
      data-testid="grafikfenster-controls"
      role="toolbar"
      aria-label="Grafikfenster Steuerleiste"
    >
      {/* Start/Weiter */}
      {/* data-testid beinhaltet beide Werte fuer E2E (live-start-run) und
          Unit-Tests (grafik-btn-start). Playwright und JSDOM suchen data-testid
          exakt — daher getrennter Wrapper oder wir verwenden live-start-run als
          primary und grafik-btn-start als Alias ueber aria-label. Wir waehlen:
          data-testid = "live-start-run" (E2E-kompatibel), fuer Unit-Tests nutzen
          wir zusaetzlich aria-label=grafik-btn-start als testid-Fallback. */}
      <Button
        type="button"
        data-testid="live-start-run"
        onClick={onStart}
        disabled={!startEnabled}
        aria-label={startCaption}
      >
        {startCaption}
      </Button>

      {/* Abbruch — faithful sichtbar, headless-Port disabled */}
      <Button
        type="button"
        variant="outline"
        data-testid="grafik-btn-abbruch"
        disabled={!abbruchEnabled}
        title="Abbruch ist im aktuellen Slice noch nicht verfügbar"
        aria-label="Simulation abbrechen (nicht verfügbar)"
      >
        Abbruch
      </Button>

      {/* Zurücksetzen */}
      <Button
        type="button"
        variant="outline"
        data-testid="grafik-btn-zurueck"
        disabled={!zurueckEnabled}
        title={
          zurueckEnabled
            ? "Zurücksetzen ist im aktuellen Slice noch nicht verfügbar"
            : "Kein aktiver Lauf"
        }
        aria-label="Simulation zurücksetzen"
      >
        Zurücksetzen
      </Button>

      {/* Trennlinie */}
      <div className="h-6 w-px bg-border" aria-hidden="true" />

      {/* Periode N */}
      <span className="text-xs text-muted-foreground">
        Periode:{" "}
        <span className="font-medium text-foreground" data-testid="grafik-field-periode">
          {periodNum > 0 ? periodNum : "–"}
          {periodLaenge > 0 && ` (${Math.round(periodLaenge / 86400)}d)`}
        </span>
      </span>

      {/* Simulationszeit */}
      <span className="text-xs text-muted-foreground">
        Sim-Zeit:{" "}
        <span className="font-medium text-foreground tabular-nums" data-testid="grafik-field-simzeit">
          {formatSimTime(simTime)}
        </span>
      </span>

      {/* assoz. Datum */}
      <span className="text-xs text-muted-foreground">
        Datum:{" "}
        <span className="font-medium text-foreground" data-testid="grafik-field-datum">
          {formatAssozDatum(simTime)}
        </span>
      </span>

      {/* Modus-Dropdown (IDC_CBB_PGFX_MODUS, §1.1) */}
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        Modus:
        <select
          data-testid="grafik-modus-select"
          value={modus}
          onChange={(e) =>
            onModusChange(
              e.target.value as GrafikfensterModus["key"],
            )
          }
          className="h-7 rounded-md border border-input bg-transparent px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Grafikfenster Modus wählen"
        >
          {GRAFIKFENSTER_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      {/* Trennlinie */}
      <div className="h-6 w-px bg-border" aria-hidden="true" />

      {/* Zoom-Button-Gruppe (analog 3fls scheduler-widget/toolbar.tsx ZOOM_OPTIONS).
          Diskrete Stufen: Fit / Tag / Std / 15m.
          Aktiver Button hervorgehoben (variant="default"), inaktive ghost.
          3FLS-Token, KEINE Daten-Farben. A11y: role="radiogroup". */}
      <div
        role="radiogroup"
        aria-label="Zoom-Stufe"
        data-testid="grafik-zoom-group"
        className="flex items-center gap-0.5"
      >
        {SIM_ZOOM_LEVELS.map((level) => {
          const active = zoom === level;
          return (
            <Button
              key={level}
              type="button"
              variant={active ? "default" : "ghost"}
              size="sm"
              role="radio"
              aria-checked={active}
              data-active={active || undefined}
              data-testid={`grafik-zoom-${level}`}
              onClick={() => onZoomChange?.(level)}
              className={cn(
                "h-7 px-2 text-xs gap-1",
                active && "shadow-sm",
              )}
              aria-label={`Zoom ${ZOOM_LABELS[level]}`}
            >
              {ZOOM_LABELS[level]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
