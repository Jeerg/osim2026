// Plan 01-09 Task 1: useSnapshotSubscriber-Hook.
//
// Abonniert den model-store und schreibt bei jeder Aenderung (debounced
// 500ms) einen Snapshot in IndexedDB. Damit ist der Crash-Recovery-Puffer
// immer mit dem aktuellsten Stand befuellt — wenn der Browser-Tab
// abstuerzt oder unkontrolliert geschlossen wird, bleibt die letzte
// Aenderung erhalten.
//
// Design-Entscheidungen:
//
//   - 500ms-Debounce: Schnelle Tipper auf einem Variable-Input erzeugen
//     ~20 Tastendruecke pro Sekunde — ohne Debounce wuerde jede einzelne
//     ein IDB-Write triggern (Spam, Performance). 500ms ist die uebliche
//     Save-Pause-Latenz; Datenverlust bei Crash ist max 500ms.
//
//   - Nur aktiv, wenn ein modelId gesetzt ist: Beim Wechsel des
//     ausgewaehlten Modells unsubscribe + neuer subscribe mit dem neuen
//     modelId-Closure.
//
//   - subscribe rather than useEffect-Polling: Zustand-Store hat einen
//     eingebauten subscribe-API (siehe model-store.ts). Wir wollen
//     Snapshot-Writes nur bei Tree-Aenderungen, nicht bei selectedOid-
//     Aenderungen — daher selektive Subscription auf (tree, dirty,
//     version) via Equality-Check.

import { useEffect, useMemo } from "react";
import { useModelStore } from "@/state/model-store";
import { writeSnapshot } from "@/persistence/snapshot-store";
import type { Oid, OtxJsonNode } from "@/viewers/core/types";

const SNAPSHOT_DEBOUNCE_MS = 500;

/**
 * Mini-Debounce-Helper. Vermeidet eine externe lodash-/util-Dependency.
 */
function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}

/**
 * Mounted im WorkspaceLayout (eine Instanz pro offenem Modell).
 *
 * Phase 1: kein Cancel-on-Unmount der pending debounced-Calls — wenn der
 * User die Seite wechselt waehrend ein Snapshot in-flight ist, wird er
 * trotzdem geschrieben (saubere Recovery beim naechsten Re-Open).
 */
export function useSnapshotSubscriber(modelId: number | null): void {
  // Stabile debounced-Write-Funktion pro modelId.
  const debouncedWrite = useMemo(() => {
    if (modelId == null) return null;
    return debounce(
      (tree: OtxJsonNode, version: number, dirty: Set<Oid>) => {
        // Fire-and-forget; Fehler werden geloggt, aber nicht weitergereicht.
        // Phase 1: IDB-Quota-Errors sind Backlog (Plan-09-Risk-Block).
        writeSnapshot(modelId, version, tree, dirty).catch((err) => {
          console.warn(
            "[useSnapshotSubscriber] writeSnapshot fehlgeschlagen:",
            err,
          );
        });
      },
      SNAPSHOT_DEBOUNCE_MS,
    );
  }, [modelId]);

  useEffect(() => {
    if (modelId == null || !debouncedWrite) return;
    // Zustand-subscribe — feuert bei jedem set(). Wir muessen selbst
    // filtern, ob die Aenderung relevant war (tree/dirty/version).
    let lastTreeRef: OtxJsonNode | null = null;
    let lastDirtySize = -1;
    let lastVersion: number | null = null;

    const unsub = useModelStore.subscribe((state) => {
      // Nur fuer das aktive Modell.
      if (state.modelId !== modelId) return;
      if (!state.tree || state.version == null) return;

      // Relevante Aenderung?
      const treeChanged = state.tree !== lastTreeRef;
      const dirtyChanged = state.dirty.size !== lastDirtySize;
      const versionChanged = state.version !== lastVersion;
      if (!treeChanged && !dirtyChanged && !versionChanged) return;

      lastTreeRef = state.tree;
      lastDirtySize = state.dirty.size;
      lastVersion = state.version;

      // Phase-1-Optimierung: schreibe nur, wenn dirty > 0 ODER
      // nach einem Reset (dirty=0 + tree erstmals gesetzt). Reine
      // selectedOid-Aenderungen werden durch die Refs-Vergleiche
      // ohnehin ausgefiltert.
      //
      // Wir wollen aber auch schreiben, wenn dirty=0 (z.B. nach
      // setTree initial); spaeter wird der Eintrag durch
      // clearSnapshot ohnehin geloescht, sobald markClean +
      // clearSnapshot von use-auto-save aufgerufen werden.
      debouncedWrite(state.tree, state.version, state.dirty);
    });
    return unsub;
  }, [modelId, debouncedWrite]);
}
