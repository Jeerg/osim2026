/**
 * PRessVerknuepfungViewer — Ressource-zentrierter Graph-Viewer mit
 * Phase-4-Kennzahl-Slot.
 *
 * **Welle 1.2-G (Phase 01.2):** Anders als der knoten-zentrierte
 * Detail-Graph (Welle 1.2-F, `PDlplConnKnotenViewer`) zeigt dieser
 * Viewer eine Ressource (`PBetriebsmittel` / `PPerson` / `PRessBeleg`)
 * zentral und drumherum alle `PDpKn*`-Knoten, die diese Ressource via
 * Belegungs-Assoziationen referenzieren. Quelle: C++
 * `PRessVerknuepfungViewer.cpp` (siehe `01.2-08-CPP-AUDIT.md`):
 *
 *  - `dframeFill` (Z.337-362) orchestriert: Reverse-Index der
 *    konnektierten Knoten holen, Ressource zentral plazieren, Knoten +
 *    Assoz-Zwischenobjekte drumherum aufbauen.
 *  - `dFillKnoten` (Z.69-111) iteriert über die Knoten-Liste mit
 *    `laufx++` — flaches lineares Layout.
 *  - `dFillAssoz` (Z.116-310) bestimmt die Assoz-Position und legt
 *    pro Verknüpfung 2 Links: Knoten→Assoz + Assoz→Ressource.
 *
 * **Anders als der erfundene Phase-1-Stub** (gelöscht in Plan 01.2-01)
 * arbeitet diese Variante NICHT mit einer fiktiven Wire-Klass
 * `PRessVerknuepfung`. Sie liest **existierende** OSim2004-Strukturen
 * rückwärts:
 *
 *   Ressource ← (Reverse-Index über alle PDpKn*) ← Knoten.m_lAssozRess
 *     ← PAssozBeleg.m_lRessourcen ← Ressource-OID
 *
 * **Wrapper-Indirektion (SCHEMA-MAP.md):** Die `m_lAssozRess`- und
 * `m_lRessourcen`-Attribute zeigen NICHT direkt auf Listen, sondern
 * auf `PAssozRessourceLList`- / `PRessBelegLList`-Wrapper-Objekte;
 * der eigentliche Inhalt steckt in `wrapper.sub_refs[0]`. Wir
 * re-usen die Helper-Funktionen aus Welle 1.2-F.
 *
 * **Phase-4-Vorgriff (Kennzahl-Slot):** Während der Sim-Laufzeit
 * setzt das C++-Original das `m_drawKennzahl`-Flag (siehe
 * `01.2-08-CPP-AUDIT.md` §3) und zeichnet pro Ressource eine
 * Bar/Numeric-Anzeige. Phase 1.2 stellt nur den **visuellen
 * Placeholder** dafür bereit (`KennzahlSlotPlaceholder`). Phase 4
 * wird ihn durch eine aktive Live-Visualisierung ersetzen — ohne
 * Component-Restruktur.
 *
 * **Listener-Slot:** `useSimulationListener` wird aus Welle 1.2-F
 * re-used (single source of truth). Der Hook ist intentional no-op;
 * Phase 4 hängt hier den WebSocket-Subscriber an. Threat T-01.2-22
 * akzeptiert den Cross-Modul-Import für Phase 1.2.
 */

import * as React from "react";
import { ReactFlowProvider } from "@xyflow/react";

import {
  GObjLink,
  GLink,
  OGraphGrid,
  GraphFlowCanvas,
} from "@/graph/foundation";
import { ChildDialog } from "@/viewers/core/ChildDialog";
import { useSimulationListener } from "@/viewers/PDlplConnKnoten/PDlplConnKnotenViewer";
import type { OBaseObj, ViewerProps } from "@/viewers/core/types";

import { KennzahlSlotPlaceholder } from "./KennzahlSlotPlaceholder";

export { KennzahlSlotPlaceholder } from "./KennzahlSlotPlaceholder";

// ---------------------------------------------------------------------------
// Wrapper-Indirektion + Helper (Pattern aus Welle 1.2-F).
// ---------------------------------------------------------------------------

/**
 * Liest eine OID-Liste über das Wrapper-Pattern: Eltern-Attribut zeigt
 * auf eine LList-Wrapper-OID, dessen `sub_refs[0]` die Element-OIDs
 * enthält. SCHEMA-MAP.md dokumentiert das Pattern für alle
 * `PAssoz*`/`PDpKn*`-Klassen.
 *
 * Fallback-Reihenfolge:
 *  1. attrs[attrName] ist eine OID (Number) → Wrapper aus `allObjects`
 *     lesen und dessen `sub_refs[0]` zurückgeben.
 *  2. attrs[attrName] ist bereits ein number[] (Welle-9-LList-
 *     Auflösung oder Test-Fixtures) → direkt benutzen.
 *  3. Sonst: leere Liste (defensiv).
 */
function readListViaWrapper(
  parent: OBaseObj,
  attrName: string,
  allObjects: Record<number, OBaseObj>,
): number[] {
  const val = parent.attrs?.[attrName];
  if (Array.isArray(val)) {
    return val.filter((x): x is number => typeof x === "number");
  }
  if (typeof val === "number" && val > 0) {
    const wrapper = allObjects[val];
    if (!wrapper) return [];
    const inner = wrapper.sub_refs?.[0];
    if (Array.isArray(inner)) {
      return inner.filter((x): x is number => typeof x === "number");
    }
  }
  return [];
}

/** Label-Konvention 1:1 aus Welle 1.2-F. */
function labelFor(obj: OBaseObj): string {
  const name = obj.attrs?.["m_sName"];
  if (typeof name === "string" && name.length > 0) return name;
  return `${obj.klass} #${obj.oid}`;
}

// ---------------------------------------------------------------------------
// Reverse-Index: alle Knoten finden, die diese Ressource referenzieren.
// ---------------------------------------------------------------------------

/**
 * Findet alle `PDpKn*`-Knoten, die die übergebene Ressource via
 * Belegungs-Assoz referenzieren. 1:1-Pendant zu C++
 * `OViewGetRessource()->GetListeKonnektierterKnoten(...)`.
 *
 * Algorithmus (siehe `01.2-08-CPP-AUDIT.md` §2):
 *  1. Iteriere alle `PDpKn*`-Objekte in `allObjects`.
 *  2. Pro Knoten: lies die Assoz-Liste via Wrapper
 *     (`knoten.m_lAssozRess → PAssozRessourceLList.sub_refs[0]`).
 *  3. Pro PAssozBeleg-Eintrag: lies die Ressourcen-Liste via Wrapper
 *     (`assoz.m_lRessourcen → PRessBelegLList.sub_refs[0]`).
 *  4. Wenn die übergebene `ressOid` enthalten ist: Knoten in Result-
 *     Liste aufnehmen.
 *  5. Result-Liste deterministisch nach `oid` sortiert.
 *
 * **Komplexität:** O(K × A × R) — bei realistischen Phase-1.2-
 * Modellen (< 500 Verknüpfungen) unter 1 ms. Stress-Test gegen
 * Bosch-Modell (30k+ Objekte) ist Backlog Phase 4.
 *
 * **PAssozBetrPers-Pfad** (RESEARCH §1.3): in Phase 1.2 NICHT
 * portiert; Person/Betriebsmittel-Sub-Verknüpfungen kommen in
 * Phase 4 mit dem Tandem-GElement-Konzept.
 *
 * **Speicher-Assoz-Pfad** (`m_lAssozSpeich`): in Phase 1.2 NICHT
 * portiert (Backlog Welle 1.3). Hier rein die direkte Verknüpfung
 * über `m_lAssozRess`.
 */
function buildConnectedKnoten(
  ressOid: number,
  allObjects: Record<number, OBaseObj>,
): OBaseObj[] {
  const result: OBaseObj[] = [];
  for (const o of Object.values(allObjects)) {
    if (!o.klass.startsWith("PDpKn")) continue;
    const assozOids = readListViaWrapper(o, "m_lAssozRess", allObjects);
    const hasRef = assozOids.some((aOid) => {
      const assoz = allObjects[aOid];
      if (!assoz) return false;
      // Phase-1.2-Scope: nur PAssozBeleg (PAssozMenge wird ignoriert,
      // PAssozBetrPers ist Backlog).
      if (assoz.klass !== "PAssozBeleg") return false;
      const ressOids = readListViaWrapper(assoz, "m_lRessourcen", allObjects);
      return ressOids.includes(ressOid);
    });
    if (hasRef) result.push(o);
  }
  result.sort((a, b) => a.oid - b.oid);
  return result;
}

/**
 * Findet die PAssozBeleg-Objekte zwischen einem Knoten und der
 * Ressource. Wird im Grid-Builder verwendet, um pro Verknüpfung das
 * Assoz-Zwischenobjekt + die zwei Links Knoten→Assoz + Assoz→Ress
 * aufzubauen. Gibt eine deterministische, nach OID sortierte Liste
 * zurück.
 */
function findAssozBelegBetween(
  knoten: OBaseObj,
  ressOid: number,
  allObjects: Record<number, OBaseObj>,
): OBaseObj[] {
  const assozOids = readListViaWrapper(knoten, "m_lAssozRess", allObjects);
  const matching: OBaseObj[] = [];
  for (const aOid of assozOids) {
    const assoz = allObjects[aOid];
    if (!assoz) continue;
    if (assoz.klass !== "PAssozBeleg") continue;
    const ressOids = readListViaWrapper(assoz, "m_lRessourcen", allObjects);
    if (ressOids.includes(ressOid)) matching.push(assoz);
  }
  matching.sort((a, b) => a.oid - b.oid);
  return matching;
}

// ---------------------------------------------------------------------------
// Grid-Builder — Pipeline nach C++ dframeFill + dFillKnoten + dFillAssoz.
// ---------------------------------------------------------------------------

/**
 * Baut das Ressource-Verknüpfungs-Grid auf.
 *
 *  1. Ressource zentral plazieren — Spalte aus `Math.floor(knotenCount/2)`,
 *     Reihe 1 (entspricht C++ `dFillResourcenGitter` Z.582:
 *     `xpos = m_lKnotenList.GetCount() / 2`).
 *  2. Pro verbundenem Knoten (linear, `laufx++`):
 *     a) Knoten-GObj in Reihe 0 plazieren.
 *     b) Pro PAssozBeleg zwischen Knoten und Ressource:
 *        - Assoz-GObj in Reihe 2 plazieren (zwischen Knoten oben und
 *          Ressource unten — visuell zwischen-liegend).
 *        - Link Knoten → Assoz (C++ Z.207-210).
 *        - Link Assoz → Ressource (C++ Z.212-215).
 *  3. `finalizeLayout({x:0, y:0})` — Foundation berechnet die
 *     finalen Pixel-Positionen.
 *
 * **Layout-Konvention** (siehe `01.2-08-CPP-AUDIT.md` §1 Skizze):
 *  - Reihe 0: Knoten (Tops)
 *  - Reihe 1: Ressource (Mitte) — analog `dFillResourcenGitter` Z.603
 *  - Reihe 2: Assoz-Zwischenobjekte (Bottoms)
 *
 *  Die genaue Pixel-Reihenfolge wird von `finalizeLayout`
 *  bestimmt; die `(col, row)`-Tupel sind logische Hints.
 */
function buildRessVerknuepfungGrid(
  ressource: OBaseObj,
  connectedKnoten: OBaseObj[],
  allObjects: Record<number, OBaseObj>,
): OGraphGrid {
  const grid = new OGraphGrid();

  // -------- 1. Ressource zentral --------
  // C++ `dFillResourcenGitter` Z.582: xpos = knotenCount / 2. Wenn
  // keine Knoten vorhanden: xpos = 0. Die Ressource bekommt Move/Delete-
  // Forbidden, weil sie der "Anker" des Detail-Graphs ist.
  const ressCol = Math.floor(Math.max(connectedKnoten.length, 1) / 2);
  const ressGObj = new GObjLink();
  ressGObj.SetViewedObject(ressource.oid);
  ressGObj.SetText(labelFor(ressource));
  ressGObj.SetMoveForbidden(true);
  ressGObj.SetDeleteForbidden(true);
  grid.GOIns(ressGObj, ressCol, 1, false);

  // -------- 2. Knoten + Assoz-Zwischenobjekte + Links --------
  // C++ `dFillKnoten` Z.81: laufx = 0; Z.106: laufx++ pro Knoten.
  let laufx = 0;
  for (const knoten of connectedKnoten) {
    const knotenGObj = new GObjLink();
    knotenGObj.SetViewedObject(knoten.oid);
    knotenGObj.SetText(labelFor(knoten));

    // Knoten in Reihe 0 plazieren. Sollte die berechnete Zelle belegt
    // sein (z.B. weil ressCol mit laufx kollidiert), nehmen wir die
    // nächste freie Spalte. Phase-1.2 Heuristik — saubere Layout-
    // Geometrie ist Phase-4-Backlog.
    let knotenCol = laufx;
    if (grid.IsGridPlaceTaken(knotenCol, 0)) {
      const free = { x: knotenCol, y: 0 };
      grid.GetNextFreeGridPlace(free);
      knotenCol = free.x;
    }
    grid.GOIns(knotenGObj, knotenCol, 0, false);

    // Pro PAssozBeleg zwischen Knoten und Ressource: Zwischenobjekt
    // + zwei Links.
    const assozs = findAssozBelegBetween(knoten, ressource.oid, allObjects);
    for (let i = 0; i < assozs.length; i++) {
      const assoz = assozs[i];
      const aGObj = new GObjLink();
      aGObj.SetViewedObject(assoz.oid);
      aGObj.SetText(labelFor(assoz));
      // Assoz-Reihe = 2. Spalte aus laufx + i. Bei Kollision: nächster
      // freier Platz.
      let assozCol = laufx + i;
      if (grid.IsGridPlaceTaken(assozCol, 2)) {
        const free = { x: assozCol, y: 2 };
        grid.GetNextFreeGridPlace(free);
        assozCol = free.x;
      }
      grid.GOIns(aGObj, assozCol, 2, false);

      // Link Knoten → Assoz (C++ Z.207-210, VT_KNO_ASSRES).
      new GLink(knotenGObj, aGObj);
      // Link Assoz → Ressource (C++ Z.212-215, VT_ASSRES_RESBEL).
      new GLink(aGObj, ressGObj);
    }

    laufx++;
  }

  // -------- 3. Finalize Layout --------
  grid.finalizeLayout({ x: 0, y: 0 });
  return grid;
}

// ---------------------------------------------------------------------------
// Viewer-Component
// ---------------------------------------------------------------------------

/**
 * Public-Export. Wraps die Inner-Component in `ReactFlowProvider`
 * (Pattern aus PDurchlaufplanViewerDesign G21 / PDlplConnKnotenViewer
 * Welle 1.2-F — Konsument braucht den Provider on top, damit
 * `useReactFlow` innen verfügbar ist).
 */
export function PRessVerknuepfungViewer(
  props: ViewerProps,
): React.ReactElement {
  return (
    <ReactFlowProvider>
      <PRessVerknuepfungViewerInner {...props} />
    </ReactFlowProvider>
  );
}

function PRessVerknuepfungViewerInner(
  props: ViewerProps,
): React.ReactElement {
  const { obj, allObjects, disabled } = props;

  // Phase 1.2 ist Read-Only — bumpRevision noch nicht nötig, aber
  // State behalten für Phase-4-Live-Updates über WebSocket-Tick.
  const [revision] = React.useState(0);

  // Phase-4-Listener-Slot mounten (no-op aus Welle 1.2-F).
  useSimulationListener({});

  // Reverse-Index + Grid-Build memoized.
  const { connectedKnoten, grid } = React.useMemo(() => {
    const connectedKnoten = buildConnectedKnoten(obj.oid, allObjects);
    const grid = buildRessVerknuepfungGrid(obj, connectedKnoten, allObjects);
    return { connectedKnoten, grid };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.oid, allObjects, revision]);

  const title = `Ressourcen-Verknüpfungen — ${labelFor(obj)}`;
  const description = `Verknüpft mit ${connectedKnoten.length} ${
    connectedKnoten.length === 1 ? "Knoten" : "Knoten"
  }`;

  return (
    <ChildDialog title={title} description={description}>
      <div
        data-viewer="PRessVerknuepfungViewer"
        data-oid={obj.oid}
        className="flex h-full w-full"
      >
        {/* Links: TTY-Pane mit Knoten-Liste (C++ dframeFill Z.352-355). */}
        <aside
          data-testid="tty-pane"
          className="w-48 flex-shrink-0 overflow-auto border-r border-border bg-muted p-2 font-mono text-xs"
        >
          <h3 className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Verknüpfte Knoten
          </h3>
          <ul className="space-y-1">
            {connectedKnoten.map((k) => (
              <li
                key={k.oid}
                data-oid={k.oid}
                className="truncate"
                title={labelFor(k)}
              >
                {labelFor(k)}
              </li>
            ))}
            {connectedKnoten.length === 0 && (
              <li className="text-muted-foreground">
                Keine verknüpften Knoten
              </li>
            )}
          </ul>
        </aside>

        {/* Rechts: Graph-Pane mit Kennzahl-Slot-Placeholder (oben rechts). */}
        <div className="relative flex-1">
          <GraphFlowCanvas
            grid={grid}
            revision={revision}
            readOnly={disabled ?? true}
          />
          <KennzahlSlotPlaceholder />
        </div>
      </div>
    </ChildDialog>
  );
}
