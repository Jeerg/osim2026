// Plan 01-09 Task 2: Strg+S / Cmd+S Tastenkuerzel fuer Save.
//
// Globaler keydown-Listener (window-Level), der auf Ctrl+S bzw. Cmd+S
// reagiert und event.preventDefault() ruft (verhindert Browser-Default
// "Seite speichern"). Triggert saveModel mit dem aktuellen Store-State,
// sofern hasLock=true und dirty>0.
//
// Wird einmal pro WorkspaceLayout-Instance gemounted (also pro offenem
// Modell — was identisch zu "pro /models/{id}-Route" ist).

import { useEffect, useRef } from "react";
import { useModelStore } from "@/state/model-store";
import { saveModel } from "./use-save-model";

export interface UseSaveShortcutOptions {
  modelId: number | null;
  hasLock: boolean;
  onError?: (err: unknown) => void;
}

export function useSaveShortcut({
  modelId,
  hasLock,
  onError,
}: UseSaveShortcutOptions): void {
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (modelId == null || !hasLock) return;

    function onKeyDown(e: KeyboardEvent) {
      const isSaveKey =
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "s" || e.key === "S");
      if (!isSaveKey) return;
      // Browser-Default "Seite speichern" unterdruecken.
      e.preventDefault();

      const state = useModelStore.getState();
      if (!state.tree || state.version == null) return;
      if (state.saving) return;
      if (state.dirty.size === 0) return;

      saveModel({
        modelId: modelId!,
        tree: state.tree,
        expectedVersion: state.version,
      }).catch((err) => {
        console.warn("[useSaveShortcut] Save fehlgeschlagen:", err);
        onErrorRef.current?.(err);
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modelId, hasLock]);
}
