/**
 * useLockHeartbeat — Lock-Lifecycle-Hook (Plan 01-11 Task 3).
 *
 * Verantwortung:
 *  1. On mount: `useLockStore.acquire(modelId)`.
 *  2. setInterval(30000): `useLockStore.heartbeat()`.
 *  3. On unmount: `useLockStore.release()`.
 *  4. window.addEventListener("beforeunload"): `releaseLockSync` via
 *     keepalive-fetch — synchroner Pfad fuer Tab-Close (asynchrones
 *     `release()` wuerde vom Browser gekillt).
 *
 * Heartbeat-Intervall (30 s) ist deutlich kuerzer als die Backend-TTL
 * (60 s; siehe app/services/lock_service.py). Damit ueberlebt der Lock auch
 * einen verpassten Tick (z.B. Tab-Tausch).
 *
 * Tab-Visibility-Pause:
 *  - Phase 1 ignoriert visibility-Aenderungen — der Heartbeat tickt immer,
 *    auch wenn der Tab im Hintergrund ist. setInterval-Throttling in modernen
 *    Browsern (~1 min im hidden-tab) ist nicht kuerzer als die TTL; Worst-Case
 *    ist Lock-Verlust waehrend laengerer Hintergrund-Sessions, was D-13's
 *    "15 min Max-Inaktivitaet" gerade abdeckt.
 */

import { useEffect } from "react";

import { releaseLockSync } from "@/api/locks";
import { useLockStore } from "@/stores/lock-store";

/** Heartbeat-Intervall: 30 s (Backend-TTL ist 60 s). */
const HEARTBEAT_INTERVAL_MS = 30_000;

export function useLockHeartbeat(modelId: string): void {
  useEffect(() => {
    let cancelled = false;
    // 1. acquire on mount.
    void useLockStore
      .getState()
      .acquire(modelId)
      .then(() => {
        // No-op — Result wird in den Store geschrieben; UI liest via
        // useLockStore-Selector.
      });

    // 2. Heartbeat-Interval. Wir lesen den Store-State BEI JEDEM Tick frisch
    // — sonst captured der Effekt einen stale-Token.
    const intervalId = setInterval(() => {
      if (cancelled) return;
      void useLockStore.getState().heartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // 3. beforeunload: synchroner Release via keepalive-fetch.
    const handleBeforeUnload = () => {
      const { modelId: mid, token } = useLockStore.getState();
      if (mid && token) {
        releaseLockSync(mid, token);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Cleanup: clear interval, listener entfernen, async release (best-effort).
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Async release ist beim Route-Unmount erlaubt (kein Tab-Close); kein
      // await — wir lassen die Promise im Hintergrund laufen.
      void useLockStore.getState().release();
    };
  }, [modelId]);
}
