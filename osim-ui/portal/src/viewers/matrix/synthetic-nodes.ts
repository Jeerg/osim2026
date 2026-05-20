// Plan 01-06 Task 2: Synthetische Folder-Knoten fuer Matrix-Viewer.
//
// Hintergrund (siehe Plan-01-05-D3 + Plan-01-06-decisions in SUMMARY):
//   Die Backend-`_group`-Wrapper haben alle oid=-1 (kollidiert), und sie
//   sind nicht-selektierbar in der Sidebar. Matrix-Viewer brauchen aber
//   einen Sidebar-Eintrag, der beim Klick einen Matrix-Viewer mountet.
//
// Loesung:
//   - Drei (oder mehr) synthetische "Matrix-Group"-Knoten mit eindeutigen
//     Klassen-Strings (RESS_BELEG_GROUP etc.) + eigenen synthetischen OIDs.
//   - Die OIDs liegen WEIT unter dem TEMP-OID-Counter (start -1) — wir
//     reservieren -10000..-19999 fuer Matrix-Folder; TEMP-OIDs koennen
//     -1..-9999 nutzen. Praktisch wird der TEMP-Counter bei normaler Nutzung
//     nie unter -1000 fallen.
//   - Der WorkspaceLayout/ViewerHost faellt auf diese Map zurueck, wenn
//     `selectByOid(state, oid)` null liefert.
//   - SidebarTree haengt die synthetischen Knoten als zusaetzliche
//     Top-Level-Children unter den Modell-Root.
//
// Diese Trennung bewahrt den OViewer-Pattern (Klasse → Viewer-Component);
// die Matrix-Viewer denken weiterhin "ich bin ein klass-gebundener Viewer",
// die Tatsache, dass ihr `obj` synthetisch ist, ist Implementierungs-Detail.

import type { OtxJsonNode } from "@/viewers/core/types";

// ---------------------------------------------------------------------------
// Reservierte synthetische OIDs.
// ---------------------------------------------------------------------------

export const SYNTHETIC_RESS_BELEG_OID = -10001;
export const SYNTHETIC_RESS_MENGE_OID = -10002;
export const SYNTHETIC_RESS_VERKN_OID = -10003;

// Plan 01-08: Verknuepfungs- + Arbeitszeit-Sichten (Welle 4, Plan 08).
export const SYNTHETIC_DLPL_BETRIEBSMITTEL_OID = -10004;
export const SYNTHETIC_DLPL_PERSONAL_OID = -10005;
export const SYNTHETIC_AEINSATZWUNSCH_OID = -10006;
export const SYNTHETIC_AKAPBED_OID = -10007;

// Reserviert fuer spaetere Plans (Gantt etc.):
//   -10008 ... -10999

export const SYNTHETIC_RESS_BELEG_KLASS = "RESS_BELEG_GROUP";
export const SYNTHETIC_RESS_MENGE_KLASS = "RESS_MENGE_GROUP";
export const SYNTHETIC_RESS_VERKN_KLASS = "RESS_VERKNUEPFUNG_GROUP";

// Plan 01-08.
export const SYNTHETIC_DLPL_BETRIEBSMITTEL_KLASS = "DLPL_BETRIEBSMITTEL_GROUP";
export const SYNTHETIC_DLPL_PERSONAL_KLASS = "DLPL_PERSONAL_GROUP";
export const SYNTHETIC_AEINSATZWUNSCH_KLASS = "AEINSATZWUNSCH_GROUP";
export const SYNTHETIC_AKAPBED_KLASS = "AKAPBED_GROUP";

// ---------------------------------------------------------------------------
// Definition + Lookup-Map.
// ---------------------------------------------------------------------------

export interface SyntheticMatrixNode {
  oid: number;
  klass: string;
  name: string;
}

export const SYNTHETIC_MATRIX_NODES: SyntheticMatrixNode[] = [
  {
    oid: SYNTHETIC_RESS_BELEG_OID,
    klass: SYNTHETIC_RESS_BELEG_KLASS,
    name: "Belegungsressourcen-Matrix",
  },
  {
    oid: SYNTHETIC_RESS_MENGE_OID,
    klass: SYNTHETIC_RESS_MENGE_KLASS,
    name: "Mengenressourcen-Matrix",
  },
  {
    oid: SYNTHETIC_RESS_VERKN_OID,
    klass: SYNTHETIC_RESS_VERKN_KLASS,
    name: "Ressourcen-Verknuepfungen",
  },
];

/**
 * Plan 01-08: Verknuepfungs-Sichten (Knoten ↔ Ressource), Cross-Tree-Editoren.
 *
 * Read-only in Phase 1 (siehe SUMMARY.md Plan 01-08): die echten
 * Verknuepfungs-Objekte (PAssozBelegLink, etc.) sind im _SKIP-Set des
 * otx_loaders — Edit-Funktion braucht eine Engine-Schema-Erweiterung
 * (Phase 2 backlog).
 */
export const SYNTHETIC_LINKING_NODES: SyntheticMatrixNode[] = [
  {
    oid: SYNTHETIC_DLPL_BETRIEBSMITTEL_OID,
    klass: SYNTHETIC_DLPL_BETRIEBSMITTEL_KLASS,
    name: "Knoten ↔ Betriebsmittel",
  },
  {
    oid: SYNTHETIC_DLPL_PERSONAL_OID,
    klass: SYNTHETIC_DLPL_PERSONAL_KLASS,
    name: "Knoten ↔ Personal",
  },
];

/**
 * Plan 01-08: Arbeitszeit-Sichten (Einsatz-Wunsch + Kapazitaetsbedarf).
 *
 * Phase 1 nutzt synthetische Folder-Knoten, weil das Backend
 * AEinsatzWunsch/AKapBed aktuell nicht direkt liefert. Sobald echte
 * Knoten dieser Klassen im Tree erscheinen, mountet der Viewer-Registry-
 * Lookup denselben Viewer (Doppel-Registrierung auf echtem Klass-String).
 */
export const SYNTHETIC_ARBEITSZEIT_NODES: SyntheticMatrixNode[] = [
  {
    oid: SYNTHETIC_AEINSATZWUNSCH_OID,
    klass: SYNTHETIC_AEINSATZWUNSCH_KLASS,
    name: "Einsatz-Wunsch",
  },
  {
    oid: SYNTHETIC_AKAPBED_OID,
    klass: SYNTHETIC_AKAPBED_KLASS,
    name: "Kapazitaetsbedarf",
  },
];

/**
 * Gesammelte synthetische Folder fuer den Sidebar-Tree (alle Welle-4-
 * Sichten). Verwendet von sidebar-tree.tsx fuer den "Cross-Sichten"-Folder
 * ueber Plan 06+08.
 */
export const SYNTHETIC_ALL_GROUP_NODES: SyntheticMatrixNode[] = [
  ...SYNTHETIC_MATRIX_NODES,
  ...SYNTHETIC_LINKING_NODES,
  ...SYNTHETIC_ARBEITSZEIT_NODES,
];

// ---------------------------------------------------------------------------
// Modul-lokaler "synthetischer Property-Store".
//
// Da synthetische Matrix-Group-Knoten NICHT im echten Tree leben, kann
// useModelStore.updateProperty() ihre Edits nicht persistieren (der
// Tree-Walk findet keinen Knoten mit der negativen OID). Statt den Tree
// mit synthetischen Knoten zu verseuchen, halten wir die Matrix-Cell-
// Edits hier in einem leichtgewichtigen Store.
//
// Vorteile:
//   - tree bleibt 1:1 das, was das Backend liefert
//   - Save-back (Plan 09) liest diese Maps explizit aus und schreibt sie
//     in echte PAssozBeleg/PAssozMenge/PRessVerknuepfung-Knoten zurueck
//   - dirty-Set des Haupt-Stores bleibt unverschmutzt durch synthetische
//     OIDs; ein eigener "matrixDirty"-Indicator kann in Plan 09 ergaenzt
//     werden
//
// Nachteil:
//   - Snapshot-Undo des Haupt-Stores erfasst Matrix-Edits NICHT (Plan 09
//     verdrahtet)
// ---------------------------------------------------------------------------

const SYNTH_PROPS: Map<number, Record<string, unknown>> = new Map();
const SYNTH_LISTENERS = new Set<() => void>();

/** Subscribe-Pattern fuer React-Re-Render (Plan 09 ggf. via Zustand). */
export function subscribeSyntheticProps(listener: () => void): () => void {
  SYNTH_LISTENERS.add(listener);
  return () => SYNTH_LISTENERS.delete(listener);
}

function notify(): void {
  for (const l of SYNTH_LISTENERS) l();
}

export function getSyntheticProps(
  oid: number,
): Record<string, unknown> {
  return SYNTH_PROPS.get(oid) ?? {};
}

export function setSyntheticProperty(
  oid: number,
  key: string,
  value: unknown,
): void {
  const cur = SYNTH_PROPS.get(oid) ?? {};
  SYNTH_PROPS.set(oid, { ...cur, [key]: value });
  notify();
}

/** Test-Helper: leert den synthetischen Store. */
export function _clearSyntheticPropsForTests(): void {
  SYNTH_PROPS.clear();
}

/**
 * Liefert den synthetischen Node fuer die gegebene OID, wenn die OID im
 * synthetischen Bereich liegt. Wird vom WorkspaceLayout als Fallback nach
 * `selectByOid` aufgerufen.
 *
 * Die properties kommen aus dem modul-lokalen SYNTH_PROPS-Store (siehe
 * oben); children sind leer (synthetisch).
 */
export function getSyntheticNode(oid: number): OtxJsonNode | null {
  // Suche in ALLEN synthetischen Folder-Listen (Plan 06 Matrix + Plan 08
  // Verknuepfungs- und Arbeitszeit-Sichten).
  const def = SYNTHETIC_ALL_GROUP_NODES.find((s) => s.oid === oid);
  if (!def) return null;
  return {
    oid: def.oid,
    klass: def.klass,
    name: def.name,
    properties: getSyntheticProps(def.oid),
    children: [],
  };
}

/**
 * Liefert TRUE wenn die OID im reservierten synthetischen Bereich liegt
 * (-10000 .. -19999). SidebarTree/WorkspaceLayout-Hilfsfunktion.
 */
export function isSyntheticOid(oid: number): boolean {
  return oid <= -10000 && oid > -20000;
}
