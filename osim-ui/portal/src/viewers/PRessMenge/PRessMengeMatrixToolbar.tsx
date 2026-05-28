/**
 * PRessMengeMatrixToolbar — Combobox-Toolbar fuer den
 * PRessMengeMatrixViewer (Phase 01.3 Welle 4 / Plan 06).
 *
 * 1:1-Pendant zur C++-Toolbar in `PRessMengeMatrixViewer::OViewInit`
 * (Z.1408-1450 in OSim2004/OSimPro/PRessMengeMatrixViewer.cpp):
 *   - m_cbTyp   — Subklassen-Dropdown (Fill(pMeta=PAssozMenge::META, ...)
 *                 iterierte programmatisch über die META-Subklassen).
 *                 Default: SetCurSel(0) → "Erzeuger".
 *   - m_cbMenge — Mengen-Eingabe (im Original CComboBox mit den fixen
 *                 Werten 1/5/10/20/50/100; Default-Text "1").
 *                 Wir verwenden ein <input type="number">, weil die
 *                 freie Eingabe für die UI-Migration angemessener ist
 *                 (keine fixe Dropdown-Liste, identische Semantik).
 *
 * Pattern-Quelle: PRessBelegMatrixToolbar.tsx (Welle 1.2-E Plan 06) —
 * gleiches Combobox-Layout, gleiche shadcn-Token-Disziplin, gleicher
 * Section-Separator. Wo der PRessBelegMatrixToolbar drei Comboboxes
 * (Ansicht/Verknüpfung/Status) hat, hat dieser Toolbar nur zwei
 * (Typ/Menge), entsprechend dem schmaleren C++-Original.
 *
 * 3FLS-EAM-Token-Disziplin: shadcn-Tokens (bg-card, border-border,
 * text-foreground, ring-primary), 4px-Grid, Segoe UI als Body-Font
 * (über font-sans-Default), Brand-Blau-Primary für Focus + Active.
 * KEINE ad-hoc Hex-Strings.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------
// Subklassen-Typ-Konstante (1:1 aus C++ + schemas.json Plan-05-Patch)
// ---------------------------------------------------------------------

/**
 * Subklassen-Typ-Optionen für die Cell-Create-Logik des
 * PRessMengeMatrixViewers.
 *
 * 1:1 aus C++ `PRessMengeMatrixViewer::OViewInit` Z.1430-1438:
 *   Fill(PAssozMenge::META, &m_cbTyp) iteriert über die META-
 *   Subklassen und füllt die Combobox.
 *
 * Hier hart kodiert auf die 4 konkreten PAssozMenge-Subklassen aus
 * `app/static/schemas/v1/schemas.json` (Plan 05) — die abstrakte
 * Basis PAssozMenge wird NICHT angeboten (keine Instanziierung).
 *
 * Das `mengen_attr` pro Eintrag bestimmt, in welches Attribut der
 * Toolbar-Mengen-Wert geschrieben wird (siehe AUDIT.md Sektion 2.7):
 *   - PAssozMengeErzgt          → m_iMengeAus
 *   - PAssozMengeVerbr          → m_iMengeEin
 *   - PAssozMengeVerbrZwischen  → m_iMengeEin (geerbt)
 *   - PAssozMengeAbfr           → m_iMengeAbfr
 */
export const PRESSMENGE_TYPES: Array<{
  value:
    | "PAssozMengeErzgt"
    | "PAssozMengeVerbr"
    | "PAssozMengeVerbrZwischen"
    | "PAssozMengeAbfr";
  label: string;
  mengen_attr: "m_iMengeAus" | "m_iMengeEin" | "m_iMengeAbfr";
}> = [
  { value: "PAssozMengeErzgt", label: "Erzeuger", mengen_attr: "m_iMengeAus" },
  { value: "PAssozMengeVerbr", label: "Verbraucher", mengen_attr: "m_iMengeEin" },
  {
    value: "PAssozMengeVerbrZwischen",
    label: "Zwischen-Verbrauch",
    mengen_attr: "m_iMengeEin",
  },
  { value: "PAssozMengeAbfr", label: "Abfrage", mengen_attr: "m_iMengeAbfr" },
];

export type PRessMengeTypeValue = (typeof PRESSMENGE_TYPES)[number]["value"];

// ---------------------------------------------------------------------
// Innere Combobox-Komponente — 1:1 Pattern aus PRessBelegMatrixToolbar
// ---------------------------------------------------------------------

interface ViewerComboboxProps {
  label: string;
  options: Array<{ value: PRessMengeTypeValue; label: string }>;
  value: PRessMengeTypeValue;
  onChange: (value: PRessMengeTypeValue) => void;
  comboKind: "typ";
  disabled?: boolean;
}

function ViewerCombobox({
  label,
  options,
  value,
  onChange,
  comboKind,
  disabled,
}: ViewerComboboxProps) {
  return (
    <div className="flex items-center gap-2" data-testid={`combo-${comboKind}`}>
      <label
        htmlFor={`combo-${comboKind}`}
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <select
        id={`combo-${comboKind}`}
        value={value}
        onChange={(e) => onChange(e.target.value as PRessMengeTypeValue)}
        disabled={disabled}
        className={cn(
          "rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1 text-xs text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/40",
          disabled && "cursor-not-allowed opacity-50",
        )}
        data-testid={`combo-${comboKind}-select`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------
// Mengen-Input (number-Field; freie Eingabe statt der C++ 1/5/10/20/50/100
// Combobox — semantisch identisch, idiomatisch in der Web-UI)
// ---------------------------------------------------------------------

interface MengeInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function MengeInput({ label, value, onChange, disabled }: MengeInputProps) {
  return (
    <div className="flex items-center gap-2" data-testid="combo-menge">
      <label
        htmlFor="combo-menge-input"
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <input
        id="combo-menge-input"
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const next = Number(raw);
          // Bei Invalid (NaN / leer) bleibt der Wert auf dem alten Stand,
          // der Reset passiert per Re-Render aus der Parent-State.
          if (raw === "" || Number.isNaN(next)) return;
          onChange(next);
        }}
        disabled={disabled}
        className={cn(
          "w-20 rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1 text-xs text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/40",
          disabled && "cursor-not-allowed opacity-50",
        )}
        data-testid="combo-menge-input"
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------

export interface PRessMengeMatrixToolbarProps {
  typ: PRessMengeTypeValue;
  onTypChange: (v: PRessMengeTypeValue) => void;
  menge: number;
  onMengeChange: (v: number) => void;
  disabled?: boolean;
}

export const PRessMengeMatrixToolbar: React.FC<PRessMengeMatrixToolbarProps> = ({
  typ,
  onTypChange,
  menge,
  onMengeChange,
  disabled = false,
}) => {
  return (
    <div
      data-testid="matrix-toolbar"
      className="flex w-full flex-wrap items-center gap-4"
    >
      <ViewerCombobox
        label="Assoziations-Typ"
        options={PRESSMENGE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        value={typ}
        onChange={onTypChange}
        comboKind="typ"
        disabled={disabled}
      />
      <div className="h-5 w-px bg-border-light" />
      <MengeInput
        label="Menge"
        value={menge}
        onChange={onMengeChange}
        disabled={disabled}
      />
    </div>
  );
};
