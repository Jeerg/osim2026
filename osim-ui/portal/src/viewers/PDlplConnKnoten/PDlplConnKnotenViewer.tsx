/**
 * PDlplConnKnotenViewer — Knoten-zentrierter Detail-Graph-Viewer.
 *
 * **Welle 1.2-F (Phase 01.2):** Konsumiert die GraphObject-Foundation aus
 * Phase 1.1 (OGraphGrid + GObjLink + GLink + GraphFlowCanvas). Anders als
 * der Matrix-Konsument PRessBelegMatrixViewer (Welle 1.2-E) ist dies KEIN
 * Matrix-Viewer, sondern ein klassischer Graph-Detail-Viewer:
 *
 *  - Der gerade gewählte PDlplKnoten ist zentral bei Grid-Position (3, 0)
 *    plaziert (1:1 aus C++ `PDlplConnKnotenViewer.cpp::dFillKnoten` Z.228).
 *  - Seine Assoz-Ressourcen (`PAssozBeleg` / `PAssozBetrPers`) werden über
 *    den Wrapper `PAssozRessourceLList` aufgelöst und drumherum plaziert
 *    (Position aus `m_pntRaster`, sonst `GetNextFreeGridPlace`).
 *  - Die einzelnen Ressourcen (`PBetriebsmittel` / `PPerson`) hängen über
 *    den Wrapper `PRessBelegLList` aus dem PAssozBeleg.
 *  - Eine optionale Speicher-Assoziation (`m_lAssozSpeich`) ergänzt das
 *    Layout mit Speicher-Prozessen via `PSpeicherProzLList`-Wrapper.
 *
 * **Wrapper-Indirektion (SCHEMA-MAP.md):** Im OTX-Wire leben Listen NICHT
 * in `sub_refs[N]` des Parents, sondern in separaten LList-Wrapper-
 * Objekten. Die `PAssozRessourceLList.sub_refs[0]` enthält die PAssozBeleg-
 * OIDs; `PRessBelegLList.sub_refs[0]` die Ressourcen-OIDs. Dieser Viewer
 * folgt dem Wrapper-Pfad konsequent, ohne `model-store`-Mutation
 * (Phase 1.2 ist Read-Only).
 *
 * **C++-Konzeptvorlage:** siehe `01.2-07-CPP-AUDIT.md`. Die `VT_*`-Link-
 * Typen werden NICHT visuell unterschieden (alle generische `GLink`s);
 * Phase 4 könnte das pro Typ via `m_crLinkColor` nachrüsten.
 *
 * **Listener-Slot:** Der no-op-Hook `useSimulationListener` ist Phase-4-
 * Vorbereitung — er hängt KEINEN WebSocket an und triggert KEINEN Effect.
 * Phase 4 wird die `/ws/runs/{run_id}`-Anbindung hier einbauen, ohne
 * Component-Restruktur.
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
import type { OBaseObj, ViewerProps } from "@/viewers/core/types";

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Liest eine OID-Liste aus dem Wrapper-Pattern: Eltern-Attribut zeigt auf
 * eine LList-Wrapper-OID, dessen `sub_refs[0]` die Element-OIDs enthält.
 * SCHEMA-MAP.md dokumentiert das Pattern für alle PAssoz/PDpKn-Klassen.
 *
 * Fallback-Reihenfolge:
 *  1. attrs[attrName] ist eine OID (Number) → schaue in allObjects nach
 *     Wrapper und lies dessen sub_refs[0].
 *  2. attrs[attrName] ist bereits ein number[] (Welle-9-LList-Auflösung
 *     oder ältere Fixtures) → direkt benutzen.
 *  3. Sonst leere Liste.
 *
 * NULL- oder fehlende Wrapper-Ziele liefern eine leere Liste (defensiv).
 */
function readListViaWrapper(
  parent: OBaseObj,
  attrName: string,
  allObjects: Record<number, OBaseObj>,
): number[] {
  const val = parent.attrs?.[attrName];
  // Fall 2: bereits aufgelöst als Array
  if (Array.isArray(val)) {
    return val.filter((x): x is number => typeof x === "number");
  }
  // Fall 1: Wrapper-OID
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

/** Liest eine OID-Liste DIREKT aus einem attr-Wert (Welle-9-Auflösung). */
function readListDirect(parent: OBaseObj, attrName: string): number[] {
  const val = parent.attrs?.[attrName];
  if (Array.isArray(val)) {
    return val.filter((x): x is number => typeof x === "number");
  }
  return [];
}

/**
 * Liest eine `m_pntRaster`-Position aus Wire-Attrs als (col, row)-Paar.
 * Akzeptiert das im Codebase übliche Tuple-Schema `[col, row]` und
 * `{x, y}`-Object-Form (Legacy). `-1`-Sentinels werden als „nicht
 * plaziert" interpretiert → null.
 */
function readRaster(
  attrs: Record<string, unknown> | undefined,
): { col: number; row: number } | null {
  const raw = attrs?.["m_pntRaster"];
  if (Array.isArray(raw) && raw.length >= 2) {
    const col = raw[0];
    const row = raw[1];
    if (typeof col === "number" && typeof row === "number") {
      if (col < 0 || row < 0) return null;
      return { col, row };
    }
  }
  if (raw && typeof raw === "object") {
    const obj = raw as { x?: unknown; y?: unknown };
    if (typeof obj.x === "number" && typeof obj.y === "number") {
      if (obj.x < 0 || obj.y < 0) return null;
      return { col: obj.x, row: obj.y };
    }
  }
  return null;
}

/** Labels eines Wire-Objekts. */
function labelFor(obj: OBaseObj): string {
  const name = obj.attrs?.["m_sName"];
  if (typeof name === "string" && name.length > 0) return name;
  return `${obj.klass} #${obj.oid}`;
}

/**
 * Plaziert ein GObjLink im Grid: zuerst an `pntRaster` (wenn vorhanden
 * UND Cell frei), sonst an der nächsten freien Position ab `(0, 1)`.
 * Mutiert keine Wire-Daten (Phase-1.2-Pragma: kein Persistenz-Patch
 * beim Auto-Placement — wäre Backlog Welle 1.3).
 */
function placeWithFallback(
  grid: OGraphGrid,
  gObj: GObjLink,
  raster: { col: number; row: number } | null,
): void {
  if (raster && !grid.IsGridPlaceTaken(raster.col, raster.row)) {
    grid.GOIns(gObj, raster.col, raster.row, false);
    return;
  }
  const free = { x: 0, y: 1 };
  grid.GetNextFreeGridPlace(free);
  grid.GOIns(gObj, free.x, free.y, false);
}

// ---------------------------------------------------------------------------
// Grid-Builder — Pipeline nach C++ dFillKnoten + ConnectKnoten
// ---------------------------------------------------------------------------

/**
 * Baut das Knoten-Detail-Grid auf.
 *
 *  1. Knoten-Knoten zentral bei (3, 0), `SetMoveForbidden + SetDeleteForbidden`.
 *  2. Assoz-Ressourcen aus `knoten → PAssozRessourceLList → PAssozBeleg/BetrPers`.
 *  3. Pro PAssozBeleg: Ressourcen aus `assoz → PRessBelegLList → PBetriebsmittel/PPerson`.
 *  4. Optional: Speicher-Assoz aus `knoten.m_lAssozSpeich → PAssozSpeicher` plus
 *     dessen `PSpeicherProzLList → PSpeicherProz`-Wrapper.
 *  5. Links setzen (alle generisch via `new GLink(source, target)` — Konstruktor
 *     registriert automatisch in `m_OutList`/`m_InList`):
 *       - Knoten → AssozRess (VT_KNO_ASSRES)
 *       - AssozRess → Ressource (VT_ASSRES_RESBEL)
 *       - Knoten → AssozSpeich (VT_KNO_ASSSPE)
 *       - AssozSpeich → SpeicherProz (VT_ASSSPE_PROSPE)
 *  6. `finalizeLayout({x:0, y:0})` berechnet finale Pixel-Positionen.
 */
function buildKnotenDetailGrid(
  knoten: OBaseObj,
  allObjects: Record<number, OBaseObj>,
): OGraphGrid {
  const grid = new OGraphGrid();

  // -------- 1. Knoten zentral bei (3, 0) ----------------------------------
  const knotenGObj = new GObjLink();
  knotenGObj.SetViewedObject(knoten.oid);
  knotenGObj.SetText(labelFor(knoten));
  knotenGObj.SetMoveForbidden(true);
  knotenGObj.SetDeleteForbidden(true);
  grid.GOIns(knotenGObj, 3, 0, false);

  // -------- 2. Assoz-Ressourcen via Wrapper (PAssozRessourceLList) --------
  // SCHEMA-MAP.md: knoten.attrs.m_lAssozRess → Wrapper-OID,
  // wrapper.sub_refs[0] = PAssozBeleg-/PAssozBetrPers-OIDs.
  const assozRessOids = readListViaWrapper(knoten, "m_lAssozRess", allObjects);

  for (const assozOid of assozRessOids) {
    const assoz = allObjects[assozOid];
    if (!assoz) continue;
    // Phase-1.2-Reduktion: PAssozMenge wird im Detail-Knoten-Viewer NICHT gerendert
    // (1:1 aus C++ `dFillKnoten` Z.175).
    if (assoz.klass === "PAssozMenge") continue;

    const aGObj = new GObjLink();
    aGObj.SetViewedObject(assoz.oid);
    aGObj.SetText(labelFor(assoz));
    placeWithFallback(grid, aGObj, readRaster(assoz.attrs));

    // 2a. Ressourcen-Items aus assoz.m_lRessourcen via PRessBelegLList-Wrapper
    // C++ Z.380-391: pro Ressource ein VT_ASSRES_RESBEL-Link.
    if (assoz.klass === "PAssozBeleg") {
      const ressOids = readListViaWrapper(assoz, "m_lRessourcen", allObjects);
      for (const rOid of ressOids) {
        const ress = allObjects[rOid];
        if (!ress) continue;
        const rGObj = new GObjLink();
        rGObj.SetViewedObject(ress.oid);
        rGObj.SetText(labelFor(ress));
        placeWithFallback(grid, rGObj, readRaster(ress.attrs));
        // Link AssozRess → Ressource (Konstruktor registriert automatisch)
        new GLink(aGObj, rGObj);
      }
    }

    // 2b. PAssozBetrPers-Spezial: pro betrper zwei Links (Person + Betr).
    // C++ Z.394-428. SCHEMA-MAP.md: betrper hat m_lPers + m_lBetr als
    // Scalar-OID-Pointers. Wir lesen die Liste über den BetrPers-Wrapper.
    if (assoz.klass === "PAssozBetrPers") {
      const betrPersOids = readListViaWrapper(
        assoz,
        "m_lBetrPers",
        allObjects,
      );
      for (const bpOid of betrPersOids) {
        const betrper = allObjects[bpOid];
        if (!betrper) continue;
        const persOid = betrper.attrs?.["m_lPers"];
        const betrOid = betrper.attrs?.["m_lBetr"];
        if (typeof persOid === "number" && allObjects[persOid]) {
          const persObj = allObjects[persOid];
          const pGObj = new GObjLink();
          pGObj.SetViewedObject(persObj.oid);
          pGObj.SetText(labelFor(persObj));
          placeWithFallback(grid, pGObj, readRaster(persObj.attrs));
          new GLink(aGObj, pGObj);
        }
        if (typeof betrOid === "number" && allObjects[betrOid]) {
          const betrObj = allObjects[betrOid];
          const bGObj = new GObjLink();
          bGObj.SetViewedObject(betrObj.oid);
          bGObj.SetText(labelFor(betrObj));
          placeWithFallback(grid, bGObj, readRaster(betrObj.attrs));
          new GLink(aGObj, bGObj);
        }
      }
    }

    // Link Knoten → AssozRess (VT_KNO_ASSRES, C++ Z.372)
    new GLink(knotenGObj, aGObj);
  }

  // -------- 3. Speicher-Assoz (m_lAssozSpeich → PAssozSpeicher) -----------
  // C++ Z.199-216, Z.430-468. m_lAssozSpeich ist Scalar-OID (kein Wrapper),
  // zeigt direkt auf PAssozSpeicher. Dessen m_lSpeicher ist Wrapper-OID
  // (PSpeicherProzLList) mit den enthaltenen SpeicherProz-Items.
  const assozSpeichOid = knoten.attrs?.["m_lAssozSpeich"];
  if (typeof assozSpeichOid === "number" && assozSpeichOid > 0) {
    const assozSpeich = allObjects[assozSpeichOid];
    if (assozSpeich) {
      const asGObj = new GObjLink();
      asGObj.SetViewedObject(assozSpeich.oid);
      asGObj.SetText(labelFor(assozSpeich));
      placeWithFallback(grid, asGObj, readRaster(assozSpeich.attrs));

      // 3a. SpeicherProz via Wrapper PSpeicherProzLList
      const speiOids = readListViaWrapper(
        assozSpeich,
        "m_lSpeicher",
        allObjects,
      );
      for (const sOid of speiOids) {
        const speiproz = allObjects[sOid];
        if (!speiproz) continue;
        const spGObj = new GObjLink();
        spGObj.SetViewedObject(speiproz.oid);
        spGObj.SetText(labelFor(speiproz));
        placeWithFallback(grid, spGObj, readRaster(speiproz.attrs));
        // Link AssozSpeich → SpeicherProz (VT_ASSSPE_PROSPE)
        new GLink(asGObj, spGObj);

        // 3b. SpeicherProz → aktive Ressourcen (VT_PROSPE_AKT, C++ Z.451-464).
        // Wrapper-Pfad analog: speiproz.m_lRessourcen → PRessBelegLList.
        const aktRessOids = readListViaWrapper(
          speiproz,
          "m_lRessourcen",
          allObjects,
        );
        for (const aOid of aktRessOids) {
          const aktRess = allObjects[aOid];
          if (!aktRess) continue;
          // Direkter Wire-Lookup: gibt es schon ein GObj? Phase-1.2 baut den
          // Graphen einmalig in einem Durchgang — daher kein Re-Use-Lookup;
          // wir fügen die Ressource potenziell mehrfach ein (selten in
          // Real-Modellen mit Speicher-Prozessen).
          const aGObj = new GObjLink();
          aGObj.SetViewedObject(aktRess.oid);
          aGObj.SetText(labelFor(aktRess));
          placeWithFallback(grid, aGObj, readRaster(aktRess.attrs));
          new GLink(spGObj, aGObj);
        }
      }

      // Link Knoten → AssozSpeich (VT_KNO_ASSSPE, C++ Z.434)
      new GLink(knotenGObj, asGObj);
    }
  }

  // Auch direkter PSpeicherProzLList als m_lAssozSpeich-Ziel ist möglich
  // (siehe Test-Fixture). Dann iterieren wir den Wrapper direkt und
  // platzieren die SpeicherProzs ohne Zwischen-PAssozSpeicher.
  // — Dieser Fall ist im Real-Modell selten; readListViaWrapper above
  // mit assozSpeichOid würde fehlschlagen, weil PSpeicherProzLList kein
  // m_lAssozSpeich-Wrapper ist. Wir behandeln das separat hier:
  if (typeof assozSpeichOid === "number" && assozSpeichOid > 0) {
    const target = allObjects[assozSpeichOid];
    if (target?.klass === "PSpeicherProzLList") {
      const speiOids = Array.isArray(target.sub_refs?.[0])
        ? (target.sub_refs[0] as number[])
        : [];
      for (const sOid of speiOids) {
        const speiproz = allObjects[sOid];
        if (!speiproz) continue;
        const spGObj = new GObjLink();
        spGObj.SetViewedObject(speiproz.oid);
        spGObj.SetText(labelFor(speiproz));
        placeWithFallback(grid, spGObj, readRaster(speiproz.attrs));
        new GLink(knotenGObj, spGObj);
      }
    }
  }

  // Welle-9-Variante (Engine-LList-Resolution) als Fallback: wenn
  // m_lAssozSpeich bereits als Array kommt, iteriere direkt.
  for (const speOid of readListDirect(knoten, "m_lAssozSpeich")) {
    const obj = allObjects[speOid];
    if (!obj) continue;
    const spGObj = new GObjLink();
    spGObj.SetViewedObject(obj.oid);
    spGObj.SetText(labelFor(obj));
    placeWithFallback(grid, spGObj, readRaster(obj.attrs));
    new GLink(knotenGObj, spGObj);
  }

  // -------- 4. Finalize Layout — bottom-up Sub-Grids, dann Sizes, dann Positions
  grid.finalizeLayout({ x: 0, y: 0 });
  return grid;
}

// ---------------------------------------------------------------------------
// Listener-Hook — Phase-4-Vorbereitung (no-op)
// ---------------------------------------------------------------------------

/**
 * Phase-4-Vorbereitung: Slot für den Sim-Listener.
 *
 * Im C++-Original (`PListenerPDlplConnKnotenViewer`, siehe
 * `01.2-07-CPP-AUDIT.md` §3) hängt der Viewer einen `OListenerSimulator`-
 * Subscriber an den `PSimulator` und reagiert auf vier Event-Typen:
 *
 *   - `OnPeriodBegin(timeBegin, timeEnd)` — Editor sperren, Live-Modus aktiv
 *   - `OnPeriodEnd(timeEnd)` — Editor freigeben
 *   - `OnSimBegin(timeBegin)` — globaler Sim-Start
 *   - `OnGfxEvent(timeCurrent)` — Live-Repaint-Tick
 *
 * Phase 1.2 stellt nur die Signatur bereit. Phase 4 wird hier den
 * WebSocket `/ws/runs/{run_id}` subscriben — ohne Component-Restruktur.
 *
 * **Bewusst kein useEffect:** Threat T-01.2-19 verlangt, dass der Hook
 * KEINEN Effect triggert. Tests 5 verifiziert das.
 */
export function useSimulationListener(_handlers: {
  onPeriodBegin?: (timeBegin: number, timeEnd: number) => void;
  onPeriodEnd?: (timeEnd: number) => void;
  onSimBegin?: (timeBegin: number) => void;
  onGfxEvent?: (timeCurrent: number) => void;
}): void {
  // Intentionally no-op. Phase 4 verdrahtet hier den WebSocket-Subscriber.
}

// ---------------------------------------------------------------------------
// Viewer-Component
// ---------------------------------------------------------------------------

/**
 * Public-Export: Wraps die Inner-Component in `ReactFlowProvider`.
 * 1:1-Pattern aus `PDurchlaufplanViewerDesign` (Welle G21) — Konsument
 * braucht den Provider on top, damit `useReactFlow` im Inner verfügbar
 * ist (`GraphFlowCanvas` selbst hängt KEINEN eigenen Provider mehr ein).
 */
export function PDlplConnKnotenViewer(props: ViewerProps): React.ReactElement {
  return (
    <ReactFlowProvider>
      <PDlplConnKnotenViewerInner {...props} />
    </ReactFlowProvider>
  );
}

function PDlplConnKnotenViewerInner(props: ViewerProps): React.ReactElement {
  const { obj, allObjects, disabled } = props;

  // Revision-Counter — Phase 1.2 ist Read-Only, daher kein bumpRevision-
  // Trigger nötig; behalten als Hook für Phase-4-Live-Updates.
  const [revision] = React.useState(0);

  // Hook-Mount für Phase 4 (no-op).
  useSimulationListener({});

  // Grid-Build memoized. Re-Build bei Wechsel des angezeigten Knotens,
  // Wire-Mutation (allObjects-Reference) oder revision-Bump.
  const grid = React.useMemo(
    () => buildKnotenDetailGrid(obj, allObjects),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.oid, allObjects, revision],
  );

  const title = `Knoten-Detail — ${labelFor(obj)}`;
  const description = `${obj.klass} (oid ${obj.oid})`;

  return (
    <ChildDialog title={title} description={description}>
      <div
        data-viewer="PDlplConnKnotenViewer"
        data-oid={obj.oid}
        className="h-full w-full"
      >
        <GraphFlowCanvas
          grid={grid}
          revision={revision}
          readOnly={disabled ?? true}
        />
      </div>
    </ChildDialog>
  );
}
