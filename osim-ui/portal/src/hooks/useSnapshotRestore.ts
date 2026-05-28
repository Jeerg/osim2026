/**
 * useSnapshotRestore — Crash-Recovery-Dialog-Hook (Plan 01-11 Task 3).
 *
 * Verantwortung:
 *  - Beim Mount der Workspace-Route: prueft, ob in IndexedDB ein Snapshot
 *    fuer das modelId existiert.
 *  - Wenn ja UND der Server-Wire wurde frisch geladen → bietet einen Dialog
 *    "Lokale Aenderungen gefunden — wiederherstellen oder verwerfen?".
 *  - `restore()` laedt den Snapshot in den ModelStore (mit dirty=true, damit
 *    Auto-Save ihn auf den Server traegt).
 *  - `discard()` loescht die Snapshots und behaelt den Server-Stand.
 *
 * Phase-1-Heuristik (siehe Plan-Doc):
 *  - Wir haben (noch) keinen server-side `updated_at` im wire, mit dem wir
 *    "snapshot newer than server" exakt vergleichen koennten. Statt-dessen:
 *    Wenn ueberhaupt ein Snapshot existiert, zeige den Dialog. Bei einem
 *    sauberen Logout/Reload hat das Auto-Save den Snapshot via
 *    `clearSnapshots` schon entfernt; der Dialog erscheint also nur, wenn
 *    ein nicht-gespeichter Edit + Crash/F5 passiert ist.
 *  - Edge-Case: Snapshot ist genau gleich wie Server (User hat reloaded
 *    BEVOR Auto-Save lief): Dialog erscheint trotzdem, aber `discard` ist
 *    no-op-ish und User waehlt das. Akzeptiert; keine false-positive-
 *    Korruption.
 *
 * Bewusst KEIN automatisches restore — Datenverlust vermeiden ist wichtiger
 * als UX-Convenience. User muss aktiv entscheiden.
 */

import { useEffect, useRef, useState } from "react";

import {
  clearSnapshots,
  loadLatestSnapshot,
} from "@/snapshot/snapshot-service";
import { useModelStore } from "@/stores/model-store";

import type { ModelTreeWire } from "@/api/models";

interface UseSnapshotRestoreResult {
  /** True wenn der Restore-Dialog gezeigt werden soll. */
  dialogVisible: boolean;
  /** Lokalen Snapshot in den Store laden (markiert dirty=true). */
  restore: () => void;
  /** Snapshot verwerfen und Server-Stand behalten. */
  discard: () => void;
}

export function useSnapshotRestore(
  modelId: string,
  serverWire: ModelTreeWire | undefined,
): UseSnapshotRestoreResult {
  const [dialogVisible, setDialogVisible] = useState(false);
  // Snapshot in ref halten, damit restore() den ge-cachten wire abrufen kann
  // ohne erneute IndexedDB-Query.
  const snapshotRef = useRef<ModelTreeWire | null>(null);
  // Sentinel, damit der Effekt nicht mehrfach Snapshots prueft, wenn
  // server-wire stabil ist aber andere props sich aendern.
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    // Nur einmal pro (modelId, serverWire-Identitaet) pruefen.
    if (!serverWire) return;
    if (checkedRef.current === modelId) return;

    let cancelled = false;
    void loadLatestSnapshot(modelId).then((snapshot) => {
      if (cancelled) return;
      // Marker erst NACH erfolgreicher Auflösung setzen — sonst überspringt
      // der StrictMode-Double-Mount in Dev die Detection: Mount-1 schaltet
      // `checkedRef` um, Unmount setzt cancelled=true → Mount-2 läuft sofort
      // in den early-return und keine Iteration setzt mehr `setDialogVisible`.
      checkedRef.current = modelId;
      if (snapshot) {
        snapshotRef.current = snapshot;
        setDialogVisible(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [modelId, serverWire]);

  const restore = () => {
    const snap = snapshotRef.current;
    if (snap) {
      useModelStore.getState().loadFromWire(modelId, snap);
      // loadFromWire setzt dirty=false (Plan 07-Default). Wir markieren
      // explizit dirty, damit Auto-Save den Snapshot auf den Server traegt.
      useModelStore.setState({ dirty: true });
      useModelStore.temporal.getState().clear();
    }
    setDialogVisible(false);
    snapshotRef.current = null;
  };

  const discard = () => {
    void clearSnapshots(modelId);
    setDialogVisible(false);
    snapshotRef.current = null;
    // Server-Stand bleibt; loadFromWire vom Workspace-Effekt hat ihn schon
    // geladen — wir muessen ihn hier nicht nochmal anwenden.
  };

  return { dialogVisible, restore, discard };
}
