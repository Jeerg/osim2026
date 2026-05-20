// Plan 01-06 Task 1: Helper-Funktionen fuer Matrix-Viewer.
//
// - getAllOfKlass(tree, klass): rekursiv alle Knoten einer Klasse einsammeln.
//   Beruecksichtigt die synthetischen `_group`-Wrapper aus dem Backend
//   (Plan 03 json_tree_service.py), die als Container fuer Ausloeser/
//   Plaene/Knoten/Kanten/Ressourcen/Einsatzzeiten eingefuegt sind.
//
// - extractScheduleColumns(tree): liefert die Zeitintervall-Spalten fuer
//   Belegungs-/Mengen-Matrix-Viewer.
//
//   Heuristik (Phase 1 Best-Effort, dokumentiert in Plan-Risk-Block):
//     1) Wenn PEinsatzzeitTag-Knoten existieren, einer pro Tag → eine
//        Spalte pro Tag (sortiert nach Beginn).
//     2) Sonst → Fallback eine Spalte "Standard".
//
//   Die Engine kennt mehrere Wege, Schichten zu modellieren (PEinsatzzeit,
//   AGruppe-Schicht-Pool, PRessBeleg-m_lEinsatzzeit). Phase 1 deckt nur
//   PEinsatzzeitTag ab; Plan 08 (AEinsatzWunsch) zieht die anderen nach.

import type { OtxJsonNode } from "@/viewers/core/types";

const GROUP_KLASS = "_group";

/**
 * Sammelt rekursiv alle Knoten einer gegebenen Klasse aus dem Tree.
 * Steigt durch `_group`-Wrapper hindurch.
 *
 * Reihenfolge: Pre-Order (Wurzel zuerst, dann Kinder von links nach
 * rechts). Stabil ueber Re-Renders (rein abhaengig vom Tree-Aufbau).
 */
export function getAllOfKlass(
  tree: OtxJsonNode | null,
  klass: string,
): OtxJsonNode[] {
  if (!tree) return [];
  const out: OtxJsonNode[] = [];
  const stack: OtxJsonNode[] = [tree];
  while (stack.length > 0) {
    const node = stack.shift()!;
    if (node.klass === klass) out.push(node);
    // Auch `_group`-Knoten descenden, damit wir die echten Eintraege darin
    // finden.
    for (const c of node.children) stack.push(c);
  }
  return out;
}

/**
 * Eine Spalte im Matrix-Layout (Belegungs- / Mengen-Matrix).
 *
 * - `id`: eindeutiger Schluessel (TEMP-OID bei synthetischen Spalten).
 * - `label`: Anzeige-Text in der Header-Zelle.
 * - `oid`: optional die OID des Schicht-/Einsatzzeit-Knotens, falls die
 *   Spalte aus einem echten Objekt stammt — wird vom Cell-Editor genutzt,
 *   um die Edits an dem richtigen Knoten festzumachen.
 */
export interface ScheduleColumn {
  id: string;
  label: string;
  oid?: number;
}

/**
 * Extrahiert Zeitintervall-Spalten aus dem Modell. Phase-1-Best-Effort.
 *
 * Heuristik:
 *   - PEinsatzzeitTag-Knoten sortiert nach m_iBeginn (falls vorhanden);
 *     fallback Reihenfolge im Tree.
 *   - Falls keine PEinsatzzeitTag im Tree → eine Default-Spalte
 *     `{ id: "default", label: "Standard" }`.
 */
export function extractScheduleColumns(
  tree: OtxJsonNode | null,
): ScheduleColumn[] {
  const tage = getAllOfKlass(tree, "PEinsatzzeitTag");
  if (tage.length === 0) {
    return [{ id: "default", label: "Standard" }];
  }
  // Sortierschluessel: m_iBeginn (Sekunden seit Mitternacht). Fallback 0.
  const sorted = [...tage].sort((a, b) => {
    const ba = typeof a.properties.m_iBeginn === "number"
      ? (a.properties.m_iBeginn as number)
      : 0;
    const bb = typeof b.properties.m_iBeginn === "number"
      ? (b.properties.m_iBeginn as number)
      : 0;
    return ba - bb;
  });
  return sorted.map((n) => ({
    id: `oid:${n.oid}`,
    label: n.name || `PEinsatzzeitTag-${n.oid}`,
    oid: n.oid,
  }));
}

/**
 * Liefert alle Ressource-Knoten (PBetriebsmittel + PPerson + PRessMenge —
 * falls als Klasse im Tree). Wird vom Verknuepfungs-Viewer benoetigt, der
 * eine quadratische Adjazenz-Matrix ueber ALLE Ressourcen aufspannt.
 */
export function getAllRessources(
  tree: OtxJsonNode | null,
): OtxJsonNode[] {
  return [
    ...getAllOfKlass(tree, "PBetriebsmittel"),
    ...getAllOfKlass(tree, "PPerson"),
    ...getAllOfKlass(tree, "PRessMenge"),
  ];
}

/**
 * Test-Helper: ist diese Klasse ein synthetischer Folder-Wrapper?
 */
export function isGroupNode(node: OtxJsonNode): boolean {
  return node.klass === GROUP_KLASS;
}
