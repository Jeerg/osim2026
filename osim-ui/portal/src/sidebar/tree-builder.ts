/**
 * tree-builder — Wandelt Wire-Format in TreeNode-Hierarchie für react-arborist.
 *
 * Hierarchie (siehe Plan 01-07 Task 4):
 *
 *     Modell (Simulator-Root)
 *      ├── Auslöser              (PAslEinzel)
 *      ├── Durchlaufpläne        (PDurchlaufplan)
 *      │    └── Plan X
 *      │         ├── Knoten      (sub_refs[0] des Plans)
 *      │         └── Kanten      (PDlplKante via sub_refs[1])
 *      ├── Belegungsressourcen   (PBetriebsmittel)
 *      ├── Mengenressourcen      (PRessMenge)
 *      ├── Personalgruppen       (AGruppe)
 *      └── Einsatzwünsche        (AEinsatzzeitWunsch)
 *
 * Pattern-Quelle: .planning/phases/01-vertical-slice/01-RESEARCH.md §Pattern 4.
 *
 * Konvention für TreeNode-IDs (react-arborist verlangt eindeutige Strings):
 *  - Objekt-Knoten:  `"oid:<n>"` (z.B. "oid:42")
 *  - Gruppen-Knoten: `"grp:<label>:<parent-oid?>"` (synthetisch, keine echte OID)
 *
 * TODO Phase 2/3: sub_refs-Layout aus Engine via Plan-04-Wire-Format verifizieren.
 * Heute nehme ich an: PDurchlaufplan.sub_refs[0] enthält Knoten-Oids,
 * sub_refs[1] enthält Kanten-Oids. Wenn die Engine das anders organisiert,
 * fallen Knoten-/Kanten-Sub-Gruppen leer aus — das ist keine Funktionsstörung
 * der Sidebar, sondern ein Wire-Layout-Mismatch der separat zu beheben ist.
 */

import type { ModelTreeWire } from "@/api/models";
import type { OBaseObj } from "@/viewers/core/types";

export interface TreeNode {
  /** Eindeutige String-ID für react-arborist (oid-prefixed oder grp-prefixed). */
  id: string;
  /** OID des dahinterliegenden OBaseObj — undefined bei synthetischen Gruppen. */
  oid?: number;
  klass?: string;
  label: string;
  /**
   * Bei synthetischen Gruppen-Knoten: Stabile Kennung der Gruppe (z.B.
   * "Belegungsressourcen", "Mengenressourcen") — damit der Workspace beim
   * Click den passenden `viewerHint` setzen kann (Plan 01-11 Task 5
   * schliesst den Plan-09-Backlog-Punkt). Bei Objekt-Knoten undefined.
   */
  groupKey?: string;
  children?: TreeNode[];
}

/** Filtert alle Objekte einer Klasse aus dem Wire. */
function findByKlass(wire: ModelTreeWire, klass: string): OBaseObj[] {
  return Object.values(wire.objects).filter((o) => o.klass === klass);
}

/** Erzeugt ein Leaf für ein Objekt (oid:<n>). */
function objNode(obj: OBaseObj, children?: TreeNode[]): TreeNode {
  // Label-Resolution: m_sName > m_name > Fallback "<klass> #<oid>"
  const name = (obj.attrs.m_sName ?? obj.attrs.m_name) as
    | string
    | null
    | undefined;
  const label =
    name && typeof name === "string" && name.length > 0
      ? name
      : `${obj.klass} #${obj.oid}`;
  return {
    id: `oid:${obj.oid}`,
    oid: obj.oid,
    klass: obj.klass,
    label,
    ...(children !== undefined ? { children } : {}),
  };
}

/**
 * Erzeugt einen Gruppen-Knoten (synthetisch, ohne OID).
 * Wenn `objs` leer ist, hat die Gruppe leere children — sie wird trotzdem
 * angezeigt damit der User die Struktur erkennt (Plan-Hinweis "Modell zeigt
 * Modell + Auslöser + Durchlaufpläne + Ressourcen" auch bei leerem Modell).
 */
function groupNode(
  label: string,
  objs: OBaseObj[],
  parentOid: number | string,
  childBuilder?: (obj: OBaseObj) => TreeNode[],
): TreeNode {
  const children = objs.map((o) =>
    objNode(o, childBuilder ? childBuilder(o) : undefined),
  );
  return {
    id: `grp:${label}:${parentOid}`,
    label,
    // groupKey ist gleich dem Label — das ist die stabile, deutsche Bezeichnung
    // ("Belegungsressourcen", "Mengenressourcen", ...). Workspace nutzt sie
    // zum Mappen auf viewerHint+Klass.
    groupKey: label,
    children,
  };
}

/**
 * Findet alle Knoten-Objekte (PDpKn*, PProzess*) eines bestimmten
 * Durchlaufplans über dessen sub_refs[0].
 */
function findKnotenForPlan(
  wire: ModelTreeWire,
  plan: OBaseObj,
): OBaseObj[] {
  const knotenOids = plan.sub_refs[0] ?? [];
  return knotenOids
    .map((oid) => wire.objects[oid])
    .filter((o): o is OBaseObj => o !== undefined);
}

/** Findet alle Kanten eines Plans (PDlplKante) über m_lKnotenOber-Backlink. */
function findKantenForPlan(
  wire: ModelTreeWire,
  plan: OBaseObj,
): OBaseObj[] {
  return Object.values(wire.objects).filter(
    (o) => o.klass === "PDlplKante" && o.attrs.m_lKnotenOber === plan.oid,
  );
}

/**
 * Hauptfunktion: Baut den TreeNode[]-Baum aus einer ModelTreeWire.
 *
 * Wenn `wire.simulator_oid` nicht in `wire.objects` existiert, returnt
 * der Builder einen Fallback-Root (sollte bei korrekt parsed OTX nie
 * passieren, aber defensive).
 */
export function buildTree(wire: ModelTreeWire): TreeNode[] {
  const sim = wire.objects[wire.simulator_oid];
  if (!sim) {
    return [
      {
        id: "grp:root:empty",
        label: "(Modell konnte nicht geladen werden)",
        children: [],
      },
    ];
  }

  const ausloeserGroup = groupNode(
    "Auslöser",
    findByKlass(wire, "PAslEinzel"),
    sim.oid,
  );

  const plaeneGroup = groupNode(
    "Durchlaufpläne",
    findByKlass(wire, "PDurchlaufplan"),
    sim.oid,
    (plan) => [
      groupNode("Knoten", findKnotenForPlan(wire, plan), plan.oid),
      groupNode("Kanten", findKantenForPlan(wire, plan), plan.oid),
    ],
  );

  const belegGroup = groupNode(
    "Belegungsressourcen",
    findByKlass(wire, "PBetriebsmittel"),
    sim.oid,
  );

  const mengeGroup = groupNode(
    "Mengenressourcen",
    findByKlass(wire, "PRessMenge"),
    sim.oid,
  );

  const personalGroup = groupNode(
    "Personalgruppen",
    findByKlass(wire, "AGruppe"),
    sim.oid,
  );

  const wuenscheGroup = groupNode(
    "Einsatzwünsche",
    findByKlass(wire, "AEinsatzzeitWunsch"),
    sim.oid,
  );

  // Arbeitszeiten: die PEinsatzzeitTag-Muster (Schichten). Gruppen-Klick öffnet
  // die Arbeitszeit-Matrix (Ressourcen × Tage) auf dem Simulator — 1:1
  // OSim2004 PEinsatzViewer. Mapping in $id.tsx handleGroupSelect.
  const arbeitszeitGroup = groupNode(
    "Arbeitszeiten",
    findByKlass(wire, "PEinsatzzeitTag"),
    sim.oid,
  );

  return [
    objNode(sim, [
      ausloeserGroup,
      plaeneGroup,
      belegGroup,
      mengeGroup,
      personalGroup,
      wuenscheGroup,
      arbeitszeitGroup,
    ]),
  ];
}
