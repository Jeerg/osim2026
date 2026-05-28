/**
 * ModelTree — Sidebar-Tree mit Suche, Default-Collapsed-State und
 * Custom-Context-Menu (Plan 1.1 Redesign).
 *
 * Verhalten:
 *  - Default: nur Root expanded, alle Untergruppen zu.
 *  - Suchfeld: filtert Tree (case-insensitive Substring auf Label).
 *  - Linker Klick: Selektion (Objekte) bzw. Expand-Toggle + Group-Hint (Gruppen).
 *  - Rechter Klick: Context-Menu mit Aktionen — z.B. "Im Graph-Editor öffnen"
 *    für Durchlaufpläne.
 */

import * as React from "react";
import { Tree, type NodeApi, type NodeRendererProps } from "react-arborist";
import {
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  InfoIcon,
  PencilLineIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

import type { ModelTreeWire } from "@/api/models";
import { buildTree, type TreeNode } from "@/sidebar/tree-builder";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { OsimSymbols, symbolForGroup, symbolForKlass } from "@/assets/symbols";

export type TreeContextAction =
  | { type: "open-design"; oid: number }
  | { type: "open-properties"; oid: number; klass: string }
  | { type: "set-hint"; hint: string; oid: number }
  | { type: "delete"; oid: number };

export interface ModelTreeProps {
  wire: ModelTreeWire;
  selection: number | null;
  onSelect: (oid: number | null) => void;
  onGroupSelect?: (groupKey: string) => void;
  onContextAction?: (action: TreeContextAction) => void;
  height?: number;
  className?: string;
}

/**
 * Liefert das richtige OSim-Symbol für einen Tree-Node.
 * Group-Nodes nutzen symbolForGroup, Object-Nodes nutzen symbolForKlass.
 * Fällt auf den BoxIcon (lucide) zurück, wenn weder Group noch Klass passt.
 */
function iconForNode(node: TreeNode): React.ReactNode {
  if (node.groupKey) {
    const Icon = OsimSymbols[symbolForGroup(node.groupKey)];
    return <Icon width={16} height={16} className="text-brand-600" />;
  }
  if (node.klass) {
    const Icon = OsimSymbols[symbolForKlass(node.klass)];
    return <Icon width={16} height={16} className="text-surface-600" />;
  }
  return <BoxIcon className="h-4 w-4" />;
}

interface RowProps extends NodeRendererProps<TreeNode> {
  onContextAction?: (action: TreeContextAction) => void;
}

function Row({ node, style, dragHandle, onContextAction }: RowProps) {
  const isGroup = node.data.groupKey !== undefined;
  const isLeaf = node.isLeaf;
  const isDurchlaufplan =
    node.data.klass?.startsWith("PDurchlaufplan") === true;

  const handleClick = () => {
    if (isGroup || !isLeaf) {
      node.toggle();
    }
    // react-arborist propagiert die Selektion via onSelect-Prop am Tree-Root
    node.select();
  };

  const treeKind = isGroup ? "group" : isLeaf ? "leaf" : "branch";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          style={style}
          ref={dragHandle}
          data-testid={`tree-row-${node.data.id}`}
          data-tree-kind={treeKind}
          data-klass={node.data.klass ?? undefined}
          className={cn(
            // Style-Guide §2.2 + §7.4: Hover = soft-cyan, Active = primary-light
            // mit 3px primary Left-Accent (border-transparent hält Alignment).
            "group flex cursor-pointer items-center gap-1.5 rounded-md border-l-[3px] border-transparent px-1.5 py-1 text-sm transition-colors",
            "hover:bg-surface-soft-cyan",
            node.isSelected &&
              "border-primary bg-primary-light text-brand-900 hover:bg-primary-light",
          )}
          onClick={handleClick}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-surface-400">
            {isLeaf ? (
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
            ) : node.isOpen ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            )}
          </span>
          <span
            className={cn(
              "shrink-0",
              node.isSelected ? "text-brand-600" : "text-surface-500",
              isGroup && "text-brand-500",
            )}
          >
            {iconForNode(node.data)}
          </span>
          <span className="truncate">{node.data.label}</span>
          {isGroup && node.children && node.children.length > 0 && (
            <span className="ml-auto text-[10px] font-medium tabular-nums text-surface-400">
              {node.children.length}
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>
          {isGroup ? "Gruppe" : `${node.data.klass ?? "Objekt"}`}
        </ContextMenuLabel>
        {isDurchlaufplan && node.data.oid !== undefined && (
          <>
            <ContextMenuItem
              onSelect={() =>
                onContextAction?.({
                  type: "open-design",
                  oid: node.data.oid!,
                })
              }
            >
              <ExternalLinkIcon /> Im Graph-Editor öffnen
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                onContextAction?.({
                  type: "set-hint",
                  hint: "std",
                  oid: node.data.oid!,
                })
              }
            >
              <PencilLineIcon /> Eigenschaften bearbeiten
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {!isGroup && node.data.oid !== undefined && (
          <ContextMenuItem
            onSelect={() =>
              onContextAction?.({
                type: "open-properties",
                oid: node.data.oid!,
                klass: node.data.klass ?? "",
              })
            }
          >
            <InfoIcon /> Details anzeigen
          </ContextMenuItem>
        )}
        {isGroup && (
          <ContextMenuItem
            onSelect={() => {
              if (node.isOpen) node.close();
              else node.open();
            }}
          >
            {node.isOpen ? "Gruppe einklappen" : "Gruppe aufklappen"}
          </ContextMenuItem>
        )}
        {!isGroup && node.data.oid !== undefined && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="danger"
              onSelect={() =>
                onContextAction?.({ type: "delete", oid: node.data.oid! })
              }
            >
              <Trash2Icon /> Objekt löschen
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Filter-Algorithmus: Behalte Pfade, deren Blatt das Query matcht. */
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const matchOrPrune = (n: TreeNode): TreeNode | null => {
    const selfMatch = n.label.toLowerCase().includes(q);
    const filteredChildren = (n.children ?? [])
      .map(matchOrPrune)
      .filter((c): c is TreeNode => c !== null);
    if (selfMatch || filteredChildren.length > 0) {
      return { ...n, children: filteredChildren.length ? filteredChildren : n.children };
    }
    return null;
  };
  return nodes.map(matchOrPrune).filter((n): n is TreeNode => n !== null);
}

export function ModelTree({
  wire,
  selection,
  onSelect,
  onGroupSelect,
  onContextAction,
  height = 600,
  className,
}: ModelTreeProps) {
  const [search, setSearch] = React.useState("");

  const rawTree = React.useMemo<TreeNode[]>(() => buildTree(wire), [wire]);
  const tree = React.useMemo(
    () => filterTree(rawTree, search),
    [rawTree, search],
  );

  // Default-Collapsed: kein openByDefault. Nur der Simulator-Root ist initial
  // expanded (id="oid:0"). Bei aktiver Suche alles aufklappen.
  const initialOpenState = React.useMemo<Record<string, boolean>>(() => {
    if (search.trim()) {
      // Bei Suche alle Gruppen aufgeklappt, damit Treffer sichtbar sind.
      const all: Record<string, boolean> = {};
      const walk = (ns: TreeNode[]) => {
        for (const n of ns) {
          all[n.id] = true;
          if (n.children) walk(n.children);
        }
      };
      walk(tree);
      return all;
    }
    return { [`oid:${wire.simulator_oid}`]: true };
  }, [tree, search, wire.simulator_oid]);

  return (
    <div
      data-testid="model-tree"
      className={cn(
        // Style-Guide §2.2: Sidebar-Background = soft-blue (statt pures Weiß).
        "flex h-full flex-col overflow-hidden border-r border-border bg-surface-soft-cyan-2",
        className,
      )}
    >
      <div className="border-b border-border p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Im Modell suchen…"
            className="h-9 pl-9"
          />
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <Tree<TreeNode>
          data={tree}
          // Default-Collapsed: openByDefault=false sorgt dafür dass NUR die
          // im initialOpenState explizit markierten Nodes initial offen sind
          // (= nur der Simulator-Root).
          openByDefault={false}
          initialOpenState={initialOpenState}
          width="100%"
          height={height - 64 /* search bar */}
          indent={18}
          rowHeight={28}
          selection={selection !== null ? `oid:${selection}` : undefined}
          onSelect={(nodes: NodeApi<TreeNode>[]) => {
            const n = nodes[0];
            if (!n) return;
            if (n.data.oid !== undefined) {
              onSelect(n.data.oid);
            } else if (n.data.groupKey && onGroupSelect) {
              onGroupSelect(n.data.groupKey);
            }
          }}
        >
          {(props) => <Row {...props} onContextAction={onContextAction} />}
        </Tree>
      </div>
    </div>
  );
}
