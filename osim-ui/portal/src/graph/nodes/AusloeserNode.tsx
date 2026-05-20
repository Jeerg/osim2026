// Plan 01-07 Task 1: AusloeserNode — concrete GObject + reactflow-Node-FC
// fuer Ausloeser (PAslEinzel/EPAslEntAufExtern/ACOAnt).
//
// Visuell unterscheidbar von KnotenNode durch andere Form (Diamant) und
// gelben Hintergrund. Verbinden via Handle wie KnotenNode.

import { memo, type ReactNode } from "react";
import { Handle, Position as RFPosition } from "reactflow";
import type { NodeProps } from "reactflow";
import { GObject, DEFAULT_OBJECT_SIZE } from "@/graph/core/GObject";
import type { Position, Size } from "@/graph/core/types";
import type { GObjectNodeData } from "./types";

// ---------------------------------------------------------------------------
// TS-Klasse — Foundation-Vertrag.
// ---------------------------------------------------------------------------

export class AusloeserNode extends GObject {
  constructor(
    id: string,
    position: Position,
    klass: string,
    public name: string,
    public beginTermin: number,
    size: Size = { ...DEFAULT_OBJECT_SIZE },
  ) {
    super(id, klass, position, size);
  }

  render(): ReactNode {
    return null;
  }
}

export interface AusloeserNodeData extends GObjectNodeData {
  gobj: AusloeserNode;
}

// ---------------------------------------------------------------------------
// FC fuer reactflow (NODE_TYPES-Eintrag).
// ---------------------------------------------------------------------------

/**
 * Visuelle Darstellung eines Ausloesers.
 *
 * Layout: rotated square (Diamant-Form) mit Name und Begin-Termin.
 * Gelber Hintergrund signalisiert "trigger / event source".
 *
 * Phase 1: keine Status-Farbe. Phase 3 koennte Live-Indicator (Auftrag
 * gerade aktiv) hier einblenden.
 */
function AusloeserNodeViewImpl({
  data,
  selected,
}: NodeProps<AusloeserNodeData>) {
  const { gobj } = data;

  return (
    <div
      data-testid={`ausloeser-node-${gobj.id}`}
      data-klass={gobj.klass}
      className={[
        "rounded border-2 bg-amber-100 shadow-sm",
        "px-3 py-2 text-xs",
        selected ? "border-amber-700" : "border-amber-500",
      ].join(" ")}
      style={{
        minWidth: gobj.size.width,
        minHeight: gobj.size.height,
        // Phase-1-Hinweis: echte Diamant-Form via transform: rotate(45deg)
        // bricht die Handles. Wir bleiben bei abgerundeter Box + farblicher
        // Differenzierung — visuell genauso eindeutig wie Diamant.
      }}
    >
      <Handle
        type="target"
        position={RFPosition.Left}
        style={{ background: "#a16207" }}
      />
      <div className="font-semibold leading-tight text-amber-900">
        {gobj.name}
      </div>
      <div className="text-[10px] text-amber-700">
        <span>Ausloeser</span>
        {Number.isFinite(gobj.beginTermin) && gobj.beginTermin > 0 && (
          <>
            {" · "}
            <span data-testid={`ausloeser-node-begin-${gobj.id}`}>
              @{gobj.beginTermin}s
            </span>
          </>
        )}
      </div>
      <Handle
        type="source"
        position={RFPosition.Right}
        style={{ background: "#a16207" }}
      />
    </div>
  );
}

export const AusloeserNodeView = memo(AusloeserNodeViewImpl);
AusloeserNodeView.displayName = "AusloeserNodeView";
