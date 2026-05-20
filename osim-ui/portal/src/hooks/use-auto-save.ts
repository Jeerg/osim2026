// Plan 01-09 Task 2: useAutoSave-Hook.
//
// Alle 30s, sofern:
//   - hasLock=true (sonst hat der User keinen Schreib-Anspruch),
//   - dirty.size > 0 (sonst ist nichts zu speichern),
//   - tree != null und version != null,
//   - saving=false (kein laufender Save),
// → wird saveModel aufgerufen (siehe use-save-model.ts).
//
// Fehler werden geloggt aber nicht weiterverbreitet — dirty bleibt
// stehen, der naechste Tick versucht es erneut. Plan-09-Risk:
// Exponential-Backoff wird in Phase 4 nachgezogen, wenn es zu
// nervigen Fehler-Loops kommt.

import { useEffect, useRef } from "react";
import { useModelStore } from "@/state/model-store";
import { saveModel } from "./use-save-model";

const AUTO_SAVE_INTERVAL_MS = 30_000;

export interface UseAutoSaveOptions {
  modelId: number | null;
  /** True wenn der Edit-Lock vom aktuellen User gehalten wird. */
  hasLock: boolean;
  /** Optional: Override fuer Tests (kuerzeres Intervall). */
  intervalMs?: number;
  /** Optional: wird bei Fehlern aufgerufen (z.B. fuer Toast). */
  onError?: (err: unknown) => void;
}

/**
 * Mounted im WorkspaceLayout (oder direkt im /models/{id}-Route).
 *
 * Beim Mount: startet einen Interval-Timer. Bei jedem Tick wird die
 * Save-Bedingung geprueft (siehe oben) und ggf. saveModel aufgerufen.
 *
 * Beim Unmount/hasLock-Wechsel: stoppt den Timer.
 */
export function useAutoSave({
  modelId,
  hasLock,
  intervalMs = AUTO_SAVE_INTERVAL_MS,
  onError,
}: UseAutoSaveOptions): void {
  // onError-Ref, damit Aenderungen den Effect-Cleanup nicht triggern.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (modelId == null || !hasLock) return;
    const id = window.setInterval(() => {
      const state = useModelStore.getState();
      if (state.dirty.size === 0) return;
      if (!state.tree || state.version == null) return;
      if (state.saving) return;
      // Snapshot des Trees zur Save-Zeit. Auch wenn dirty waehrend des
      // Requests veraendert wird (Race), wird der naechste Tick die neuen
      // dirty-Markierungen erfassen.
      const tree = state.tree;
      const version = state.version;
      saveModel({ modelId, tree, expectedVersion: version }).catch((err) => {
        // Log + optional onError; dirty bleibt stehen, naechster Tick
        // versucht es erneut.
        console.warn("[useAutoSave] Save fehlgeschlagen:", err);
        onErrorRef.current?.(err);
      });
    }, intervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [modelId, hasLock, intervalMs]);
}
