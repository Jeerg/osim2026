/**
 * interactions — React-Flow-Event-Handler-Adapter für die GraphObject-Foundation.
 *
 * Welle F. Schmale Mapping-Schicht zwischen React-Flow-Events
 * (onNodeDragStop, onConnect, onNodesDelete) und der OGraphGrid-API
 * (MoveGObj, GORemove, GLink-Konstruktor).
 *
 * Volle Phantom-Preview + MarkField + OGBlock-Selection-Rectangle kommt in
 * einer Folge-Welle (braucht Lesen von OGfxCtrl.cpp + OGBlock.cpp). Hier
 * reicht der Kernpfad: Drag persistiert Position, Connect erzeugt GLink,
 * Delete entfernt aus dem Grid.
 */

import type { Connection, Edge, Node } from "@xyflow/react";

import { GObject } from "@/graph/foundation/GObject";
import { GObjLink } from "@/graph/foundation/GObjLink";
import { GObjSub } from "@/graph/foundation/GObjSub";
import { GLink } from "@/graph/foundation/GLink";
import { GOStateSub } from "@/graph/foundation/types";
import type { OGraphGrid } from "@/graph/foundation/OGraphGrid";
import type {
  OsimEdgeData,
  OsimNodeData,
} from "@/graph/foundation/view-adapter";

/**
 * Lookup: GObject finden anhand der Node-Id (= "oid:<ViewedObject>"-Konvention
 * aus view-adapter.nodeIdFor).
 */
export function findObjectByNodeId(
  rootGrid: OGraphGrid,
  nodeId: string,
): GObject | null {
  const expected = nodeId.startsWith("oid:")
    ? nodeId.slice(4)
    : nodeId;
  let found: GObject | null = null;
  const visit = (grid: OGraphGrid): void => {
    grid.iterate((obj) => {
      if (found) return;
      if (String(obj.GetViewedObject()) === expected) {
        found = obj;
        return;
      }
      // Rekursion durch D_OPEN-Sub-Grids
      if (obj instanceof GObjSub && obj.GetSubState() === GOStateSub.D_OPEN) {
        for (const subColl of obj.GetSubCollections()) {
          const subGrid = subColl as OGraphGrid;
          if (typeof subGrid.iterate === "function") visit(subGrid);
        }
      }
    });
  };
  visit(rootGrid);
  return found;
}

/**
 * React-Flow-Drag-Stop-Handler: bewegt den Knoten in die Grid-Zelle, die zur
 * neuen Pixel-Position passt — **inklusive Grid-Topologie-Update via
 * GORemove+GOIns**, exakt wie im C++-Original (OGGrid.cpp `OnDropped`-Pfad).
 *
 * Welle G8 (Fix): die Vorgänger-Implementierung rief nur `SetPosition(pixel)`,
 * was lediglich `m_GOrg` änderte aber NICHT die Grid-Zelle, in der der Knoten
 * gelistet ist. Beim nächsten finalizeLayout() wurde die alte Zelle ausgelesen
 * und der Knoten sprang zurück.
 *
 * Returns: das neue (col, row) Tupel, oder null wenn der Knoten nicht
 * verschoben wurde (z.B. weil die Ziel-Zelle belegt ist).
 */
export function onNodeDragStop(
  rootGrid: OGraphGrid,
  _event: unknown,
  node: Node<OsimNodeData>,
): { col: number; row: number } | null {
  const obj = findObjectByNodeId(rootGrid, node.id);
  if (!obj) return null;

  // 1. Aus welcher Collection kommt der Knoten? (= das umgebende Grid)
  //    Bei Top-Level direkt rootGrid; bei Sub-Plan-Knoten das Sub-Grid des GObjSub.
  const owningGrid = obj.m_OGCollection as OGraphGrid | null;
  if (!owningGrid || typeof owningGrid.GORemoveObj !== "function") return null;

  // 2. React-Flow gibt die Position absolut im Canvas-Koordinatensystem
  //    (bei parentNode-Children: relativ zum Parent). Wir nutzen die Position
  //    direkt — bei nested Knoten subtrahieren wir den Sub-Grid-Origin nicht,
  //    weil react-arborist/react-flow das `extent: 'parent'`-Mapping schon
  //    übernimmt. GetGridAtPoint arbeitet immer relativ zum Grid-Origin.
  const targetPixel = {
    x: node.position.x,
    y: node.position.y,
  };
  // GetGridAtPoint inGrid=false → liefert (-1,-1) wenn außerhalb, statt null.
  const target = owningGrid.GetGridAtPoint(targetPixel, false);
  if (!target || target.x < 0 || target.y < 0) return null;

  // 3. Aktuelle Position
  const current = { x: 0, y: 0 };
  obj.GetGridPos(current);
  if (current.x === target.x && current.y === target.y) {
    // Keine Bewegung — fitView nach Drag kann Pixel-Drift erzeugen, ist OK.
    return { col: current.x, row: current.y };
  }

  // 4. Ziel-Zelle belegt? Dann nicht bewegen (kein automatischer
  //    GetNextFreeGridPlace, weil das User-Erwartung verletzen würde).
  const occupant = owningGrid.GetGOAtGrid(target);
  if (occupant && occupant !== obj) return null;

  // 5. GORemove + GOIns (1:1 zum C++ Drag-Pfad)
  owningGrid.GORemoveObj(obj, false);
  const ok = owningGrid.GOIns(obj, target.x, target.y, false);
  if (!ok) {
    // Fallback: wieder an alter Position einfügen
    owningGrid.GOIns(obj, current.x, current.y, false);
    return null;
  }
  // 6. Layout neu finalisieren — Spalten/Zeilen-Größen ändern sich evtl.
  rootGrid.finalizeLayout(rootGrid.m_GOrg);
  return { col: target.x, row: target.y };
}

/**
 * React-Flow-Connect-Handler: erzeugt einen GLink zwischen den beiden Knoten.
 *
 * - source/target sind React-Flow-Node-Ids
 * - sourceHandle/targetHandle sind die Handle-Ids (top/bottom/left/right)
 */
export function onConnect(
  rootGrid: OGraphGrid,
  connection: Connection,
): GLink | null {
  if (!connection.source || !connection.target) return null;
  const sourceObj = findObjectByNodeId(rootGrid, connection.source);
  const targetObj = findObjectByNodeId(rootGrid, connection.target);
  if (!(sourceObj instanceof GObjLink) || !(targetObj instanceof GObjLink)) {
    return null;
  }
  const link = new GLink(sourceObj, targetObj);
  return link;
}

/**
 * Welle G24 + G26: Findet eine Grid-Cell für eine neue PDlplKante zwischen
 * Source- und Target-Knoten.
 *
 * Heuristik (1:1 zum User-Wunsch 2026-05-24 "wenn kein Platz für die Kante
 * ist wird ein Grid-Raster eingefügt"):
 *
 * - **Horizontaler Flow** (src.x !== tgt.x):
 *   - Wenn |diff| >= 2 UND Midpoint-Cell frei: Edge dort.
 *   - Sonst: neue Spalte direkt nach min(src.x, tgt.x), Edge in der neuen.
 *
 * - **Vertikaler Flow** (src.x === tgt.x):
 *   - Wenn |diff| >= 2 UND Midpoint-Cell frei: Edge dort.
 *   - Sonst: neue Zeile direkt nach min(src.y, tgt.y), Edge in der neuen.
 *
 * Returns `insertedColAfter` und/oder `insertedRowAfter` — der Aufrufer
 * MUSS ALLE wire-m_pntRaster-Werte mit col > insertedColAfter bzw.
 * row > insertedRowAfter um +1 anheben, damit wire-to-grid konsistent
 * bleibt (Cascade-Mutation der Wire-Daten).
 *
 * Welle G26 (Heuristik straffen):
 * Vorher hatte der Algo bei besetzter Default-Cell erst row±1, row±2
 * probiert (Edge in "Nachbar-Row"). Das gab UX-Müll: Kanten zwischen
 * direkt benachbarten Knoten landeten in Target-Col mit Off-Row statt
 * sauber dazwischen. Jetzt: besetzt → immer sofort Spalte/Zeile einfügen.
 *
 * Reference: OSim2004 OGGrid.cpp:1602+ (InsertColBefore), OGOCtrl.cpp:1834+
 * (OnLButtonUp INSERT_LINK macht im Original keinen Auto-Col-Insert, weil
 * GLink dort kein Grid-Slot hat — in osim-ui ist PDlplKante seit Welle G11
 * ein Grid-Element, daher brauchen WIR die Insertion-Logik).
 */
export function findEdgeCell(
  rootGrid: OGraphGrid,
  sourceObj: GObjLink,
  targetObj: GObjLink,
): {
  col: number;
  row: number;
  insertedColAfter: number | null;
  insertedRowAfter: number | null;
} {
  const src = sourceObj.m_OGPosition?.pGridPos;
  const tgt = targetObj.m_OGPosition?.pGridPos;

  if (!src || !tgt) {
    return { col: 0, row: 0, insertedColAfter: null, insertedRowAfter: null };
  }

  if (src.x !== tgt.x) {
    // Horizontaler Flow
    const colDiff = Math.abs(src.x - tgt.x);
    if (colDiff >= 2) {
      const midCol = Math.round((src.x + tgt.x) / 2);
      if (!rootGrid.IsGridPlaceTaken(midCol, src.y)) {
        return {
          col: midCol,
          row: src.y,
          insertedColAfter: null,
          insertedRowAfter: null,
        };
      }
    }
    // Adjacent (colDiff===1) ODER Midpoint belegt → neue Spalte einfügen.
    const insertedColAfter = Math.min(src.x, tgt.x);
    return {
      col: insertedColAfter + 1,
      row: src.y,
      insertedColAfter,
      insertedRowAfter: null,
    };
  }

  // Vertikaler Flow (src.x === tgt.x)
  const rowDiff = Math.abs(src.y - tgt.y);
  if (rowDiff >= 2) {
    const midRow = Math.round((src.y + tgt.y) / 2);
    if (!rootGrid.IsGridPlaceTaken(src.x, midRow)) {
      return {
        col: src.x,
        row: midRow,
        insertedColAfter: null,
        insertedRowAfter: null,
      };
    }
  }
  const insertedRowAfter = Math.min(src.y, tgt.y);
  return {
    col: src.x,
    row: insertedRowAfter + 1,
    insertedColAfter: null,
    insertedRowAfter,
  };
}

/**
 * React-Flow-Delete-Handler: entfernt Knoten + ihre Links aus dem Grid.
 *
 * Reihenfolge:
 * 1. Für jeden zu löschenden Knoten: alle ein-/ausgehenden Links abkoppeln
 *    (löst sich rekursiv über GLink.OnNodeXxxRemoved)
 * 2. Knoten aus dem Grid entfernen (GORemoveObj)
 *
 * Sub-Children eines D_OPEN-GObjSub werden NICHT mit-gelöscht — der User
 * muss sie explizit selektieren (defensiv gegen Massen-Verlust).
 */
export function onNodesDelete(
  rootGrid: OGraphGrid,
  nodesToDelete: Node<OsimNodeData>[],
): GObject[] {
  const deleted: GObject[] = [];
  for (const n of nodesToDelete) {
    const obj = findObjectByNodeId(rootGrid, n.id);
    if (!obj) continue;
    if (obj.IsDeleteForbidden()) continue;

    // Links abkoppeln
    if (obj instanceof GObjLink) {
      // Kopie der Listen, weil die Mutationen während des Iterates passieren
      const outLinks = [...obj.m_OutList];
      const inLinks = [...obj.m_InList];
      for (const link of outLinks) {
        const l = link as GLink;
        l.OnNodePrevRemoved(obj);
      }
      for (const link of inLinks) {
        const l = link as GLink;
        l.OnNodeNextRemoved(obj);
      }
    }

    // Aus dem Grid entfernen — finden über GridPos
    const coll = obj.m_OGCollection as OGraphGrid | null;
    if (coll && typeof coll.GORemoveObj === "function") {
      coll.GORemoveObj(obj, false);
      deleted.push(obj);
    }
  }
  return deleted;
}

/**
 * React-Flow-Edges-Delete-Handler: entfernt GLink-Verbindungen.
 */
export function onEdgesDelete(
  rootGrid: OGraphGrid,
  edgesToDelete: Edge<OsimEdgeData>[],
): number {
  let count = 0;
  for (const e of edgesToDelete) {
    const sourceObj = findObjectByNodeId(rootGrid, e.source);
    const targetObj = findObjectByNodeId(rootGrid, e.target);
    if (
      !(sourceObj instanceof GObjLink) ||
      !(targetObj instanceof GObjLink)
    ) {
      continue;
    }
    // Finde den passenden GLink (gleiche source/target)
    const link = sourceObj.m_OutList.find((l) => {
      const gl = l as GLink;
      return gl.m_Next === targetObj;
    }) as GLink | undefined;
    if (!link) continue;
    link.OnNodePrevRemoved(sourceObj);
    link.OnNodeNextRemoved(targetObj);
    count++;
  }
  return count;
}

/**
 * Doppelklick-Handler: GObjSub → toggelt D_OPEN/D_CLOSED.
 * Für andere Klassen: keine Default-Aktion (Konsument kann eigenen Pfad
 * via PropertyEditor-Open implementieren).
 */
export function onNodeDoubleClick(
  rootGrid: OGraphGrid,
  nodeId: string,
): boolean {
  const obj = findObjectByNodeId(rootGrid, nodeId);
  if (!obj) return false;
  if (obj instanceof GObjSub) {
    const newState =
      obj.GetSubState() === GOStateSub.D_OPEN
        ? GOStateSub.D_CLOSED
        : GOStateSub.D_OPEN;
    obj.SetSubState(newState);
    return true;
  }
  return false;
}
