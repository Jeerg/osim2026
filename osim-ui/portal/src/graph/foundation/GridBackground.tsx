/**
 * GridBackground — visualisiert das Spalten-/Zeilen-Raster eines OGraphGrid.
 *
 * **Welle G21 (Render 1:1 zum OSim2004-Original):**
 *
 * Im C++-Original (`OGGrid.cpp:1037-1183 _DrawGrid`) wird pro Zelle ein
 * 3D-Win32-Effekt gezeichnet:
 *
 * - **oben + links** mit `m_PenShad` (COLOR_3DSHADOW, dunkler)
 * - **unten + rechts** mit `m_PenHeight` (COLOR_3DHILIGHT, heller)
 * - Plus ein umfassender Grenzrahmen mit `m_PenHeight`.
 *
 * Wir mappen das auf 3FLS-EAM-Style-Tokens:
 * - Shadow-Linie: `--color-border` (#D1D5DB, neutralgrau)
 * - Highlight-Linie: `--color-brand-100` (#E0F7FA, helles Cyan)
 * - Border-Rahmen: `--color-brand-200` (#A5F3FC)
 *
 * Render-Strategie: ViewportPortal projiziert das SVG in den Graph-
 * Koordinatenraum von React-Flow — Lines skalieren/translaten beim Zoomen
 * und Pannen automatisch mit.
 *
 * Welle G3 (Initial-Bau): erste, einfachere Version mit gestrichelten End-
 * Linien — wurde mit G21 durch 3D-Effekt ersetzt.
 */

import * as React from "react";
import { ViewportPortal } from "@xyflow/react";

import type { OGraphGrid } from "@osim/graphobject";

export interface GridBackgroundProps {
  /** Der OGraphGrid, dessen Spalten/Zeilen visualisiert werden. */
  grid: OGraphGrid;
  /** Schatten-Farbe (oben/links pro Zelle). Default: token `--color-border`. */
  shadowStroke?: string;
  /** Highlight-Farbe (unten/rechts pro Zelle). Default: token `--color-brand-100`. */
  highlightStroke?: string;
  /** Rahmen-Farbe (um das gesamte Grid). Default: token `--color-brand-200`. */
  borderStroke?: string;
  /** Linienstärke in Pixel (Graph-Space). Default: 1. */
  strokeWidth?: number;
}

export const GridBackground: React.FC<GridBackgroundProps> = ({
  grid,
  shadowStroke = "var(--color-border, #D1D5DB)",
  highlightStroke = "var(--color-brand-100, #E0F7FA)",
  borderStroke = "var(--color-brand-200, #A5F3FC)",
  strokeWidth = 1,
}) => {
  if (grid.m_GColList.length === 0 || grid.m_GRowList.length === 0) {
    return null;
  }

  const rect = grid.GetGridRect();
  // Etwas Pufferraum, damit Linien nicht exakt am letzten Knoten enden
  const pad = grid.m_iStdLinkPlace;
  const left = rect.left - pad;
  const top = rect.top - pad;
  const right = rect.right + pad;
  const bottom = rect.bottom + pad;
  const width = right - left;
  const height = bottom - top;

  return (
    <ViewportPortal>
      <svg
        data-testid="grid-background"
        style={{
          position: "absolute",
          left,
          top,
          pointerEvents: "none",
          overflow: "visible",
        }}
        width={width}
        height={height}
      >
        {/* Vertikale Shadow-Linien: linker Rand jeder Spalte
            (1:1 OSim2004 _DrawGrid Z.1085 m_PenShad LineTo top→bottom). */}
        {grid.m_GColList.map((col) => (
          <line
            key={`col-shadow-${col.m_GColPos}`}
            x1={col.m_StartPos - left}
            y1={0}
            x2={col.m_StartPos - left}
            y2={height}
            stroke={shadowStroke}
            strokeWidth={strokeWidth}
          />
        ))}
        {/* Vertikale Highlight-Linien: rechter Rand jeder Spalte
            (1:1 OSim2004 _DrawGrid Z.1100 m_PenHeight LineTo bottom→top). */}
        {grid.m_GColList.map((col) => (
          <line
            key={`col-highlight-${col.m_GColPos}`}
            x1={col.m_EndPos - left}
            y1={0}
            x2={col.m_EndPos - left}
            y2={height}
            stroke={highlightStroke}
            strokeWidth={strokeWidth}
          />
        ))}
        {/* Horizontale Shadow-Linien: oberer Rand jeder Zeile. */}
        {grid.m_GRowList.map((row) => (
          <line
            key={`row-shadow-${row.m_GRowPos}`}
            x1={0}
            y1={row.m_StartPos - top}
            x2={width}
            y2={row.m_StartPos - top}
            stroke={shadowStroke}
            strokeWidth={strokeWidth}
          />
        ))}
        {/* Horizontale Highlight-Linien: unterer Rand jeder Zeile. */}
        {grid.m_GRowList.map((row) => (
          <line
            key={`row-highlight-${row.m_GRowPos}`}
            x1={0}
            y1={row.m_EndPos - top}
            x2={width}
            y2={row.m_EndPos - top}
            stroke={highlightStroke}
            strokeWidth={strokeWidth}
          />
        ))}
        {/* Grenzrahmen um das gesamte Grid (1:1 OSim2004 _DrawGrid Z.1175
            m_PenHeight, 4× LineTo). */}
        <rect
          x={rect.left - left}
          y={rect.top - top}
          width={rect.right - rect.left}
          height={rect.bottom - rect.top}
          fill="none"
          stroke={borderStroke}
          strokeWidth={strokeWidth + 0.5}
        />
      </svg>
    </ViewportPortal>
  );
};
