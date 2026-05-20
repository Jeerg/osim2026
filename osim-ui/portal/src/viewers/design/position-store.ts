// Plan 01-07 Task 2: Phase-1-Lokaler Position-Override-Store.
//
// Hintergrund:
//   Engine-Writer kann GFX-Positionen aktuell NICHT persistieren
//   (OGfxDesign*-Klassen sind in der otx_loader-Skip-Liste). Daher haelt
//   das Frontend manuell-gezogene Positionen IN-MEMORY in diesem Store.
//
// Plan-01-09 (Save-Mechanik) wird diesen Store an IndexedDB
// (dexie ist bereits installiert) verdrahten — pro (modelId, planOid,
// nodeOid) eine persistente Override-Position. Bis dahin gilt:
//   - Session-lokal: Drag eines Knotens uebersteht spaetere Re-Renders,
//     aber NICHT einen Page-Reload.
//   - Beim Wechsel des Modells / Sidebar-Klick wird der Store NICHT
//     automatisch geleert — wir keyen via "planOid:nodeOid", was pro
//     Plan eindeutig ist. Im Phase-1-Workflow ist das ausreichend.
//
// API:
//   getNodePositionOverride(planOid, nodeOid) → Position | null
//   setNodePositionOverride(planOid, nodeOid, pos) → void
//   subscribeOverrides(listener) → unsubscribe
//   _clearOverridesForTests() → void

import type { Position } from "@/graph/core/types";

const OVERRIDES = new Map<string, Position>();
const LISTENERS = new Set<() => void>();

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
  OVERRIDES.set(makeKey(planOid, nodeOid), { ...pos });
  notify();
}

export function subscribeOverrides(listener: () => void): () => void {
  LISTENERS.add(listener);
  return () => LISTENERS.delete(listener);
}

export function _clearOverridesForTests(): void {
  OVERRIDES.clear();
}
