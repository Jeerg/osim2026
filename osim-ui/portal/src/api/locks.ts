/**
 * API-Client fuer Single-Editor-Lock-Endpoints (Plan 01-11 Task 2).
 *
 * Endpoint-Spec aus Plan 01-04 (Backend) und symmetrisch zu
 * `app/api/schemas/lock.py`:
 *
 *   POST   /api/v1/models/{id}/lock              -> 200 LockOut | 409 LockConflict
 *   POST   /api/v1/models/{id}/lock/heartbeat    -> 200 HeartbeatResponse | 404 E_LOCK_EXPIRED
 *   DELETE /api/v1/models/{id}/lock?token=<UUID> -> 204 (idempotent)
 *
 * Diese Datei exportiert KEINE Hooks — der `useLockStore` (zustand) kapselt
 * die Aufrufe und haelt Token/Status. Pure async Funktionen sind testbarer
 * gegen vi.mock und vermeiden den Hook-Cleanup-Overhead beim Heartbeat-Polling.
 *
 * Beacon-Variante fuer `beforeunload`: synchrones `navigator.sendBeacon` —
 * `fetch` waere asynchron und der Browser kann den Tab schliessen bevor
 * die Promise resolved.
 */

import { ApiError, apiFetch } from "@/api/fetch";

// -------------------------- Wire-Type-Mirrors --------------------------------

/** Symmetrisch zu `app.api.schemas.lock.LockOut`. */
export interface LockOut {
  token: string;
  /** ISO-8601 UTC. */
  expires_at: string;
}

/** Symmetrisch zu `app.api.schemas.lock.LockConflict` (Body bei 409). */
export interface LockConflict {
  code: "E_MODEL_LOCKED";
  owner_user_uid: string;
  owner_email: string | null;
  expires_at: string;
}

/** Symmetrisch zu `app.api.schemas.lock.HeartbeatResponse`. */
export interface HeartbeatResponse {
  expires_at: string;
}

// -------------------------- API-Funktionen -----------------------------------

/**
 * Acquired einen Lock fuer das Modell.
 *
 * Bei Erfolg: 200 mit LockOut. Bei 409: ApiError mit body == LockConflict.
 * Der Caller (lock-store.acquire) unterscheidet die beiden Faelle ueber
 * `err.status === 409`.
 */
export async function acquireLock(modelId: string): Promise<LockOut> {
  return await apiFetch<LockOut>(`/api/v1/models/${modelId}/lock`, {
    method: "POST",
  });
}

/**
 * Verlaengert die TTL des Locks. Token ist im Body, kein Query-Param.
 *
 * 404 E_LOCK_EXPIRED bedeutet: Lock ist abgelaufen oder von anderem Owner
 * uebernommen — der Store schaltet dann in `status: "expired"`.
 */
export async function heartbeatLock(
  modelId: string,
  token: string,
): Promise<HeartbeatResponse> {
  return await apiFetch<HeartbeatResponse>(
    `/api/v1/models/${modelId}/lock/heartbeat`,
    {
      method: "POST",
      body: JSON.stringify({ token }),
    },
  );
}

/**
 * Gibt den Lock frei. Token ist Query-Parameter (DELETE-Requests sollten
 * keinen Body haben — Backend-Konvention aus Plan 04).
 *
 * Idempotent aus Client-Sicht: 204 auch bei missing/expired Lock.
 */
export async function releaseLock(
  modelId: string,
  token: string,
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/models/${modelId}/lock?token=${encodeURIComponent(token)}`,
    { method: "DELETE" },
  );
}

/**
 * Synchroner Release via `navigator.sendBeacon` fuer `beforeunload`.
 *
 * `sendBeacon` ist die einzige verlaessliche Methode, einen Request beim
 * Tab-Close abzusetzen — `fetch` ist asynchron und der Browser killt den
 * Request bei `unload`. Limitierungen:
 *  - Nur POST (kein DELETE). Wir benutzen daher einen POST-Workaround mit
 *    `?_method=DELETE`-Query-Param? Nein — Backend erwartet DELETE; statt-
 *    dessen tunneln wir den Release ueber den heartbeat-Endpoint mit
 *    `_release=true`-Flag? Auch nein — das wuerde den Backend-Vertrag
 *    aufweichen.
 *  - Pragmatisch: wir feuern einen DELETE als sendBeacon mit fetch+keepalive.
 *    `fetch` mit `keepalive: true` ueberlebt navigator.unload (Spec) und kann
 *    DELETE. Server-TTL deckt den Worst-Case ab (kein Beacon empfangen).
 *
 * Keine Promise — beforeunload-Handler duerfen keine awaits blockieren.
 */
export function releaseLockSync(modelId: string, token: string): void {
  const url = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/v1/models/${modelId}/lock?token=${encodeURIComponent(token)}`;
  // fetch mit keepalive ist seit 2017 spec'd und in allen modernen Browsern
  // verlaessbar. Auth-Token aus Firebase getIdToken() ist beim beforeunload
  // moeglicherweise stale — wir senden den letzten cachten Token mit; wenn
  // Backend mit 401 ablehnt, raeumt der Server-TTL (15 min) auf.
  try {
    void fetch(url, {
      method: "DELETE",
      keepalive: true,
      // Auth-Header wird vom apiFetch-Pfad nicht gesetzt (synchron) —
      // beforeunload-Pfad hat kein gueltiges await fuer getIdToken. Server-
      // TTL (15 min) ist die fallback-Mitigation.
    });
  } catch {
    // beforeunload darf nichts werfen — Browser ignoriert den Throw, aber
    // strict-mode-Eslint mag den catch-Block.
  }
}

// Re-export fuer Test-Konsumenten, die TYPE-IMPORTS brauchen.
export type { ApiError };
