// Plan 01-09 Task 2: Save-Logik als gemeinsame Funktion fuer Auto-Save
// und manuellen Save-Button.
//
// Beide Wege (Timer-Trigger und Button-Klick) rufen dieselbe saveModel-
// Funktion auf — Single-Source-of-Truth fuer den Save-Pfad. Vorteile:
//   - keine Code-Duplizierung,
//   - das saving-Flag wird konsistent gesetzt/zurueckgesetzt,
//   - Race-Resolution (zweiter Save startet nicht, wenn saving=true).
//
// Backend-Vertrag (Plan 01-03 PUT /api/v1/models/{id}/tree):
//   Request:  { tree: JsonTreeDocument, expected_version: number }
//   Response: { model_id, version, storage_key, bytes_size }
//
//   Phase-1-Hinweis: Das Backend liefert AKTUELL kein oid_mapping in der
//   Response. patchOids wird trotzdem aufgerufen (mit leerem Mapping),
//   damit das Frontend Phase-2-ready ist, sobald das Backend die
//   id-Mapping-Antwort liefert.

import { apiClient } from "@/api/client";
import { useModelStore } from "@/state/model-store";
import { clearSnapshot } from "@/persistence/snapshot-store";
import type { OtxJsonNode } from "@/viewers/core/types";

export interface SaveModelOptions {
  modelId: number;
  /** Aktueller Tree (deep im store, hier zur Vermeidung mehrfacher Reads gepasst). */
  tree: OtxJsonNode;
  /** Erwartete Server-Version (Optimistic-Concurrency-Hint). */
  expectedVersion: number;
}

export interface SaveModelResult {
  /** Neue Server-Version nach erfolgreichem Save. */
  version: number;
  /** Storage-Key der neuen Version. */
  storageKey: string;
  /** TEMP→real OID-Mapping (Phase-1: leer; Phase-2-ready). */
  oidMapping: Record<string, number>;
}

interface PutTreeResponse {
  model_id: number;
  version: number;
  storage_key: string;
  bytes_size: number;
  /**
   * Phase-1: NICHT vom Backend geliefert. Wir typisieren das Feld
   * optional, damit Phase-2-Backend-Erweiterung ohne Frontend-Refactor
   * funktioniert.
   */
  oid_mapping?: Record<string, number>;
}

/**
 * Schema-Document fuer den PUT-Body. Backend (Plan 01-03 PUT /tree)
 * erwartet { tree: { schema_version, root } } — wir bauen das hier
 * direkt aus dem In-Memory-Tree.
 */
function buildTreeDocument(tree: OtxJsonNode): {
  schema_version: string;
  root: OtxJsonNode;
} {
  return { schema_version: "1.0", root: tree };
}

/**
 * Speichert den aktuellen Modell-Tree zurueck zum Backend.
 *
 * Side-Effects (bei Erfolg):
 *   1. useModelStore.setState({ version: response.version }) — neuer
 *      Stamp.
 *   2. patchOids(response.oid_mapping ?? {}) — TEMP-OIDs auf echte
 *      OIDs patchen (Phase-1: no-op).
 *   3. markClean() — dirty-Set leeren.
 *   4. clearSnapshot(modelId) — Crash-Recovery-Puffer loeschen
 *      (Server-Stand ist jetzt die Wahrheit).
 *
 * Bei Fehler (Network, 4xx, 5xx) wirft die Funktion. Caller (Auto-Save
 * oder SaveButton) entscheidet ueber Retry/Toast/Banner.
 *
 * Race-Protection: setzt store.saving=true VOR dem Request, false NACH.
 * Wenn beim Start saving=true ist, wird der Aufruf abgebrochen
 * (kein Doppel-Save).
 */
export async function saveModel(
  opts: SaveModelOptions,
): Promise<SaveModelResult | null> {
  const store = useModelStore.getState();
  if (store.saving) {
    // Es laeuft bereits ein Save — Caller (z.B. Timer) soll spaeter
    // erneut probieren.
    return null;
  }
  store.setSaving(true);
  try {
    const body = {
      tree: buildTreeDocument(opts.tree),
      expected_version: opts.expectedVersion,
    };
    const resp = await apiClient.put<PutTreeResponse>(
      `/api/v1/models/${opts.modelId}/tree`,
      body,
    );
    // Reihenfolge der Side-Effects ist wichtig: erst version stempeln
    // (sonst rendert SaveButton kurz "saved (v_old)"), dann patchOids
    // (sonst zeigt Sidebar TEMP-OIDs auf neuen tree), dann markClean
    // (UI zeigt "alles gespeichert"), zuletzt clearSnapshot (IDB ist
    // dann redundant).
    useModelStore.setState({ version: resp.version });
    useModelStore.getState().patchOids(resp.oid_mapping ?? {});
    useModelStore.getState().markClean();
    await clearSnapshot(opts.modelId).catch(() => undefined);
    return {
      version: resp.version,
      storageKey: resp.storage_key,
      oidMapping: resp.oid_mapping ?? {},
    };
  } finally {
    useModelStore.getState().setSaving(false);
  }
}
