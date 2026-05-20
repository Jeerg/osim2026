// Plan 01-09 Task 2: useLockHeartbeat-Hook.
//
// Schickt alle 60s POST /api/v1/models/{id}/lock/heartbeat. Bei Erfolg:
// nichts tun (Server-TTL wird verschoben). Bei Fehler (401/409): den
// Lock-Store auf "Lock verloren" setzen — die LockBanner-Komponente
// mountet daraufhin den roten Warning-Banner.
//
// CONTEXT D-13: Lock-TTL 900s (15 min) im Backend (Plan 01-03 LOCK_TTL_
// SECONDS). 60s-Heartbeat-Intervall = 14 Heartbeats pro TTL-Periode →
// grosszuegiger Sicherheitspuffer (auch bei kurzfristigen Netzwerk-
// Glitches wird der Lock nicht verloren).

import { useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { ApiError } from "@/api/fetch";
import { useLockStore } from "@/state/lock-store";

const LOCK_HEARTBEAT_INTERVAL_MS = 60_000;

export interface UseLockHeartbeatOptions {
  modelId: number | null;
  /** True wenn der aktuelle User der Lock-Holder ist. */
  hasLock: boolean;
  /** Optional: Override fuer Tests (kuerzeres Intervall). */
  intervalMs?: number;
}

interface LockResponse {
  holder_uid: string;
  holder_email: string;
  acquired_at: string;
  last_heartbeat_at: string;
  expires_at: string;
  is_self: boolean;
}

/**
 * Mounted im WorkspaceLayout, sobald hasLock=true (vom use-tree-loader).
 *
 * Phase 1: 60s-Intervall, single retry-on-fail (= nichts; Lock-Verlust
 * ist UX-relevant, kein Retry-on-Network-Glitch).
 */
export function useLockHeartbeat({
  modelId,
  hasLock,
  intervalMs = LOCK_HEARTBEAT_INTERVAL_MS,
}: UseLockHeartbeatOptions): void {
  // Stable-Ref auf loseLock (kein Re-Setup des Intervals bei Render).
  const loseLockRef = useRef(useLockStore.getState().loseLock);

  useEffect(() => {
    if (modelId == null || !hasLock) return;
    const id = window.setInterval(() => {
      apiClient
        .post<LockResponse>(`/api/v1/models/${modelId}/lock/heartbeat`)
        .catch((err) => {
          // 404 (kein Lock mehr fuer uns) oder 409 (anderer hat Lock) ODER
          // 401 (Auth abgelaufen) → Lock verloren. Andere Errors (5xx,
          // network) → Phase 1: gleiche Reaktion (Banner zeigen).
          if (err instanceof ApiError) {
            console.warn(
              `[useLockHeartbeat] Heartbeat fail (${err.status}):`,
              err.body,
            );
          } else {
            console.warn("[useLockHeartbeat] Heartbeat fail:", err);
          }
          loseLockRef.current();
        });
    }, intervalMs);
    return () => {
      window.clearInterval(id);
    };
  }, [modelId, hasLock, intervalMs]);
}
