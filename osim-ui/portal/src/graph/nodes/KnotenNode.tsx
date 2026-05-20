// Plan 01-07 Task 1: KnotenNode — concrete GObject-Subklasse + reactflow-
// Node-Component fuer Bearbeitungs-Knoten (PDpKnKonstant/PDpKnMenge/...).
//
// Datei enthaelt zwei Exports:
//   - class KnotenNode extends GObject — TS-Klasse mit dem OSim-spezifischen
//     Inhalt (name, dauer_s). Wird von PDurchlaufplanViewerDesign aus dem
//     model-store-Tree konstruiert und an GraphView weitergegeben.
//   - const KnotenNodeView (FC) — reactflow-Node-Component, die in
//     GraphView's NODE_TYPES registriert ist. Liest data.gobj und rendert
//     das visuelle Element.
//
// Die Trennung Klasse vs FC ist absichtlich:
//   - Die Klasse erfuellt das Plan-Interface (D-07: GObject-Subklasse).
//   - Die FC ist das, was reactflow als nodeTypes-Eintrag erwartet.
// Phase 3 (Vollportierung) wird die Klasse mit dem 4-Layer-Render-Stack
// (DrawBackground/Draw/DrawForeground/DrawHelpers) befuellen — der FC-
// Adapter bleibt das Bindeglied zu reactflow.

import { memo, type ReactNode } from "react";
import { Handle, Position as RFPosition } from "reactflow";
import type { NodeProps } from "reactflow";
import { GObject, DEFAULT_OBJECT_SIZE } from "@/graph/core/GObject";
import type { Position, Size } from "@/graph/core/types";
import type { GObjectNodeData } from "./types";

// ---------------------------------------------------------------------------
// TS-Klasse — Foundation-Vertrag.
// ---------------------------------------------------------------------------

export class KnotenNode extends GObject {
  constructor(
    id: string,
    position: Position,
    klass: string,
    public name: string,
    public dauer_s: number,
    size: Size = { ...DEFAULT_OBJECT_SIZE },
  ) {
    super(id, klass, position, size);
  }

  /**
   * Phase-1-Foundation-Stub: KnotenNode.render() liefert null, weil das
   * reactflow-Node-Rendering ueber KnotenNodeView (unten) laeuft.
   * Phase 3 wird hier den 4-Layer-Render-Stack befuellen.
   */
  render(): ReactNode {
    return null;
  }
}

export interface KnotenNodeData extends GObjectNodeData {
  gobj: KnotenNode;
}

// ---------------------------------------------------------------------------
// FC fuer reactflow (NODE_TYPES-Eintrag).
// ---------------------------------------------------------------------------

/**
 * Visuelle Darstellung eines Bearbeitungs-Knotens.
 *
 * Layout: gerundete Box mit Name (fett) + Klassen-Kuerzel + Dauer.
 * Handles: Target links, Source rechts — User kann Kanten in beide
 * Richtungen ziehen.
 *
 * Phase 1 zeigt KEINE Status-Farbe (alle Knoten gleich blau-grau). Phase 3
 * faerbt nach Live-Animation (vgl. GraphObj.h DrawRed).
 */
function KnotenNodeViewImpl({ data, selected }: NodeProps<KnotenNodeData>) {
  const { gobj } = data;
  const klassShort = gobj.klass.replace(/^PDpKn/, "");
  const isUnknown = !gobj.klass.startsWith("PDpKn");

  return (
    <div
      data-testid={`knoten-node-${gobj.id}`}
      data-klass={gobj.klass}
      className={[
        "rounded-md border-2 bg-white shadow-sm",
        "px-3 py-2 text-xs",
        selected ? "border-blue-500" : "border-gray-400",
        isUnknown ? "border-dashed text-amber-700" : "text-gray-800",
      ].join(" ")}
      style={{
        minWidth: gobj.size.width,
        minHeight: gobj.size.height,
      }}
    >
      <Handle
        type="target"
        position={RFPosition.Left}
        style={{ background: "#888" }}
      />
      <div className="font-semibold leading-tight">{gobj.name}</div>
      <div className="text-[10px] text-gray-500">
        <span>{klassShort}</span>
        {Number.isFinite(gobj.dauer_s) && gobj.dauer_s > 0 && (
          <>
            {" · "}
            <span data-testid={`knoten-node-dauer-${gobj.id}`}>
              {gobj.dauer_s} s
            </span>
          </>
        )}
      </div>
      <Handle
        type="source"
        position={RFPosition.Right}
        style={{ background: "#888" }}
      />
    </div>
  );
}

export const KnotenNodeView = memo(KnotenNodeViewImpl);
KnotenNodeView.displayName = "KnotenNodeView";
