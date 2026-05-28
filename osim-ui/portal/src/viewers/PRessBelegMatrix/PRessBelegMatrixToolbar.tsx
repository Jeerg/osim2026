/**
 * PRessBelegMatrixToolbar — Combobox-Toolbar fuer den
 * PRessBelegMatrixViewer (Welle 1.2-E / Plan 06).
 *
 * 1:1-Pendant zur C++-Toolbar in `PRessBelegMatrixViewer::OViewInit`
 * (Z.1803-1838): drei Comboboxes nebeneinander —
 *   - Ansicht (m_cbView): Alles / Personen / Betriebsmittel
 *   - Verknüpfung (m_cbVerknuepfung): "ja"/PRBM_AND / "wenn notwendig"/PRBM_OR
 *   - Status (m_cbVerkStatus): bevorzugt / standard / notfalls / geblockt
 *
 * Pattern-Quelle: `PDurchlaufplan/PlanToolbar.tsx` (Welle G17-A
 * Combobox-Pattern). Strikt 3FLS-EAM-konform: shadcn-Tokens
 * (bg-card, border-border, text-foreground, ring-primary), 4px-Grid,
 * Geist Variable als Body-Font (über font-sans-Default), Cyan-Primary
 * fuer Focus + Active. KEINE Hex-Strings.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------
// Combobox-Konstanten (1:1 aus 01.2-PATTERNS.md §7 + C++ Z.1809-1835)
// ---------------------------------------------------------------------

/** View-Filter — bestimmt welche Klassen als Zeilen erscheinen. */
export const VIEW_MODI: Array<{ value: "ALL" | "PERS" | "RESS"; label: string }> = [
  { value: "ALL", label: "Alles" },
  { value: "PERS", label: "Nur Personen" },
  { value: "RESS", label: "Nur Betriebsmittel" },
];

/**
 * PAssozBeleg.m_eStatus (1:1 aus C++ `PRessBelegMatrixGObj::DrawSymbol`
 * Z.81-92): Default = STD (Z.1838 `m_cbVerkStatus.SetCurSel(1)`).
 */
export const VERK_STATUS: Array<{ value: number; label: string }> = [
  { value: 0, label: "bevorzugt" },
  { value: 1, label: "standard" },
  { value: 2, label: "notfalls" },
  { value: 3, label: "geblockt" },
];

/**
 * Verknüpfungs-Modus — entscheidet, ob Cell-Create einen neuen
 * PAssozBeleg-Wrapper anlegt (AND, C++ default) oder einen passenden
 * existierenden sucht (OR, "wenn notwendig"). In Phase 1.2 ist AND der
 * Default — Phase 4 / E2E-Tests können OR-Path ergaenzen.
 */
export const VERK_MODI: Array<{ value: "AND" | "OR"; label: string }> = [
  { value: "AND", label: "ja (neuer Wrapper)" },
  { value: "OR", label: "wenn notwendig (Best-Match)" },
];

// ---------------------------------------------------------------------
// Innere Combobox-Komponente — 1:1 Pattern aus PlanToolbar.ClassCombobox
// ---------------------------------------------------------------------

interface ViewerComboboxProps<TValue extends string | number> {
  label: string;
  options: Array<{ value: TValue; label: string }>;
  value: TValue;
  onChange: (value: TValue) => void;
  comboKind: "view" | "verk" | "status";
  disabled?: boolean;
}

function ViewerCombobox<TValue extends string | number>({
  label,
  options,
  value,
  onChange,
  comboKind,
  disabled,
}: ViewerComboboxProps<TValue>) {
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
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          // Numerische Optionen (Status) zurueck zu Number casten,
          // sonst string-Werte direkt durchreichen.
          const sample = options[0]?.value;
          const next =
            typeof sample === "number" ? (Number(raw) as TValue) : (raw as TValue);
          onChange(next);
        }}
        disabled={disabled}
        className={cn(
          "rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1 text-xs text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/40",
          disabled && "cursor-not-allowed opacity-50",
        )}
        data-testid={`combo-${comboKind}-select`}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------

export interface PRessBelegMatrixToolbarProps {
  viewMode: "ALL" | "PERS" | "RESS";
  onViewModeChange: (mode: "ALL" | "PERS" | "RESS") => void;
  verkMode: "AND" | "OR";
  onVerkModeChange: (mode: "AND" | "OR") => void;
  defaultStatus: number;
  onDefaultStatusChange: (status: number) => void;
  disabled?: boolean;
}

export const PRessBelegMatrixToolbar: React.FC<PRessBelegMatrixToolbarProps> = ({
  viewMode,
  onViewModeChange,
  verkMode,
  onVerkModeChange,
  defaultStatus,
  onDefaultStatusChange,
  disabled = false,
}) => {
  return (
    <div
      data-testid="matrix-toolbar"
      className="flex w-full flex-wrap items-center gap-4"
    >
      <ViewerCombobox<"ALL" | "PERS" | "RESS">
        label="Ansicht"
        options={VIEW_MODI}
        value={viewMode}
        onChange={onViewModeChange}
        comboKind="view"
        disabled={disabled}
      />
      <div className="h-5 w-px bg-border-light" />
      <ViewerCombobox<"AND" | "OR">
        label="Verknüpfung"
        options={VERK_MODI}
        value={verkMode}
        onChange={onVerkModeChange}
        comboKind="verk"
        disabled={disabled}
      />
      <div className="h-5 w-px bg-border-light" />
      <ViewerCombobox<number>
        label="Status"
        options={VERK_STATUS}
        value={defaultStatus}
        onChange={onDefaultStatusChange}
        comboKind="status"
        disabled={disabled}
      />
    </div>
  );
};
