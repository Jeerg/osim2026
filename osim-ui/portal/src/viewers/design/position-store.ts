// Plan 01-07 Task 2: Position-Override-Store fuer den Design-Viewer.
// Plan 01-09 Task 2: Erweitert um IndexedDB-Persistenz (modelId-aware).
//
// Hintergrund:
//   Engine-Writer kann GFX-Positionen aktuell NICHT persistieren
//   (OGfxDesign*-Klassen sind in der otx_loader-Skip-Liste). Daher haelt
//   das Frontend manuell-gezogene Positionen lokal — Phase 1 mit
//   IndexedDB-Persistenz: Drag-Positionen ueberleben Page-Reload.
//
// Plan-01-09-Erweiterung:
//   - In-Memory-Map bleibt fuer schnelle Lookups (kein await pro
//     getNodePositionOverride).
//   - Schreib-Pfad: setNodePositionOverride schreibt zusaetzlich
//     ASYNCHRON in die IDB-Tabelle `position_overrides` (debounced 300ms
//     pro (planOid,nodeOid), damit Drag-Bewegung nicht jeden Pixel
//     persistiert).
//   - Lese-Pfad: hydrateOverridesForModel(modelId) wird beim Mount des
//     Design-Viewers (oder besser noch: Workspaces) aufgerufen und
//     fuellt die In-Memory-Map mit allen persistierten Positions.
//
// API (kompatibel zu Plan 01-07):
//   getNodePositionOverride(planOid, nodeOid) → Position | null
//   setNodePositionOverride(planOid, nodeOid, pos) → void
//   subscribeOverrides(listener) → unsubscribe
//   _clearOverridesForTests() → void
//
// Neu in Plan 01-09:
//   setActiveModelId(modelId | null) → void
//   hydrateOverridesForModel(modelId) → Promise<void>

import type { Position } from "@/graph/core/types";
import { db } from "@/persistence/indexeddb";

const OVERRIDES = new Map<string, Position>();
const LISTENERS = new Set<() => void>();

/**
 * Aktuell aktiver Modell-Kontext. Beim Persistieren in IDB brauchen wir
 * den modelId-Anteil des Composite-PK. setActiveModelId wird vom
 * WorkspaceLayout beim Mount aufgerufen.
 */
let ACTIVE_MODEL_ID: number | null = null;

/**
 * Debounce-Timer pro (planOid, nodeOid)-Key, damit Drag-Bewegung nicht
 * jeden Pixel persistiert (Phase 1: 300ms — schneller als Snapshot weil
 * Position-Drags ueblicherweise einzelne, finalere Aktionen sind).
 */
const PERSIST_DEBOUNCE_MS = 300;
const PERSIST_TIMERS = new Map<string, ReturnType<typeof setTimeout>>();

function makeKey(planOid: number, nodeOid: number): string {
  return `${planOid}:${nodeOid}`;
}

function notify(): void {
  for (const l of LISTENERS) l();
}

export function getNodePositionOverride(
  planOid: number,
  nodeOid: number,
): Position | null {
  return OVERRIDES.get(makeKey(planOid, nodeOid)) ?? null;
}

export function setNodePositionOverride(
  planOid: number,
  nodeOid: number,
  pos: Position,
): void {
  const key = makeKey(planOid, nodeOid);
  OVERRIDES.set(key, { ...pos });
  notify();

  // Debounced IDB-Persistenz, sofern Modell-Kontext bekannt.
  if (ACTIVE_MODEL_ID == null) return;
  const modelId = ACTIVE_MODEL_ID;
  const existing = PERSIST_TIMERS.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    PERSIST_TIMERS.delete(key);
    void db.position_overrides
      .put({
        modelId,
        planOid,
        nodeOid,
        x: pos.x,
        y: pos.y,
        savedAt: Date.now(),
      })
      .catch((err) => {
        console.warn(
          "[position-store] persist fehlgeschlagen:",
          err,
        );
      });
  }, PERSIST_DEBOUNCE_MS);
  PERSIST_TIMERS.set(key, timer);
}

export function subscribeOverrides(listener: () => void): () => void {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

/**
 * Plan 01-09: Setzt den aktiven Modell-Kontext fuer die IDB-Persistenz.
 * Wird vom WorkspaceLayout beim Mount aufgerufen.
 */
export function setActiveModelId(modelId: number | null): void {
  ACTIVE_MODEL_ID = modelId;
}

/**
 * Plan 01-09: Laedt alle persistierten Position-Overrides fuer ein
 * Modell aus IDB in die In-Memory-Map.
 *
 * Wird beim Workspace-Mount aufgerufen (vor dem ersten Design-Viewer-
 * Render). Loescht VORHER die In-Memory-Map, damit alte Modell-Overrides
 * nicht durchsickern.
 */
export async function hydrateOverridesForModel(
  modelId: number,
): Promise<void> {
  OVERRIDES.clear();
  try {
    const rows = await db.position_overrides
      .where("modelId")
      .equals(modelId)
      .toArray();
    for (const row of rows) {
      OVERRIDES.set(makeKey(row.planOid, row.nodeOid), {
        x: row.x,
        y: row.y,
      });
    }
    notify();
  } catch (err) {
    console.warn(
      "[position-store] hydrate fehlgeschlagen:",
      err,
    );
  }
}

export function _clearOverridesForTests(): void {
  OVERRIDES.clear();
  for (const t of PERSIST_TIMERS.values()) clearTimeout(t);
  PERSIST_TIMERS.clear();
  ACTIVE_MODEL_ID = null;
}
