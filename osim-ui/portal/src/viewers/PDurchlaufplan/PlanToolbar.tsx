/**
 * PlanToolbar — Top-Toolbar des Durchlaufplan-Designers.
 *
 * Welle G17-A: Rebuild von Button-Reihe zu echten Comboboxen (HTML `<select>`).
 * 1:1-Nachbau der OSim2004-Toolbar aus `PDlplViewerStd.cpp:1552-1601`:
 * drei `CComboBox`-Felder nebeneinander für Knoten / Kanten / Kennzahl, jeweils
 * mit "Auswahlfenster" als erstem Eintrag und allen Klassen darunter.
 *
 * **Interaktions-Pattern (Original + Plus):**
 *
 * 1. **Combobox-Selektion (Original-Pattern):** User wählt einen Typ aus dem
 *    Dropdown → `insertKnotenKlass`/`insertKantenKlass` wird gesetzt. Der
 *    nächste Klick auf den Canvas legt einen Knoten dieser Klasse an der
 *    Klick-Position an. "Auswahlfenster" = Reset auf null = kein INSERT-Mode.
 *
 * 2. **Drag-from-Combobox (Plus-Feature):** User kann ein Item per Drag aus der
 *    Combobox in den Canvas ziehen — direkter Drop legt den Knoten an. Pattern
 *    aus modernen Diagramm-Editoren (Figma, Miro).
 *
 * 3. **ESC** bricht jeden aktiven INSERT-Mode ab — handled vom Parent-Viewer.
 *
 * Style-Guide-Konform (3FLS-EAM §6): shadcn-Tokens (`bg-card`, `border-border`,
 * `text-foreground`), 4px-Spacing-Grid, Cyan-Primary für Focus + Active-State.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Vollständige Knotentyp-Auswahl (Welle G15/G17, 1:1 zu OSim2004-Original
 * `PDlplViewerStd.cpp:1561-1572`). 11 Klassen + "Auswahlfenster"-Default.
 */
export const KNOTEN_KLASSEN: Array<{ klass: string; label: string }> = [
  { klass: "PDlplKnoten", label: "Knoten (Basis)" },
  { klass: "PDpKnKonstant", label: "Konstant" },
  { klass: "PDpKnMenge", label: "Menge" },
  { klass: "PDpKnMengeRuesten", label: "Menge + Rüsten" },
  { klass: "PDpKnVerteilung", label: "Verteilung" },
  { klass: "PDpKnRueckKonstant", label: "Rück. Konstant" },
  { klass: "PDpKnRueckVerteilung", label: "Rück. Verteilung" },
  { klass: "PDpKnAlternativTypID", label: "Alt. Typ-ID" },
  { klass: "PDpKnAlternativVerteilung", label: "Alt. Verteilung" },
  { klass: "PDpKnAlternativELogik", label: "Alt. E-Logik" },
  { klass: "PAssozBeleg", label: "Ress.-Belegung" },
];

/**
 * Vollständige Kantentyp-Auswahl (Welle G15/G17, 1:1 zu OSim2004
 * `PDlplViewerStd.cpp:1577-1583`). 6 Klassen.
 */
export const KANTEN_KLASSEN: Array<{ klass: string; label: string }> = [
  { klass: "PDlplKante", label: "Übergang (Basis)" },
  { klass: "PDpKaUebergang", label: "Übergang spez." },
  { klass: "PDpKaVerteilung", label: "Verteilung" },
  { klass: "PDpKaExtern", label: "Extern" },
  { klass: "PDpKaEntitaet", label: "Entität" },
  { klass: "PDpKaEntitaetAblage", label: "Ent. Ablage" },
];

/**
 * Kennzahl-Typen aus `PDlplViewerStd.cpp:1594-1601`. 7 Kennzahlen, die im
 * Original im Plan-Editor angeklickt werden um sie an einem Knoten als
 * Live-Annotation anzuzeigen. In osim-ui-Phase 1 sind die Knoten reine
 * Modellierungs-Objekte ohne Sim-Lauf-Daten — die Combobox ist daher
 * disabled mit "Phase 2"-Hinweis.
 */
export const KENNZAHL_KLASSEN: Array<{ klass: string; label: string }> = [
  { klass: "KnzAnzAusloesungen", label: "Anz. Auslösungen" },
  { klass: "KnzAnzRefusedAusloesungen", label: "Anz. abgelehnt" },
  { klass: "KnzMittlDlfz", label: "Ø Durchlaufzeit" },
  { klass: "KnzMinDlfz", label: "Min. Durchlaufzeit" },
  { klass: "KnzZegDlfz", label: "ZEG Durchlaufzeit" },
  { klass: "KnzPrzKosten", label: "Prozesskosten" },
  { klass: "KnzZegBediengrad", label: "ZEG Bediengrad" },
];

/** Drag-Data-Type-Identifier für DataTransfer. */
export const PLAN_TOOLBAR_DRAG_MIME = "application/x-osim-plan-toolbar";

/** Sentinel für "Auswahlfenster"-Option (1:1 zum Original-Default). */
const SELECT_PLACEHOLDER = "__select__";

export interface PlanToolbarProps {
  insertKnotenKlass: string | null;
  insertKantenKlass: string | null;
  onInsertKnotenKlassChange: (klass: string | null) => void;
  onInsertKantenKlassChange: (klass: string | null) => void;
  selectedCount: number;
  onDelete: () => void;
  disabled?: boolean;
  stats?: { nodes: number; edges: number };
  /** Welle G18-D: Grid-Linien sichtbar (1:1 zu OSim2004 OGGrid::s_Raster). */
  showGrid?: boolean;
  /** Toggle für Grid-Anzeige. */
  onToggleGrid?: () => void;
}

/**
 * Einzelne Combobox mit "Auswahlfenster"-Default. Wert "" / SELECT_PLACEHOLDER
 * → kein INSERT-Mode. Drag-from-Select ist via separatem Drag-Handle daneben
 * (HTML <select> selbst ist nicht drag-source-fähig).
 */
function ClassCombobox({
  label,
  options,
  value,
  onChange,
  comboKind,
  disabled,
  testId,
}: {
  label: string;
  options: Array<{ klass: string; label: string }>;
  value: string | null;
  onChange: (klass: string | null) => void;
  comboKind: "knoten" | "kante" | "kennzahl";
  disabled: boolean;
  testId: string;
}) {
  const currentValue = value ?? SELECT_PLACEHOLDER;
  const activeOption = options.find((o) => o.klass === value);
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <label
        htmlFor={`combo-${comboKind}`}
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <div className="flex items-center gap-1">
        <select
          id={`combo-${comboKind}`}
          value={currentValue}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === SELECT_PLACEHOLDER ? null : v);
          }}
          disabled={disabled}
          className={cn(
            "rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1 text-xs text-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary/40",
            value && "border-primary text-primary",
            disabled && "cursor-not-allowed opacity-50",
          )}
          data-testid={`combo-${comboKind}-select`}
        >
          <option value={SELECT_PLACEHOLDER}>Auswahlfenster</option>
          {options.map((o) => (
            <option
              key={o.klass}
              value={o.klass}
              data-testid={`combo-${comboKind}-${o.klass}`}
            >
              {o.label}
            </option>
          ))}
        </select>
        {/* Drag-Handle — als sichtbarer Mini-Button neben dem Select. Drag
            funktioniert nur wenn ein Item aktiv selektiert ist. */}
        {activeOption && !disabled && (
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData(
                PLAN_TOOLBAR_DRAG_MIME,
                JSON.stringify({ kind: comboKind, klass: activeOption.klass }),
              );
              e.dataTransfer.setData(
                "text/plain",
                `${comboKind}:${activeOption.klass}`,
              );
              // Welle G21-F: Custom Drag-Image, das dem Cursor folgt und
              // wie ein Knoten-Pfeil aussieht. Browser-Default-Ghost (kleiner
              // Drag-Handle-Button) gibt User keinen Hinweis WAS er gerade
              // platziert. Element wird nach 0 ms wieder aus dem DOM entfernt.
              const ghost = document.createElement("div");
              ghost.textContent = activeOption.label;
              ghost.setAttribute(
                "style",
                [
                  "position:absolute",
                  "top:-1000px",
                  "left:-1000px",
                  "padding:6px 14px",
                  "background:var(--color-surface-soft-cyan, #ECFEFF)",
                  "border:2px solid var(--color-primary, #0EA5C7)",
                  "border-radius:6px",
                  "font-family:var(--font-sans, sans-serif)",
                  "font-size:11px",
                  "font-weight:600",
                  "color:var(--color-primary-dark, #155E75)",
                  "white-space:nowrap",
                  "box-shadow:0 4px 12px rgba(14,165,199,0.35)",
                  "pointer-events:none",
                  "z-index:9999",
                ].join(";"),
              );
              document.body.appendChild(ghost);
              const rect = ghost.getBoundingClientRect();
              e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
              // Cleanup nach Browser-Ghost-Snapshot
              window.setTimeout(() => {
                ghost.remove();
              }, 0);
            }}
            title={`${activeOption.label} in Canvas ziehen`}
            aria-label="Zum Canvas ziehen"
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded-[var(--radius-sm)] border border-primary/30 bg-[var(--color-surface-soft-cyan)] text-primary hover:bg-[var(--color-primary-light)] active:cursor-grabbing"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <circle cx="5" cy="4" r="1" fill="currentColor" />
              <circle cx="11" cy="4" r="1" fill="currentColor" />
              <circle cx="5" cy="8" r="1" fill="currentColor" />
              <circle cx="11" cy="8" r="1" fill="currentColor" />
              <circle cx="5" cy="12" r="1" fill="currentColor" />
              <circle cx="11" cy="12" r="1" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export const PlanToolbar: React.FC<PlanToolbarProps> = ({
  insertKnotenKlass,
  insertKantenKlass,
  onInsertKnotenKlassChange,
  onInsertKantenKlassChange,
  selectedCount,
  onDelete,
  disabled = false,
  stats,
  showGrid = true,
  onToggleGrid,
}) => {
  return (
    <div
      data-testid="plan-toolbar"
      className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-4 py-2"
    >
      <ClassCombobox
        label="Knoten"
        options={KNOTEN_KLASSEN}
        value={insertKnotenKlass}
        onChange={(klass) => {
          onInsertKnotenKlassChange(klass);
          if (klass) onInsertKantenKlassChange(null);
        }}
        comboKind="knoten"
        disabled={disabled}
        testId="combo-knoten"
      />

      <div className="h-5 w-px bg-border-light" />

      <ClassCombobox
        label="Kanten"
        options={KANTEN_KLASSEN}
        value={insertKantenKlass}
        onChange={(klass) => {
          onInsertKantenKlassChange(klass);
          if (klass) onInsertKnotenKlassChange(null);
        }}
        comboKind="kante"
        disabled={disabled}
        testId="combo-kante"
      />

      <div className="h-5 w-px bg-border-light" />

      {/* Kennzahl-Combobox — disabled, Phase 2 */}
      <div className="flex items-center gap-2" data-testid="kennzahl-combo">
        <label
          htmlFor="combo-kennzahl"
          className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Kennzahl
        </label>
        <select
          id="combo-kennzahl"
          disabled
          className="rounded-[var(--radius-sm)] border border-border bg-muted px-2 py-1 text-xs text-muted-foreground disabled:cursor-not-allowed"
          title="Kennzahl-Annotation am Knoten — Phase 2 (Sim-Visualisierung)"
        >
          <option>Auswahlfenster (Phase 2)</option>
          {KENNZAHL_KLASSEN.map((k) => (
            <option key={k.klass} value={k.klass}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div className="h-5 w-px bg-border-light" />

      {/* Löschen-Button (Style-Guide §6.2 danger-Intent) */}
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled || selectedCount === 0}
        data-testid="btn-delete-selected"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium transition-colors",
          "border-danger/40 bg-danger/5 text-danger hover:bg-danger/10",
          "disabled:cursor-not-allowed disabled:opacity-40",
        )}
        title="Selektierte Knoten/Kanten löschen"
      >
        <span aria-hidden>×</span>
        <span>
          Löschen{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </span>
      </button>

      {/* Welle G18-D: Grid-Anzeige toggeln (1:1 OSim2004 OGGrid::s_Raster,
          Menü-ID ID_GOBJ_TOGGLE_GRID=962). */}
      {onToggleGrid && (
        <>
          <div className="h-5 w-px bg-border-light" />
          <button
            type="button"
            onClick={onToggleGrid}
            data-testid="btn-toggle-grid"
            aria-pressed={showGrid}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-medium transition-colors",
              showGrid
                ? "border-primary bg-[var(--color-surface-soft-cyan)] text-primary-dark"
                : "border-border bg-card text-muted-foreground hover:bg-surface-hover",
            )}
            title={showGrid ? "Raster ausblenden" : "Raster anzeigen"}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path
                d="M0 0h16v16H0z M4 0v16 M8 0v16 M12 0v16 M0 4h16 M0 8h16 M0 12h16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
            <span>Raster</span>
          </button>
        </>
      )}

      {/* INSERT-Mode-Indikator-Banner — direkter visueller Hinweis */}
      {(insertKnotenKlass || insertKantenKlass) && (
        <div
          data-testid="insert-mode-indicator"
          className="ml-2 inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-primary/30 bg-[var(--color-surface-soft-cyan)] px-2 py-1 text-[11px] text-primary-dark"
        >
          <span className="font-medium">
            {insertKnotenKlass &&
              `Einfügen-Modus: ${insertKnotenKlass} (Klick im Canvas legt Knoten an)`}
            {insertKantenKlass &&
              `Einfügen-Modus: ${insertKantenKlass} (Klick im Canvas legt Kante an)`}
          </span>
          <button
            type="button"
            onClick={() => {
              if (insertKnotenKlass) onInsertKnotenKlassChange(null);
              if (insertKantenKlass) onInsertKantenKlassChange(null);
            }}
            className="underline decoration-dotted underline-offset-2 hover:text-primary"
          >
            abbrechen (Esc)
          </button>
        </div>
      )}

      {/* Stats rechts (Style-Guide §4 — Monospace für Zahlen-Anzeige) */}
      {stats && (
        <div className="ml-auto font-mono text-xs text-muted-foreground">
          <strong className="text-foreground">{stats.nodes}</strong> Knoten ·{" "}
          <strong className="text-foreground">{stats.edges}</strong> Kanten
        </div>
      )}
    </div>
  );
};
