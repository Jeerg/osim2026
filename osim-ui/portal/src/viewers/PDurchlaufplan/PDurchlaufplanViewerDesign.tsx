/**
 * PDurchlaufplanViewerDesign — Graphische Design-Ansicht eines Durchlaufplans.
 *
 * **Welle G der GraphObject-Foundation-Portierung (Phase 1.1):**
 * Migriert von der alten Plan-1-10-Variante (graph-builder + ReactFlowAdapter)
 * auf die neue Foundation in `@/graph/foundation`. Nutzt:
 *
 * - `wireToGrid` baut einen `OGraphGrid` aus dem PDurchlaufplan-Wire-Objekt
 *   (Knoten in sub_refs[0], Kanten in sub_refs[1])
 * - `GraphFlowCanvas` rendert den Grid via React-Flow
 * - Drag/Connect/Delete-Handler synct die Mutationen zurück in den model-store
 *
 * Bonus durch die Foundation: nested `GObjSub`-Knoten werden direkt als
 * verschachtelte React-Flow-Group-Nodes angezeigt (D_OPEN ↔ D_CLOSED via
 * Doppelklick toggelbar).
 *
 * **C++-Konzeptvorlage:** `OSim2004/inc/PDlplViewerGObj.h` + `OSim2004/inc/
 * GraphObj.h`. Die Foundation portiert die volle Klassen-Hierarchie aus
 * `GraphObj.h` 1:1.
 */

import * as React from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import {
  GraphFlowCanvas,
  findEdgeCell,
  findObjectByNodeId,
  onConnect as foundationOnConnect,
  onEdgesDelete as foundationOnEdgesDelete,
  onNodeDragStop as foundationOnNodeDragStop,
  onNodeDoubleClick as foundationOnNodeDoubleClick,
  onNodesDelete as foundationOnNodesDelete,
} from "@/graph/foundation";
import { wireToGrid, GObjLink } from "@osim/graphobject";
import { ReactFlowProvider, useReactFlow, ViewportPortal } from "@xyflow/react";
import type { Connection, Edge, Node } from "@xyflow/react";
import { useModelStore } from "@/stores/model-store";
import { toast } from "sonner";
import type { ViewerProps } from "@/viewers/core/types";
import {
  PlanToolbar,
  KNOTEN_KLASSEN,
  PLAN_TOOLBAR_DRAG_MIME,
} from "./PlanToolbar";

/**
 * Public-Export wraps Inner in ReactFlowProvider. GraphFlowCanvas hat zwar
 * einen internen Provider, aber für die Welle-G21-Coord-Transform (Rechtsklick
 * → Flow-Position für Insert) brauchen wir Zugriff auf rfInstance VOR dem
 * GraphFlowCanvas-Mount. Daher liftet der Provider hier rauf.
 */
export function PDurchlaufplanViewerDesign(props: ViewerProps) {
  return (
    <ReactFlowProvider>
      <PDurchlaufplanViewerDesignInner {...props} />
    </ReactFlowProvider>
  );
}

function PDurchlaufplanViewerDesignInner(props: ViewerProps) {
  const { obj, allObjects, disabled } = props;
  const rfInstance = useReactFlow();

  // Revision-Counter zwingt useMemo zum Re-Build wenn der Wire-Tree mutiert.
  const [revision, setRevision] = React.useState(0);
  const bumpRevision = React.useCallback(
    () => setRevision((r) => r + 1),
    [],
  );

  const [selectedOids, setSelectedOids] = React.useState<unknown[]>([]);
  // Welle G12: INSERT-Mode-States — User wählt Klasse, nächster Pane-Klick legt Knoten an.
  const [insertKnotenKlass, setInsertKnotenKlass] = React.useState<string | null>(null);
  // Welle G25-A: Kanten-Default ist "PDlplKante" (Standardkante). User-Wunsch
  // 2026-05-24: "Vorauswahl bei Kanten ist die Standardkante". Ctrl+Drag
  // nutzt diese Klass automatisch — kein Mode-Aktivierungs-Schritt nötig.
  const [insertKantenKlass, setInsertKantenKlass] = React.useState<string | null>(
    "PDlplKante",
  );
  // Welle G25-B: Ctrl+Drag-Edge-Insert State.
  const [edgeInsertSourceOid, setEdgeInsertSourceOid] = React.useState<number | null>(
    null,
  );
  const [edgeInsertCursor, setEdgeInsertCursor] = React.useState<
    { x: number; y: number } | null
  >(null);
  const [contextMenuOid, setContextMenuOid] = React.useState<number | null>(null);
  // Welle G18-D: Grid-Linien-Anzeige toggeln (analog OSim2004 OGGrid::s_Raster).
  const [showGrid, setShowGrid] = React.useState(true);

  // ESC bricht INSERT-Mode ab
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInsertKnotenKlass(null);
        setInsertKantenKlass(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Foundation-Grid aus dem Wire-Tree bauen. Wenn der Wire-Tree mutiert
  // (Drag/Connect/Delete), liefert der model-store-Subscribe ein neues
  // allObjects-Reference — useMemo baut den Grid neu.
  const { grid } = React.useMemo(
    () => wireToGrid(obj.oid, allObjects),
    // revision triggert Re-Build nach Drag/Connect/Delete (siehe bumpRevision)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.oid, allObjects, revision],
  );

  // --- Edit-Handlers --------------------------------------------------------

  const handleNodeDragStop = React.useCallback(
    (event: unknown, node: Node) => {
      // Foundation-Drag aktualisiert die Grid-Topologie (GORemove + GOIns)
      // und liefert die neue Cell zurück. Wenn null → Drag wurde abgelehnt
      // (Ziel belegt, außerhalb, oder Foundation-Lookup fehlgeschlagen).
      const newCell = foundationOnNodeDragStop(grid, event, node as never);
      if (newCell === null) {
        // Re-Render zwingen, damit der React-Flow-Visual zurück auf die alte
        // Pixel-Position springt (= Foundation-Wahrheit).
        bumpRevision();
        return;
      }
      // Wire-Store: m_pntRaster ist die kanonische Quelle (Welle G2). Patchen
      // mit der echten neuen Cell, damit der nächste wire-to-grid die NEUE
      // Position liest. m_iPosX/Y sind nur Fallback für Knoten ohne Raster —
      // wir setzen sie KOORDINIERT auf null/0, damit sie nicht widersprechen.
      const oid = Number(node.id.replace(/^oid:/, ""));
      if (!Number.isNaN(oid)) {
        useModelStore.getState().patchObject(oid, {
          m_pntRaster: [newCell.col, newCell.row],
        });
      }
      bumpRevision();
    },
    [grid, bumpRevision],
  );

  /**
   * Welle G24-B + G25-B: Kante zwischen zwei Knoten-OIDs anlegen.
   *
   * Findet eine echte Grid-Position für die neue PDlplKante (1:1 zum
   * Original — PDlplKante ist im OSim2004 ein eigenständiges Grid-Element,
   * siehe Welle G11). findEdgeCell sucht eine freie Cell zwischen Source
   * und Target; wenn nichts frei: Auto-Col-Insertion direkt nach Source.
   *
   * Cascade-Mutation bei Auto-Col-Insert:
   * Wenn eine Spalte eingefügt wird, müssen ALLE wire-m_pntRaster-Werte
   * mit col > insertedColAfter um +1 angehoben werden — sonst überlappen
   * die existierenden Knoten/Kanten beim nächsten wire-to-grid-Re-Build
   * mit der neuen Edge-Cell.
   *
   * @param klass Wire-Klass der neuen Kante (Default: "PDlplKante").
   */
  const createKanteBetween = React.useCallback(
    (vonOid: number, nachOid: number, klass: string = "PDlplKante") => {
      // Source + Target im Grid finden — für die Cell-Berechnung.
      const sourceObj = findObjectByNodeId(grid, `oid:${vonOid}`);
      const targetObj = findObjectByNodeId(grid, `oid:${nachOid}`);
      if (!(sourceObj instanceof GObjLink) || !(targetObj instanceof GObjLink)) {
        toast.error("Kante nicht möglich", {
          description: "Source oder Target konnte nicht zugeordnet werden.",
        });
        return;
      }

      const cell = findEdgeCell(grid, sourceObj, targetObj);
      const store = useModelStore.getState();

      // Welle G24 + G26: Auto-Col/Row-Insert mit Cascade-Mutation der
      // Wire-Daten — erst ALLE Wire-Objekte mit m_pntRaster.{x|y} >
      // shiftAfter um +1 verschieben, DANN die neue Kante erzeugen.
      // Sonst überlappt die Edge-Cell mit einem Bestandsknoten beim
      // nächsten wire-to-grid-Re-Build.
      if (cell.insertedColAfter !== null || cell.insertedRowAfter !== null) {
        const planObj = allObjects[obj.oid];
        const knotenOids =
          (planObj?.attrs?.m_lKnoten as number[] | undefined) ??
          (planObj?.sub_refs?.[0] as number[] | undefined) ??
          [];
        const kantenOids =
          (planObj?.attrs?.m_lKanten as number[] | undefined) ??
          (planObj?.sub_refs?.[1] as number[] | undefined) ??
          [];
        const shiftColAfter = cell.insertedColAfter;
        const shiftRowAfter = cell.insertedRowAfter;
        for (const oid of [...knotenOids, ...kantenOids]) {
          const wireObj = allObjects[oid];
          const raster = wireObj?.attrs?.m_pntRaster as
            | [number, number]
            | undefined;
          if (!Array.isArray(raster)) continue;
          const newX =
            shiftColAfter !== null && raster[0] > shiftColAfter
              ? raster[0] + 1
              : raster[0];
          const newY =
            shiftRowAfter !== null && raster[1] > shiftRowAfter
              ? raster[1] + 1
              : raster[1];
          if (newX !== raster[0] || newY !== raster[1]) {
            store.patchObject(oid, { m_pntRaster: [newX, newY] });
          }
        }
        if (shiftColAfter !== null) {
          toast.info("Spalte eingefügt", {
            description: `Kein freier Platz zwischen Knoten — neue Spalte ${cell.col} angelegt.`,
          });
        } else {
          toast.info("Zeile eingefügt", {
            description: `Kein freier Platz zwischen Knoten — neue Zeile ${cell.row} angelegt.`,
          });
        }
      }

      const newKantenOid = store.createObject(klass, {
        m_lVorgaenger: vonOid,
        m_lNachfolger: nachOid,
        m_sName: "",
        m_pntRaster: [cell.col, cell.row],
      });
      store.appendSubRef(obj.oid, 1, newKantenOid);
      bumpRevision();
    },
    [grid, obj.oid, allObjects, bumpRevision],
  );

  /** React-Flow-Handle-to-Handle-Connect (sekundärer Pfad, falls User
   *  doch die Handle-Dots nutzt). Welle G25-Primärpfad ist Ctrl+Drag. */
  const handleConnect = React.useCallback(
    (connection: Connection) => {
      const link = foundationOnConnect(grid, connection);
      if (!link) return;
      const vonOid = Number(connection.source?.replace(/^oid:/, ""));
      const nachOid = Number(connection.target?.replace(/^oid:/, ""));
      if (Number.isNaN(vonOid) || Number.isNaN(nachOid)) return;
      createKanteBetween(vonOid, nachOid, insertKantenKlass ?? "PDlplKante");
    },
    [grid, insertKantenKlass, createKanteBetween],
  );

  const handleNodesDelete = React.useCallback(
    (nodes: Node[]) => {
      foundationOnNodesDelete(grid, nodes as never);
      const store = useModelStore.getState();
      for (const n of nodes) {
        const oid = Number(n.id.replace(/^oid:/, ""));
        if (!Number.isNaN(oid)) store.deleteObject(oid);
      }
      bumpRevision();
    },
    [grid, bumpRevision],
  );

  const handleEdgesDelete = React.useCallback(
    (edges: Edge[]) => {
      foundationOnEdgesDelete(grid, edges as never);
      const store = useModelStore.getState();
      for (const e of edges) {
        // Edge-Id-Konvention: "e<counter>:<source>-><target>" — wir suchen
        // die Wire-Kante über Source/Target-Oids im wire.objects.
        const sourceOid = Number(e.source.replace(/^oid:/, ""));
        const targetOid = Number(e.target.replace(/^oid:/, ""));
        const kantenOids =
          (allObjects[obj.oid]?.sub_refs?.[1] as number[] | undefined) ?? [];
        for (const kantenOid of kantenOids) {
          const kante = allObjects[kantenOid];
          if (!kante) continue;
          const v = kante.attrs["m_lVorgaenger"] ?? kante.attrs["m_oid_von"];
          const n = kante.attrs["m_lNachfolger"] ?? kante.attrs["m_oid_nach"];
          if (v === sourceOid && n === targetOid) {
            store.deleteObject(kantenOid);
            break;
          }
        }
      }
      bumpRevision();
    },
    [grid, obj.oid, allObjects, bumpRevision],
  );

  const handleNodeSelect = React.useCallback((viewedOid: unknown) => {
    if (typeof viewedOid === "string" || typeof viewedOid === "number") {
      setSelectedOids([viewedOid]);
    }
  }, []);

  const handleNodeDblClick = React.useCallback(
    (viewedOid: unknown) => {
      foundationOnNodeDoubleClick(grid, `oid:${String(viewedOid)}`);
      bumpRevision();
    },
    [grid, bumpRevision],
  );

  const handleDeleteSelected = React.useCallback(() => {
    const store = useModelStore.getState();
    for (const oid of selectedOids) {
      if (typeof oid === "number" || typeof oid === "string") {
        const n = Number(oid);
        if (!Number.isNaN(n)) store.deleteObject(n);
      }
    }
    setSelectedOids([]);
    bumpRevision();
  }, [selectedOids, bumpRevision]);

  /**
   * Welle G21: legt einen Knoten der gegebenen Klasse an der gegebenen
   * Canvas-Position (Flow-Koords, post Zoom/Pan) an.
   *
   * 1:1 zum OSim2004-Original (OGGrid.cpp:2930-2975 INSERT_OBJECT-Branch):
   * - Pixel → Cell via `grid.GetGridAtPoint(p, false)` (Welle G2-Vertrag)
   * - Wenn Cell belegt → Reject + Toast (im Original: `if (gobj != NULL) return;`)
   * - Wenn Position ungültig (außerhalb Grid-Bounds) → Reject + Toast
   * - KEIN Fallback auf maxRow+1 (das war ein Welle-G18-Anti-Pattern)
   *
   * Wenn `canvasPos == null` (z.B. ContextMenu ohne gemerkte Position):
   * → Reject statt blind anlegen. Aufrufer muss eine Position liefern.
   */
  const insertKnotenAt = React.useCallback(
    (klass: string, canvasPos: { x: number; y: number } | null): boolean => {
      if (!canvasPos) {
        toast.error("Keine Klick-Position", {
          description: "Klick direkt im Canvas, um einen Knoten anzulegen.",
        });
        return false;
      }
      const target = grid.GetGridAtPoint(
        { x: canvasPos.x, y: canvasPos.y },
        false,
      );
      if (!target || target.x < 0 || target.y < 0) {
        toast.error("Außerhalb des Plans", {
          description: "Klick auf eine sichtbare Grid-Zelle, nicht in den Rand.",
        });
        return false;
      }
      const col = target.x;
      const row = target.y;

      // 1:1 OSim2004: belegte Cell → Insert ablehnen (C++ Z.2940 `if (gobj)`).
      // Foundation hat kein GetObjectAt — wir scannen die m_pntRaster-Werte
      // der direkten Knoten des aktuellen Plans (Welle G2-Vertrag).
      const planObj = allObjects[obj.oid];
      const knotenOids =
        (planObj?.attrs?.m_lKnoten as number[] | undefined) ??
        (planObj?.sub_refs?.[0] as number[] | undefined) ??
        [];
      const occupied = knotenOids.some((kOid) => {
        const r = allObjects[kOid]?.attrs?.m_pntRaster as
          | [number, number]
          | undefined;
        return Array.isArray(r) && r[0] === col && r[1] === row;
      });
      if (occupied) {
        toast.error("Zelle belegt", {
          description: `Spalte ${col}, Zeile ${row} ist schon besetzt.`,
        });
        return false;
      }

      const store = useModelStore.getState();
      const klassDef = KNOTEN_KLASSEN.find((k) => k.klass === klass);
      const label = klassDef?.label ?? klass.replace(/^PDpKn/, "");
      const newOid = store.createObject(klass, {
        m_sName: `Neuer ${label}`,
        m_pntRaster: [col, row],
      });
      store.appendSubRef(obj.oid, 0, newOid);
      bumpRevision();
      return true;
    },
    [grid, obj.oid, allObjects, bumpRevision],
  );

  /**
   * Welle G23: Phantom-Click-Schutz. Wenn der User das ContextMenu-Toggle
   * "Einfüge-Modus" anklickt, schließt radix-ui das Menu durch einen MouseUp
   * am Item — der Browser feuert kurz danach noch einen Click auf das
   * darunterliegende Pane (ContextMenuTrigger). Ohne Schutz triggert das
   * sofort einen Insert an der ContextMenu-Position. ignorePaneClickUntilRef
   * sperrt handlePaneClick für 300 ms nach jeder ContextMenu-Aktion.
   */
  const ignorePaneClickUntilRef = React.useRef<number>(0);

  /**
   * Welle G25-B: Ctrl+Drag-Edge-Insert.
   *
   * User-Pattern (1:1 vom User vorgegeben 2026-05-24): "wenn man einen
   * Knoten klickt mit links und dabei Strg drückt kommt man automatisch
   * in den Kantenmodus. Strg die ganze Zeit halten. Dann auf einem
   * anderen Knoten die Maus loslassen und dann wird eine Kante zwischen
   * den Knoten angelegt".
   *
   * Implementation:
   * 1. onMouseDownCapture im Canvas-Wrapper: bei `e.ctrlKey` + Klick auf
   *    Knoten (closest data-oid mit "oid:"-Präfix): preventDefault +
   *    stopPropagation (unterdrückt React-Flow-Drag), setEdgeInsertSourceOid
   * 2. Global mousemove: trackt cursor in Flow-Koords für Preview-Line
   * 3. Global mouseup: wenn Ziel ein anderer Knoten → createKanteBetween
   * 4. ESC oder Ctrl loslassen oder mouseup auf Pane → Cancel
   */
  const isCtrlDragActive = edgeInsertSourceOid !== null;
  React.useEffect(() => {
    if (!isCtrlDragActive) return;
    const onMove = (e: MouseEvent) => {
      const flowPos = rfInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      setEdgeInsertCursor(flowPos);
    };
    const onUp = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest("[data-oid]");
      const oidStr = target?.getAttribute("data-oid");
      const targetOid = oidStr
        ? Number(oidStr.replace(/^oid:/, ""))
        : Number.NaN;
      const sourceOid = edgeInsertSourceOid;
      // Reset state IMMER — auch bei Cancel.
      setEdgeInsertSourceOid(null);
      setEdgeInsertCursor(null);
      if (
        sourceOid !== null &&
        !Number.isNaN(targetOid) &&
        targetOid !== sourceOid
      ) {
        createKanteBetween(
          sourceOid,
          targetOid,
          insertKantenKlass ?? "PDlplKante",
        );
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Control") {
        setEdgeInsertSourceOid(null);
        setEdgeInsertCursor(null);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keyup", onKey);
    };
  }, [
    isCtrlDragActive,
    edgeInsertSourceOid,
    insertKantenKlass,
    rfInstance,
    createKanteBetween,
  ]);

  /**
   * Wrapper-MouseDown vor React-Flow. Wenn Ctrl + Klick auf Knoten:
   * Edge-Insert starten, React-Flow-Drag unterdrücken.
   */
  const handleCanvasMouseDownCapture = React.useCallback(
    (e: React.MouseEvent) => {
      if (!e.ctrlKey) return;
      if (e.button !== 0) return; // nur linke Maustaste
      const target = (e.target as HTMLElement | null)?.closest("[data-oid]");
      const oidStr = target?.getAttribute("data-oid");
      if (!oidStr) return;
      const oid = Number(oidStr.replace(/^oid:/, ""));
      if (Number.isNaN(oid)) return;
      e.preventDefault();
      e.stopPropagation();
      setEdgeInsertSourceOid(oid);
      const flowPos = rfInstance.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      setEdgeInsertCursor(flowPos);
    },
    [rfInstance],
  );

  /** Source-Knoten-Center in Flow-Koords (für Preview-Linie-Startpunkt).
   *  `revision` ist explizite Re-Build-Quelle nach Grid-Mutationen. */
  const edgeInsertSourceCenter = React.useMemo(() => {
    if (edgeInsertSourceOid === null) return null;
    const node = rfInstance.getNode(`oid:${edgeInsertSourceOid}`);
    if (!node) return null;
    const w = node.measured?.width ?? node.width ?? 200;
    const h = node.measured?.height ?? node.height ?? 80;
    return {
      x: node.position.x + w / 2,
      y: node.position.y + h / 2,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeInsertSourceOid, rfInstance, revision]);

  /**
   * Welle G18: Pane-Click (NUR Background, NICHT Knoten) mit echten
   * React-Flow-Canvas-Koords. GraphFlowCanvas reicht flowPos via
   * onPaneClick durch (screenToFlowPosition rechnet Zoom+Pan raus).
   *
   * Original-Verhalten (PDlplViewerStd.cpp:3307+ OnRequestInsertGObj):
   * INSERT-Mode bleibt aktiv nach dem Anlegen — User kann mehrere
   * Knoten in Folge platzieren. ESC oder Combobox-Wechsel beendet den Mode.
   */
  const handlePaneClick = React.useCallback(
    (flowPos: { x: number; y: number }) => {
      // Welle G23-B: Phantom-Click nach ContextMenu-Close ignorieren.
      if (Date.now() < ignorePaneClickUntilRef.current) return;
      if (!insertKnotenKlass) return;
      insertKnotenAt(insertKnotenKlass, flowPos);
      // NICHT auto-reset — INSERT-Mode bleibt aktiv für Folge-Anlagen.
    },
    [insertKnotenKlass, insertKnotenAt],
  );

  /**
   * Welle G21: Pane-Drop: User hat aus der Toolbar-Combo in den Canvas
   * gezogen. clientX/Y → Flow-Koords via rfInstance.screenToFlowPosition
   * (rechnet Zoom + Pan raus). DOM-Pixel-Approach aus Welle G18 war bei
   * Zoom ≠ 100% falsch.
   */
  const handlePaneDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(PLAN_TOOLBAR_DRAG_MIME);
      if (!raw) return;
      try {
        const data = JSON.parse(raw) as { kind: string; klass: string };
        if (data.kind !== "knoten") return; // Kanten-Drop später
        const flowPos = rfInstance.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        insertKnotenAt(data.klass, flowPos);
      } catch {
        // Ignoriere ungültiges Drag-Payload
      }
    },
    [insertKnotenAt, rfInstance],
  );

  const handlePaneDragOver = React.useCallback((event: React.DragEvent) => {
    if (event.dataTransfer.types.includes(PLAN_TOOLBAR_DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  /** Aktuelles Wire-Klass des ContextMenu-Ziels — für intelligente Aktion-Wahl. */
  const contextMenuTarget = React.useMemo(() => {
    if (contextMenuOid === null) return null;
    const wireObj = allObjects[contextMenuOid];
    if (!wireObj) return null;
    return {
      oid: contextMenuOid,
      klass: wireObj.klass,
      name:
        typeof wireObj.attrs["m_sName"] === "string"
          ? wireObj.attrs["m_sName"]
          : String(contextMenuOid),
      isKante: wireObj.klass.startsWith("PDlplKante") || wireObj.klass.includes("Kante"),
      isAlternativ: wireObj.klass.includes("Alternativ"),
    };
  }, [contextMenuOid, allObjects]);

  const planName =
    typeof obj.attrs["m_sName"] === "string"
      ? obj.attrs["m_sName"]
      : `oid ${obj.oid}`;

  // Stats für die Status-Zeile (Welle 9: attrs.m_lKnoten/m_lKanten statt sub_refs)
  const stats = React.useMemo(() => {
    const planObj = allObjects[obj.oid];
    const readLen = (attr: string, subIdx: number): number => {
      const a = planObj?.attrs?.[attr];
      if (Array.isArray(a)) return a.length;
      const s = planObj?.sub_refs?.[subIdx];
      return Array.isArray(s) ? s.length : 0;
    };
    return {
      nodes: readLen("m_lKnoten", 0),
      edges: readLen("m_lKanten", 1),
    };
  }, [obj.oid, allObjects]);

  return (
    <ChildDialog
      title={`Durchlaufplan-Design: ${planName}`}
      description={obj.klass}
    >
      <div
        data-viewer="PDurchlaufplanViewerDesign"
        data-viewer-klass={obj.klass}
        data-foundation="v2"
        className="flex h-full flex-col"
      >
        {/* Welle G12: Top-Toolbar 1:1 zum OSim2004-Original mit 2 Comboboxes
            (Knoten + Kanten) — Klick aktiviert INSERT-Mode, Drag-from-Item
            erlaubt direkten Drop in Canvas. */}
        <PlanToolbar
          insertKnotenKlass={insertKnotenKlass}
          insertKantenKlass={insertKantenKlass}
          onInsertKnotenKlassChange={(k) => {
            setInsertKnotenKlass(k);
            if (k) setInsertKantenKlass(null);
          }}
          onInsertKantenKlassChange={(k) => {
            setInsertKantenKlass(k);
            if (k) setInsertKnotenKlass(null);
          }}
          selectedCount={selectedOids.length}
          onDelete={handleDeleteSelected}
          disabled={disabled}
          stats={stats}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((v) => !v)}
        />

        {/* Canvas — GraphFlowCanvas mit ContextMenu-Wrapper.
            Welle G18: ContextMenu vereinfacht — Background-Klick zeigt NUR
            "Knoten einfügen" / "Kante einfügen" (1:1 OSim2004 OnBuildContextMenu
            in PDlplViewerStd.cpp:3818). Die Klasse kommt aus der aktiven
            Combobox in der PlanToolbar — Single-Source-of-Truth.
            Pane-Click via React-Flow's onPaneClick mit echten Canvas-Coords. */}
        <ContextMenu
          onOpenChange={(open) => {
            // Welle G23-B: sobald das ContextMenu schließt, blocken wir
            // handlePaneClick für 300 ms. Verhindert dass der Schließ-Klick
            // des Menus als Pane-Insert interpretiert wird.
            if (!open) ignorePaneClickUntilRef.current = Date.now() + 300;
          }}
        >
          <ContextMenuTrigger asChild>
            <div
              className="flex-1 relative"
              style={{
                minHeight: 0,
                // Welle G21-E: Crosshair im INSERT-Mode signalisiert
                // dem User "jetzt Cell klicken". G25-B: bei Ctrl+Drag
                // auf einen Knoten wird "alias" zum Edge-Indikator.
                cursor: edgeInsertSourceOid !== null
                  ? "alias"
                  : insertKnotenKlass
                    ? "crosshair"
                    : undefined,
              }}
              onMouseDownCapture={handleCanvasMouseDownCapture}
              onDrop={handlePaneDrop}
              onDragOver={handlePaneDragOver}
              onContextMenuCapture={(e) => {
                // Welle G22: ContextMenu aktiviert nur INSERT-Mode, kein
                // direkter Insert mehr — daher wird die Rechtsklick-Position
                // NICHT mehr gemerkt (vorher Welle G21-B). Der eigentliche
                // Insert kommt beim nächsten Linksklick mit handlePaneClick.
                // Wenn Rechtsklick auf einen Knoten (mit data-oid), Ziel merken
                const target = (e.target as HTMLElement).closest("[data-oid]");
                const dataOid = target?.getAttribute("data-oid");
                if (dataOid) {
                  const n = Number(dataOid.replace(/^oid:/, ""));
                  setContextMenuOid(Number.isNaN(n) ? null : n);
                } else {
                  setContextMenuOid(null);
                }
              }}
            >
              <GraphFlowCanvas
                key={`${obj.oid}`}
                grid={grid}
                revision={revision}
                onNodeSelect={handleNodeSelect}
                onNodeDblClick={handleNodeDblClick}
                onNodeDragStop={handleNodeDragStop}
                onConnect={handleConnect}
                onNodesDelete={handleNodesDelete}
                onEdgesDelete={handleEdgesDelete}
                onPaneClick={handlePaneClick}
                readOnly={disabled}
                showGrid={showGrid}
                className="h-full w-full"
              />
              {/* Welle G25-C: Preview-Linie während Ctrl+Drag. SVG im
                  ViewportPortal mit-zoomt + mit-pant automatisch. */}
              {edgeInsertSourceCenter && edgeInsertCursor && (
                <ViewportPortal>
                  <svg
                    data-testid="edge-insert-preview"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      overflow: "visible",
                      pointerEvents: "none",
                    }}
                  >
                    <line
                      x1={edgeInsertSourceCenter.x}
                      y1={edgeInsertSourceCenter.y}
                      x2={edgeInsertCursor.x}
                      y2={edgeInsertCursor.y}
                      stroke="var(--color-primary, #0EA5C7)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                    <circle
                      cx={edgeInsertCursor.x}
                      cy={edgeInsertCursor.y}
                      r={5}
                      fill="var(--color-primary, #0EA5C7)"
                    />
                  </svg>
                </ViewportPortal>
              )}
              {/* Status-Banner während Ctrl+Drag */}
              {edgeInsertSourceOid !== null && (
                <div
                  data-testid="edge-insert-banner"
                  className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-[var(--radius-sm)] border border-primary/30 bg-[var(--color-surface-soft-cyan)] px-3 py-1 text-xs font-medium text-primary-dark shadow-sm"
                >
                  Kanten-Modus aktiv ({insertKantenKlass ?? "PDlplKante"})
                  &nbsp;— Maus auf Ziel-Knoten loslassen. ESC oder Ctrl
                  loslassen bricht ab.
                </div>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-60">
            {contextMenuTarget === null ? (
              // Background-Klick: NUR Einfügen-Aktion(en) — Klasse aus Combobox.
              // 1:1 OSim2004: OGOSub.cpp Z.463+ baut ContextMenu mit
              // INSERT_NODE/INSERT_LINK/DELETE auf, kein Klassen-Submenu.
              <>
                <ContextMenuLabel>Canvas</ContextMenuLabel>
                {/* Welle G23-A: Toggle-Pattern statt direkt-Insert.
                    - Mode AUS + Combobox-Klass aktiv → "aktivieren"
                    - Mode AUS + keine Klass → disabled
                    - Mode AN → "deaktivieren" (egal welche Klass)
                    Phantom-Click-Schutz (G23-B) verhindert, dass der Close-
                    Click des Menus als Pane-Klick einen Insert auslöst. */}
                <ContextMenuItem
                  disabled={!insertKnotenKlass}
                  onSelect={() => {
                    // 300ms Sperre für handlePaneClick (Phantom-Click-Schutz)
                    ignorePaneClickUntilRef.current = Date.now() + 300;
                    if (insertKnotenKlass) {
                      // Mode war an → deaktivieren
                      setInsertKnotenKlass(null);
                      toast.info("Einfügen-Modus aus");
                    } else {
                      // Mode war aus, aber dieser Branch ist disabled
                      // (siehe disabled-Prop oben) — defensiv NoOp.
                    }
                  }}
                >
                  {insertKnotenKlass ? (
                    <>
                      Einfüge-Modus aus
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        (aktiv: {insertKnotenKlass})
                      </span>
                    </>
                  ) : (
                    <>
                      Einfüge-Modus an
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        (Combobox auswählen)
                      </span>
                    </>
                  )}
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!insertKantenKlass}
                  onSelect={() => {
                    // Kanten-Insert benötigt 2-Knoten-Selektion — Phase 2.
                    // Hier nur Placeholder, der Mode wird über Combobox aktiviert.
                  }}
                >
                  Kante einfügen
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    (Source → Target ziehen)
                  </span>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => setShowGrid((v) => !v)}>
                  {showGrid ? "Raster ausblenden" : "Raster anzeigen"}
                </ContextMenuItem>
              </>
            ) : contextMenuTarget.isKante ? (
              // Kante: nur Löschen
              <>
                <ContextMenuLabel>
                  Kante {contextMenuTarget.name}
                </ContextMenuLabel>
                <ContextMenuItem
                  variant="danger"
                  onSelect={() => {
                    // Welle G16-defensive: Confirm + Plan-Self-Guard.
                    // Verhindert versehentliches Löschen des aktuellen
                    // Plans oder Top-Level-Modell-Objekten via ContextMenu.
                    if (contextMenuTarget.oid === obj.oid) return;
                    if (!window.confirm(`Kante "${contextMenuTarget.name}" wirklich löschen?`)) return;
                    useModelStore.getState().deleteObject(contextMenuTarget.oid);
                    bumpRevision();
                  }}
                >
                  Löschen
                </ContextMenuItem>
              </>
            ) : (
              // Knoten: Eigenschaften, ggf. GObjSub-Toggle, Löschen
              <>
                <ContextMenuLabel>
                  {contextMenuTarget.klass} — {contextMenuTarget.name}
                </ContextMenuLabel>
                <ContextMenuItem
                  onSelect={() => handleNodeSelect(contextMenuTarget.oid)}
                >
                  Eigenschaften öffnen
                </ContextMenuItem>
                {contextMenuTarget.isAlternativ && (
                  <ContextMenuItem
                    onSelect={() => handleNodeDblClick(contextMenuTarget.oid)}
                  >
                    Sub-Plan öffnen/schließen
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="danger"
                  onSelect={() => {
                    // Welle G16-defensive: Confirm + Plan-Self-Guard.
                    if (contextMenuTarget.oid === obj.oid) return;
                    if (!window.confirm(`${contextMenuTarget.klass} "${contextMenuTarget.name}" wirklich löschen?`)) return;
                    useModelStore.getState().deleteObject(contextMenuTarget.oid);
                    bumpRevision();
                  }}
                >
                  Löschen
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </ChildDialog>
  );
}
