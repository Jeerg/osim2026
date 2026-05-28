/**
 * KennzahlSlotPlaceholder — visueller Phase-4-Vorgriff.
 *
 * **Welle 1.2-G (Phase 01.2):** Im C++-Original
 * (`PRessVerknuepfungViewer` + `PGObjViewerCtrl::DrawKennzahl`) wird
 * während eines Sim-Laufs eine Live-Kennzahl pro Ressource angezeigt
 * (m_drawKennzahl + m_iKnz + m_dScaleKnz + m_dMax, siehe
 * 01.2-08-CPP-AUDIT.md §3). Phase 1.2 baut nur den **visuellen
 * Placeholder** dafür — die Backend-Verdrahtung (WebSocket
 * `/ws/runs/{run_id}` mit Event `gfx_tick{t_current}`) folgt in
 * Phase 4 (Sim-Live-Visualisierung).
 *
 * **Design-Tokens (3FLS-EAM Style Guide §6, tokens.css):**
 *  - Background: `bg-[var(--color-surface-soft-cyan)]` (Cyan-Soft-Surface)
 *  - Border: `border-primary/30` (Cyan-Primary 30 % alpha)
 *  - Text: `text-primary-dark` (Cyan-Dark)
 *  - Opacity: `opacity-60` macht den Disabled-Status visuell erkennbar
 *  - KEINE Hex-Strings — ESLint-Guardrail durchsetzbar.
 *
 * **Accessibility:**
 *  - `data-slot="kennzahl-placeholder"` für E2E + Spec-Selektoren.
 *  - `aria-label` beschreibt explizit "Kennzahl-Anzeige (Phase 4 …
 *    derzeit deaktiviert)" — Screen-Reader-Disambiguation gegen aktive
 *    Kennzahlen.
 *  - `title`-Attribut dupliziert die Phase-4-Information als Tooltip.
 *
 * **Positionierung:** Standardmäßig `absolute right-2 top-2` —
 * funktioniert nur in einem `relative`-Parent. Der Konsument
 * `PRessVerknuepfungViewer` hängt das Element innerhalb des
 * Graph-Pane-Containers (`relative flex-1`) ein.
 */

import * as React from "react";

export function KennzahlSlotPlaceholder(): React.ReactElement {
  return (
    <div
      data-slot="kennzahl-placeholder"
      title="Live-Kennzahl-Anzeige — Phase 4 (Sim-Visualisierung) wird hier aktiviert"
      aria-label="Kennzahl-Anzeige (Phase 4 — derzeit deaktiviert)"
      className="absolute right-2 top-2 rounded-[var(--radius-sm)] border border-primary/30 bg-[var(--color-surface-soft-cyan)] px-3 py-2 text-xs text-primary-dark opacity-60"
    >
      <span className="font-medium">Kennzahl</span>
      <span className="ml-2 text-[10px] uppercase tracking-wider">Phase 4</span>
    </div>
  );
}
