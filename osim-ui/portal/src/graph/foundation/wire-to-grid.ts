/**
 * wire-to-grid — Konvertiert ein PDurchlaufplan-Wire-Objekt in einen
 * OGraphGrid mit GObjLink-Knoten + GLink-Kanten + verschachtelten GObjSub-
 * Containern für Sub-Pläne.
 *
 * Vertrag mit dem Wire-Format (Plan 01-07/10, Welle G2, Welle G6):
 * - PDurchlaufplan-Objekt hat `attrs.m_lKnoten: number[]` (Welle 9 löst die
 *   Engine-LListPtr-Kette auf) oder Fallback `sub_refs[0]: number[]`
 * - PDurchlaufplan-Objekt hat `attrs.m_lKanten: number[]` oder `sub_refs[1]`
 * - Knoten haben `attrs.m_pntRaster: [col, row]` als Original-Rasterposition
 *   (kanonisch, exakt wie OSim2004). `m_iPosX/Y` ist Fallback für neu
 *   angelegte Knoten OHNE Raster (Drag-State vor Grid-Snap).
 * - Kanten haben `attrs.m_lVorgaenger`/`m_lNachfolger` als OID-Referenz
 * - Alle Objekte haben `attrs.m_sName` als Label
 *
 * **Sub-Plan-Hierarchie (Welle G6, 1:1 aus elval1.cpp + OGOAlt.cpp):**
 * `PDurchlaufplan.m_lKnotenOber` zeigt auf den Parent-Container — das kann
 * entweder ein **anderer PDurchlaufplan** sein (Plan-zu-Plan-Hierarchie, im
 * Original wird der Sub-Plan als zusätzliches Sub-Grid im Parent gerendert)
 * ODER ein **Knoten** des Parent-Plans (Alternativ-Container, im Original
 * `class GObjAlt : public GObjSub` mit `m_GOList.AddTail(grid)` siehe
 * `OGOAlt.cpp:211`). In beiden Fällen wird der Sub-Plan rekursiv in einen
 * eigenen `OGraphGrid` aufgebaut und via `GObjSub.AddSubCollection` an einen
 * `GObjSub`-Container gehängt. Cycle-Schutz via `visited`-Set.
 *
 * Reziproke Funktion `syncGridToWire` schreibt Änderungen (Drag/Connect/
 * Delete) zurück in den model-store.
 */

import { GObjLink } from "@/graph/foundation/GObjLink";
import { GObjSub } from "@/graph/foundation/GObjSub";
import { GLink } from "@/graph/foundation/GLink";
import { GLinkSquare } from "@/graph/foundation/GLinkSquare";
import { OGraphGrid } from "@/graph/foundation/OGraphGrid";
import { GOStateSub } from "@/graph/foundation/types";
import { STD_OBJ_HEIGHT, STD_OBJ_WIDTH } from "@/graph/foundation/constants";
import type { OBaseObj } from "@/viewers/core/types";

/**
 * Wählt die GLink-Subklasse passend zur Wire-Kanten-Klasse.
 *
 * PPS-Modelle (PDlplKante, PDlplKnoten-Übergänge etc.) nutzen im OSim2004-
 * Original rechtwinkliges Routing → GLinkSquare. Default-Fallback: plain
 * GLink (smoothstep im Adapter).
 */
function makeLinkInstance(
  klass: string,
  source: GObjLink,
  target: GObjLink,
): GLink {
  if (klass.startsWith("PDlplKante") || klass.includes("Kante")) {
    return new GLinkSquare(source, target);
  }
  return new GLink(source, target);
}

/**
 * Liest m_pntRaster als (col, row)-Paar aus den Wire-Attrs.
 * Python-Tuples kommen über JSON als Array an: `[col, row]`.
 * Akzeptiert auch Object-Shape `{x, y}` aus älteren Pfaden.
 *
 * Spezialfall OSim2004: `(-1,-1)` markiert "keine explizite Raster-Position"
 * (z.B. bei PDurchlaufplan-Containern selbst) — wir liefern null zurück,
 * damit der Aufrufer die Fallback-Strategie greift.
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

/**
 * Liest ein einzelnes OID-Wert aus einem Wire-Attribut. Welle 9 löst LList-
 * Container zu int auf — bei alten Fixtures kann es noch ein Array sein.
 * ONULL wird in der Engine zu 0 oder null serialisiert.
 */
function readSingleOid(val: unknown): number | null {
  if (typeof val === "number" && val > 0) return val;
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === "number") {
    return val[0] > 0 ? val[0] : null;
  }
  return null;
}

/**
 * Welle G17-C: Liest eine OID-LISTE aus einem Wire-Attribut-Value (Single-
 * Ref, Liste, oder Null). PDlplKante hat `m_lVorgaenger`/`m_lNachfolger`
 * als LISTE — im OSim2004-Original können Kanten zu mehreren Vorgängern
 * UND mehreren Nachfolgern gehen (Branching/Merging-Topology). Vor G17
 * wurde nur der erste Eintrag gelesen → 4 von 5 Edges verloren bei
 * `n=[417,485,541,545,549]`.
 *
 * Akzeptiert: `number` (Single-Ref nach Welle 9), `number[]` (LList-
 * Resolution), oder Mix. Liefert leere Liste wenn nichts brauchbar.
 *
 * Hinweis: Es gibt eine zweite `readOidList(planObj, attrName, subRefIdx)`-
 * Funktion unten — die liest direkt aus Plan-Knoten-/Kanten-Sub-Refs. Diese
 * hier ist für Kanten-V/N-Listen.
 */
function readOidListFromVal(val: unknown): number[] {
  if (typeof val === "number" && val > 0) return [val];
  if (Array.isArray(val)) {
    const out: number[] = [];
    for (const x of val) {
      if (typeof x === "number" && x > 0) out.push(x);
    }
    return out;
  }
  return [];
}

/**
 * Liest eine OID-Liste aus einem Wire-attr. Welle 9 löst LList-Container zu
 * `list[int]` auf; ältere Modelle könnten weiterhin sub_refs nutzen.
 */
function readOidList(
  planObj: OBaseObj,
  attrName: string,
  subRefIdx: number,
): number[] {
  const fromAttr = planObj.attrs?.[attrName];
  if (Array.isArray(fromAttr) && fromAttr.every((v) => typeof v === "number")) {
    return fromAttr as number[];
  }
  return (planObj.sub_refs?.[subRefIdx] as number[] | undefined) ?? [];
}

/**
 * Baut einen Reverse-Index aller PDurchlaufpläne mit nicht-leerem
 * `m_lKnotenOber`. Das ist der Daten-Pfad aus dem C++-Original — siehe
 * `elval1.cpp:420` (`oprPDurchlaufplan(...41)->m_lKnotenOber.SetOID(36)`).
 *
 * Map: ParentOid → Liste der OIDs aller PDurchlaufpläne, die diesen Parent
 * referenzieren. Der Parent kann entweder ein Knoten (Alternativ-Container)
 * oder ein anderer Plan sein.
 */
function buildSubPlansIndex(
  allObjects: Record<number, OBaseObj>,
): Map<number, number[]> {
  const idx = new Map<number, number[]>();
  for (const obj of Object.values(allObjects)) {
    if (obj.klass !== "PDurchlaufplan") continue;
    const parent = readSingleOid(obj.attrs?.["m_lKnotenOber"]);
    if (parent === null) continue;
    const list = idx.get(parent) ?? [];
    list.push(obj.oid);
    idx.set(parent, list);
  }
  return idx;
}

/**
 * Mapping Wire-Klasse → CSS-Farben.
 */
function colorForKlass(klass: string): { bg: string; fg: string } {
  if (klass.startsWith("PDpKnKonstant")) return { bg: "#dbeafe", fg: "#1e3a8a" };
  if (klass.startsWith("PDpKnAlternativ"))
    return { bg: "#fef3c7", fg: "#92400e" };
  if (klass.startsWith("PDpKnSpeicher")) return { bg: "#dcfce7", fg: "#166534" };
  if (klass.startsWith("PAsl") || klass.includes("Ausloeser"))
    return { bg: "#fce7f3", fg: "#9f1239" };
  if (klass === "PDurchlaufplan") return { bg: "#f0f9ff", fg: "#075985" };
  return { bg: "#ffffff", fg: "#0f172a" };
}

export interface WireToGridResult {
  /** Der gefüllte OGraphGrid. */
  grid: OGraphGrid;
  /** Map: Wire-OID → GObject (für Lookup beim Sync zurück). Enthält auch
   *  Knoten aus rekursiv aufgebauten Sub-Pläne. */
  oidToObj: Map<number, GObjLink>;
}

interface WireToGridOptions {
  /** Set bereits besuchter Plan-OIDs (Cycle-Protection bei m_lKnotenOber-
   *  Daten-Fehlern wie A→B→A). Wird bei Rekursion fortgeschrieben. */
  visited?: Set<number>;
  /** Optional: liefert true für Klassen, die als nested GObjSub statt
   *  einfachem GObjLink behandelt werden sollen (Override des Default-
   *  Verhaltens, das ausschliesslich m_lKnotenOber konsultiert). */
  nestedKlassPredicate?: (klass: string) => boolean;
  /** Optional vorgerechneter Reverse-Index — wenn nicht gesetzt, wird er
   *  einmalig pro `wireToGrid`-Top-Level-Aufruf gebaut und in der Rekursion
   *  weitergereicht. */
  subPlansIndex?: Map<number, number[]>;
}

/**
 * Konvertiert die m_pntRaster-Pixel-Fallback-Logik in (col, row).
 */
function resolvePosition(
  wireObj: OBaseObj,
  idx: number,
  grid: OGraphGrid,
): { col: number; row: number } {
  const raster = readRaster(wireObj.attrs);
  if (raster) return raster;
  const posX = wireObj.attrs?.["m_iPosX"];
  const posY = wireObj.attrs?.["m_iPosY"];
  if (typeof posX === "number" && typeof posY === "number") {
    const stride = grid.m_csStdGridExtent.cx + grid.m_iStdLinkPlace;
    const vstride = grid.m_csStdGridExtent.cy + grid.m_iStdLinkPlace;
    return {
      col: Math.max(0, Math.round(posX / stride)),
      row: Math.max(0, Math.round(posY / vstride)),
    };
  }
  return { col: idx, row: 0 };
}

/**
 * Liefert die höchste in `grid` belegte Zeile, oder -1 wenn leer.
 * Genutzt vom Plan-zu-Plan-Sub-Container-Layout, um eine freie Zeile UNTER
 * den regulären Knoten zu finden.
 */
function computeMaxRow(grid: OGraphGrid): number {
  let maxRow = -1;
  for (const rowHead of grid.m_GRowList) {
    if (rowHead.m_GRowPos > maxRow) maxRow = rowHead.m_GRowPos;
  }
  return maxRow;
}

/**
 * Baut einen OGraphGrid aus einem PDurchlaufplan-Wire-Objekt.
 *
 * **Welle G6 — rekursiv:** Per Knoten und per Plan werden Sub-Pläne via
 * `m_lKnotenOber`-Reverse-Index aufgelöst und als nested `GObjSub` mit
 * eigenem internen `OGraphGrid` eingebaut. Doppelklick im Renderer toggelt
 * D_OPEN ↔ D_CLOSED.
 *
 * @param planOid OID des PDurchlaufplan
 * @param allObjects Wire-Objekte-Map (model-store.wire.objects)
 * @param options Optional: visited-Set für Cycle-Protection, vorgerechneter
 *   Sub-Plan-Index, Klass-Override-Predicate
 */
export function wireToGrid(
  planOid: number,
  allObjects: Record<number, OBaseObj>,
  options: WireToGridOptions = {},
): WireToGridResult {
  const grid = new OGraphGrid();
  const oidToObj = new Map<number, GObjLink>();

  // Cycle-Protection: derselbe Plan im Pfad → abbrechen (leerer Grid).
  const visited = options.visited ?? new Set<number>();
  if (visited.has(planOid)) return { grid, oidToObj };
  const nextVisited = new Set([...visited, planOid]);

  const plan = allObjects[planOid];
  if (!plan) return { grid, oidToObj };

  // Welle G2: Zellgröße = Standard-Knotengröße, damit Knoten genau in eine
  // Zelle passen und die Original-Raster-Koordinaten visuell sinnvoll auf
  // den Canvas projizieren. STD_LINK_PLACE=20 sorgt für sichtbare Spalten-/
  // Zeilen-Lücken zwischen den Zellen.
  grid.m_csStdGridExtent = { cx: STD_OBJ_WIDTH, cy: STD_OBJ_HEIGHT };

  // Sub-Plan-Index einmalig pro Top-Level-Aufruf bauen, in Rekursion teilen.
  const subPlansIndex =
    options.subPlansIndex ?? buildSubPlansIndex(allObjects);

  const klassOverride =
    options.nestedKlassPredicate ??
    ((klass) => klass.includes("Unterplan") || klass.includes("SubPlan"));

  // Hilfsfunktion: instantiiert einen Knoten als GObjLink ODER GObjSub +
  // hängt rekursiv Sub-Pläne ein. Sub-Plan-Knoten und Sub-Plan-Kanten landen
  // ebenfalls in oidToObj, damit Lookups durch die ganze Hierarchie funktionieren.
  function makeKnoten(wireObj: OBaseObj): GObjLink {
    const subPlanOids = subPlansIndex.get(wireObj.oid) ?? [];
    const isAlternativContainer = subPlanOids.length > 0;
    const forceSub = klassOverride(wireObj.klass);

    if (isAlternativContainer || forceSub) {
      const gSub = new GObjSub();
      gSub.SetViewedObject(wireObj.oid);
      gSub.SetText(labelFor(wireObj));
      const colors = colorForKlass(wireObj.klass);
      gSub.m_BackColor = colors.bg;
      gSub.m_TextColor = colors.fg;

      // Jeder referenzierte Sub-Plan wird zu einem eigenen OGraphGrid in der
      // Sub-View — 1:1 zu OGOAlt.cpp:211 `m_GOList.AddTail(grid)`.
      for (const subPlanOid of subPlanOids) {
        const subResult = wireToGrid(subPlanOid, allObjects, {
          visited: nextVisited,
          nestedKlassPredicate: options.nestedKlassPredicate,
          subPlansIndex,
        });
        gSub.AddSubCollection(subResult.grid);
        subResult.oidToObj.forEach((v, k) => oidToObj.set(k, v));
      }
      // D_OPEN per Default: der User sieht die Hierarchie sofort. Doppelklick
      // im Renderer toggelt auf D_CLOSED (siehe GObjSub.OnEditGo).
      gSub.SetSubState(GOStateSub.D_OPEN);
      return gSub;
    }

    // Standard-Knoten
    const gObj = new GObjLink();
    gObj.SetViewedObject(wireObj.oid);
    gObj.SetText(labelFor(wireObj));
    gObj.m_wireKlass = wireObj.klass;
    const colors = colorForKlass(wireObj.klass);
    gObj.m_BackColor = colors.bg;
    gObj.m_TextColor = colors.fg;
    return gObj;
  }

  // Knoten dieses Plans (Welle 9: attrs.m_lKnoten oder Fallback sub_refs[0])
  const knotenOids = readOidList(plan, "m_lKnoten", 0);
  knotenOids.forEach((knotenOid, idx) => {
    const wireObj = allObjects[knotenOid];
    if (!wireObj) return;

    const gObj = makeKnoten(wireObj);
    const { col, row } = resolvePosition(wireObj, idx, grid);

    // GOIns berechnet aus pColHead.m_StartPos + pRowHead.m_StartPos + m_GOrg
    // automatisch die Pixel-Position auf obj.m_GOrg. KEIN nachgelagertes
    // SetPosition mehr (würde Layout zerstören).
    const ok = grid.GOIns(gObj, col, row, false);
    if (!ok) {
      const free = { x: col, y: row };
      grid.GetNextFreeGridPlace(free);
      grid.GOIns(gObj, free.x, free.y, false);
    }

    oidToObj.set(knotenOid, gObj);
  });

  // Kanten dieses Plans — Welle G11+G17-C:
  //
  // Im OSim2004-Original sind PDlplKante-Objekte EIGENSTÄNDIGE GRID-KNOTEN
  // mit eigener m_pntRaster-Position (Lücken-Spalten zwischen Knoten). Sie
  // rendern als kleine Box mit Linien zu ihren Vorgänger-/Nachfolger-Knoten.
  //
  // **Welle G17-C — Multi-Topology + Plan-Self-Refs:**
  // - `m_lVorgaenger` und `m_lNachfolger` sind LISTEN (Branching/Merging).
  //   Pro (Vorgänger × Nachfolger) wird ein GLink erzeugt. Vor G17 wurde
  //   nur der erste Eintrag gelesen → 4 von 5 Edges verloren bei
  //   `n=[417,485,541,545,549]`.
  // - **Plan-Self-Referenzen**: `v=[planOid]` bzw. `n=[planOid]` markieren
  //   Start-/End-Kanten. Der Plan ist KEIN Grid-Element — also wird in
  //   diesen Fällen kein GLink zum Plan gezeichnet (Plan-Reference einfach
  //   skippen pro V-/N-Eintrag). Die Kanten-Box wird trotzdem gerendert.
  // - **m_pntRaster=(-1,-1)**: gemäß Original-Verhalten (PSimObj.odh:108)
  //   = "nicht im Plan platziert" → Kante wird komplett ausgelassen.
  const kantenOids = readOidList(plan, "m_lKanten", 1);
  for (const kantenOid of kantenOids) {
    const wireObj = allObjects[kantenOid];
    if (!wireObj) continue;

    // OSim2004-Original: m_pntRaster=(-1,-1) = nicht platziert → skip.
    const kantenRaster = readRaster(wireObj.attrs);
    if (kantenRaster === null) continue;

    // Multi-Vorgänger / Multi-Nachfolger lesen
    const vonOids = readOidListFromVal(
      wireObj.attrs["m_lVorgaenger"] ?? wireObj.attrs["m_oid_von"],
    );
    const nachOids = readOidListFromVal(
      wireObj.attrs["m_lNachfolger"] ?? wireObj.attrs["m_oid_nach"],
    );
    if (vonOids.length === 0 || nachOids.length === 0) continue;

    // Plan-Self-Refs filtern: der Plan selbst ist kein Grid-Element.
    // Wir behalten aber alle anderen Refs — wenn eine Kante z.B.
    // v=[planOid] n=[planOid, 690] hat, bleibt nach Filter v=[] n=[690],
    // dann unten nur n iterieren mit "Start"-Marker als source.
    const realVon = vonOids.filter((o) => o !== planOid);
    const realNach = nachOids.filter((o) => o !== planOid);
    const isStartKante = realVon.length === 0 && vonOids.includes(planOid);
    const isEndKante = realNach.length === 0 && nachOids.includes(planOid);

    // Wenn nach dem Filter weder echte Vorgänger noch Nachfolger übrig
    // sind und nur Plan-Refs, ist die Kante topologisch leer — skip.
    if (realVon.length === 0 && realNach.length === 0) continue;

    // Kanten-Knoten in den Grid einsetzen
    const kantenObj = new GObjLink();
    kantenObj.SetViewedObject(kantenOid);
    kantenObj.m_wireKlass = wireObj.klass;
    const kanteName = wireObj.attrs["m_sName"];
    kantenObj.SetText(
      typeof kanteName === "string" && kanteName.length > 0 ? kanteName : "",
    );
    const okKante = grid.GOIns(kantenObj, kantenRaster.col, kantenRaster.row, false);
    if (!okKante) {
      const free = { x: kantenRaster.col, y: kantenRaster.row };
      grid.GetNextFreeGridPlace(free);
      grid.GOIns(kantenObj, free.x, free.y, false);
    }
    oidToObj.set(kantenOid, kantenObj);
    kantenObj.m_BackColor = isStartKante
      ? "#dcfce7" // hellgrün = Start
      : isEndKante
        ? "#fee2e2" // hellrot = Ende
        : "#ffffff";
    kantenObj.m_TextColor = "#0f172a";
    kantenObj.SetSize({ cx: 40, cy: 30 });

    // GLinks erzeugen: pro (Vorgänger × Nachfolger) eine Linie. Plan-
    // Self-Refs erzeugen KEINE Links (Plan ist kein Grid-Element).
    for (const vOid of realVon) {
      const source = oidToObj.get(vOid);
      if (!source) continue;
      for (const nOid of realNach) {
        const target = oidToObj.get(nOid);
        if (!target) continue;
        // Visualisierung: source → kantenBox → target. Pro V×N-Kombi
        // werden zwei kurze Links erzeugt, die sich in der Box treffen.
        const linkIn = makeLinkInstance(wireObj.klass, source, kantenObj);
        linkIn.SetViewedObject(`${kantenOid}-in-${vOid}`);
        const linkOut = makeLinkInstance(wireObj.klass, kantenObj, target);
        linkOut.SetViewedObject(`${kantenOid}-out-${nOid}`);
      }
    }

    // Edge-Cases: Start-Kante (nur Nachfolger) → reine "kantenBox → target"-
    // Links zeichnen ohne source. End-Kante umgekehrt.
    if (isStartKante && realVon.length === 0) {
      for (const nOid of realNach) {
        const target = oidToObj.get(nOid);
        if (!target) continue;
        const linkOut = makeLinkInstance(wireObj.klass, kantenObj, target);
        linkOut.SetViewedObject(`${kantenOid}-startout-${nOid}`);
      }
    }
    if (isEndKante && realNach.length === 0) {
      for (const vOid of realVon) {
        const source = oidToObj.get(vOid);
        if (!source) continue;
        const linkIn = makeLinkInstance(wireObj.klass, source, kantenObj);
        linkIn.SetViewedObject(`${kantenOid}-endin-${vOid}`);
      }
    }
  }

  // Plan-zu-Plan-Hierarchie: Sub-Pläne, deren m_lKnotenOber direkt auf DIESEN
  // Plan zeigt (nicht auf einen Knoten). Sie werden als zusätzliche
  // GObjSub-Container in eigene Zeilen unter den regulären Knoten platziert.
  // Begründung: das C++-Original hängt Sub-Pläne mit Plan-Parent als weitere
  // m_GOList-Einträge an die OGraphView — Position ist nicht im OTX persistiert,
  // also wählen wir eine deterministische "unter den Knoten"-Anordnung.
  const directChildPlans = subPlansIndex.get(planOid) ?? [];
  if (directChildPlans.length > 0) {
    let nextRow = computeMaxRow(grid) + 2; // 1 Zeile Abstand zu den Knoten
    for (const childPlanOid of directChildPlans) {
      if (nextVisited.has(childPlanOid)) continue; // bereits in Rekursion
      const childPlan = allObjects[childPlanOid];
      if (!childPlan) continue;

      const gSub = new GObjSub();
      gSub.SetViewedObject(childPlanOid);
      gSub.SetText(labelFor(childPlan));
      const colors = colorForKlass("PDurchlaufplan");
      gSub.m_BackColor = colors.bg;
      gSub.m_TextColor = colors.fg;

      const subResult = wireToGrid(childPlanOid, allObjects, {
        visited: nextVisited,
        nestedKlassPredicate: options.nestedKlassPredicate,
        subPlansIndex,
      });
      gSub.AddSubCollection(subResult.grid);
      gSub.SetSubState(GOStateSub.D_OPEN);
      subResult.oidToObj.forEach((v, k) => oidToObj.set(k, v));

      const ok = grid.GOIns(gSub, 0, nextRow, false);
      if (!ok) {
        const free = { x: 0, y: nextRow };
        grid.GetNextFreeGridPlace(free);
        grid.GOIns(gSub, free.x, free.y, false);
      }
      oidToObj.set(childPlanOid, gSub);
      nextRow++;
    }
  }

  // Welle G18-D: Mindest-Grid-Größe (1:1 OSim2004 STD_GRID_WIDTH=20 ×
  // STD_GRID_HEIGHT=10). Auch wenn der Plan leer ist oder nur wenige
  // Knoten hat: das Raster zeigt ein 20×10-Gitter, damit User Platz zum
  // Modellieren sieht. ExpandCol/ExpandRow legen leere Spalten/Zeilen
  // bis zur gewünschten Größe an — siehe OGraphGrid.ExpandColTo /
  // ExpandRowTo. Nur beim Top-Level-Aufruf (Sub-Grids sind eng).
  if (visited.size === 0) {
    const MIN_COLS = 20;
    const MIN_ROWS = 10;
    if (grid.m_GColList.length < MIN_COLS) {
      grid.GOIns(new GObjLink(), MIN_COLS - 1, 0, false);
      // Der Platzhalter dient nur dem Spalten-Aufbau — entfernen.
      grid.GORemove(MIN_COLS - 1, 0);
    }
    if (grid.m_GRowList.length < MIN_ROWS) {
      grid.GOIns(new GObjLink(), 0, MIN_ROWS - 1, false);
      grid.GORemove(0, MIN_ROWS - 1);
    }
  }

  // Welle G7: finales Layout NUR beim Top-Level-Aufruf (visited war leer).
  // finalizeLayout iteriert bottom-up alle Sub-Grids und setzt dann die
  // Spalten-/Zeilen-Größen + Pixel-Positionen exakt nach C++ OGGrid.cpp:2390+2469.
  if (visited.size === 0) {
    grid.finalizeLayout({ x: 0, y: 0 });
  }

  return { grid, oidToObj };
}

/**
 * Sinnvoller Anzeige-Name aus einem Wire-Objekt.
 */
function labelFor(wireObj: OBaseObj): string {
  const name = wireObj.attrs?.["m_sName"];
  if (typeof name === "string" && name.length > 0) return name;
  return `${wireObj.klass} #${wireObj.oid}`;
}
