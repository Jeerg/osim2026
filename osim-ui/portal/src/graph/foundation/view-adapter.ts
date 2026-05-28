/**
 * View-Adapter — konvertiert ein OGraphGrid in React-Flow `{nodes, edges}`.
 *
 * Welle E der GraphObject-Foundation-Portierung. Das Backend-Rendering
 * (React-Flow / @xyflow/react) wird mit den von OGraphGrid verwalteten
 * Daten gefüttert. Nested-Sub-Grids von GObjSub werden über React-Flow's
 * `parentNode` + `extent='parent'` als visuell verschachtelte Knoten
 * dargestellt.
 *
 * **Datenfluss:**
 * 1. Workspace ruft `ogGridToReactFlow(rootGrid)` beim Modell-Open
 * 2. React-Flow rendert die `{nodes, edges}` mit `<OsimNode>` als CustomNode
 * 3. User-Aktionen (Drag, Connect, Delete) gehen ZUERST in den OGraphGrid-
 *    State (via GOIns/GORemove/MoveGObj) und triggern dann InvalidateView
 * 4. InvalidateView ruft `ogGridToReactFlow` erneut → React-Flow rendert neu
 *
 * Phase-1.1-Reduktion: kein Live-Update über Sub-View-Hierarchie hinaus —
 * Welle F verdrahtet die echten Re-Render-Hooks.
 */

import type { Edge, Node } from "@xyflow/react";

import {
  GObject,
  GObjLink,
  GObjSub,
  GLink,
  GLinkPoint,
  GLinkSquare,
  GObjState,
  GOStateSub,
} from "@osim/graphobject";
import type { OGraphGrid } from "@osim/graphobject";

/**
 * Wählt den React-Flow-Edge-Type passend zur GLink-Subklasse.
 *
 * - `GLinkSquare`: rechtwinkliges Routing mit genau zwei 90°-Knicken
 *   → React-Flow `step`-Edge (scharfe rechte Winkel, OSim-Original-Look)
 * - `GLinkPoint`: Polyline mit bis zu 6 Stützpunkten
 *   → React-Flow `step`-Edge als pragmatische Phase-1.1-Lösung; ein echter
 *     Polyline-Custom-Edge mit Waypoints folgt in Phase 4
 * - Plain `GLink`: einfacher Bezier-ähnlicher Verlauf
 *   → React-Flow `smoothstep` (alter Default, weiterhin sinnvoll)
 *
 * Reihenfolge der instanceof-Checks ist wichtig: GLinkSquare extends
 * GLinkPoint extends GLink. Spezifisch zuerst.
 */
function edgeTypeFor(link: GLink): string {
  if (link instanceof GLinkSquare) return "step";
  if (link instanceof GLinkPoint) return "step";
  return "smoothstep";
}

/**
 * Data-Bag, der mit jedem React-Flow-Node mitgeführt wird. Wird vom
 * OsimNode-Custom-Renderer gelesen.
 */
export interface OsimNodeData {
  /** Stabiler Identifier (für React-Reconciliation). */
  oid: string;
  /** Anzeige-Label (m_string aus GObject). */
  label: string;
  /** Backend-Klassen-Discriminator (für Icon-Wahl). */
  klass: string;
  /** Wire-Klassen-Name (z.B. "PDpKnMengeRuesten", "PDlplKante") — zur
   *  Auswahl des passenden Renderer (Welle G11). */
  wireKlass: string;
  /** Wahre Klasse ist GObjSub? */
  isSub: boolean;
  /** GObjSub-State (nur wenn isSub=true). */
  subState?: "closed" | "open";
  /** Marked-State (Selektion). */
  marked: boolean;
  /** Hintergrundfarbe. */
  backColor: string;
  /** Textfarbe. */
  textColor: string;
  /** Brücke zum echten GObject — Click-Handler nutzt dies, um den Store zu updaten. */
  viewedObjectId: unknown;
  /** React-Flow erwartet einen Record-kompatiblen Index — Pflicht-Index-Signature. */
  [k: string]: unknown;
}

/**
 * Edge-Data für React-Flow.
 */
export interface OsimEdgeData {
  /** Anzeige-Label (optional). */
  label?: string;
  /** Link-Farbe (CSS). */
  color: string;
  /** Source-Direction (für Routing). */
  sourceDirection: string;
  /** Target-Direction. */
  targetDirection: string;
  /** React-Flow erwartet einen Record-kompatiblen Index. */
  [k: string]: unknown;
}

/**
 * Konvertiert einen OGraphGrid (mit allen verschachtelten GObjSub-Sub-Grids)
 * in flache React-Flow-Arrays.
 *
 * Nested-Sub-Grids werden via `parentNode`/`extent='parent'` ausgedrückt —
 * React-Flow rendert sie dann visuell INNERHALB der Parent-Node-Bounding-Box.
 */
export function ogGridToReactFlow(
  rootGrid: OGraphGrid,
): {
  nodes: Node<OsimNodeData>[];
  edges: Edge<OsimEdgeData>[];
} {
  const nodes: Node<OsimNodeData>[] = [];
  const edges: Edge<OsimEdgeData>[] = [];
  const visited = new Set<GObject>();

  // Counter für deterministische Edge-Ids
  let edgeCounter = 0;

  function visitGrid(
    grid: OGraphGrid,
    parentId: string | undefined,
    parentOrigin: { x: number; y: number } | undefined,
  ): void {
    grid.iterate((obj) => {
      if (visited.has(obj)) return;
      visited.add(obj);

      const nodeId = nodeIdFor(obj);
      // Welle G9: bei nested Knoten muss die Position RELATIV zum Parent
      // sein (React-Flow + extent='parent' Konvention). Die Foundation
      // applyPositions() setzt m_GOrg ABSOLUT im Canvas-Koordinatensystem;
      // wir subtrahieren die Parent-Origin für nested Children.
      const px = obj.m_GOrg.x - (parentOrigin?.x ?? 0);
      const py = obj.m_GOrg.y - (parentOrigin?.y ?? 0);

      // Welle G11: Wire-Klass entscheidet Renderer-Variante. PDlplKante
      // (und andere "Kante"-Klassen) sind eigenständige Grid-Knoten im
      // OSim2004-Original, gerendert als kleine Box mit Rechteck-Border.
      const wireKlass = obj.m_wireKlass ?? "";
      const isKantenBox =
        wireKlass.startsWith("PDlplKante") || wireKlass.includes("Kante");

      const node: Node<OsimNodeData> = {
        id: nodeId,
        type: isKantenBox ? "osimEdgeBox" : "osim",
        position: { x: px, y: py },
        data: {
          oid: nodeId,
          label: obj.GetText(),
          klass: obj.constructor.name,
          wireKlass,
          isSub: obj instanceof GObjSub,
          subState:
            obj instanceof GObjSub
              ? obj.GetSubState() === GOStateSub.D_OPEN
                ? "open"
                : "closed"
              : undefined,
          marked: obj.GetState() === GObjState.MARKED,
          backColor: obj.m_BackColor,
          textColor: obj.m_TextColor,
          viewedObjectId: obj.GetViewedObject(),
        },
        // Welle G9: m_GSize kommt seit Welle G7 korrekt aus der Foundation
        // (computeSizes + GObjSub.GetSize). Kein eigener Override mehr.
        style: {
          width: obj.m_GSize.cx,
          height: obj.m_GSize.cy,
        },
      };
      // Nested-Markup für React-Flow
      if (parentId) {
        node.parentId = parentId;
        node.extent = "parent";
      }
      // GObjSub im D_OPEN bekommt 'group'-Style (React-Flow-Konvention).
      if (
        obj instanceof GObjSub &&
        obj.GetSubState() === GOStateSub.D_OPEN
      ) {
        node.type = "osimGroup";
      }
      nodes.push(node);

      // Kanten (nur für GObjLink-Knoten)
      if (obj instanceof GObjLink) {
        for (const linkAny of obj.m_OutList) {
          const link = linkAny as GLink;
          if (!link.m_Next) continue;
          const sourceId = nodeIdFor(obj);
          const targetId = nodeIdFor(link.m_Next);
          const edge: Edge<OsimEdgeData> = {
            id: `e${edgeCounter++}:${sourceId}->${targetId}`,
            source: sourceId,
            target: targetId,
            type: edgeTypeFor(link),
            data: {
              label: link.GetText(),
              color: link.m_crLinkColor,
              sourceDirection: directionToHandleId(link.m_STDGLDirPrev),
              targetDirection: directionToHandleId(link.m_STDGLDirNext),
            },
          };
          edges.push(edge);
        }
      }

      // Rekursion: GObjSub im D_OPEN hat Sub-Collections.
      // Welle G9: parentOrigin = obj.m_GOrg (ABSOLUTE Position) wird an die
      // Sub-Rekursion gereicht — Sub-Knoten bekommen ihre Position relativ
      // dazu (siehe Z.132 px/py-Berechnung).
      if (
        obj instanceof GObjSub &&
        obj.GetSubState() === GOStateSub.D_OPEN
      ) {
        for (const subColl of obj.GetSubCollections()) {
          const subAsGrid = subColl as {
            iterate?: (cb: (obj: GObject) => void) => void;
          } & OGraphGrid;
          if (typeof subAsGrid.iterate === "function") {
            visitGrid(subAsGrid as OGraphGrid, nodeId, {
              x: obj.m_GOrg.x,
              y: obj.m_GOrg.y,
            });
          }
        }
      }
    });
  }

  visitGrid(rootGrid, undefined, undefined);

  return { nodes, edges };
}

/**
 * Deterministischer React-Flow-Node-Id aus einem GObject.
 * Bevorzugt die ViewedObject-ID (= Wire-OID), fällt auf Object-Identity-Hash zurück.
 */
function nodeIdFor(obj: GObject): string {
  const viewed = obj.GetViewedObject();
  if (viewed != null) return `oid:${String(viewed)}`;
  // Fallback: Constructor + Random-Seed (sollte selten genutzt werden)
  const anyObj = obj as unknown as { __nodeId?: string };
  if (!anyObj.__nodeId) {
    anyObj.__nodeId = `obj:${Math.random().toString(36).slice(2, 10)}`;
  }
  return anyObj.__nodeId;
}

/**
 * Mapt eine GLDirection auf einen React-Flow-Handle-Identifier.
 * React-Flow nutzt typischerweise `top/bottom/left/right` als Handle-Ids.
 */
function directionToHandleId(direction: number): string {
  switch (direction) {
    case 1 /* NORTH */:
      return "top";
    case 2 /* SOUTH */:
      return "bottom";
    case 3 /* EAST */:
      return "right";
    case 4 /* WEST */:
      return "left";
    default:
      return "right";
  }
}

/**
 * Inverse: konvertiert React-Flow-Position-Update zurück in OGraphGrid-State.
 * Wird vom Drag-Handler in Welle F genutzt.
 */
export function applyPositionUpdate(
  obj: GObject,
  newPosition: { x: number; y: number },
): void {
  obj.SetPosition(newPosition);
}
