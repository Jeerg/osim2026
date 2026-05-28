/**
 * OsimNode — React-Flow-Custom-Node, der ein GObject rendert.
 *
 * Welle E der GraphObject-Foundation. Nutzt die `data: OsimNodeData` aus
 * `view-adapter.ts`. Zwei Varianten:
 *
 * 1. `OsimNode` — Standard-Knoten (Rectangle mit Label + Klassen-Icon)
 * 2. `OsimGroupNode` — D_OPEN-GObjSub-Knoten (Group-Container mit
 *    Header + dann verschachtelte React-Flow-Kinder via `parentNode`)
 *
 * Memoized via `React.memo`, weil React-Flow alle sichtbaren Nodes bei
 * jedem viewport-Change neu rendert — ohne memo wäre das ein
 * Performance-Problem bei den 30k Knoten von Bosch.
 */

import * as React from "react";
import { Handle, Position } from "@xyflow/react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OsimNodeData } from "@/graph/foundation/view-adapter";

interface OsimNodeProps {
  data: OsimNodeData;
  selected?: boolean;
  /**
   * React-Flow setzt diese Prop auf `true`, solange der Knoten aktiv gezogen
   * wird. Wir nutzen sie für den **Drag-Ghost** (1:1-Idee zum OSim2004-
   * Phantom): der gezogene Knoten wird angehoben (Shadow), halb-transparent
   * und bekommt eine gestrichelte Blau-Kontur — deutlich sichtbar, unabhängig
   * von der `.react-flow__node.dragging`-CSS-Klasse (die nicht zuverlässig
   * griff). Drag funktioniert nur im Edit-Mode (nodesDraggable={!readOnly}).
   */
  dragging?: boolean;
}

/** Brand-Blau für Selektion + Drag-Ghost-Kontur (Style-Guide §1.1). */
const BRAND_PRIMARY = "#1E4F9C";

/**
 * Standard-Knoten (nicht-GObjSub oder GObjSub im D_CLOSED).
 *
 * **Welle G7:** Knoten haben Pfeil-Spitze-Form (1:1 aus OGObjODlp.cpp Z.123-132,
 * 5-Point-Polygon). Realisiert als SVG-Background mit
 * `vectorEffect="non-scaling-stroke"`, damit die Border bei beliebiger
 * Knoten-Skalierung konstante Strichbreite behält. Handles sitzen als
 * sichtbare Overlay-Elemente außerhalb des SVG-Clipping (sonst werden sie
 * abgeschnitten).
 */
const OsimNodeImpl: React.FC<OsimNodeProps> = ({ data, selected, dragging }) => {
  const isSubClosed = data.isSub && data.subState === "closed";
  // SVG-Polygon: Top-Left → Top-Right-Body → Right-Peak → Bottom-Right-Body
  // → Bottom-Left. STD_PEAK_WIDTH ist im Original 20 Pixel; mit
  // preserveAspectRatio="none" mappen wir das auf 90% der Breite.
  const polygonPoints = "0,0 90,0 100,50 90,100 0,100";
  const strokeColor = dragging || selected ? BRAND_PRIMARY : "#0f172a";
  return (
    <div
      data-testid="osim-node"
      data-oid={data.oid}
      data-marked={data.marked ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      className={cn(
        "nodrag-cursor relative h-full w-full",
        !dragging && data.marked && "drop-shadow-[0_0_4px_rgba(59,130,246,0.6)]",
      )}
      style={{
        color: data.textColor,
        cursor: dragging ? "grabbing" : "grab",
        willChange: "transform",
        // Drag-Ghost: angehoben + halb-transparent. Sehr sichtbar.
        opacity: dragging ? 0.82 : 1,
        filter: dragging
          ? "drop-shadow(0 14px 26px rgba(30, 79, 156, 0.55))"
          : undefined,
        transition: "opacity 90ms ease, filter 90ms ease",
      }}
    >
      {/* Pfeil-Spitze-Background — 1:1 aus OGObjODlp.cpp Draw().
          WICHTIG (Welle G9): pointer-events=none, sonst absorbiert das SVG
          alle Mausevents → React-Flow sieht weder Drag-Start noch Handle-
          Clicks (= keine Edges entstehen). z-Index unter Content + Handles. */}
      <svg
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        aria-hidden="true"
        style={{ pointerEvents: "none", zIndex: 0 }}
      >
        <polygon
          points={polygonPoints}
          fill={data.backColor}
          stroke={strokeColor}
          strokeWidth={dragging ? 3 : selected ? 2 : 1.5}
          strokeDasharray={dragging ? "6 3" : undefined}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* React-Flow-Handles (z-Index 10, über SVG + Content) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-2 !w-2 !bg-brand-500"
        style={{ zIndex: 10 }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2 !w-2 !bg-brand-500"
        style={{ zIndex: 10 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2 !w-2 !bg-brand-500"
        style={{ right: 0, zIndex: 10 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2 !w-2 !bg-brand-500"
        style={{ zIndex: 10 }}
      />

      {/* Content-Overlay — 10% Reserve rechts für die Pfeil-Spitze */}
      <div
        className="relative flex h-full w-full items-center gap-2"
        style={{
          paddingLeft: 12,
          paddingRight: "12%",
          paddingTop: 8,
          paddingBottom: 8,
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        {isSubClosed && (
          <ChevronRightIcon
            className="h-4 w-4 shrink-0 text-surface-500"
            aria-hidden="true"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-sm font-medium">{data.label}</div>
          <div className="text-[10px] uppercase tracking-wider opacity-70">
            {data.klass}
          </div>
        </div>
      </div>
    </div>
  );
};

export const OsimNode = React.memo(OsimNodeImpl);

/**
 * Group-Knoten (GObjSub im D_OPEN). Header oben, Inhalt unten via
 * React-Flow's parentNode/extent — die Sub-Children sind eigene React-Flow-
 * Nodes mit `parentId === group.id`.
 */
const OsimGroupNodeImpl: React.FC<OsimNodeProps> = ({ data, selected, dragging }) => {
  return (
    <div
      data-testid="osim-group-node"
      data-oid={data.oid}
      data-state="open"
      data-dragging={dragging ? "true" : undefined}
      className={cn(
        "relative h-full w-full rounded-lg border-2 bg-surface-50/50 transition-colors",
        dragging
          ? "border-dashed border-primary"
          : selected
            ? "border-brand-500"
            : "border-brand-200",
      )}
      style={
        dragging
          ? {
              opacity: 0.82,
              filter: "drop-shadow(0 14px 26px rgba(30, 79, 156, 0.55))",
              cursor: "grabbing",
            }
          : undefined
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-2 !w-2 !bg-brand-500"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2 !w-2 !bg-brand-500"
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-brand-200 bg-card px-3 py-2">
        <ChevronDownIcon
          className="h-4 w-4 shrink-0 text-brand-500"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="truncate text-sm font-medium text-surface-900">
            {data.label}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-surface-500">
            {data.klass}
          </div>
        </div>
      </div>

      {/* Inhalt — React-Flow rendert hier die Sub-Knoten via parentNode-Hierarchie */}

      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2 !w-2 !bg-brand-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2 !w-2 !bg-brand-500"
      />
    </div>
  );
};

export const OsimGroupNode = React.memo(OsimGroupNodeImpl);

/**
 * OsimEdgeBox (Welle G11) — Kanten als eigenständige Grid-Knoten rendern.
 *
 * Im OSim2004-Original ist PDlplKante ein **echtes Grid-Objekt** mit eigener
 * m_pntRaster-Position (zwischen den Knoten in den Lücken-Spalten). Es wird
 * als kleines weißes Rechteck mit schwarzem Rand gezeichnet (siehe Bild
 * dlp16.jpg: zwischen Knoten 21 ↔ 22 ist ein kleines Kästchen).
 *
 * React-Flow-Edges sind die VERBINDUNGSLINIEN von Knoten zu dieser Box; die
 * Box selbst ist ein eigenständiger Knoten.
 */
const OsimEdgeBoxImpl: React.FC<OsimNodeProps> = ({ data, selected, dragging }) => {
  return (
    <div
      data-testid="osim-edge-box"
      data-oid={data.oid}
      data-dragging={dragging ? "true" : undefined}
      className={cn(
        "relative h-full w-full border bg-white",
        dragging
          ? "border-2 border-dashed border-primary"
          : selected
            ? "border-brand-500 border-2"
            : "border-surface-900",
        !dragging && data.marked && "ring-1 ring-brand-300",
      )}
      style={{
        cursor: dragging ? "grabbing" : "grab",
        willChange: "transform",
        opacity: dragging ? 0.82 : 1,
        filter: dragging
          ? "drop-shadow(0 14px 26px rgba(30, 79, 156, 0.55))"
          : undefined,
        transition: "opacity 90ms ease, filter 90ms ease",
      }}
    >
      {/* Handles bündig an allen Seiten — die Linien gehen vom Knoten zur
          Box-Mitte. zIndex 10 wie bei OsimNode. */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-1.5 !w-1.5 !bg-surface-700"
        style={{ zIndex: 10 }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-1.5 !w-1.5 !bg-surface-700"
        style={{ zIndex: 10 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-1.5 !w-1.5 !bg-surface-700"
        style={{ zIndex: 10 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-1.5 !w-1.5 !bg-surface-700"
        style={{ zIndex: 10 }}
      />
      {/* Optional: Kanten-Label (m_sName) zentriert — falls vorhanden. */}
      {data.label && (
        <div
          className="absolute inset-0 flex items-center justify-center text-[9px] text-surface-700"
          style={{ pointerEvents: "none" }}
        >
          {data.label}
        </div>
      )}
    </div>
  );
};

export const OsimEdgeBox = React.memo(OsimEdgeBoxImpl);

/**
 * React-Flow-NodeTypes-Map. Beim Mount der React-Flow-Komponente:
 *
 *   import { osimNodeTypes } from "@/graph/foundation/OsimNode";
 *   <ReactFlow nodeTypes={osimNodeTypes} ... />
 *
 * **Pitfall #5** aus Plan-1-10-SUMMARY: nodeTypes MUSS außerhalb der
 * Component definiert werden, sonst rendert React-Flow bei jedem Render
 * alle Nodes neu (= Performance-Tod bei Bosch-Größe).
 */
export const osimNodeTypes = {
  osim: OsimNode,
  osimGroup: OsimGroupNode,
  osimEdgeBox: OsimEdgeBox,
};
