/**
 * GObject — abstrakte Renderable-Basis-Klasse.
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 341-505 (`class GObject :
 * public CObject`).
 *
 * Im C++-Original hat GObject ~30 Felder + ~40 virtuelle Methoden für
 * Rendering, Hit-Test, Phantom-Preview, Drag/Move, Message-Handling. Diese
 * Klasse bildet ALLE diese Felder ab und stellt die einfachen Setter/Getter
 * bereit. Komplexe Methoden (`Draw`, `CheckRegion`, `IsHit`, `MoveGObj`,
 * `OnLMButtonDown` etc.) sind als overrideable Default-Methoden implementiert
 * — Sub-Klassen (`GObjLink`, `GObjSub`, `GObjOSimDlp`) überschreiben sie.
 *
 * **Renderer-Trennung (CONTEXT D-1.1-05, NOTES §18.2):** das C++-Original
 * mischt Domain-State (m_OGCollection, m_OGPosition, m_VirtRect) mit
 * View-State (Draw, m_BackColor) in einer Klasse. Wir halten die SELBE Klasse
 * (für 1:1-Treue), aber Rendering im React-Flow-Adapter delegiert auf
 * `getRenderProps()`-ähnliche Helpers statt MFC-CDC.
 *
 * **Notifications (CONTEXT D-1.1-05, NOTES §18.5):** WM_GOBJ_*-Messages
 * werden als Event-Emitter implementiert (siehe `notifyParent`).
 *
 * **Friend-Klassen-Zugriffe:** im C++ via `friend class`. In TS sind alle
 * Felder `public` mit `// @internal`-Markierung — die Algorithmen in
 * OGraphGrid/GLink müssen direkt auf m_OGPosition, m_VirtRect etc. zugreifen
 * können.
 */

import {
  GO_DEFAULT,
  STD_OBJ_HEIGHT,
  STD_OBJ_WIDTH,
} from "@/graph/foundation/constants";
import {
  GObjState,
  GORegion,
  crectEmpty,
  csize,
  cpoint,
  crectContains,
  type CPoint,
  type CRect,
  type CSize,
} from "@/graph/foundation/types";
import type { DrawContext } from "@/graph/foundation/DrawContext";

// Forward-Refs (circular imports vermieden via type-only).
import type { OGPosition } from "@/graph/foundation/OGPosition";
import type { OGraphCollection } from "@/graph/foundation/OGraphCollection";
import type { OGraphView } from "@/graph/foundation/OGraphView";

/**
 * GObject — abstrakte Basis. Direkt instanzierbar (kein C++-abstract-virtual),
 * aber praktisch werden immer Sub-Klassen genutzt.
 *
 * Die Konstruktor-Signatur entspricht C++:
 *   `GObject(UINT width=GO_DEFAULT, UINT height=GO_DEFAULT)`
 * Bei GO_DEFAULT werden STD_OBJ_WIDTH/HEIGHT genommen.
 */
export class GObject {
  // ============================================================
  // Schutz-Flags (C++ Z. 358-364)
  // ============================================================

  /** Löschen verboten? (z.B. Pflicht-Knoten Start/Ende). */
  m_IsDeleteForbidden: boolean = false;
  /** Bewegen verboten? */
  m_IsMoveForbidden: boolean = false;
  /** Wurde von GraphObjCtrl gelöscht? */
  m_IsKilldByGOCtrl: boolean = false;
  /** Soll das Kontextmenü gezeigt werden? */
  m_bShowContextMenu: boolean = true;
  /** Wird gerade animiert? */
  m_bAnimate: boolean = false;
  /** Phantom-Preview gerade sichtbar? */
  m_isPhShown: boolean = false;
  /** Sendet Messages an Parent? */
  m_sendMessage: boolean = true;

  // ============================================================
  // Eltern-Referenzen (C++ Z. 366-371)
  // ============================================================

  /** View-Layer, in dem das GObject dargestellt wird. */
  m_OGView: OGraphView | null = null;
  /** Top-Level GraphObjCtrl (Aufrufer-Hierarchie für Mouse/Keyboard). */
  m_GOCtrl: unknown = null; // GraphObjCtrl kommt in Welle F
  /** "All-Parent" — in MFC: CWnd-Owner für SendMessage. */
  m_AllParent: unknown = null;
  /** Collection (OGraphList oder OGraphGrid), in der das GObject lebt. */
  m_OGCollection: OGraphCollection | null = null;
  /** Position-Knoten der zirkulären Doppelliste. */
  m_OGPosition: OGPosition | null = null;
  /** Beliebiges fachliches Modell-Objekt, das durch dieses GObject visualisiert wird. */
  m_pViewedObj: unknown = null;

  // ============================================================
  // Interna (C++ Z. 374-385)
  // ============================================================

  /** Zähler für PaintCount (Diagnose). */
  m_PtkDrawCount: number = 0;

  /** Rot-Anteil bei Animation (0..1). */
  m_fHowMuchRed: number = 0;

  /** Style-Flags (GS_LEFT_ALLIGN | GS_MIDDLE_ALLIGN | GS_STDOBJECT_ALLIGN). */
  m_styles: number = 0;

  /** Aktueller Knoten-State (HIDDEN/MARKED/NO_STATE). */
  m_GOState: GObjState = GObjState.NO_STATE;

  /** Virtuelles Rechteck (Pixel-Position auf dem Canvas). */
  m_VirtRect: CRect = crectEmpty();

  /** Virtuelle Größe. */
  m_GSize: CSize = csize(STD_OBJ_WIDTH, STD_OBJ_HEIGHT);

  /** Virtueller Ursprung (linke obere Ecke). */
  m_GOrg: CPoint = cpoint(0, 0);

  /** User-Variable (für Clipboard-Operationen). */
  m_User: number = 0;

  /** Anzeige-Text. */
  m_string: string = "";

  /** Hintergrundfarbe (CSS-Farbstring statt MFC-COLORREF). */
  m_BackColor: string = "#ffffff";

  /** Textfarbe. */
  m_TextColor: string = "#000000";

  /**
   * Optionale Wire-Klassen-Kennung (z.B. "PDpKnMengeRuesten", "PDlplKante").
   * Wird von `wire-to-grid.ts` gesetzt; der view-adapter nutzt sie um den
   * passenden React-Flow-Node-Type zu wählen (z.B. "osim" vs. "osimEdgeBox").
   * Welle G11.
   */
  m_wireKlass: string = "";

  // ============================================================
  // Phantom-Felder (C++ Z. 388-390)
  // ============================================================

  /** Alte Phantom-Position für Erase-Schritt. */
  m_OldPhantomRect: CRect = crectEmpty();
  /** Phantom-Delta x (während Drag). */
  m_PDeltaX: number = 0;
  /** Phantom-Delta y. */
  m_PDeltaY: number = 0;

  // ============================================================
  // Konstruktor (C++ Z. 497-499)
  // ============================================================

  /**
   * Erzeugt ein neues GObject mit der gegebenen Größe. Bei GO_DEFAULT
   * werden STD_OBJ_WIDTH/HEIGHT genommen — analog zum C++-Default-Parameter.
   */
  constructor(width: number = GO_DEFAULT, height: number = GO_DEFAULT) {
    const w = width === GO_DEFAULT ? STD_OBJ_WIDTH : width;
    const h = height === GO_DEFAULT ? STD_OBJ_HEIGHT : height;
    this.m_GSize = csize(w, h);
    this.m_VirtRect = {
      left: 0,
      top: 0,
      right: w,
      bottom: h,
    };
  }

  // ============================================================
  // Simple Setter/Getter (C++ Z. 398-413, inline)
  // ============================================================

  SetDelta(fvMousePos: CPoint): void {
    this.m_PDeltaX = fvMousePos.x - this.m_GOrg.x;
    this.m_PDeltaY = fvMousePos.y - this.m_GOrg.y;
  }

  SetFocus(): void {
    this.m_GOState = GObjState.MARKED;
  }

  ClearFocus(): void {
    this.m_GOState = GObjState.NO_STATE;
  }

  /**
   * Setzt die Sichtbarkeit der Kinder. Default-Implementation tut nichts;
   * GObjSub überschreibt diese Methode rekursiv.
   */
  SetChildsVisible(_visible: boolean): boolean {
    return true;
  }

  SetState(state: GObjState): void {
    this.m_GOState = state;
  }

  GetState(): GObjState {
    return this.m_GOState;
  }

  IsKilledByGOCtrl(): boolean {
    return this.m_IsKilldByGOCtrl;
  }

  SetMoveForbidden(v: boolean): void {
    this.m_IsMoveForbidden = v;
  }

  IsMoveForbidden(): boolean {
    return this.m_IsMoveForbidden;
  }

  SetDeleteForbidden(v: boolean): void {
    this.m_IsDeleteForbidden = v;
  }

  IsDeleteForbidden(): boolean {
    return this.m_IsDeleteForbidden;
  }

  SetShowContextMenue(v: boolean): void {
    this.m_bShowContextMenu = v;
  }

  IsShowContextMenue(): boolean {
    return this.m_bShowContextMenu;
  }

  SendMessages2Parent(b: boolean): void {
    this.m_sendMessage = b;
  }

  IsSendMessages2Parent(): boolean {
    return this.m_sendMessage;
  }

  // ============================================================
  // Member-Zugriff (C++ Z. 416-421)
  // ============================================================

  GetStyles(): number {
    return this.m_styles;
  }

  GetOGView(): OGraphView | null {
    return this.m_OGView;
  }

  /**
   * Liefert den Top-Level-GraphObjCtrl. Hangelt sich über m_OGCollection nach
   * oben. C++ Z. 418 deklariert, Implementierung in OGObject.cpp.
   */
  GetOGCtrl(): unknown {
    // TODO Welle F: nach Lesen von OGfxCtrl.cpp implementieren.
    return this.m_GOCtrl;
  }

  GetOGCollection(): OGraphCollection | null {
    return this.m_OGCollection;
  }

  /**
   * Hangelt sich rekursiv durch parent.m_OGCollection bis zur Top-Collection.
   * C++ Z. 420.
   */
  GetTopLevelCollection(): OGraphCollection | null {
    // TODO Welle B-Ende: implementieren wenn OGraphCollection Parent-Refs hat.
    return this.m_OGCollection;
  }

  GetOGPositon(): OGPosition | null {
    return this.m_OGPosition;
  }

  // ============================================================
  // Allgemeine Funktionen (C++ Z. 426-433)
  // ============================================================

  /**
   * Liefert die Grid-Position (x,y) durch Lookup in m_OGPosition.
   * Wenn nicht in einem Grid: liefert (-1,-1).
   * C++-Implementation in OGObject.cpp.
   */
  GetGridPos(p: CPoint): void {
    // Cast via OGPosition-Hierarchie. Wird in Welle C/F voll implementiert.
    const pos = this.m_OGPosition;
    if (pos && "pGridPos" in pos) {
      const grid = pos as unknown as { pGridPos: CPoint };
      p.x = grid.pGridPos.x;
      p.y = grid.pGridPos.y;
    } else {
      p.x = -1;
      p.y = -1;
    }
  }

  /**
   * Holt virtuelles Rectangle. Default = m_VirtRect.
   * Sub-Klassen (GObjSub mit aufgeklapptem Inhalt) überschreiben.
   */
  GetRect(rect: CRect): void {
    rect.left = this.m_VirtRect.left;
    rect.top = this.m_VirtRect.top;
    rect.right = this.m_VirtRect.right;
    rect.bottom = this.m_VirtRect.bottom;
  }

  /**
   * Setzt die Größe. Aktualisiert auch m_VirtRect (right=left+cx, bottom=top+cy).
   */
  SetSize(size: CSize): void {
    this.m_GSize = { ...size };
    this.m_VirtRect.right = this.m_VirtRect.left + size.cx;
    this.m_VirtRect.bottom = this.m_VirtRect.top + size.cy;
  }

  SetText(s: string): void {
    this.m_string = s;
  }

  GetText(): string {
    return this.m_string;
  }

  SetBKColor(r: string): void {
    this.m_BackColor = r;
  }

  SetTextColor(r: string): void {
    this.m_TextColor = r;
  }

  /**
   * Hierarchie-Tiefe (wie tief im verschachtelten GObjSub-Baum).
   * Hangelt über GetTopLevelCollection nach oben.
   * Liefert -1 bei Fehler. C++ Z. 433.
   */
  GetHierachyLevel(): number {
    let level = 0;
    let coll = this.m_OGCollection;
    while (coll) {
      level++;
      // Geht durch GObjSub-Parent rekursiv hoch. In Welle B+ implementiert.
      const collParent = (coll as unknown as { m_Parent?: GObject }).m_Parent;
      if (!collParent) break;
      coll = collParent.m_OGCollection;
      if (level > 100) return -1; // Zyklus-Schutz
    }
    return level;
  }

  // ============================================================
  // ViewedObject (C++ Z. 441-446)
  // ============================================================

  GetViewedObject(): unknown {
    return this.m_pViewedObj;
  }

  SetViewedObject(v: unknown): void {
    this.m_pViewedObj = v;
    this.OnViewedObjSet(v);
  }

  /**
   * Erlaubt externe Befüll-Methoden. Default tut nichts.
   * Sub-Klassen wie GObjOSimDlp überschreiben.
   */
  Fill(_v: unknown = null): void {
    // Default no-op.
  }

  /**
   * Wird true bei Single-Inheritance, false bei Mehrfach (GObjSub).
   * Mehrfacherbungs-Check der C++-Welt — siehe GObjSub.IsOnlyGObj() = false.
   */
  IsOnlyGObj(): boolean {
    return true;
  }

  // ============================================================
  // Position/Size (C++ Z. 465-466)
  // ============================================================

  /**
   * Setzt die linke obere Ecke. Aktualisiert m_GOrg + m_VirtRect.
   */
  SetPosition(myorg: CPoint): boolean {
    const dx = myorg.x - this.m_GOrg.x;
    const dy = myorg.y - this.m_GOrg.y;
    this.m_GOrg = { ...myorg };
    this.m_VirtRect.left += dx;
    this.m_VirtRect.right += dx;
    this.m_VirtRect.top += dy;
    this.m_VirtRect.bottom += dy;
    return true;
  }

  /**
   * Liefert die aktuelle Größe (out-param).
   */
  GetSize(mysize: CSize): boolean {
    mysize.cx = this.m_GSize.cx;
    mysize.cy = this.m_GSize.cy;
    return true;
  }

  // ============================================================
  // 4-Layer-Drawing-API (C++ Z. 467-485) — renderer-agnostisch
  // ============================================================
  // Track B4 (Audit 2026-05-28 §5.3): die `_ctx`-Parameter sind jetzt vom
  // Typ `DrawContext` (siehe DrawContext.ts) statt `unknown`. Sub-Klassen
  // können layer-disziplinierte Render-Primitives nutzen:
  //
  //   override Draw(ctx: DrawContext): boolean {
  //     ctx.setLayer(DrawLayer.CONTENT);
  //     ctx.drawRect(this.m_VirtRect, { stroke: "#000000" });
  //     return true;
  //   }
  //
  // Default-Implementations bleiben no-ops; Adapter (RF, Canvas) müssen
  // DrawContext implementieren.
  // ============================================================

  DrawBackground(_ctx: DrawContext): boolean {
    return true;
  }

  Draw(_ctx: DrawContext): boolean {
    return true;
  }

  DrawForeground(_ctx: DrawContext): boolean {
    return true;
  }

  DrawHelpers(_ctx: DrawContext): boolean {
    return true;
  }

  ShowPhantom(_ctx: DrawContext, virtp: CPoint): void {
    this.m_isPhShown = true;
    this.m_OldPhantomRect = {
      left: virtp.x,
      top: virtp.y,
      right: virtp.x + this.m_GSize.cx,
      bottom: virtp.y + this.m_GSize.cy,
    };
  }

  HidePhantom(_ctx: DrawContext): void {
    this.m_isPhShown = false;
  }

  /**
   * Zeichnet den Phantom-Knoten am aktuellen `m_OldPhantomRect` auf dem
   * OVERLAY-Layer. Vorschau-Bild während Drag — semi-transparent, ohne
   * Inhalt, nur Umriss + Füllung.
   *
   * Track B5 (Audit §5.3): pendant zu C++ GObject::ShowPhantom mit
   * direkter Canvas-Pinsel-Operation. In TS halten wir die Render-Op
   * deklarativ über DrawContext.
   *
   * Sub-Klassen können diese Methode überschreiben um eine
   * shape-spezifische Phantom-Variante zu zeichnen (z.B. die Pfeil-
   * Spitze für GObjOSimDlp). Default: einfaches semi-transparentes
   * Rechteck.
   */
  DrawPhantom(ctx: DrawContext): void {
    if (!this.m_isPhShown) return;
    // Lazy-Import vermeidet circular dep — DrawLayer.OVERLAY ist runtime,
    // aber DrawContext.setLayer akzeptiert den numerischen Wert.
    ctx.setLayer(5 /* DrawLayer.OVERLAY */);
    ctx.drawRect(this.m_OldPhantomRect, {
      fill: this.m_BackColor,
      stroke: "#000000",
      strokeWidth: 1,
      strokeDasharray: [4, 2],
      opacity: 0.5,
    });
  }

  /**
   * Liefert das aktuelle Phantom-Rect (oder null wenn nicht gezeigt).
   * Renderer-Adapter (RF, Canvas, SVG) können das pollen statt
   * GObject.DrawPhantom direkt aufzurufen — passt zum osim-ui-Pattern
   * wo der RF-Adapter alle Render-Daten DECLARATIVELY aus Foundation
   * liest.
   */
  GetPhantomRect(): CRect | null {
    return this.m_isPhShown ? this.m_OldPhantomRect : null;
  }

  DrawText(_ctx: DrawContext): void {
    // Default no-op; volle Implementierung kommt in einer Welle die einen
    // konkreten Renderer-Adapter hat (Canvas in Track C4 o.ä.).
  }

  DrawRed(howMuchRed: number, _ctx: DrawContext | null = null): void {
    this.m_fHowMuchRed = howMuchRed;
  }

  // ============================================================
  // Hit-Test (C++ Z. 473-475)
  // ============================================================

  /**
   * Region-Check: Wo im Knoten liegt der Punkt? (Mitte=Edit, Rand=Move/Link).
   * Default-Implementation: liefert R_NO wenn außerhalb, R_MOVE bei Treffer.
   * Sub-Klassen mit komplexerer Geometrie (GObjLink mit Link-Edit-Zonen)
   * überschreiben.
   */
  CheckRegion(virtp: CPoint): GORegion {
    if (!crectContains(this.m_VirtRect, virtp)) return GORegion.R_NO;
    return GORegion.R_MOVE;
  }

  /**
   * Hit-Test: liegt der Punkt im Knoten? Fügt das GObject in `list` ein wenn
   * ja. C++ Z. 474: rekursiv für GObjSub (alle getroffenen Kinder).
   */
  IsHit(virtp: CPoint, list: GObject[]): boolean {
    if (crectContains(this.m_VirtRect, virtp)) {
      list.push(this);
      return true;
    }
    return false;
  }

  /**
   * Liefert die Collection, die am gegebenen Punkt sichtbar ist.
   * Default: eigene Collection wenn Hit, sonst null.
   */
  GetCollection(virtp: CPoint): OGraphCollection | null {
    return crectContains(this.m_VirtRect, virtp) ? this.m_OGCollection : null;
  }

  // ============================================================
  // Event-Handler (C++ Z. 476-491)
  // Default-Implementations sind no-ops (return false = nicht verarbeitet).
  // Sub-Klassen (insbesondere GObjSub und Konkretisierungen) überschreiben.
  // ============================================================

  OnEditGo(_virtpoint: CPoint): boolean {
    return false;
  }

  OnOpenPopUp(_p: CPoint, _parent: unknown): boolean {
    return false;
  }

  OnCommand(_wParam: number, _lParam: number): boolean {
    return false;
  }

  /** Wird gerufen wenn das GObject in eine Collection aufgenommen wurde. */
  OnGObj2CollAdded(): boolean {
    return true;
  }

  OnRectUpDate(_vrect: CRect): boolean {
    return true;
  }

  OnOpenAll(_open: boolean): void {
    // no-op; GObjSub überschreibt.
  }

  /**
   * Aufforderung zum Verschieben. Default: Position auf newrect.left/top setzen.
   * Sub-Klassen können verweigern (return false).
   */
  MoveGObj(newrect: CRect, _virtpoint: CPoint): boolean {
    if (this.m_IsMoveForbidden) return false;
    return this.SetPosition(cpoint(newrect.left, newrect.top));
  }

  /**
   * Aufforderung zur Größen-Änderung.
   */
  SizeGObj(newrect: CRect): boolean {
    const cx = newrect.right - newrect.left;
    const cy = newrect.bottom - newrect.top;
    this.SetPosition(cpoint(newrect.left, newrect.top));
    this.SetSize(csize(cx, cy));
    return true;
  }

  OnLMButtonDown(_nFlags: number, _point: CPoint): boolean {
    return false;
  }

  OnRMButtonDown(_nFlags: number, _virtpoint: CPoint, _point: CPoint): boolean {
    return false;
  }

  OnGOContextMenu(_pWnd: unknown, _virtpoint: CPoint, _point: CPoint): boolean {
    return false;
  }

  OnUserMessage(
    _msg: number,
    _i: number,
    _wParam: number,
    _lParam: number,
  ): boolean {
    return false;
  }

  OnDroped(_virtpoint: CPoint, _s: string): boolean {
    return false;
  }

  OnViewedObjSet(_ptr: unknown): boolean {
    return true;
  }

  // ============================================================
  // Clipboard (C++ Z. 453-457) — Stubs für Welle F
  // ============================================================

  GetClipboardSize(): number {
    // Default-Implementation: nur die Felder eines plain GObject.
    return 64; // Placeholder; volle Implementierung Welle F.
  }

  /** Stub für Welle F. */
  protected CopyToClipboard(
    ptr: Uint8Array,
    _bRectStart: CPoint,
    _copyExtern: boolean = false,
  ): Uint8Array {
    return ptr;
  }

  /** Stub für Welle F. */
  protected RestoreFromClipboard(
    ptr: Uint8Array,
    _insertPos: CPoint,
  ): Uint8Array {
    return ptr;
  }

  protected PostRestoreFromClipboard(): void {
    // Default no-op.
  }

  protected SetUserValue(val: number): void {
    this.m_User = val;
  }

  // ============================================================
  // Helpers (C++ Z. 461)
  // ============================================================

  protected FindFromViewed(v: unknown): GObject | null {
    return this.m_pViewedObj === v ? this : null;
  }

  /**
   * Sendet eine Notification an die Parent-Collection (Pendant zu
   * SendMessage(WM_GOBJ_*, ...) im C++-Original). In Welle B implementieren
   * wir das als simples no-op; Welle F verdrahtet einen Event-Bus.
   */
  protected notifyParent(_msg: string, _payload?: unknown): void {
    // TODO Welle F: Event-Emitter / Observer-Pattern.
  }
}
