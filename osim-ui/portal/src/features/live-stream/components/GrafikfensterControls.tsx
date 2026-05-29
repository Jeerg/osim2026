/**
 * GrafikfensterControls — Steuerleiste des faithful OSim-Grafikfensters
 * (Plan 01-15 Task 2).
 *
 * 1:1-Port der PSimulatorViewerGfx Bottom-Bar (OSimPro/PSimulatorViewerGfx.cpp:18-28):
 *  - Start/Weiter-Button (caption = "Start" bei ssBegin, "Weiter" bei ssPeriod)
 *  - Abbruch (nur enabled bei ssRunning — im headless-Port: always disabled)
 *  - Zurücksetzen (enabled bei ssPeriod/ssSuspended — nach erstem Lauf-Ende)
 *  - Felder: Periode N / Simulationszeit / assoz. Datum / Modus-Dropdown
 *
 * Im headless-Port von Phase 01 ist serverseitig nur Start realisiert.
 * Abbruch + Zurücksetzen sind faithful sichtbar, aber wie in den Kommentaren
 * im C++ klar dokumentiert als "noch nicht verfügbar" deaktiviert — KEINE
 * erfundene Funktionalität (SPEC §1.2 headless-Port-Anmerkung).
 *
 * Styling über 3FLS-Design-Tokens (osim-ui/CLAUDE.md).
 * A11y: aria-Labels auf allen Buttons (osim-ui/CLAUDE.md §5).
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { GRAFIKFENSTER_MODES, type GrafikfensterModus } from "./grafikfenster-modes";

/** Simulations-Status (§1.2 OSimPro/PSimulatorViewerGfx.cpp:134-181). */
export type SimStatus = "begin" | "period" | "running" | "suspended";

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
      <Button
        type="button"
        data-testid="grafik-btn-start"
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
    </div>
  );
}
