/**
 * Route: /models/$id — Workspace (Plan 1.1 Redesign).
 *
 * Layout: vertikal `[Header][Body][StatusBar]`. Body ist 2-Spalten-Grid
 * `[Sidebar][Viewer]`. Sidebar enthält das ModelTree mit Suche und
 * Context-Menu. Viewer-Pane hat Toolbar oben (mit Std/Design-Toggle für
 * Durchlaufpläne) und das ViewerFrame darunter.
 *
 * GraphView-Reachability: bei Selektion eines PDurchlaufplan wird der
 * viewerHint automatisch auf "design" gesetzt — der Graph-Editor öffnet
 * sich also direkt. Wechsel zu "Standard"-Property-Editor via Toggle.
 *
 * Welle G13 (Reload-Bug-Fix): Selection und viewerHint werden in den
 * URL-Search-Params `?selection=<oid>&hint=<name>` gespiegelt, damit
 * F5/Reload den Graph-Editor mit dem selben Plan wiederherstellt. Ohne
 * diese Persistenz wirft `loadFromWire` die Selektion auf den Simulator-
 * Root zurück und der User sieht im Hauptbereich den PSimulatorViewer
 * statt seinen Durchlaufplan — der "Knoten verschwunden"-Effekt.
 */

import { useCallback, useEffect } from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import {
  ChevronRightIcon,
  FileBoxIcon,
  HomeIcon,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { apiErrorMessage } from "@/api/error-message";
import { useModel } from "@/api/models";
import { useSchemas } from "@/api/schemas";
import { ModelTree, type TreeContextAction } from "@/sidebar/ModelTree";
import { useModelStore } from "@/stores/model-store";
import { useLockStore } from "@/stores/lock-store";
import { useViewerStore } from "@/stores/viewer-store";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useLockHeartbeat } from "@/hooks/useLockHeartbeat";
import { useSnapshotRestore } from "@/hooks/useSnapshotRestore";
import { ViewerFrame } from "@/viewers/core/ViewerFrame";
import { ViewerHintSwitcher } from "@/components/ViewerHintSwitcher";
import { WorkspaceStatusBar } from "@/components/WorkspaceStatusBar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  AttrValue,
  ClassSchema,
  ViewerCommand,
} from "@/viewers/core/types";
// Side-Effect-Import: registriert PGObjBaseStub als Registry-Fallback.
import "@/viewers/setup";

/**
 * Welle G13: Search-Params für Workspace-State, der F5 überleben muss.
 *
 * - `selection`: OID des aktuell selektierten Objekts (Number; URL-encoded
 *   als String). Default = Simulator-Root via `wire.simulator_oid` nach
 *   Server-Load.
 * - `hint`: Viewer-Variante ("design", "std", "matrix"). Default = null;
 *   wird durch `handleSelectionChange` automatisch gesetzt.
 *
 * Beide werden bei jeder Selektions-/Hint-Änderung via
 * `navigate({ replace: true })` in die URL geschrieben — kein History-
 * Push, damit der Back-Button nicht zur OID-Granularität degeneriert.
 */
interface WorkspaceSearch {
  selection?: number;
  hint?: string;
}

function parseWorkspaceSearch(search: Record<string, unknown>): WorkspaceSearch {
  const result: WorkspaceSearch = {};
  if (typeof search.selection === "number" && Number.isFinite(search.selection)) {
    result.selection = search.selection;
  } else if (typeof search.selection === "string") {
    const n = Number(search.selection);
    if (Number.isFinite(n)) result.selection = n;
  }
  if (typeof search.hint === "string" && search.hint.length > 0) {
    result.hint = search.hint;
  }
  return result;
}

export const Route = createFileRoute("/_authenticated/models/$id")({
  validateSearch: parseWorkspaceSearch,
  component: ModelWorkspace,
});

function ModelWorkspace() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data, isLoading, error } = useModel(id);
  const { data: schemasData } = useSchemas();

  const { selection, loadedModelId, storeWire } = useModelStore(
    useShallow((s) => ({
      selection: s.selection,
      loadedModelId: s.modelId,
      storeWire: s.wire,
    })),
  );
  const viewerHint = useViewerStore((s) => s.viewerHint);
  const lockStatus = useLockStore((s) => s.status);

  useLockHeartbeat(id);
  useAutoSave(id);
  const { dialogVisible, restore, discard } = useSnapshotRestore(
    id,
    data?.wire,
  );

  // Welle G13: Server-Wire laden → loadFromWire bekommt search.selection
  // ATOMAR mit dem Wire, damit kein Zwischen-State mit selection=
  // simulator_oid entsteht (sonst überschreibt ModelTree's onSelect-Mount-
  // Callback die URL via syncUrlState → wir würden ?selection=385 mit
  // ?selection=0 überschrieben verlieren).
  //
  // Welle G15 (Bug 1+4 zusammen):
  // - sessionStorage-Backup falls die URL keine search-Params trägt (Tab
  //   wurde vor Welle G13 geöffnet, geteilter Link ohne ?selection, oder
  //   externes Navigations-Ziel). sessionStorage überlebt F5 wie URL, ist
  //   aber tab-lokal — kein Cross-Tab-Leak. Pro modelId eigener Key.
  // - useEffect-Trigger nur beim ERSTEN Wire-Load (wenn loadedModelId !== id
  //   beim Effekt-Start). Spätere Wire-Refetches (TanStack-Query
  //   refetchOnWindowFocus / invalidateQueries nach save) übernehmen den
  //   neuen Wire, OHNE Selection oder ViewerHint zu resetten — sonst
  //   verschwindet der Graph "nach einiger Zeit" (Bug 4: Auto-Save → save
  //   → invalidateQueries → refetch → useEffect rief loadFromWire mit
  //   reset auf simulator_oid wenn search.selection inzwischen aus der
  //   URL verloren).
  useEffect(() => {
    if (!data?.wire || !id) return;
    const wasInitialLoad = useModelStore.getState().modelId !== id;
    if (wasInitialLoad) {
      // Initial-Load: URL-Search-Params primär, sessionStorage als Backup.
      const sessionKey = `osim-ui:ws:${id}`;
      let restoredSel: number | undefined;
      let restoredHint: string | undefined;
      if (search.selection !== undefined && data.wire.objects[search.selection]) {
        restoredSel = search.selection;
      } else {
        try {
          const raw = sessionStorage.getItem(sessionKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { selection?: number; hint?: string };
            if (
              typeof parsed.selection === "number" &&
              data.wire.objects[parsed.selection] !== undefined
            ) {
              restoredSel = parsed.selection;
              restoredHint = parsed.hint;
              // URL nachziehen, damit der Link teilbar/bookmarkbar wird.
              void navigate({
                to: "/models/$id",
                params: { id },
                search: { selection: restoredSel, hint: restoredHint },
                replace: true,
              });
            }
          }
        } catch {
          // Defensive: kein sessionStorage (private browsing), kein JSON parse.
        }
      }
      useModelStore.getState().loadFromWire(id, data.wire, restoredSel);
      useModelStore.temporal.getState().clear();
      const effectiveHint = search.hint ?? restoredHint;
      if (effectiveHint) {
        useViewerStore.getState().setViewerHint(effectiveHint);
      }
    } else {
      // Refetch-Pfad: Wire updaten OHNE selection/hint zu resetten. Die
      // Store-Action selectObject(current) ist no-op-äquivalent — wir
      // setzen wire direkt via Zustand's setState (Immer-bypass).
      const currentSelection = useModelStore.getState().selection;
      useModelStore.getState().loadFromWire(id, data.wire, currentSelection);
      // KEIN temporal.clear() — Undo-History bleibt erhalten.
    }
    // search.selection / search.hint absichtlich NICHT in deps: sie sollen
    // nur beim initialen Wire-Load greifen, nicht bei jeder URL-Mutation
    // (sonst Endlos-Loop mit den navigate()-Calls in den Handlern unten).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.wire, id]);

  useEffect(() => {
    return () => {
      useModelStore.getState().clear();
      useModelStore.temporal.getState().clear();
      useViewerStore.getState().reset();
    };
  }, []);

  /**
   * Welle G13: URL-Mirror für Selection + Hint. Nutzt replace=true, damit
   * der Browser-History-Stack nicht mit Selektions-Granularität geflutet wird.
   * Wird in handleSelectionChange + handleContextAction + handleGroupSelect +
   * dem ViewerHintSwitcher-onChange aufgerufen.
   */
  const syncUrlState = useCallback(
    (next: { selection?: number | null; hint?: string | null }) => {
      void navigate({
        to: "/models/$id",
        params: { id },
        search: (prev) => {
          const cur = prev as WorkspaceSearch;
          const out: WorkspaceSearch = { ...cur };
          if ("selection" in next) {
            if (next.selection === null || next.selection === undefined) {
              delete out.selection;
            } else {
              out.selection = next.selection;
            }
          }
          if ("hint" in next) {
            if (!next.hint) {
              delete out.hint;
            } else {
              out.hint = next.hint;
            }
          }
          // Welle G15: sessionStorage-Backup (für Tabs ohne URL-Params, z.B.
          // direkter Link-Hit oder vor Welle G13 geöffnete Tabs).
          try {
            sessionStorage.setItem(`osim-ui:ws:${id}`, JSON.stringify(out));
          } catch {
            // Defensive: kein sessionStorage verfügbar.
          }
          return out;
        },
        replace: true,
      });
    },
    [navigate, id],
  );

  const getSchemaFor = useCallback(
    (klass: string): ClassSchema | null => {
      if (!schemasData) return null;
      return schemasData.schemas.find((s) => s.klass === klass) ?? null;
    },
    [schemasData],
  );

  /**
   * Selektion ändert sich → ggf. viewerHint automatisch anpassen:
   * Durchlaufplan defaultet auf "design" (Graph-Editor), sonst auf "std".
   * Welle G13: zusätzlich URL-State spiegeln (Reload-Persistenz).
   */
  const handleSelectionChange = useCallback(
    (oid: number | null) => {
      useModelStore.getState().selectObject(oid);
      if (oid === null) {
        syncUrlState({ selection: null });
        return;
      }
      const wire = useModelStore.getState().wire ?? data?.wire;
      if (!wire) {
        syncUrlState({ selection: oid });
        return;
      }
      const obj = wire.objects[oid];
      if (!obj) {
        syncUrlState({ selection: oid });
        return;
      }
      const schema = getSchemaFor(obj.klass);
      const hints = schema?.viewer_hints ?? [];
      let nextHint: string | null | undefined;
      if (obj.klass.startsWith("PDurchlaufplan") && hints.includes("design")) {
        useViewerStore.getState().setViewerHint("design");
        nextHint = "design";
      } else if (obj.klass === "PEinsatzzeitTag" && hints.includes("einsatzzeit")) {
        // Schicht im Tree angeklickt → Arbeitszeit-Matrix (mit dieser Schicht
        // aktiv), direkt modellierbar statt nur Property-Editor.
        useViewerStore.getState().setViewerHint("einsatzzeit");
        nextHint = "einsatzzeit";
      } else if (hints.length > 0 && viewerHint && !hints.includes(viewerHint)) {
        useViewerStore.getState().setViewerHint(hints[0]);
        nextHint = hints[0];
      }
      syncUrlState({ selection: oid, ...(nextHint !== undefined ? { hint: nextHint } : {}) });
    },
    [data?.wire, getSchemaFor, viewerHint, syncUrlState],
  );

  const handleGroupSelect = useCallback(
    (groupKey: string) => {
      const groupMap: Record<string, { klass: string; hint: string }> = {
        Belegungsressourcen: { klass: "PBetriebsmittel", hint: "matrix" },
        Mengenressourcen: { klass: "PRessMenge", hint: "matrix" },
        // Arbeitszeiten: Simulator-Viewer (Ressourcen × Tage). Der Sim-Root
        // trägt im Wire die Klasse "ASimulator".
        Arbeitszeiten: { klass: "ASimulator", hint: "einsatzzeit" },
      };
      const cfg = groupMap[groupKey];
      if (!cfg) return;
      const wire = useModelStore.getState().wire ?? data?.wire;
      if (!wire) return;
      const first = Object.values(wire.objects).find(
        (o) => o.klass === cfg.klass,
      );
      useViewerStore.getState().setViewerHint(cfg.hint);
      if (first) useModelStore.getState().selectObject(first.oid);
      syncUrlState({ selection: first?.oid ?? null, hint: cfg.hint });
    },
    [data?.wire, syncUrlState],
  );

  const handleContextAction = useCallback(
    (action: TreeContextAction) => {
      switch (action.type) {
        case "open-design":
          useModelStore.getState().selectObject(action.oid);
          useViewerStore.getState().setViewerHint("design");
          syncUrlState({ selection: action.oid, hint: "design" });
          break;
        case "open-properties":
          useModelStore.getState().selectObject(action.oid);
          useViewerStore.getState().setViewerHint("std");
          syncUrlState({ selection: action.oid, hint: "std" });
          break;
        case "set-hint":
          useModelStore.getState().selectObject(action.oid);
          useViewerStore.getState().setViewerHint(action.hint);
          syncUrlState({ selection: action.oid, hint: action.hint });
          break;
        case "delete":
          useModelStore.getState().deleteObject(action.oid);
          break;
      }
    },
    [syncUrlState],
  );

  const handlePatch = useCallback(
    (oid: number, patch: Record<string, AttrValue>) => {
      useModelStore.getState().patchObject(oid, patch);
    },
    [],
  );

  const handleCommand = useCallback((cmd: ViewerCommand) => {
    switch (cmd.type) {
      case "navigate": {
        // Welle 10 D-1.1-12: Geschwister-Navigation innerhalb derselben
        // Wire-Klasse. first/prev/next/last suchen das relevante Objekt
        // anhand der OID-Sequenz aller Objekte mit gleichem klass.
        const store = useModelStore.getState();
        const w = store.wire;
        if (!w) break;
        const currentOid = store.selection;
        if (currentOid === null) break;
        const current = w.objects[currentOid];
        if (!current) break;
        const siblings = Object.values(w.objects)
          .filter((o) => o.klass === current.klass)
          .map((o) => o.oid)
          .sort((a, b) => a - b);
        const idx = siblings.indexOf(currentOid);
        let nextIdx = idx;
        switch (cmd.direction) {
          case "first":
            nextIdx = 0;
            break;
          case "last":
            nextIdx = siblings.length - 1;
            break;
          case "prev":
            nextIdx = Math.max(0, idx - 1);
            break;
          case "next":
            nextIdx = Math.min(siblings.length - 1, idx + 1);
            break;
        }
        if (nextIdx >= 0 && nextIdx < siblings.length) {
          store.selectObject(siblings[nextIdx]);
        }
        break;
      }
      case "create":
        if (cmd.objKlass) {
          const newOid = useModelStore
            .getState()
            .createObject(cmd.objKlass, {});
          useModelStore.getState().selectObject(newOid);
        }
        break;
      case "delete":
        useModelStore.getState().deleteObject(cmd.oid);
        break;
      case "reset":
        // Welle 10 D-1.1-12: Reset zum letzten Server-Stand via Undo
        useModelStore.temporal.getState().undo();
        break;
      case "open-sub-viewer":
        useModelStore.getState().selectObject(cmd.oid);
        break;
      case "method":
      case "sub_refs_update":
        break;
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
        <div className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        Lade Modell …
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Fehler beim Laden des Modells:{" "}
        {apiErrorMessage(error, "Modell konnte nicht geladen werden")}
      </div>
    );
  }

  if (!data?.wire) {
    return (
      <div className="m-6 text-sm text-muted-foreground">
        Kein Modell gefunden.
      </div>
    );
  }

  // Welle G13: Render-Guard — warte bis der Store den frisch geladenen Wire
  // hat (loadedModelId === id), sonst mountet ModelTree mit der Default-
  // Selection (wire.simulator_oid) und react-arborist feuert seinen Mount-
  // onSelect-Callback, der via handleSelectionChange → syncUrlState die URL-
  // Search-Params überschreibt und den Reload-Restore-Pfad zerstört. Der
  // useEffect oben (Z.~125) führt den loadFromWire-Call im nächsten Tick aus.
  if (loadedModelId !== id) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
        <div className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        Lade Modell …
      </div>
    );
  }

  const wire = loadedModelId === id && storeWire ? storeWire : data.wire;
  const effectiveSelection =
    loadedModelId === id && selection !== null
      ? selection
      : wire.simulator_oid;

  const currentObj = wire.objects[effectiveSelection];
  const currentSchema = currentObj ? getSchemaFor(currentObj.klass) : null;
  const availableHints = currentSchema?.viewer_hints ?? [];

  // Welle G19-C: Lock ist temporär SOFT WARNING, nicht UI-HARDBLOCK.
  // Vorher blockierte `disabled = lockStatus !== "own"` ALLE Interaktionen
  // (Drag, Connect, Select) sobald der Lock-Heartbeat 1x fehlschlug oder
  // beim Initial-Mount noch nicht resolved war — User sah "nur Pan
  // funktioniert". Lock-Konflikte sind in Phase 1 zudem extrem selten
  // (Single-User-Tenants), der Hardblock ist Premature-Pessimismus.
  // Heartbeat-Hook bleibt aktiv (zeigt Status in der WorkspaceStatusBar),
  // aber blockiert keine Edits. Hardblock kommt zurück sobald Multi-User-
  // Tests das wirklich brauchen.
  const disabled = false;
  void lockStatus; // reserviert für künftige Statusbar-Anzeige
  const modelName = data.model.name;

  return (
    <>
      <div
        data-testid="model-workspace"
        className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden bg-background"
      >
        {/* ============== Breadcrumb-Header ============== */}
        <header className="flex h-12 items-center justify-between gap-3 border-b border-border bg-card px-5">
          <nav className="flex items-center gap-1.5 text-sm">
            <Link
              to="/models"
              className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-surface-500 hover:bg-surface-100 hover:text-surface-900"
            >
              <HomeIcon className="h-3.5 w-3.5" />
              Modelle
            </Link>
            <ChevronRightIcon className="h-3.5 w-3.5 text-surface-400" />
            <span className="flex items-center gap-1.5 text-surface-900">
              <FileBoxIcon className="h-3.5 w-3.5 text-brand-500" />
              <span className="max-w-[40ch] truncate font-medium">
                {modelName}
              </span>
            </span>
            {currentObj && (
              <>
                <ChevronRightIcon className="h-3.5 w-3.5 text-surface-400" />
                <span className="max-w-[30ch] truncate text-surface-600">
                  {(typeof currentObj.attrs.m_sName === "string" &&
                    currentObj.attrs.m_sName) ||
                    (typeof currentObj.attrs.m_name === "string" &&
                      currentObj.attrs.m_name) ||
                    `${currentObj.klass} #${currentObj.oid}`}
                </span>
              </>
            )}
          </nav>
          {availableHints.length > 1 && (
            <ViewerHintSwitcher
              availableHints={availableHints}
              currentHint={viewerHint}
              onHintChange={(h) => {
                useViewerStore.getState().setViewerHint(h);
                syncUrlState({ hint: h });
              }}
            />
          )}
        </header>

        {/* ============== Body ============== */}
        <div className="grid grid-cols-[300px_1fr] overflow-hidden">
          <ModelTree
            wire={wire}
            selection={effectiveSelection}
            onSelect={handleSelectionChange}
            onGroupSelect={handleGroupSelect}
            onContextAction={handleContextAction}
            height={window.innerHeight - 56 - 48 - 36 /* header + bread + status */}
          />
          <div className="flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <ViewerFrame
                selection={effectiveSelection}
                objects={wire.objects}
                getSchemaFor={getSchemaFor}
                onSelectionChange={handleSelectionChange}
                onPatch={handlePatch}
                onCommand={handleCommand}
                viewerHint={viewerHint ?? undefined}
                disabled={disabled}
              />
            </div>
          </div>
        </div>

        {/* ============== StatusBar ============== */}
        <WorkspaceStatusBar modelId={id} />
      </div>

      {/* Snapshot-Restore-Dialog (Crash-Recovery) */}
      <Dialog open={dialogVisible}>
        <DialogContent
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Ungespeicherte Änderungen gefunden</DialogTitle>
            <DialogDescription>
              Es existieren lokale Änderungen aus einer früheren Sitzung, die
              nicht an den Server gesendet wurden. Möchten Sie diese
              wiederherstellen oder verwerfen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={discard}>
              Verwerfen
            </Button>
            <Button onClick={restore}>Wiederherstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Silence cn-unused warning in some pruned codepaths.
void cn;
