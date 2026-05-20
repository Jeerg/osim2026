// Plan 01-05 Task 1: SidebarTree — Workspace-Navigation.
//
// Rendert den JSON-Tree aus dem model-store ueber react-arborist als
// virtualisierte, expand/collapsible Tree-View. Der Backend-Tree enthaelt
// bereits synthetische `_group`-Knoten (Ausloeser/Plaene/Knoten/Kanten/
// Ressourcen/Einsatzzeiten/Entscheider) — wir rendern sie 1:1 als
// nicht-selektierbare Folder-Header.
//
// Klick auf einen echten Knoten setzt useModelStore.selectedOid; der
// WorkspaceLayout reagiert per useEffect und ruft frame.setObj().

import { useEffect, useMemo, useRef, useState } from "react";
import { Tree, type NodeApi, type NodeRendererProps } from "react-arborist";
import { useModelStore } from "@/state/model-store";
import type { OtxJsonNode } from "@/viewers/core/types";
import { SYNTHETIC_MATRIX_NODES } from "@/viewers/matrix/synthetic-nodes";

const GROUP_KLASS = "_group";
const ROW_HEIGHT = 26;
const INDENT_PX = 16;
const MATRIX_FOLDER_ID = "synthetic:matrix-sichten";

interface ArboristNode {
  /** react-arborist erwartet string-ids. */
  id: string;
  /** Original oid; bei _group-Knoten ist das die synthetische -1 (mehrfach moeglich). */
  oid: number;
  klass: string;
  name: string;
  isGroup: boolean;
  unsupported: boolean;
  children?: ArboristNode[];
}

/**
 * Konvertiert einen OtxJsonNode-Subtree in das ArboristNode-Format.
 * Synthetische _group-Knoten bekommen eindeutige, pfad-basierte IDs
 * (z.B. "group:Durchlaufplaene:42") damit ihre id im Tree eindeutig
 * bleibt — der Backend-Tree teilt sich oid=-1 fuer alle Gruppen.
 */
function toArboristNode(
  node: OtxJsonNode,
  pathPrefix: string,
): ArboristNode {
  const isGroup = node.klass === GROUP_KLASS;
  const id = isGroup
    ? `${pathPrefix}/group:${node.name}`
    : `oid:${node.oid}`;
  const childPrefix = isGroup
    ? `${pathPrefix}/${node.name}`
    : `${pathPrefix}/${node.oid}`;
  const children = node.children.length
    ? node.children.map((c) => toArboristNode(c, childPrefix))
    : undefined;
  return {
    id,
    oid: node.oid,
    klass: node.klass,
    name: node.name,
    isGroup,
    unsupported: node.unsupported === true,
    children,
  };
}

function NodeRow({
  node,
  style,
  dragHandle,
}: NodeRendererProps<ArboristNode>) {
  const isOpen = node.isOpen;
  const isLeaf = node.isLeaf;
  const data = node.data;

  const baseColor = data.isGroup
    ? "text-gray-500 font-semibold"
    : data.unsupported
      ? "text-gray-400 italic"
      : "text-gray-800";
  const selectedBg = node.isSelected && !data.isGroup ? "bg-blue-100" : "";

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`flex cursor-pointer items-center gap-1 px-1 text-xs ${baseColor} ${selectedBg} hover:bg-gray-100`}
      data-testid={`sidebar-node-${data.id}`}
      onClick={() => {
        if (data.isGroup) {
          // Gruppen: nur expand/collapse, keine Selection.
          node.toggle();
          return;
        }
        node.select();
      }}
    >
      <span className="inline-block w-3 text-gray-400">
        {!isLeaf ? (isOpen ? "▾" : "▸") : ""}
      </span>
      <span className="truncate">
        {data.name}
        {data.isGroup && data.children && (
          <span className="ml-1 text-gray-400">
            ({countLeafs(data)})
          </span>
        )}
      </span>
    </div>
  );
}

function countLeafs(node: ArboristNode): number {
  if (!node.children) return 0;
  return node.children.reduce(
    (acc, c) => acc + (c.isGroup ? countLeafs(c) : 1),
    0,
  );
}

export interface SidebarTreeProps {
  /** Optional ueberschreibbare Hoehe; default = 100% vom Container. */
  height?: number;
  /** Optional ueberschreibbare Breite. */
  width?: number | string;
}

export function SidebarTree({ height, width }: SidebarTreeProps) {
  const tree = useModelStore((s) => s.tree);
  const selectedOid = useModelStore((s) => s.selectedOid);
  const selectOid = useModelStore((s) => s.selectOid);

  const data = useMemo<ArboristNode[]>(() => {
    if (!tree) return [];
    const root = toArboristNode(tree, "");
    // Plan 01-06: synthetische Matrix-Sichten-Folder am Ende der Root-
    // Kinder einhaengen. Die einzelnen Matrix-Leafs sind selektierbar
    // (isGroup=false), der "Matrix-Sichten"-Folder selbst ist nur ein
    // Group-Header.
    const matrixFolder: ArboristNode = {
      id: MATRIX_FOLDER_ID,
      oid: -10000,
      klass: GROUP_KLASS,
      name: "Matrix-Sichten",
      isGroup: true,
      unsupported: false,
      children: SYNTHETIC_MATRIX_NODES.map((s) => ({
        id: `synthetic:${s.oid}`,
        oid: s.oid,
        klass: s.klass,
        name: s.name,
        isGroup: false,
        unsupported: false,
      })),
    };
    const newChildren = [...(root.children ?? []), matrixFolder];
    return [{ ...root, children: newChildren }];
  }, [tree]);

  // Search-Filter (oben angedockt; react-arborist hat eingebautes searchMatch)
  const [searchTerm, setSearchTerm] = useState("");

  // Container-Mass — useResizeObserver-light, ohne extra-Dependency.
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ h: number; w: number }>({
    h: 600,
    w: 320,
  });

  useEffect(() => {
    if (height !== undefined && width !== undefined) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const rect = e.contentRect;
      setSize({ h: Math.floor(rect.height), w: Math.floor(rect.width) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height, width]);

  if (!tree) {
    return (
      <div
        className="p-3 text-xs italic text-gray-500"
        data-testid="sidebar-tree-empty"
      >
        Kein Modell geladen.
      </div>
    );
  }

  const treeHeight = height ?? Math.max(200, size.h - 40);
  const treeWidth = width ?? "100%";

  const selection = selectedOid != null ? `oid:${selectedOid}` : undefined;

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col"
      data-testid="sidebar-tree"
    >
      <div className="border-b border-gray-200 p-2">
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Suchen…"
          className="block w-full rounded border-gray-300 text-xs shadow-sm focus:border-blue-500 focus:ring-blue-500"
          data-testid="sidebar-tree-search"
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <Tree<ArboristNode>
          data={data}
          openByDefault={true}
          rowHeight={ROW_HEIGHT}
          indent={INDENT_PX}
          height={treeHeight}
          width={treeWidth}
          searchTerm={searchTerm}
          selection={selection}
          onActivate={(node: NodeApi<ArboristNode>) => {
            if (node.data.isGroup) return;
            selectOid(node.data.oid);
          }}
          disableDrag
          disableDrop
        >
          {NodeRow}
        </Tree>
      </div>
    </div>
  );
}
