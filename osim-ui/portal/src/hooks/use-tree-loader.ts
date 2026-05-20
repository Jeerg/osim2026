// Plan 01-05 Task 1: Tree-Loader-Hook (Read-Path-Orchestrator).
//
// Verbindet useModelTreeQuery + useModelStore + Lock-Acquire-Logik.
// Read-Path-Verantwortung:
//   1. Tree vom Backend laden (useModelTreeQuery).
//   2. Wenn geladen -> setTree() im model-store schreiben.
//   3. Lock-Acquire-Attempt beim Mount; bei 409 in "read-only"-Modus
//      wechseln und die Lock-Holder-Info ausliefern.
//   4. Lock-Heartbeat alle 60s (POST /lock/heartbeat) waehrend edit-mode.
//   5. Beim Unmount: Lock release (DELETE /lock) wenn wir der Holder sind.
//
// Der Write-Path (PUT /tree, Save-Trigger) kommt in Plan 09.

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/api/client";
import { ApiError } from "@/api/fetch";
import { useModelStore } from "@/state/model-store";
import { useModelTreeQuery } from "./use-model-tree-query";

const HEARTBEAT_INTERVAL_MS = 60_000;

export type EditMode = "loading" | "editing" | "read-only" | "error";

export interface LockHolderInfo {
  holder_uid: string;
  holder_email: string;
  expires_at: string;
}

interface LockResponse {
  holder_uid: string;
  holder_email: string;
  acquired_at: string;
  last_heartbeat_at: string;
  expires_at: string;
  is_self: boolean;
}

export interface UseTreeLoaderResult {
  /** Aktueller Edit-Modus. */
  mode: EditMode;
  /** True wenn der Tree noch lädt. */
  isLoading: boolean;
  /** Backend-Fehler beim Tree-Laden (nicht der Lock-Konflikt). */
  error: Error | null;
  /** Bei mode="read-only": Wer haelt den Lock. */
  lockHolder: LockHolderInfo | null;
  /** Aktuelle Modell-Version. */
  version: number | null;
}

/**
 * Tree-Loader-Hook fuer eine /models/{id}-Seite.
 *
 * Read-Path-Vertrag:
 *   - Beim Mount: tree fetchen, lock anfragen.
 *   - Lock-Conflict (409): mode="read-only", lockHolder gesetzt.
 *   - Beim Unmount: lock release wenn wir der Holder waren.
 *
 * NOTE Phase 1: kein optimistic-update bei concurrent edit. Plan 09 kann
 * das nachziehen (z.B. polling auf lock-status alle 30s, banner-update).
 */
export function useTreeLoader(modelId: number): UseTreeLoaderResult {
  const setTree = useModelStore((s) => s.setTree);
  const treeQuery = useModelTreeQuery(modelId);

  const [mode, setMode] = useState<EditMode>("loading");
  const [lockHolder, setLockHolder] = useState<LockHolderInfo | null>(null);
  const haveLockRef = useRef(false);

  // Tree in den Store schreiben sobald geladen.
  useEffect(() => {
    if (!treeQuery.data) return;
    const root = treeQuery.data.tree.root;
    setTree(root, treeQuery.data.model_id, treeQuery.data.version);
  }, [treeQuery.data, setTree]);

  // Lock-Acquire-Attempt beim Mount.
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      try {
        await apiClient.post<LockResponse>(`/api/v1/models/${modelId}/lock`);
        if (cancelled) return;
        haveLockRef.current = true;
        setMode("editing");
        setLockHolder(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 409) {
          // Lock liegt bei anderem User -> read-only.
          const body = err.body as {
            holder_uid?: string;
            holder_email?: string;
            expires_at?: string;
          } | null;
          setLockHolder({
            holder_uid: body?.holder_uid ?? "unbekannt",
            holder_email: body?.holder_email ?? "unbekannt",
            expires_at: body?.expires_at ?? "",
          });
          setMode("read-only");
        } else {
          // Backend down oder anderes Problem -> wir bleiben "loading"
          // bis der Tree da ist, dann setzen wir error/read-only je nach
          // Tree-Status. Phase 1: defensiv "read-only" markieren.
          setMode("read-only");
          setLockHolder(null);
        }
      }
    }
    void acquire();
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  // Heartbeat-Loop solange wir den Lock halten.
  useEffect(() => {
    if (mode !== "editing") return;
    const id = window.setInterval(() => {
      apiClient
        .post<LockResponse>(`/api/v1/models/${modelId}/lock/heartbeat`)
        .catch(() => {
          // Heartbeat fehlgeschlagen -> wir verlieren effektiv den Lock.
          // Phase 1: still bleiben; Plan 09 kann banner/toast nachziehen.
          haveLockRef.current = false;
        });
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [modelId, mode]);

  // Release-Lock beim Unmount.
  useEffect(() => {
    return () => {
      if (haveLockRef.current) {
        // best-effort fire-and-forget; auch wenn das Backend down ist,
        // laeuft der Lock nach TTL ohnehin ab.
        apiClient
          .delete(`/api/v1/models/${modelId}/lock`)
          .catch(() => undefined);
      }
    };
  }, [modelId]);

  return {
    mode,
    isLoading: treeQuery.isLoading,
    error: treeQuery.error,
    lockHolder,
    version: treeQuery.data?.version ?? null,
  };
}
