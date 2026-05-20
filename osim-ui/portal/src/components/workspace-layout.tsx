// Plan 01-05 Task 1: WorkspaceLayout — Split-Pane Sidebar + ViewerHost.
//
// Top-Bar: Modell-Name + DirtyIndicator + Lock-Status-Badge + Undo/Redo +
//          "Speichern"-Button (Stub — Plan 09 verdrahtet den Save-Pfad).
// Sidebar: <SidebarTree /> (resizable Breite, default 320px).
// Main:    <ViewerHost frame={frame} /> mit memoized ViewerFrame.
//
// Reaktion auf selectedOid:
//   useEffect mit dependency = [selectedOid, tree] — sucht den Node ueber
//   den oid-Index aus dem store und ruft frame.setObj(node).

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useModelStore, selectByOid } from "@/state/model-store";
import { useLockStore } from "@/state/lock-store";
import { SidebarTree } from "./sidebar-tree";
import { DirtyIndicator } from "./dirty-indicator";
import { SaveButton } from "./save-button";
import { LockBanner } from "./lock-banner";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useLockHeartbeat } from "@/hooks/use-lock-heartbeat";
import { useSaveShortcut } from "@/hooks/use-save-shortcut";
import { useSnapshotSubscriber } from "@/hooks/use-snapshot-subscriber";
import { ViewerFrame } from "@/viewers/core/ViewerFrame";
import { ViewerHost } from "@/viewers/core/ViewerHost";
import { getDefaultProperties } from "@/viewers/property";
import {
  getSyntheticNode,
  isSyntheticOid,
  subscribeSyntheticProps,
} from "@/viewers/matrix/synthetic-nodes";
import {
  hydrateOverridesForModel,
  setActiveModelId,
} from "@/viewers/design/position-store";
import type { LockHolderInfo } from "@/hooks/use-tree-loader";

export interface WorkspaceLayoutProps {
  modelName: string;
  /** Modell-ID (Plan 01-09: fuer Save/Heartbeat/Snapshot-Persistenz). */
  modelId: number;
  /** Aktueller Lock-Modus (aus use-tree-loader). */
  mode: "loading" | "editing" | "read-only" | "error";
  /** Bei mode="read-only": Wer haelt den Lock. */
  lockHolder?: LockHolderInfo | null;
  /** Backend-Version (fuer Anzeige). */
  version?: number | null;
}

const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;

export function WorkspaceLayout({
  modelName,
  modelId,
  mode,
  lockHolder,
  version,
}: WorkspaceLayoutProps) {
  const tree = useModelStore((s) => s.tree);
  const selectedOid = useModelStore((s) => s.selectedOid);
  const undo = useModelStore((s) => s.undo);
  const redo = useModelStore((s) => s.redo);
  const undoCount = useModelStore((s) => s.undoStack.length);
  const redoCount = useModelStore((s) => s.redoStack.length);
  const hasLock = mode === "editing";

  // Plan 01-09: LockStore-Sync — wir spiegeln den use-tree-loader-Modus
  // in den useLockStore, damit der LockBanner und der Heartbeat-Hook
  // dieselbe Wahrheit haben.
  useEffect(() => {
    const ls = useLockStore.getState();
    if (mode === "editing") {
      ls.acquireLock();
    } else if (mode === "read-only" && lockHolder?.holder_email) {
      ls.reportOtherHolder(lockHolder.holder_email);
    } else if (mode === "read-only") {
      ls.reportOtherHolder("unbekannt");
    }
    return () => {
      // reset beim Unmount, damit ein anderer Workspace nicht falschen
      // Zustand erbt.
      useLockStore.getState().reset();
    };
  }, [mode, lockHolder]);

  // Plan 01-09: Save-/Heartbeat-/Snapshot-/Position-Hooks mounten.
  // Hooks sind no-op solange hasLock=false (siehe jeweilige
  // Implementierungen).
  useAutoSave({ modelId, hasLock });
  useLockHeartbeat({ modelId, hasLock });
  useSaveShortcut({ modelId, hasLock });
  useSnapshotSubscriber(modelId);

  // Plan 01-09: Position-Overrides-Hydration. Wir setzen erst den
  // aktiven Modell-Kontext (damit setNodePositionOverride spaeter weiss,
  // wo es persistieren soll) und laden dann die persistierten Overrides
  // aus IDB nach In-Memory.
  useEffect(() => {
    setActiveModelId(modelId);
    void hydrateOverridesForModel(modelId);
    return () => {
      setActiveModelId(null);
    };
  }, [modelId]);

  // ViewerFrame ist eine TS-Klasse; pro Layout-Instance EINE Frame.
  const frame = useMemo(() => new ViewerFrame(modelName), [modelName]);

  // Wenn Tree initial geladen ist und nichts selektiert -> Root auswaehlen.
  useEffect(() => {
    if (tree && selectedOid == null) {
      useModelStore.getState().selectOid(tree.oid);
    }
  }, [tree, selectedOid]);

  // Plan 01-06: Synthetic-Property-Tick — re-rendert wenn der modul-lokale
  // synthetische Property-Store sich aendert (Matrix-Cell-Edits). Triggert
  // den nachfolgenden useEffect, der ein frische synthetischen Node
  // konstruiert und an frame.setObj weiterreicht.
  const [synthTick, bumpSynthTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeSyntheticProps(bumpSynthTick), []);

  // selectedOid -> frame.setObj.
  // Plan 01-06: Wenn selectedOid eine synthetische Matrix-OID ist, holt
  // sich der Lookup den synthetischen Wrapper-Node aus
  // viewers/matrix/synthetic-nodes (ViewerHost mountet dann den
  // RESS_*_GROUP-Viewer).
  useEffect(() => {
    if (!tree) return;
    if (selectedOid == null) {
      frame.setObj(null);
      return;
    }
    if (isSyntheticOid(selectedOid)) {
      const synth = getSyntheticNode(selectedOid);
      frame.setObj(synth);
      return;
    }
    const node = selectByOid(useModelStore.getState(), selectedOid);
    frame.setObj(node);
  }, [tree, selectedOid, frame, synthTick]);

  // Resizable Sidebar — drag auf Separator-Bar.
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  function onResizeStart(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startW: sidebarWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeEnd);
  }
  function onResizeMove(e: MouseEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, drag.startW + (e.clientX - drag.startX)),
    );
    setSidebarWidth(next);
  }
  function onResizeEnd() {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", onResizeEnd);
  }
  // Cleanup falls Component unmounted waehrend Drag:
  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeEnd);
    };
    // onResizeMove/End sind stabil ueber den Closure-Scope — die Listener
    // verwenden current state ueber dragRef + setState. Wir disablen die
    // exhaustive-deps-Warnung weil das Pattern gewollt ist (single setup
    // ueber den ganzen component-lifetime).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockBadge =
    mode === "editing" ? (
      <span
        className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
        data-testid="lock-badge-editing"
      >
        Sie bearbeiten
      </span>
    ) : mode === "read-only" ? (
      <span
        className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
        data-testid="lock-badge-readonly"
        title={
          lockHolder
            ? `Lock-Holder: ${lockHolder.holder_email} (Ablauf: ${lockHolder.expires_at})`
            : undefined
        }
      >
        Read-Only{" "}
        {lockHolder && <>– {lockHolder.holder_email}</>}
      </span>
    ) : mode === "loading" ? (
      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
        Laedt…
      </span>
    ) : (
      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
        Fehler
      </span>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-semibold text-gray-800"
            data-testid="workspace-model-name"
          >
            {modelName}
          </span>
          {version !== null && version !== undefined && (
            <span className="text-xs text-gray-500">v{version}</span>
          )}
          {lockBadge}
          <DirtyIndicator />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={undo}
            disabled={undoCount === 0}
            className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="workspace-undo"
          >
            Rueckgaengig ({undoCount})
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={redoCount === 0}
            className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="workspace-redo"
          >
            Wiederherstellen ({redoCount})
          </button>
          <SaveButton modelId={modelId} hasLock={hasLock} />
        </div>
      </div>
      <LockBanner />
      <div className="flex flex-1 overflow-hidden">
        <aside
          style={{ width: sidebarWidth }}
          className="border-r border-gray-200 bg-white"
          data-testid="workspace-sidebar"
        >
          <SidebarTree />
        </aside>
        <div
          onMouseDown={onResizeStart}
          className="w-1 cursor-col-resize bg-gray-200 hover:bg-blue-300"
          data-testid="workspace-resizer"
        />
        <main
          className="flex-1 overflow-auto bg-gray-50"
          data-testid="workspace-main"
        >
          <ViewerHost
            frame={frame}
            methodDispatcher={{ getDefaultProperties }}
          />
        </main>
      </div>
    </div>
  );
}
