/**
 * WorkspaceStatusBar — Footer-Bar im Workspace (Plan 01-11 Task 4).
 *
 * Layout:
 *   [● Ungespeichert | ✓ Gespeichert vor 5s | 🔒 Gesperrt von X]
 *   [Coverage 100% | N Objekte]
 *   [↶ Undo] [↷ Redo] [Speichern]
 *
 * State-Quellen:
 *  - useModelStore → wire, dirty, temporal (Undo/Redo)
 *  - useLockStore  → status, ownerEmail, ownerUid
 *  - useSaveModel  → mutate, isPending (fuer manuellen Save)
 *
 * Pattern: Subscribe via Selektor (keine ganze State-Subscribe — sonst
 * Re-Renders bei jedem patchObject). useShallow wo mehrere Felder gelesen
 * werden.
 */

import * as React from "react";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  LockIcon,
  Redo2Icon,
  SaveIcon,
  ShieldCheckIcon,
  Undo2Icon,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { useSaveModel } from "@/api/models";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLockStore } from "@/stores/lock-store";
import { useModelStore } from "@/stores/model-store";
import { cn } from "@/lib/utils";

export interface WorkspaceStatusBarProps {
  modelId: string;
  className?: string;
}

/**
 * Liefert eine deutsche Kurz-Form fuer "Zeit seit ...": "vor 5 s", "vor 2 min",
 * "vor 1 h", "vor 3 d". Bei Zukunft (negative diff) leerer String.
 */
function formatTimeAgo(date: Date | null, nowMs: number): string {
  if (!date) return "";
  const diffMs = nowMs - date.getTime();
  if (diffMs < 0) return "";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `vor ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `vor ${hr} h`;
  const days = Math.floor(hr / 24);
  return `vor ${days} d`;
}

export function WorkspaceStatusBar({
  modelId,
  className,
}: WorkspaceStatusBarProps) {
  // Model-Store-Slice (shallow): dirty + Objekt-Count fuer Mitte.
  const { dirty, objectCount } = useModelStore(
    useShallow((s) => ({
      dirty: s.dirty,
      objectCount: s.wire ? Object.keys(s.wire.objects).length : 0,
    })),
  );

  // Lock-Store-Slice (shallow).
  const { status, ownerEmail, ownerUid } = useLockStore(
    useShallow((s) => ({
      status: s.status,
      ownerEmail: s.ownerEmail,
      ownerUid: s.ownerUid,
    })),
  );

  // useSaveModel — fuer manuellen Save-Klick.
  const saveMutation = useSaveModel(modelId);

  // Undo/Redo-Counts ueber temporal-State. Wir subscriben via
  // React.useSyncExternalStore an den temporal-Slice, damit Re-Renders bei
  // History-Aenderungen ausgeloest werden und der getState()-Aufruf NICHT
  // mehr direkt im Render-Body steht (eslint react-hooks/purity).
  const temporal = React.useSyncExternalStore(
    useModelStore.temporal.subscribe,
    () => useModelStore.temporal.getState(),
    () => useModelStore.temporal.getState(),
  );
  const canUndo = temporal.pastStates.length > 0;
  const canRedo = temporal.futureStates.length > 0;

  // Last-Save-Time-Tracking: useState + Effect ist hier zwingend, weil
  // useMutation in TanStack-Query KEIN dataUpdatedAt liefert (nur useQuery
  // hat das). saveMutation.isSuccess + saveMutation.data wechselt nach jeder
  // erfolgreichen Mutation; wir capturen den Moment via useEffect.
  // ESLint react-hooks/set-state-in-effect ist hier ein false-positive —
  // wir capturen externen Event-State, kein lokaler-Cascade.
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const saveData = saveMutation.data;
  const saveIsSuccess = saveMutation.isSuccess;
  React.useEffect(() => {
    if (saveIsSuccess && saveData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastSavedAt(new Date());
    }
  }, [saveIsSuccess, saveData]);

  // 10s-Tick fuer "vor X s/min/h"-Update. useSyncExternalStore-Contract:
  // getSnapshot MUSS denselben Wert zurückgeben solange sich der externe
  // State nicht geändert hat — `Date.now()` direkt würde dagegen verstoßen
  // (neuer Wert pro Aufruf) und einen Re-Render-Loop triggern. Wir cachen
  // den Tick in einem Modul-Ref-Wrapper, der nur vom Interval geupdated wird.
  const nowRef = React.useRef(Date.now());
  const subscribe10s = React.useCallback((cb: () => void) => {
    const id = setInterval(() => {
      nowRef.current = Date.now();
      cb();
    }, 10_000);
    return () => clearInterval(id);
  }, []);
  const getNowSnapshot = React.useCallback(() => nowRef.current, []);
  const nowMs = React.useSyncExternalStore(
    subscribe10s,
    getNowSnapshot,
    getNowSnapshot,
  );

  const handleManualSave = () => {
    const wire = useModelStore.getState().wire;
    const token = useLockStore.getState().token;
    if (!wire || !token) return;
    saveMutation.mutate(
      { wire, lock_token: token },
      {
        // dataUpdatedAt wird von TanStack-Query nach onSuccess gesetzt;
        // lastSavedAt-Anzeige kommt daraus (useMemo oben). Wir muessen hier
        // nur dirty zuruecksetzen.
        onSuccess: () => {
          useModelStore.getState().resetDirty();
        },
      },
    );
  };

  const ownerLabel = ownerEmail ?? (ownerUid ? `Nutzer ${ownerUid.slice(0, 8)}` : "anderem Nutzer");

  return (
    <footer
      data-testid="workspace-status-bar"
      className={cn(
        "flex h-10 shrink-0 items-center justify-between border-t border-border bg-card px-4 text-xs",
        className,
      )}
    >
      {/* LINKS: Save + Lock */}
      <div className="flex items-center gap-4">
        {dirty ? (
          <span
            className="flex items-center gap-1.5 font-medium text-amber-600"
            data-testid="status-dirty"
          >
            <CircleDashedIcon className="h-3.5 w-3.5" />
            Ungespeichert
          </span>
        ) : (
          <span
            className="flex items-center gap-1.5 text-surface-500"
            data-testid="status-saved"
          >
            <CheckCircle2Icon className="h-3.5 w-3.5 text-emerald-500" />
            Gespeichert
            {lastSavedAt && (
              <span className="text-surface-400">
                · {formatTimeAgo(lastSavedAt, nowMs)}
              </span>
            )}
          </span>
        )}
        <div className="h-4 w-px bg-border" />
        {status === "foreign" && (
          <span
            className="flex items-center gap-1.5 font-medium text-destructive"
            data-testid="status-lock-foreign"
          >
            <LockIcon className="h-3.5 w-3.5" />
            Gesperrt von {ownerLabel}
          </span>
        )}
        {status === "expired" && (
          <span
            className="flex items-center gap-1.5 font-medium text-destructive"
            data-testid="status-lock-expired"
          >
            <LockIcon className="h-3.5 w-3.5" />
            Lock abgelaufen
          </span>
        )}
        {status === "own" && (
          <span
            className="flex items-center gap-1.5 text-emerald-600"
            data-testid="status-lock-own"
          >
            <ShieldCheckIcon className="h-3.5 w-3.5" />
            Sperre aktiv
          </span>
        )}
      </div>

      {/* MITTE: Objekt-Count */}
      <div
        className="text-surface-500 tabular-nums"
        data-testid="status-objects"
      >
        {objectCount > 0 && `${objectCount.toLocaleString("de-DE")} Objekte`}
      </div>

      {/* RECHTS: Undo / Redo / Speichern */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Rückgängig"
              disabled={!canUndo}
              onClick={() => useModelStore.temporal.getState().undo()}
              data-testid="status-undo"
              className="h-8 w-8 text-surface-600 hover:bg-surface-100 hover:text-surface-900"
            >
              <Undo2Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Rückgängig (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Wiederherstellen"
              disabled={!canRedo}
              onClick={() => useModelStore.temporal.getState().redo()}
              data-testid="status-redo"
              className="h-8 w-8 text-surface-600 hover:bg-surface-100 hover:text-surface-900"
            >
              <Redo2Icon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Wiederherstellen (Ctrl+Y)</TooltipContent>
        </Tooltip>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          size="sm"
          disabled={!dirty || status !== "own" || saveMutation.isPending}
          onClick={handleManualSave}
          data-testid="status-save-button"
          className="h-8 gap-1.5"
        >
          <SaveIcon className="h-3.5 w-3.5" />
          {saveMutation.isPending ? "Speichert…" : "Speichern"}
        </Button>
      </div>
    </footer>
  );
}
