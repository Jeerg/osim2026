/**
 * useViewerStore — Trägt UI-Zustand des Viewer-Frames (Plan 01-07 Task 3).
 *
 * Bewusst MINIMAL gehalten:
 *  - selection lebt im model-store (siehe model-store.ts Doc-Block).
 *  - viewer-store hat nur `viewerHint` (welche Viewer-Variante: "std" vs.
 *    "design" für PDurchlaufplan, etc.).
 *  - KEIN zundo, KEIN immer — Hint-Änderungen sind keine Modell-Mutationen,
 *    sollen NICHT undobar sein.
 */

import { create } from "zustand";

interface ViewerState {
  viewerHint: string | null;
}

interface ViewerActions {
  setViewerHint: (hint: string | null) => void;
  reset: () => void;
}

export const useViewerStore = create<ViewerState & ViewerActions>((set) => ({
  viewerHint: null,
  setViewerHint: (hint) => set({ viewerHint: hint }),
  reset: () => set({ viewerHint: null }),
}));
