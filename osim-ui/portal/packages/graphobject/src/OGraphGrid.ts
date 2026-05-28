/**
 * OGraphGrid — 2D-Raster-Collection von GObjects.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 1639+ und OGGrid.cpp.
 * Algorithmen aus 01.1-GRAPHOBJ-NOTES.md §5-§14.
 *
 * **Topologie (NOTES §20):**
 * - Jede besetzte Zelle (x,y) wird durch genau eine OGPositionGrid-Instanz
 *   repräsentiert.
 * - Diese Instanz hängt gleichzeitig in:
 *   - der Spalten-Doppelliste (sortiert nach pGridPos.y aufsteigend)
 *   - der Zeilen-Doppelliste (sortiert nach pGridPos.x aufsteigend)
 * - Beide Listen sind zirkulär — der Header (OGPositionGrid mit pObj=LNULL)
 *   ist gleichzeitig Anfang und Ende.
 * - m_GColList und m_GRowList sind nach m_GColPos/m_GRowPos sortiert.
 *
 * **Pool-Allokator entfällt:** in C++ wurden OGPositionGrid-Instanzen aus
 * einer Freelist (s_setPosFree, CPlex-Blöcke à 1000) geholt — in TS reicht
 * `new`. Die NewPos/FreePos-Semantik bleibt für API-Treue erhalten.
 *
 * **Pflicht-Invarianten:**
 * 1. pGridPos.x === pColHead.m_GColPos UND pGridPos.y === pRowHead.m_GRowPos
 * 2. Listen sind zirkulär (Header zeigt auf sich selbst wenn leer)
 * 3. pObj === LNULL markiert Header — NIE dereferenzieren
 * 4. m_GColList/m_GRowList sind aufsteigend nach m_GColPos/m_GRowPos sortiert
 * 5. Nach InsertCol/RemoveCol werden ALLE folgenden Spalten umnummeriert UND
 *    Pixel-StartPos/EndPos neu berechnet
 * 6. GOIns liefert false bei belegter Zelle UND rollbackt den Spalten-Eintrag
 * 7. RemoveCol/Row no-op wenn nicht leer
 */

import { GOGridCol } from "./GOGridCol";
import { GOGridRow } from "./GOGridRow";
import { OGPositionGrid } from "./OGPositionGrid";
import { OGraphCollection } from "./OGraphCollection";
import { LNULL, isLNull } from "./LNULL";
import {
  STD_BGN_X,
  STD_BGN_Y,
  STD_GRID_HEIGHT,
  STD_GRID_WIDTH,
  STD_LINK_PLACE,
} from "./constants";
import type { CPoint, CRect, CSize } from "./types";
import type { GObject } from "./GObject";

/**
 * Snapshot der Topologie eines Grids — für Snapshot-Tests (NOTES §17.7).
 */
export interface GridSnapshot {
  cols: { pos: number; startPos: number; endPos: number; width: number }[];
  rows: { pos: number; startPos: number; endPos: number; height: number }[];
  cells: { x: number; y: number; objId: string }[];
}

/**
 * 2D-Raster-Container für GObjects.
 */
export class OGraphGrid extends OGraphCollection {
  // ============================================================
  // Spalten-/Zeilen-Listen (sortiert nach pos aufsteigend)
  // ============================================================

  /** Alle Spalten-Header. Sortiert nach m_GColPos. */
  m_GColList: GOGridCol[] = [];

  /** Alle Zeilen-Header. Sortiert nach m_GRowPos. */
  m_GRowList: GOGridRow[] = [];

  // ============================================================
  // Konfiguration
  // ============================================================

  /** Standard-Zellgröße (cx × cy). */
  m_csStdGridExtent: CSize = { cx: STD_GRID_WIDTH, cy: STD_GRID_HEIGHT };

  /** Ursprung in virtuellen Koordinaten. */
  m_cpStdGridOrigin: CPoint = { x: 0, y: 0 };

  /** Lücke zwischen Zellen (Default STD_LINK_PLACE=20). */
  m_iStdLinkPlace: number = STD_LINK_PLACE;

  /** Grid-Origin auf dem Canvas (für SetPosition-Synchronisation). */
  m_GOrg: CPoint = { x: STD_BGN_X, y: STD_BGN_Y };

  /** Berechnete Gesamtgröße (Pixel) — gesetzt von computeSizes(). */
  m_GSize: CSize = { cx: STD_GRID_WIDTH, cy: STD_GRID_HEIGHT };

  /** Bounding-Rect des Grids im umgebenden Koordinatensystem. */
  m_VirtRect: CRect = { left: 0, top: 0, right: 0, bottom: 0 };

  // ============================================================
  // State-Flags
  // ============================================================

  /** Wurde gerade ein Einfügen ausgeführt? (für Invalidate-Optimierung) */
  m_isInsert: boolean = false;
  /** Spalten-/Zeilen-Resize läuft? */
  m_isColRowResize: boolean = false;
  /** Grid wurde horizontal vergrößert (in GetColHeadPos gesetzt)? */
  m_isGridHEnlarged: boolean = false;
  /** Grid wurde vertikal vergrößert? */
  m_isGridVEnlarged: boolean = false;

  // ============================================================
  // Konstruktor
  // ============================================================

  constructor() {
    super();
  }

  // ============================================================
  // Pool-Allokator (NOTES §5)
  // ============================================================

  /**
   * Allokiert einen neuen OGPositionGrid.
   * C++ NewPos(colprev, colnext) — initialisiert pColPrev/Next aus den Args,
   * andere Pointer auf null. In TS einfach `new`.
   */
  protected NewPos(
    colprev: OGPositionGrid | null,
    colnext: OGPositionGrid | null,
  ): OGPositionGrid {
    const p = new OGPositionGrid();
    p.pColPrev = colprev;
    p.pColNext = colnext;
    p.pObj = null;
    this.m_objCount++;
    return p;
  }

  /**
   * Gibt einen OGPositionGrid frei. C++ hängt ihn in s_setPosFree ein.
   * In TS: GC erledigt das.
   */
  protected FreePos(_pos: OGPositionGrid): void {
    this.m_objCount--;
  }

  // ============================================================
  // List-Header-Lookup mit Auto-Expand (NOTES §6)
  // ============================================================

  /**
   * Liefert den ersten echten Position-Knoten der Spalte `gnum`. Wenn die
   * Spalte noch nicht existiert, werden ALLE Spalten 0..gnum mit Header-
   * Sentinels angelegt (Auto-Expand).
   *
   * Return: pColNext des Spalten-Headers (= erstes echtes Objekt) oder null
   * wenn Spalte leer.
   */
  GetColHeadPos(gnum: number): OGPositionGrid | null {
    this.m_isGridHEnlarged = false;
    const listcount = this.m_GColList.length;

    // Auto-Expand: lege fehlende Spalten 0..gnum an.
    if (listcount <= gnum) {
      this.m_isGridHEnlarged = true;
      for (let i = listcount; i < gnum + 1; i++) {
        const col = new GOGridCol(i, this.m_csStdGridExtent.cx);
        const ogpos = this.NewPos(null, null);
        // Zirkulär auf sich selbst (leere Spalte).
        ogpos.pColPrev = ogpos;
        ogpos.pColNext = ogpos;
        ogpos.pRowPrev = null;
        ogpos.pRowNext = null;
        ogpos.pObj = LNULL;
        ogpos.pColHead = col;
        ogpos.pRowHead = null;
        ogpos.pGridPos = { x: i, y: 0 };
        col.m_OGPositionGrid = ogpos;
        this.m_GColList.push(col);
      }

      // Pixel-StartPos/EndPos für die neu eingefügten Spalten berechnen.
      let prevCol: GOGridCol | null = null;
      for (let i = 0; i < this.m_GColList.length; i++) {
        const col = this.m_GColList[i];
        if (i >= listcount) {
          // Neu eingefügt.
          if (prevCol === null) {
            col.m_StartPos = this.m_cpStdGridOrigin.x;
            col.m_EndPos = col.m_StartPos + col.m_GColWidth;
          } else {
            col.m_StartPos = prevCol.m_EndPos + this.m_iStdLinkPlace;
            col.m_EndPos = col.m_StartPos + col.m_GColWidth;
          }
        }
        prevCol = col;
      }
      this.m_isInsert = true;
    }

    const col = this.m_GColList.find((c) => c.m_GColPos === gnum);
    if (!col || !col.m_OGPositionGrid) return null;
    const next = col.m_OGPositionGrid.pColNext;
    if (!next || isLNull(next.pObj)) return null;
    return next;
  }

  /**
   * Liefert den ersten echten Position-Knoten der Zeile `gnum`. Spiegelsymmetrisch
   * zu GetColHeadPos (NOTES §6).
   */
  GetRowHeadPos(gnum: number): OGPositionGrid | null {
    this.m_isGridVEnlarged = false;
    const listcount = this.m_GRowList.length;

    if (listcount <= gnum) {
      this.m_isGridVEnlarged = true;
      for (let i = listcount; i < gnum + 1; i++) {
        const row = new GOGridRow(i, this.m_csStdGridExtent.cy);
        const ogpos = this.NewPos(null, null);
        ogpos.pRowPrev = ogpos;
        ogpos.pRowNext = ogpos;
        ogpos.pColPrev = null;
        ogpos.pColNext = null;
        ogpos.pObj = LNULL;
        ogpos.pRowHead = row;
        ogpos.pColHead = null;
        ogpos.pGridPos = { x: 0, y: i };
        row.m_OGPositionGrid = ogpos;
        this.m_GRowList.push(row);
      }

      let prevRow: GOGridRow | null = null;
      for (let i = 0; i < this.m_GRowList.length; i++) {
        const row = this.m_GRowList[i];
        if (i >= listcount) {
          if (prevRow === null) {
            row.m_StartPos = this.m_cpStdGridOrigin.y;
            row.m_EndPos = row.m_StartPos + row.m_GRowHeight;
          } else {
            row.m_StartPos = prevRow.m_EndPos + this.m_iStdLinkPlace;
            row.m_EndPos = row.m_StartPos + row.m_GRowHeight;
          }
        }
        prevRow = row;
      }
      this.m_isInsert = true;
    }

    const row = this.m_GRowList.find((r) => r.m_GRowPos === gnum);
    if (!row || !row.m_OGPositionGrid) return null;
    const next = row.m_OGPositionGrid.pRowNext;
    if (!next || isLNull(next.pObj)) return null;
    return next;
  }

  // ============================================================
  // GOIns — Knoten einfügen (NOTES §7, ZENTRAL)
  // ============================================================

  /**
   * Fügt `obj` an der Grid-Position (x, y) ein.
   *
   * Liefert false wenn (x,y) bereits belegt — UND macht den evtl. teil-
   * gemachten Spalten-Eintrag rollbacken (NOTES §20 Invariante 6).
   *
   * `repaint=true` triggert InvalidateView nach Erfolg.
   */
  GOIns(obj: GObject, x: number, y: number, repaint: boolean = true): boolean {
    // 1. Koordinaten validieren
    if (x < -1 || y < -1 || x >= 1_000_000 || y >= 1_000_000) return false;

    let first = false;

    // 2. SPALTEN-Einfügen
    let pos = this.GetColHeadPos(x);
    let pNewGrid: OGPositionGrid | null = null;
    let insert = false;

    if (pos === null) {
      // Fall 1: Spalte ist leer
      const colHead = this.m_GColList.find((c) => c.m_GColPos === x);
      if (!colHead || !colHead.m_OGPositionGrid) return false;
      const head = colHead.m_OGPositionGrid;
      pNewGrid = this.NewPos(head, head);
      head.pColPrev = pNewGrid;
      head.pColNext = pNewGrid;
      pNewGrid.pColHead = colHead;
      pNewGrid.pObj = obj;
      pNewGrid.pGridPos = { x, y: 0 }; // y kommt im Zeilen-Schritt dazu
      first = true;
    } else {
      // Fall 2: Spalte nicht leer — Sortier-Einfügen nach pGridPos.y
      let pGridRemembered: OGPositionGrid = pos;
      let cursor: OGPositionGrid | null = pos;
      while (cursor !== null && !isLNull(cursor.pObj)) {
        const pGrid = cursor;
        if (pGrid.pGridPos.y < y) pGridRemembered = pGrid;
        if (pGrid.pGridPos.y === y) {
          // Platz belegt!
          return false;
        }
        if (pGrid.pGridPos.y > y) {
          // davor einhängen
          pNewGrid = this.NewPos(pGrid.pColPrev, pGrid);
          if (pGrid.pColPrev) pGrid.pColPrev.pColNext = pNewGrid;
          pGrid.pColPrev = pNewGrid;
          pNewGrid.pColHead = pGrid.pColHead;
          pNewGrid.pObj = obj;
          pNewGrid.pGridPos = { x, y: 0 };
          insert = true;
          break;
        }
        // weiter
        const next: OGPositionGrid | null = cursor.pColNext;
        if (!next || isLNull(next.pObj)) break;
        cursor = next;
      }
      if (!insert) {
        // Am Ende der Spalte anhängen
        pNewGrid = this.NewPos(
          pGridRemembered,
          pGridRemembered.pColNext,
        );
        if (pGridRemembered.pColNext) {
          pGridRemembered.pColNext.pColPrev = pNewGrid;
        }
        pGridRemembered.pColNext = pNewGrid;
        pNewGrid.pColHead = pGridRemembered.pColHead;
        pNewGrid.pObj = obj;
        pNewGrid.pGridPos = { x, y: 0 };
      }
    }

    if (!pNewGrid) return false;

    // 3. Erste Objekt-Initialisierung
    obj.m_OGPosition = pNewGrid;
    obj.m_OGView = this.m_OGView;
    obj.m_OGCollection = this;

    // 4. ZEILEN-Einfügen
    pos = this.GetRowHeadPos(y);
    insert = false;

    if (pos === null) {
      // Fall 1: Zeile leer
      const rowHead = this.m_GRowList.find((r) => r.m_GRowPos === y);
      if (!rowHead || !rowHead.m_OGPositionGrid) {
        // Spalten-Eintrag rollbacken
        this._rollbackColEntry(pNewGrid, obj);
        return false;
      }
      const head = rowHead.m_OGPositionGrid;
      pNewGrid.pRowNext = head;
      pNewGrid.pRowPrev = head;
      head.pRowPrev = pNewGrid;
      head.pRowNext = pNewGrid;
      pNewGrid.pRowHead = rowHead;
      pNewGrid.pGridPos.y = y;
      first = true;
    } else {
      let pGridRemembered: OGPositionGrid = pos;
      let cursor: OGPositionGrid | null = pos;
      while (cursor !== null && !isLNull(cursor.pObj)) {
        const pGrid = cursor;
        if (pGrid.pGridPos.x < x) pGridRemembered = pGrid;
        if (pGrid.pGridPos.x === x) {
          // Doppel-Eintrag! Spalten-Eintrag rollbacken
          this._rollbackColEntry(pNewGrid, obj);
          return false;
        }
        if (pGrid.pGridPos.x > x) {
          pNewGrid.pRowNext = pGrid;
          pNewGrid.pRowPrev = pGrid.pRowPrev;
          if (pGrid.pRowPrev) pGrid.pRowPrev.pRowNext = pNewGrid;
          pGrid.pRowPrev = pNewGrid;
          pNewGrid.pRowHead = pGrid.pRowHead;
          pNewGrid.pGridPos.y = y;
          insert = true;
          break;
        }
        const next: OGPositionGrid | null = cursor.pRowNext;
        if (!next || isLNull(next.pObj)) break;
        cursor = next;
      }
      if (!insert) {
        pNewGrid.pRowNext = pGridRemembered.pRowNext;
        pNewGrid.pRowPrev = pGridRemembered;
        if (pGridRemembered.pRowNext) {
          pGridRemembered.pRowNext.pRowPrev = pNewGrid;
        }
        pGridRemembered.pRowNext = pNewGrid;
        pNewGrid.pRowHead = pGridRemembered.pRowHead;
        pNewGrid.pGridPos.y = y;
      }
    }

    // 5. Pixel-Position des GObject setzen
    if (pNewGrid.pColHead && pNewGrid.pRowHead) {
      const objorg = {
        x: pNewGrid.pColHead.m_StartPos + this.m_GOrg.x,
        y: pNewGrid.pRowHead.m_StartPos + this.m_GOrg.y,
      };
      obj.SetPosition(objorg);
    }

    // 6. Invalidate falls nötig
    if (repaint) {
      const size: CSize = { cx: 0, cy: 0 };
      obj.GetSize(size);
      if (
        (pNewGrid.pColHead && size.cx > pNewGrid.pColHead.m_GColWidth) ||
        (pNewGrid.pRowHead && size.cy > pNewGrid.pRowHead.m_GRowHeight) ||
        first ||
        this.m_isInsert
      ) {
        this.InvalidateView();
        this.m_isInsert = false;
      } else if (this.m_OGView) {
        this.m_OGView.InvalidateView();
      }
    }

    // 7. Notifikation
    obj.OnGObj2CollAdded();
    // SendMessage(WM_GOBJ_OBJ_INSERTED) wird in Welle F als Event-Emit verdrahtet.

    // 8. Subobjekt-Spezialbehandlung — NOTES §7 Step 8.
    // Wenn der ENTHALTENE Grid in einem D_CLOSED GObjSub liegt, muss das neu
    // eingefügte Objekt versteckt werden. Geprüft via m_Parent.GetSubState().
    // Dynamic-Import-Trick (kein direkter Import von GObjSub) wegen Circular-
    // Risiko: wir prüfen über Duck-Typing.
    const parent = this.m_Parent as { GetSubState?: () => number } | null;
    if (parent && typeof parent.GetSubState === "function") {
      if (parent.GetSubState() === 0 /* D_CLOSED */) {
        obj.SetState(0 /* HIDDEN */);
        // Wenn obj selbst ein GObjSub ist, dessen Kinder rekursiv verstecken
        const objAsSub = obj as { SetChildsVisible?: (v: boolean) => boolean };
        if (typeof objAsSub.SetChildsVisible === "function") {
          objAsSub.SetChildsVisible(false);
        }
      }
    }

    return true;
  }

  /** Convenience: GOPIns mit CPoint statt x,y. */
  GOPIns(obj: GObject, p: CPoint, repaint: boolean = true): boolean {
    return this.GOIns(obj, p.x, p.y, repaint);
  }

  /** Rollback eines Spalten-Eintrags (intern, für GOIns-Fehlerpfad). */
  protected _rollbackColEntry(pGrid: OGPositionGrid, obj: GObject): void {
    if (pGrid.pColPrev && pGrid.pColNext) {
      pGrid.pColPrev.pColNext = pGrid.pColNext;
      pGrid.pColNext.pColPrev = pGrid.pColPrev;
    }
    this.FreePos(pGrid);
    obj.m_OGPosition = null;
    obj.m_OGView = null;
    obj.m_OGCollection = null;
  }

  // ============================================================
  // GetNextFreeGridPlace (NOTES §8)
  // ============================================================

  /**
   * Sucht zeilenweise von (p.x, p.y) aus die nächste freie Zelle.
   * Mutiert `p` in-place. Wenn nichts frei → p auf (colCount, rowCount).
   */
  GetNextFreeGridPlace(p: CPoint): void {
    if (p.x < 0) p.x = 0;
    if (p.y < 0) p.y = 0;
    const colCount = this.m_GColList.length;
    const rowCount = this.m_GRowList.length;

    if (p.x >= colCount && p.y >= rowCount) return;
    if (p.x >= colCount) return;
    if (p.y >= rowCount) return;

    for (let j = p.y; j < rowCount; j++) {
      for (let i = p.x; i < colCount; i++) {
        if (!this.IsGridPlaceTaken(i, j)) {
          p.x = i;
          p.y = j;
          return;
        }
      }
    }

    p.x = colCount;
    p.y = rowCount;
  }

  // ============================================================
  // IsGridPlaceTaken / IsGridBlockTaken (NOTES §9)
  // ============================================================

  IsGridPlaceTaken(x: number, y: number): boolean {
    if (x >= this.m_GColList.length) return false;
    if (y >= this.m_GRowList.length) return false;

    // Spalte durchgehen (defensive: erste Prüfung würde reichen)
    let pos = this.GetColHeadPos(x);
    while (pos !== null && !isLNull(pos.pObj)) {
      if (pos.pGridPos.y === y) return true;
      const next = pos.pColNext;
      if (!next || isLNull(next.pObj)) break;
      pos = next;
    }

    // Zeile durchgehen (defensiv)
    pos = this.GetRowHeadPos(y);
    while (pos !== null && !isLNull(pos.pObj)) {
      if (pos.pGridPos.x === x) return true;
      const next = pos.pRowNext;
      if (!next || isLNull(next.pObj)) break;
      pos = next;
    }

    return false;
  }

  IsGridBlockTaken(from: CPoint, to: CPoint): boolean {
    for (let y = from.y; y <= to.y; y++) {
      for (let x = from.x; x <= to.x; x++) {
        if (this.IsGridPlaceTaken(x, y)) return true;
      }
    }
    return false;
  }

  // ============================================================
  // Insert/Remove Col/Row (NOTES §10, §11)
  // ============================================================

  /**
   * Fügt eine neue Spalte vor Position `x` ein. Alle Spalten >= x werden
   * umnummeriert (m_GColPos+1) und Pixel-Pos neu berechnet.
   */
  InsertColBefore(x: number, repaint: boolean = true): void {
    const insertcol = x;
    if (this.m_GColList.length <= x) {
      // Spalte existiert noch nicht — einfach Header anlegen + return
      this.GetColHeadPos(x);
      if (repaint) this.InvalidateView();
      return;
    }

    const gcol = this.m_GColList.find((c) => c.m_GColPos === x);
    if (!gcol) return;
    const gcolIndex = this.m_GColList.indexOf(gcol);

    // Neuen Header erzeugen
    const newgcol = new GOGridCol(x, this.m_csStdGridExtent.cx);
    const ogpos = this.NewPos(null, null);
    ogpos.pColPrev = ogpos;
    ogpos.pColNext = ogpos;
    ogpos.pRowPrev = ogpos;
    ogpos.pRowNext = ogpos;
    ogpos.pObj = LNULL;
    ogpos.pColHead = newgcol;
    ogpos.pRowHead = null;
    ogpos.pGridPos = { x, y: 0 };
    newgcol.m_OGPositionGrid = ogpos;
    newgcol.m_StartPos = gcol.m_StartPos;
    newgcol.m_EndPos = newgcol.m_StartPos + newgcol.m_GColWidth;

    this.m_GColList.splice(gcolIndex, 0, newgcol);

    // Alle FOLGENDEN Spalten neu durchnummerieren + Pixel-Pos updaten.
    let curX = x;
    let oldgcol: GOGridCol = newgcol;
    for (let i = gcolIndex + 1; i < this.m_GColList.length; i++) {
      curX++;
      const cur = this.m_GColList[i];
      cur.m_GColPos = curX;
      cur.m_StartPos = oldgcol.m_EndPos + this.m_iStdLinkPlace;
      cur.m_EndPos = cur.m_StartPos + cur.m_GColWidth;
      // Alle Objekte in der Spalte: pGridPos.x updaten
      if (cur.m_OGPositionGrid && cur.m_OGPositionGrid.pColNext) {
        let cursor: OGPositionGrid | null = cur.m_OGPositionGrid.pColNext;
        while (cursor !== null && !isLNull(cursor.pObj)) {
          cursor.pGridPos.x = curX;
          const next: OGPositionGrid | null = cursor.pColNext;
          if (!next || isLNull(next.pObj)) break;
          cursor = next;
        }
      }
      oldgcol = cur;
    }

    if (repaint) this.InvalidateView();
    // SendMessage(WM_GOBJ_GRID_COL_ADDED) — Welle F.
    void insertcol;
  }

  /** Convenience: Spalte nach `x` einfügen. */
  InsertColAfter(x: number, repaint: boolean = true): void {
    const tail = this.m_GColList[this.m_GColList.length - 1];
    if (tail && tail.m_GColPos === x) {
      // x ist die letzte → einfach anhängen
      this.GetColHeadPos(x + 1);
      if (repaint) this.InvalidateView();
    } else {
      this.InsertColBefore(x + 1, repaint);
    }
  }

  /** Zeilen analog. */
  InsertRowBefore(y: number, repaint: boolean = true): void {
    const insertrow = y;
    if (this.m_GRowList.length <= y) {
      this.GetRowHeadPos(y);
      if (repaint) this.InvalidateView();
      return;
    }

    const grow = this.m_GRowList.find((r) => r.m_GRowPos === y);
    if (!grow) return;
    const growIndex = this.m_GRowList.indexOf(grow);

    const newgrow = new GOGridRow(y, this.m_csStdGridExtent.cy);
    const ogpos = this.NewPos(null, null);
    ogpos.pColPrev = ogpos;
    ogpos.pColNext = ogpos;
    ogpos.pRowPrev = ogpos;
    ogpos.pRowNext = ogpos;
    ogpos.pObj = LNULL;
    ogpos.pRowHead = newgrow;
    ogpos.pColHead = null;
    ogpos.pGridPos = { x: 0, y };
    newgrow.m_OGPositionGrid = ogpos;
    newgrow.m_StartPos = grow.m_StartPos;
    newgrow.m_EndPos = newgrow.m_StartPos + newgrow.m_GRowHeight;

    this.m_GRowList.splice(growIndex, 0, newgrow);

    let curY = y;
    let oldgrow: GOGridRow = newgrow;
    for (let i = growIndex + 1; i < this.m_GRowList.length; i++) {
      curY++;
      const cur = this.m_GRowList[i];
      cur.m_GRowPos = curY;
      cur.m_StartPos = oldgrow.m_EndPos + this.m_iStdLinkPlace;
      cur.m_EndPos = cur.m_StartPos + cur.m_GRowHeight;
      if (cur.m_OGPositionGrid && cur.m_OGPositionGrid.pRowNext) {
        let cursor: OGPositionGrid | null = cur.m_OGPositionGrid.pRowNext;
        while (cursor !== null && !isLNull(cursor.pObj)) {
          cursor.pGridPos.y = curY;
          const next: OGPositionGrid | null = cursor.pRowNext;
          if (!next || isLNull(next.pObj)) break;
          cursor = next;
        }
      }
      oldgrow = cur;
    }

    if (repaint) this.InvalidateView();
    void insertrow;
  }

  InsertRowAfter(y: number, repaint: boolean = true): void {
    const tail = this.m_GRowList[this.m_GRowList.length - 1];
    if (tail && tail.m_GRowPos === y) {
      this.GetRowHeadPos(y + 1);
      if (repaint) this.InvalidateView();
    } else {
      this.InsertRowBefore(y + 1, repaint);
    }
  }

  /**
   * Entfernt eine leere Spalte. No-op wenn Spalte nicht leer (NOTES §20.7).
   */
  RemoveCol(x: number, repaint: boolean = true): void {
    if (!this.IsColEmpty(x)) return;

    const eraseidx = this.m_GColList.findIndex((c) => c.m_GColPos === x);
    if (eraseidx < 0) throw new Error(`RemoveCol: Spalte ${x} nicht gefunden`);

    const oldgcolBefore = eraseidx > 0 ? this.m_GColList[eraseidx - 1] : null;

    // Folgende Spalten umnummerieren + Pixel-Pos
    let curX = x;
    let oldgcol: GOGridCol | null = oldgcolBefore;
    for (let i = eraseidx + 1; i < this.m_GColList.length; i++) {
      const cur = this.m_GColList[i];
      cur.m_GColPos = curX;
      cur.m_StartPos = oldgcol
        ? oldgcol.m_EndPos + this.m_iStdLinkPlace
        : this.m_iStdLinkPlace;
      cur.m_EndPos = cur.m_StartPos + cur.m_GColWidth;
      if (cur.m_OGPositionGrid && cur.m_OGPositionGrid.pColNext) {
        let cursor: OGPositionGrid | null = cur.m_OGPositionGrid.pColNext;
        while (cursor !== null && !isLNull(cursor.pObj)) {
          cursor.pGridPos.x = curX;
          const next: OGPositionGrid | null = cursor.pColNext;
          if (!next || isLNull(next.pObj)) break;
          cursor = next;
        }
      }
      oldgcol = cur;
      curX++;
    }

    this.m_GColList.splice(eraseidx, 1);
    if (repaint) this.InvalidateView();
    // SendMessage(WM_GOBJ_GRID_COL_REMOVED) — Welle F.
  }

  RemoveRow(y: number, repaint: boolean = true): void {
    if (!this.IsRowEmpty(y)) return;
    const eraseidx = this.m_GRowList.findIndex((r) => r.m_GRowPos === y);
    if (eraseidx < 0) throw new Error(`RemoveRow: Zeile ${y} nicht gefunden`);

    const oldgrowBefore = eraseidx > 0 ? this.m_GRowList[eraseidx - 1] : null;

    let curY = y;
    let oldgrow: GOGridRow | null = oldgrowBefore;
    for (let i = eraseidx + 1; i < this.m_GRowList.length; i++) {
      const cur = this.m_GRowList[i];
      cur.m_GRowPos = curY;
      cur.m_StartPos = oldgrow
        ? oldgrow.m_EndPos + this.m_iStdLinkPlace
        : this.m_iStdLinkPlace;
      cur.m_EndPos = cur.m_StartPos + cur.m_GRowHeight;
      if (cur.m_OGPositionGrid && cur.m_OGPositionGrid.pRowNext) {
        let cursor: OGPositionGrid | null = cur.m_OGPositionGrid.pRowNext;
        while (cursor !== null && !isLNull(cursor.pObj)) {
          cursor.pGridPos.y = curY;
          const next: OGPositionGrid | null = cursor.pRowNext;
          if (!next || isLNull(next.pObj)) break;
          cursor = next;
        }
      }
      oldgrow = cur;
      curY++;
    }

    this.m_GRowList.splice(eraseidx, 1);
    if (repaint) this.InvalidateView();
  }

  /** Prüft ob die Spalte `x` keine echten Objekte enthält. */
  IsColEmpty(x: number): boolean {
    const col = this.m_GColList.find((c) => c.m_GColPos === x);
    if (!col || !col.m_OGPositionGrid) return true;
    const next = col.m_OGPositionGrid.pColNext;
    return !next || isLNull(next.pObj);
  }

  /** Prüft ob die Zeile `y` keine echten Objekte enthält. */
  IsRowEmpty(y: number): boolean {
    const row = this.m_GRowList.find((r) => r.m_GRowPos === y);
    if (!row || !row.m_OGPositionGrid) return true;
    const next = row.m_OGPositionGrid.pRowNext;
    return !next || isLNull(next.pObj);
  }

  // ============================================================
  // GORemove — Objekt entfernen (NOTES §12)
  // ============================================================

  /**
   * Entfernt das Objekt an Position (x, y). Liefert das entfernte Objekt
   * oder null wenn keins da war.
   */
  GORemove(x: number, y: number, repaint: boolean = true): GObject | null {
    let pos = this.GetColHeadPos(x);
    while (pos !== null && !isLNull(pos.pObj)) {
      const obj = pos.pObj as GObject;
      if (pos.pGridPos.y === y) {
        // Aushängen aus beiden Listen
        const pgrid = pos;
        if (pgrid.pColPrev && pgrid.pColNext) {
          pgrid.pColPrev.pColNext = pgrid.pColNext;
          pgrid.pColNext.pColPrev = pgrid.pColPrev;
        }
        if (pgrid.pRowPrev && pgrid.pRowNext) {
          pgrid.pRowPrev.pRowNext = pgrid.pRowNext;
          pgrid.pRowNext.pRowPrev = pgrid.pRowPrev;
        }
        this.FreePos(pgrid);
        obj.m_OGPosition = null;
        obj.m_OGCollection = null;
        if (repaint) this.InvalidateView();
        return obj;
      }
      const next = pos.pColNext;
      if (!next || isLNull(next.pObj)) break;
      pos = next;
    }
    return null;
  }

  /** Convenience: GORemove via GObject-Referenz. */
  GORemoveObj(obj: GObject, repaint: boolean = true): GObject | null {
    const p = { x: -1, y: -1 };
    obj.GetGridPos(p);
    if (p.x < 0 || p.y < 0) return null;
    return this.GORemove(p.x, p.y, repaint);
  }

  // ============================================================
  // Reverse-Lookups (NOTES §13)
  // ============================================================

  /** Liefert das GObject an Grid-Position (p.x, p.y) oder null. */
  GetGOAtGrid(p: CPoint): GObject | null {
    let pos = this.GetColHeadPos(p.x);
    while (pos !== null && !isLNull(pos.pObj)) {
      if (pos.pGridPos.y === p.y) return pos.pObj as GObject;
      const next = pos.pColNext;
      if (!next || isLNull(next.pObj)) break;
      pos = next;
    }
    return null;
  }

  /** Liefert die GOGridCol unter dem Pixel-Punkt `p` (oder null). */
  GetGColAtPoint(p: CPoint): GOGridCol | null {
    for (const col of this.m_GColList) {
      if (
        p.x >= col.m_StartPos &&
        p.x <= col.m_EndPos + this.m_iStdLinkPlace
      ) {
        return col;
      }
    }
    return null;
  }

  /** Liefert die GOGridRow unter dem Pixel-Punkt `p` (oder null). */
  GetGRowAtPoint(p: CPoint): GOGridRow | null {
    for (const row of this.m_GRowList) {
      if (
        p.y >= row.m_StartPos &&
        p.y <= row.m_EndPos + this.m_iStdLinkPlace
      ) {
        return row;
      }
    }
    return null;
  }

  /** Liefert das GObject unter dem Pixel-Punkt `p`. */
  GetGOAtPoint(p: CPoint): GObject | null {
    const col = this.GetGColAtPoint(p);
    const row = this.GetGRowAtPoint(p);
    if (!col || !row) return null;
    return this.GetGOAtGrid({ x: col.m_GColPos, y: row.m_GRowPos });
  }

  /**
   * Liefert die Grid-Koordinaten eines Pixel-Punkts. inGrid=true erzwingt
   * Bounds-Check (null wenn außerhalb).
   */
  GetGridAtPoint(p: CPoint, inGrid: boolean = true): CPoint | null {
    const col = this.GetGColAtPoint(p);
    const row = this.GetGRowAtPoint(p);
    if (!col || !row) return inGrid ? null : { x: -1, y: -1 };
    return { x: col.m_GColPos, y: row.m_GRowPos };
  }

  // ============================================================
  // Dynamische Größen-Berechnung (Welle G7)
  // ============================================================
  // 1:1 aus C++ OGGrid.cpp:2390 OGraphGrid::GetSize().
  //
  // Pro Spalte/Zeile wird die maximale Knoten-Größe gesammelt und die Spalten-
  // breite bzw. Zeilenhöhe entsprechend gestreckt. Damit wachsen Spalten mit,
  // sobald ein GObjSub im D_OPEN-State seine Sub-View groß ausrollt. StartPos/
  // EndPos werden kumulativ mit `m_iStdLinkPlace`-Lücken neu berechnet.
  //
  // Endeffekt: nach `computeSizes()` ist `m_GSize` korrekt und reflektiert
  // alle nested Knoten-Größen. Nach `applyPositions(origin)` haben alle Knoten
  // ihre korrekte Pixel-`m_GOrg` (zentriert in der jeweiligen Zelle, exakt
  // wie das Original-Default-Alignment ohne GS_LEFT_ALLIGN/GS_STDOBJECT_ALLIGN).
  //
  // Aufruf-Reihenfolge: `finalizeLayout(origin)` ruft beides in der richtigen
  // Reihenfolge UND rekursiv für alle GObjSub-Sub-Views (bottom-up).
  // ============================================================

  /**
   * Berechnet `m_GColWidth`/`m_GRowHeight` neu basierend auf den aktuellen
   * Knoten-Größen. 1:1 aus C++ OGGrid.cpp:2390.
   *
   * Liest Knoten-Größen via `GetSize()`, das bei GObjSub rekursiv die Sub-
   * Grid-Größe liefert (siehe GObjSub.GetSize). Daher muss diese Methode
   * BOTTOM-UP aufgerufen werden — innerste Sub-Grids zuerst, damit die GObjSub-
   * Container ihre korrekte Größe melden, BEVOR ihr Parent-Grid sie abfragt.
   *
   * `finalizeLayout()` orchestriert das automatisch.
   */
  computeSizes(): void {
    // Spalten
    let lauf = this.m_cpStdGridOrigin.x;
    for (const col of this.m_GColList) {
      col.m_StartPos = lauf;
      col.m_GColWidth = this.m_csStdGridExtent.cx;
      if (col.m_OGPositionGrid) {
        let pos: OGPositionGrid | null = col.m_OGPositionGrid.pColNext;
        while (pos !== null && !isLNull(pos.pObj)) {
          const obj = pos.pObj as GObject;
          const posSize: CSize = { cx: 0, cy: 0 };
          obj.GetSize(posSize);
          if (posSize.cx > col.m_GColWidth) col.m_GColWidth = posSize.cx;
          const next = pos.pColNext;
          if (!next || isLNull(next.pObj)) break;
          pos = next;
        }
      }
      col.m_EndPos = col.m_StartPos + col.m_GColWidth;
      lauf = col.m_EndPos + this.m_iStdLinkPlace;
    }
    this.m_GSize.cx = lauf;

    // Zeilen
    lauf = this.m_cpStdGridOrigin.y;
    for (const row of this.m_GRowList) {
      row.m_StartPos = lauf;
      row.m_GRowHeight = this.m_csStdGridExtent.cy;
      if (row.m_OGPositionGrid) {
        let pos: OGPositionGrid | null = row.m_OGPositionGrid.pRowNext;
        while (pos !== null && !isLNull(pos.pObj)) {
          const obj = pos.pObj as GObject;
          const posSize: CSize = { cx: 0, cy: 0 };
          obj.GetSize(posSize);
          if (posSize.cy > row.m_GRowHeight) row.m_GRowHeight = posSize.cy;
          const next = pos.pRowNext;
          if (!next || isLNull(next.pObj)) break;
          pos = next;
        }
      }
      row.m_EndPos = row.m_StartPos + row.m_GRowHeight;
      lauf = row.m_EndPos + this.m_iStdLinkPlace;
    }
    this.m_GSize.cy = lauf;

    // Mindestgröße (C++ Z.2454-2455): leeres Grid bekommt Standard-Knoten-Bounds.
    if (this.m_GSize.cx < this.m_csStdGridExtent.cx) {
      this.m_GSize.cx = this.m_csStdGridExtent.cx;
    }
    if (this.m_GSize.cy < this.m_csStdGridExtent.cy) {
      this.m_GSize.cy = this.m_csStdGridExtent.cy;
    }
  }

  /**
   * Positioniert alle Knoten an die aus `computeSizes()` resultierenden Pixel-
   * Koordinaten — zentriert in ihrer jeweiligen Zelle. 1:1 aus C++
   * OGGrid.cpp:2469 OGraphGrid::SetPosition() (Default-Alignment-Pfad).
   *
   * Ruft auf jedem Knoten `obj.SetPosition(...)` — für GObjSub propagiert das
   * automatisch in die Sub-View-Hierarchie.
   *
   * @param origin Pixel-Origin des Grids im umgebenden Koordinatensystem.
   */
  applyPositions(origin: CPoint): void {
    this.m_GOrg = { x: origin.x, y: origin.y };

    this.iterate((obj) => {
      // m_OGPosition ist auf GObject als Basis-OGPosition typisiert; in
      // OGraphGrid-Kontext sind die Position-Knoten aber konkret
      // OGPositionGrid-Instanzen (gesetzt von GOIns/NewPos). Welle G14:
      // expliziter instanceof-Narrow statt unsicherer Cast.
      const ogp = obj.m_OGPosition;
      if (!(ogp instanceof OGPositionGrid)) return;
      if (!ogp.pColHead || !ogp.pRowHead) return;
      const s: CSize = { cx: 0, cy: 0 };
      obj.GetSize(s);
      // Default-Alignment (kein GS_LEFT_ALLIGN, kein GS_STDOBJECT_ALLIGN):
      // zentriert in Spalte UND Zeile (C++ Z.2513-2522).
      const px =
        ogp.pColHead.m_StartPos + (ogp.pColHead.m_GColWidth - s.cx) / 2;
      const py =
        ogp.pRowHead.m_StartPos + (ogp.pRowHead.m_GRowHeight - s.cy) / 2;
      const abs: CPoint = { x: px + this.m_GOrg.x, y: py + this.m_GOrg.y };
      obj.SetPosition(abs);
    });

    // m_VirtRect umfasst das ganze Grid (C++ Z.2528-2531).
    this.m_VirtRect = {
      left: this.m_GOrg.x,
      top: this.m_GOrg.y,
      right: this.m_GOrg.x + this.m_GSize.cx,
      bottom: this.m_GOrg.y + this.m_GSize.cy,
    };
  }

  /**
   * Orchestriert die vollständige Layout-Berechnung: bottom-up `computeSizes()`
   * für alle nested Sub-Grids, dann top-down `applyPositions()`.
   *
   * `wireToGrid` ruft das nach allen GOIns einmalig auf dem Root-Grid auf.
   *
   * @param origin Pixel-Origin des Grids (Default: aktueller m_GOrg).
   */
  finalizeLayout(origin?: CPoint): void {
    // 1. Bottom-Up: erst alle Sub-Grids von GObjSub-Knoten finalisieren.
    this.iterate((obj) => {
      const objAsSub = obj as unknown as {
        GetSubCollections?: () => readonly OGraphCollection[];
      };
      if (typeof objAsSub.GetSubCollections === "function") {
        for (const coll of objAsSub.GetSubCollections()) {
          const subGrid = coll as unknown as OGraphGrid;
          if (typeof subGrid.finalizeLayout === "function") {
            subGrid.finalizeLayout();
          }
        }
      }
    });
    // 2. Eigene Größen berechnen (jetzt liefern GObjSubs ihre korrekte Sub-Grid-Größe).
    this.computeSizes();
    // 3. Top-Down: Knoten zentriert in den (jetzt korrekten) Zellen platzieren.
    this.applyPositions(origin ?? this.m_GOrg);
  }

  // ============================================================
  // OGraphCollection-Implementation
  // ============================================================

  /** Iteriert über ALLE besetzten Zellen. */
  iterate(callback: (obj: GObject) => void): void {
    for (const col of this.m_GColList) {
      if (!col.m_OGPositionGrid) continue;
      let pos: OGPositionGrid | null = col.m_OGPositionGrid.pColNext;
      while (pos !== null && !isLNull(pos.pObj)) {
        callback(pos.pObj as GObject);
        const next = pos.pColNext;
        if (!next || isLNull(next.pObj)) break;
        pos = next;
      }
    }
  }

  /** Entfernt das Objekt aus dem Grid (über GORemoveObj). */
  protected removeImpl(obj: GObject): void {
    this.GORemoveObj(obj, false);
  }

  /** Bounds des gesamten Grids (Pixel). */
  GetGridRect(): CRect {
    if (this.m_GColList.length === 0 || this.m_GRowList.length === 0) {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }
    const lastCol = this.m_GColList[this.m_GColList.length - 1];
    const lastRow = this.m_GRowList[this.m_GRowList.length - 1];
    return {
      left: this.m_GColList[0].m_StartPos,
      top: this.m_GRowList[0].m_StartPos,
      right: lastCol.m_EndPos,
      bottom: lastRow.m_EndPos,
    };
  }

  // ============================================================
  // View-Notification
  // ============================================================

  InvalidateView(): void {
    if (this.m_OGView) this.m_OGView.InvalidateView();
  }

  // ============================================================
  // Snapshot-API (NOTES §17.7) — für Tests
  // ============================================================

  /** Liefert eine deterministische Topologie-Repräsentation für Snapshot-Tests. */
  snapshot(): GridSnapshot {
    const cols = this.m_GColList.map((c) => ({
      pos: c.m_GColPos,
      startPos: c.m_StartPos,
      endPos: c.m_EndPos,
      width: c.m_GColWidth,
    }));
    const rows = this.m_GRowList.map((r) => ({
      pos: r.m_GRowPos,
      startPos: r.m_StartPos,
      endPos: r.m_EndPos,
      height: r.m_GRowHeight,
    }));
    const cells: { x: number; y: number; objId: string }[] = [];
    this.iterate((obj) => {
      const p = { x: -1, y: -1 };
      obj.GetGridPos(p);
      cells.push({
        x: p.x,
        y: p.y,
        objId: String(obj.m_pViewedObj ?? "?"),
      });
    });
    cells.sort((a, b) => (a.y - b.y) * 1000 + (a.x - b.x));
    return { cols, rows, cells };
  }
}
