// Plan 01-05 Task 1: Tree-Loader-Hook (Read-Path-Orchestrator).
//
// Verbindet useModelTreeQuery + useModelStore + Lock-Acquire-Logik.
// Read-Path-Verantwortung:
//   1. Tree vom Backend laden (useModelTreeQuery).
//   2. Plan 01-09: Vor setTree pruefen, ob ein dirty Snapshot in IDB
//      existiert. Falls ja: RecoveryCheck zurueckliefern (UI mountet
//      RecoveryPrompt). User entscheidet via acceptRecovery() bzw.
//      discardRecovery() — danach geht's mit setTree weiter.
//   3. Sonst direkt setTree() im model-store schreiben.
//   4. Lock-Acquire-Attempt beim Mount; bei 409 in "read-only"-Modus
//      wechseln und die Lock-Holder-Info ausliefern.
//   5. Lock-Heartbeat ist in Plan 01-09 in use-lock-heartbeat ausgelagert
//      (haveLock-State wird hier weitergegeben).
//   6. Beim Unmount: Lock release (DELETE /lock) wenn wir der Holder sind.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/api/client";
import { ApiError } from "@/api/fetch";
import { useModelStore } from "@/state/model-store";
import { checkForRecovery, type RecoveryCheck } from "@/persistence/recovery";
import { clearSnapshot } from "@/persistence/snapshot-store";
import { useModelTreeQuery } from "./use-model-tree-query";

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
  /** True wenn der Tree noch laedt. */
  isLoading: boolean;
  /** Backend-Fehler beim Tree-Laden (nicht der Lock-Konflikt). */
  error: Error | null;
  /** Bei mode="read-only": Wer haelt den Lock. */
  lockHolder: LockHolderInfo | null;
  /** Aktuelle Modell-Version (vom Server bezogen). */
  version: number | null;
  /**
   * Plan 01-09: Wenn != null, soll die UI einen RecoveryPrompt mounten.
   * Bis der User auf "Wiederherstellen" oder "Verwerfen" klickt, ist
   * `tree` im model-store nicht gesetzt — der Workspace bleibt im
   * loading-Pendant-Modus.
   */
  recoveryCheck: RecoveryCheck | null;
  /** Akzeptiert den Recovery-Snapshot (Tree aus Snapshot, dirty bleibt). */
  acceptRecovery: () => void;
  /** Verwirft den Recovery-Snapshot (Tree vom Server, IDB-Loeschung). */
  discardRecovery: () => void;
}

/**
 * Tree-Loader-Hook fuer eine /models/{id}-Seite.
 *
 * Read-Path-Vertrag:
 *   - Beim Mount: tree fetchen, lock anfragen, Recovery-Check.
 *   - Lock-Conflict (409): mode="read-only", lockHolder gesetzt.
 *   - Beim Unmount: lock release wenn wir der Holder waren.
 *
 * NOTE Phase 1: kein optimistic-update bei concurrent edit. Plan 09 kann
 * polling auf lock-status nachziehen.
 */
export function useTreeLoader(modelId: number): UseTreeLoaderResult {
  const setTree = useModelStore((s) => s.setTree);
  const treeQuery = useModelTreeQuery(modelId);

  const [mode, setMode] = useState<EditMode>("loading");
  const [lockHolder, setLockHolder] = useState<LockHolderInfo | null>(null);
  const haveLockRef = useRef(false);

  // Recovery-State.
  const [recoveryCheck, setRecoveryCheck] = useState<RecoveryCheck | null>(
    null,
  );
  // True sobald der setTree-Pfad (entweder via Recovery-Decision oder via
  // direkter Server-Load) durchgelaufen ist — verhindert mehrfaches
  // setTree wenn treeQuery refetched.
  const treeAppliedRef = useRef(false);

  // Tree-Laden + Recovery-Check + setTree.
  useEffect(() => {
    if (!treeQuery.data || treeAppliedRef.current) return;
    const root = treeQuery.data.tree.root;
    const serverVersion = treeQuery.data.version;
    const localModelId = treeQuery.data.model_id;

    let cancelled = false;
    (async () => {
      try {
        const rc = await checkForRecovery(localModelId, serverVersion);
        if (cancelled) return;
        if (rc.snapshotIsNewer && rc.snapshot) {
          // Recovery-Prompt anzeigen, setTree wird in acceptRecovery /
          // discardRecovery aufgerufen.
          setRecoveryCheck(rc);
        } else {
          // Snapshot entweder nicht vorhanden oder clean → direkt
          // Server-Tree laden; einen evtl. cleanen Snapshot loeschen
          // (er ist redundant zum Server-Stand).
          if (rc.hasSnapshot) {
            await clearSnapshot(localModelId).catch(() => undefined);
          }
          setTree(root, localModelId, serverVersion);
          treeAppliedRef.current = true;
        }
      } catch (err) {
        // Recovery-Check fehlgeschlagen → fallback auf direkten Load.
        // Phase-1-Robustness: lieber Daten zeigen als Recovery-Prompt
        // ohne valide Daten.
        console.warn(
          "[useTreeLoader] checkForRecovery fehlgeschlagen, fallback auf direkten Server-Load:",
          err,
        );
        if (cancelled) return;
        setTree(root, localModelId, serverVersion);
        treeAppliedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treeQuery.data, setTree]);

  // Recovery-Decision-Handler.
  const acceptRecovery = useCallback(() => {
    if (!recoveryCheck?.snapshot) return;
    const snap = recoveryCheck.snapshot;
    // Tree aus Snapshot laden, dann dirty-Markierungen wiederherstellen.
    setTree(snap.tree, snap.modelId, snap.version);
    // dirty-Set ist nach setTree leer; ueberschreibe es manuell.
    useModelStore.setState({ dirty: new Set(snap.dirty) });
    setRecoveryCheck(null);
    treeAppliedRef.current = true;
  }, [recoveryCheck, setTree]);

  const discardRecovery = useCallback(() => {
    if (!recoveryCheck) return;
    const targetModelId = recoveryCheck.snapshot?.modelId ?? modelId;
    void clearSnapshot(targetModelId).catch(() => undefined);
    // Server-Tree laden (treeQuery.data ist da, da Recovery-Check nur
    // dann triggert).
    if (treeQuery.data) {
      const root = treeQuery.data.tree.root;
      setTree(root, treeQuery.data.model_id, treeQuery.data.version);
      treeAppliedRef.current = true;
    }
    setRecoveryCheck(null);
  }, [recoveryCheck, modelId, treeQuery.data, setTree]);

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

  // Release-Lock beim Unmount.
  // beforeunload best-effort: Plan 01-09 ergaenzt den Unload-Listener,
  // damit der Lock auch beim Tab-Schliessen freigegeben wird.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!haveLockRef.current) return;
      // sendBeacon ist verfuegbar im happy-dom-Test-Env nicht garantiert;
      // we use a best-effort sync XHR-like Fetch (keepalive).
      try {
        const baseUrl =
          (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
          "http://localhost:8000";
        void fetch(`${baseUrl}/api/v1/models/${modelId}/lock`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // best-effort
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
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
    recoveryCheck,
    acceptRecovery,
    discardRecovery,
  };
}
