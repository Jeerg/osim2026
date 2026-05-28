/**
 * useAutoSave — Auto-Save-Hook (Plan 01-11 Task 3).
 *
 * Verantwortung:
 *  1. setInterval(30000): Tick prueft `store.dirty && lock.status==="own"` →
 *     dispatcht `useSaveModel.mutate` mit aktuellem Wire + Lock-Token.
 *  2. zustand-subscribe auf `state.wire`-Aenderungen → debounced
 *     `saveSnapshot(modelId, wire)` in IndexedDB.
 *
 * Pitfall #6 (RESEARCH): saveSnapshot hat eigenen Sequence-Counter; der
 * Debounce hier verhindert nur die IndexedDB-Last bei vielen schnellen Edits
 * (siehe Plan-Doc: "ohne debounce drohen bei Bosch2_wechseln (18 MB) IndexedDB-
 * Quota-Errors und Browser-Lag").
 *
 * Cleanup-Disziplin:
 *  - Beim Unmount: clearInterval + unsubscribe + debounce.cancel().
 *  - Sonst feuert ein ausstehender debounced-Save NACH Unmount und kollidiert
 *    mit dem `loadFromWire` einer anderen Route (alte Daten ueberschreiben
 *    neue im IndexedDB).
 */

import { useEffect, useMemo, useRef } from "react";

import { useSaveModel } from "@/api/models";
import { saveSnapshot } from "@/snapshot/snapshot-service";
import { useModelStore } from "@/stores/model-store";

import type { ModelTreeWire } from "@/api/models";

/** Snapshot-Debounce: max 1 IndexedDB-Write pro Sekunde pro Modell. */
const SNAPSHOT_DEBOUNCE_MS = 1_000;

/**
 * Mini-Debounce-Hilfe. `wrapped.cancel()` storniert einen ausstehenden Timer.
 * 6 Zeilen, kein lodash-Dependency-Push fuer einen einzigen Konsumenten.
 */
function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { cancel: () => void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => {
    if (t) {
      clearTimeout(t);
      t = null;
    }
  };
  return wrapped;
}

/**
 * Mountet die Auto-Save-Maschinerie fuer ein konkretes Modell.
 *
 * Wird in der Workspace-Route (`/_authenticated/models/$id`) aufgerufen.
 * Caller muss sicherstellen, dass `modelId` stabil ist (Route-Param).
 */
export function useAutoSave(modelId: string): void {
  const saveMutation = useSaveModel(modelId);
  // saveMutation.mutate ist NICHT stabil zwischen Renders — nutze ref um
  // Hook-Capture-Bugs zu vermeiden (Closure ueber alten mutate-Wert).
  // Ref-Schreib im useEffect statt im Render-Body, damit eslint
  // react-hooks/refs-during-render nicht ausschlaegt.
  const mutateRef = useRef(saveMutation.mutate);
  useEffect(() => {
    mutateRef.current = saveMutation.mutate;
  }, [saveMutation.mutate]);

  // -------- 1. Auto-Save-Interval (30 s) --------
  //
  // **Welle G19-A: TEMPORÄR DEAKTIVIERT** wegen User-Befund 2026-05-24:
  // "die alten modelle die du speicherst stimmen hinten und vorne nicht.
  // du verlierst die verschachtlung der knoten und alle kanten."
  //
  // Der OTX-Writer-Roundtrip ist noch nicht reproduzierbar — G16 hat nur
  // einen Teil der Container-Pointer übernommen. Bis der Roundtrip
  // byte-für-byte stabil ist (G19-D), darf Auto-Save NIE laufen — sonst
  // korrumpiert er bei jedem 30s-Tick weitere Modelle.
  //
  // Manueller Save kann später wieder freigeschaltet werden, wenn der
  // Writer verifiziert ist.
  useEffect(() => {
    // intentional no-op — Auto-Save deaktiviert bis G19-D Roundtrip stabil.
    if (modelId && mutateRef) return;
  }, [modelId]);

  // -------- 2. IndexedDB-Snapshot bei jeder wire-Aenderung --------
  // useMemo stellt sicher, dass derselbe debounced-Wrapper waehrend des
  // gesamten Mount-Lifecycles benutzt wird — sonst wuerden subscribe-Aufrufe
  // immer neue Timer aufsetzen.
  const debouncedSave = useMemo(
    () =>
      debounce((wire: ModelTreeWire) => {
        void saveSnapshot(modelId, wire);
      }, SNAPSHOT_DEBOUNCE_MS),
    [modelId],
  );

  useEffect(() => {
    // zustand-subscribe ohne selector ueber `useModelStore.subscribe` —
    // feuert bei JEDER set()-Aktion. Wir filtern auf wire-Aenderungen via
    // referenz-equality im Handler (immer erzeugt neuen wire-Object bei
    // patchObject/createObject/deleteObject/loadFromWire). Diese Granularitaet
    // ist ausreichend; granularere Selector-Subscriptions wuerden den
    // `subscribeWithSelector`-Middleware-Layer brauchen, den wir bewusst
    // nicht im model-store haben (Plan 07).
    //
    // Welle G13: zusaetzlicher dirty-Filter. Sonst schreibt der initiale
    // loadFromWire(server-wire) einen "Ghost-Snapshot" der den Crash-
    // Recovery-Dialog beim naechsten F5 falsch ausloest — der User hat
    // gar nichts editiert, aber das System glaubt es. Snapshots sind nur
    // gerechtfertigt nach User-Mutationen (patchObject/createObject/
    // deleteObject setzen `dirty=true`).
    let prevWire = useModelStore.getState().wire;
    const unsubscribe = useModelStore.subscribe((state) => {
      if (state.wire === null) {
        // Nach clear(): keinen Snapshot mehr schreiben.
        prevWire = null;
        return;
      }
      if (state.wire === prevWire) return;
      prevWire = state.wire;
      if (!state.dirty) {
        // Wire-Ref hat sich geaendert (z.B. loadFromWire), aber kein User-
        // Edit — kein Snapshot. prevWire wurde oben aktualisiert, damit der
        // naechste echte User-Edit korrekt als Aenderung erkannt wird.
        return;
      }
      debouncedSave(state.wire);
    });
    return () => {
      unsubscribe();
      debouncedSave.cancel();
    };
  }, [debouncedSave]);
}
