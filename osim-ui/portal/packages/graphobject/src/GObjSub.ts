/**
 * GObjSub — Knoten mit eigenem internen Sub-Grid (nested Hierarchie).
 *
 * 1:1-Portierung aus OSim2004/inc/GraphObj.h Z. 2047-2150
 * (`class GObjSub : public OGraphView, public GObjLink`).
 *
 * **Audit 2026-05-28 (Track A3): Klassen-Identität bestätigt.**
 * `GObjSub` ist eine eigenständige C++-Klasse — NICHT identisch mit dem
 * separat existierenden `GObjElements` (C++ Z.666, `: public GObjLink`).
 * `GObjElements` ist ein Element-Container für GLink-Stellen am Knoten
 * (siehe `GElement` Z.639); das gehört zu einem anderen Use-Case und fehlt
 * derzeit in unserer Portierung — Track B (Foundation-Lücken) füllt das.
 *
 * **Kritisch (CONTEXT D-1.1-18 bis D-1.1-21):** GObjSub erbt im C++-Original
 * von ZWEI Basisklassen — `OGraphView` und `GObjLink` (Mehrfacherbung). In
 * TypeScript ist Mehrfacherbung nicht möglich; wir lösen das als
 * Composition: GObjSub erbt von GObjLink und hält eine interne
 * `OGraphView`-Instanz (`m_subView`), die seine internen Collections
 * verwaltet.
 *
 * **State-Maschine D_CLOSED ↔ D_OPEN:**
 * - D_CLOSED: Sub-Grid versteckt; Knoten rendert als kompakter Kasten.
 * - D_OPEN: Sub-Grid expandiert; Knoten wächst dynamisch mit Inhalt.
 *
 * **Method-Naming-Abweichung (begründet):** C++ `SetState(GOStateSub)` und
 * `GetState()` (Z.2078-2079) kollidieren in TS mit dem geerbten
 * `GObject.SetState(GObjState)` / `GetState()`. Daher heißen sie hier
 * `SetSubState/GetSubState`. Das ist die einzige bewusste Namens-Abweichung
 * (Memory `feedback-consult-original-code` — TS-Sprach-Beschränkung, kein
 * eingedeutschtes Aliasing).
 *
 * **Beliebige Verschachtelungstiefe:** ein GObjSub-Knoten kann selbst wieder
 * GObjSub-Kinder enthalten. `IsParentFrom(obj, rekursiv=TRUE)` und
 * `GetCollection(virtp)` traversieren rekursiv.
 *
 * **4-Layer-Drawing** wird durchgereicht: DrawBackground (vor Kindern) →
 * Kinder via Sub-View → DrawForeground (über Kindern) → DrawHelpers.
 *
 * **Noch nicht portiert (aus C++ Z.2047-2150):**
 * - `DeSubNode()`, `DeSubAll()`, `_Validate()` (interne Hierarchie-Auflösung)
 * - `GetParentGOSub()`, `AmISub()`, `AmICtrl()` (Identitäts-Helpers)
 * - `ShowPhantom/HidePhantom` (Phantom-Preview-Modell — Track B5)
 * - `OnDroped`, `OnGObj2CollAdded`, `OnRMButtonDown`, `OnGOContextMenu`
 *   (MFC-Event-Pfade; React-Flow-Adapter ersetzt sie funktional)
 * - Clipboard-Methoden (MFC-spezifisch, nicht portierbar)
 * Diese Lücken sind dokumentiert, kein Bug — Bedarf entsteht erst mit
 * Track B / Drag-Phantom-Welle / In-Place-Editor.
 */

import { GObjLink } from "./GObjLink";
import { OGraphView } from "./OGraphView";
import {
  GOStateSub,
  GORegion,
  type CPoint,
  type CRect,
  type CSize,
} from "./types";
import { GO_DEFAULT, STD_BGN_X, STD_BGN_Y } from "./constants";
import type { DrawContext } from "./DrawContext";
import type { GObject } from "./GObject";
import type { OGraphCollection } from "./OGraphCollection";

/**
 * Pixel-Reserve oberhalb der Sub-Grid-Bounding-Box für den GObjSub-Header
 * (Plan-/Knoten-Name + Klasse + Chevron). Muss zur OsimNode-Renderer-Höhe
 * passen (siehe OsimNode.tsx OsimGroupNodeImpl). Welle G7.
 */
const GOBJSUB_HEADER_HEIGHT = 56;

/**
 * Welle G27: Vertikale Trenn-Reserve zwischen N Sub-Grids im D_OPEN-Modus
 * (1:1 zum C++-Original GObjAlt — Alternativ-Knoten zeigen ihre N Sub-Pläne
 * vertikal gestapelt mit Sub-Plan-Header zwischen den Grids).
 */
const GOBJSUB_SUBGRID_SEPARATOR = 24;

/**
 * Nested-fähiger Knoten.
 *
 * Konstruktor wie GObjLink, plus initialer State = D_CLOSED (kompakter Kasten).
 */
export class GObjSub extends GObjLink {
  // ============================================================
  // State (C++ Z. 2069)
  // ============================================================

  /** Aktueller Sub-State (geöffnet/geschlossen). */
  protected m_GOSubState: GOStateSub = GOStateSub.D_CLOSED;

  // ============================================================
  // Sub-View (Composition statt Mehrfacherbung mit OGraphView)
  // ============================================================

  /**
   * Interner View-Layer, der die Sub-Collections dieses Knotens verwaltet.
   * In C++ erbt GObjSub direkt von OGraphView; wir halten ihn als Member.
   * Alle OGraphView-Methoden (AddCollection, InvalidateView, …) werden auf
   * `this.m_subView` delegiert.
   */
  readonly m_subView: OGraphView = new OGraphView();

  // ============================================================
  // Konstruktor (C++ Z. 2146)
  // ============================================================

  constructor(width: number = GO_DEFAULT, height: number = GO_DEFAULT) {
    super(width, height);
    this.m_subView.m_OwnerGObj = this;
    // Im D_CLOSED-State sind die Kinder per Default unsichtbar.
    // SetChildsVisible(FALSE) wird ggf. vom Aufrufer nochmal explizit gerufen.
  }

  override IsOnlyGObj(): boolean {
    return false; // GObjSub ist auch keine reine GObject.
  }

  // ============================================================
  // State-API (C++ Z. 2078-2080)
  // ============================================================

  /**
   * Setzt den Sub-State. Bei Wechsel auf D_OPEN werden Kinder sichtbar; bei
   * D_CLOSED werden sie versteckt.
   */
  SetSubState(state: GOStateSub): void {
    if (this.m_GOSubState === state) return;
    this.m_GOSubState = state;
    this.SetChildsVisible(state === GOStateSub.D_OPEN);
    // Größe muss neu berechnet werden — D_OPEN wächst mit Inhalt.
    this._recomputeSize();
  }

  GetSubState(): GOStateSub {
    return this.m_GOSubState;
  }

  // ============================================================
  // SetChildsVisible — REKURSIV (C++ Z. 2085, kritisch nach D-1.1-21)
  // ============================================================

  /**
   * Setzt die Sichtbarkeit aller Kind-Objekte. Wird rekursiv durch alle
   * verschachtelten Sub-Grids weitergegeben — auch über nested GObjSub-
   * Hierarchien hinweg.
   *
   * `visible=false` schaltet alle Kinder auf HIDDEN-State (nicht gerendert,
   * aber Topologie bleibt erhalten — Re-Open zeigt sie wieder).
   */
  override SetChildsVisible(visible: boolean): boolean {
    for (const coll of this.m_subView.m_Collections) {
      coll.iterate((child) => {
        // Sichtbarkeit setzen (über GObjState).
        if (visible) {
          // Reset auf NO_STATE wenn vorher HIDDEN war.
          // (HIDDEN → NO_STATE; MARKED bleibt MARKED.)
          if ((child as GObject).GetState() === 0 /* HIDDEN */) {
            (child as GObject).SetState(2 /* NO_STATE */);
          }
        } else {
          (child as GObject).SetState(0 /* HIDDEN */);
        }
        // Rekursion:
        // - Hide: IMMER alle Tiefen verstecken (auch durch geöffnete Sub-Knoten).
        // - Show: NUR durch D_OPEN-Sub-Knoten propagieren — D_CLOSED-Zwischen-
        //   knoten brechen die Kette (ihre Kinder bleiben HIDDEN).
        if (child instanceof GObjSub) {
          if (visible) {
            if (child.m_GOSubState === GOStateSub.D_OPEN) {
              child.SetChildsVisible(true);
            }
            // else: child ist geschlossen — seine Kinder bleiben hidden.
          } else {
            child.SetChildsVisible(false);
          }
        }
      });
    }
    return true;
  }

  // ============================================================
  // IsParentFrom — REKURSIV (kritisch für Drag-Validation)
  // ============================================================

  /**
   * Prüft ob `obj` ein Nachfahre dieses GObjSub ist. Rekursiv über alle
   * Verschachtelungs-Ebenen. C++ Z. 2113.
   */
  IsParentFrom(obj: GObject, rekursiv: boolean = true): boolean {
    for (const coll of this.m_subView.m_Collections) {
      // Direkter Hit in dieser Collection?
      if (coll.IsParentFrom(obj, false)) return true;
      // Rekursion durch nested GObjSubs.
      if (rekursiv) {
        let found = false;
        coll.iterate((child) => {
          if (found) return;
          if (child instanceof GObjSub) {
            if (child.IsParentFrom(obj, true)) found = true;
          }
        });
        if (found) return true;
      }
    }
    return false;
  }

  // ============================================================
  // ClearAll (C++ Z. 2115)
  // ============================================================

  ClearAll(sendMessage: boolean = true): void {
    for (const coll of this.m_subView.m_Collections) {
      coll.ClearAll(sendMessage);
    }
    // Eltern-Verknüpfungen lassen unangetastet — GObjSub bleibt im Parent-Grid.
  }

  // ============================================================
  // CreateGrid (C++ Z. 2107) — Sub-Grid-Factory
  // ============================================================

  /**
   * Erzeugt ein neues internes Grid (Layer i) und hängt es an den Sub-View.
   * In Welle C voll implementiert (braucht OGraphGrid). Hier als Stub, der
   * eine Collection vom passenden Typ erzeugen soll.
   *
   * Im C++-Original gibt es mehrere Grid-Layer pro GObjSub (für Multi-Phasen-
   * Modelle). Phase 1.1 reicht ein einzelnes Grid pro GObjSub.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CreateGrid(_i: number = 0): OGraphCollection | null {
    // TODO Welle C: neuer OGraphGrid + AddCollection. Param `_i` ist der
    // Grid-Layer-Index für Multi-Layer-Knoten (C++ GObjSub::CreateGrid(int)).
    return null;
  }

  // ============================================================
  // Rect/Size (C++ Z. 2083-2084) — wachsen mit Inhalt im D_OPEN
  // ============================================================

  override GetRect(rect: CRect): void {
    if (this.m_GOSubState === GOStateSub.D_CLOSED) {
      // Geschlossen: einfach das m_VirtRect.
      super.GetRect(rect);
      return;
    }
    // Offen: m_VirtRect + Bounding-Box aller Sub-Children.
    // Welle G27: bei N>1 Sub-Grids werden die Children vertikal STACKED, jeder
    // Sub-Grid mit seinem eigenen y-Offset (kumulativ über vorherige Heights
    // + Separator). Vorher überlagerten sich alle N Sub-Grids am selben Punkt
    // — der Parent sah nur das größte, andere waren visuell verloren.
    const r = this.m_VirtRect;
    rect.left = r.left;
    rect.top = r.top;
    rect.right = r.right;
    rect.bottom = r.bottom;
    let yCursor = 0;
    for (const coll of this.m_subView.m_Collections) {
      let maxBottomInColl = 0;
      coll.iterate((child) => {
        const childRect = { left: 0, top: 0, right: 0, bottom: 0 };
        child.GetRect(childRect);
        const absRight = r.left + STD_BGN_X + childRect.right;
        const absBottom = r.top + STD_BGN_Y + yCursor + childRect.bottom;
        if (absRight > rect.right) rect.right = absRight;
        if (absBottom > rect.bottom) rect.bottom = absBottom;
        if (childRect.bottom > maxBottomInColl) {
          maxBottomInColl = childRect.bottom;
        }
      });
      yCursor += maxBottomInColl + GOBJSUB_SUBGRID_SEPARATOR;
    }
  }

  /**
   * Liefert die effektive Größe — bei D_OPEN inkl. der Sub-Grid-Bounds.
   * 1:1 aus C++ OGObjSub.cpp Z.241 (`GObjSub::GetSize`): offen → von Sub-View
   * berechnen, geschlossen → wie GObjLink.
   *
   * Welle G7: das ist die Brücke zwischen GObjSub-Größe und der
   * OGraphGrid.computeSizes()-Spalten-Width-Berechnung. Wenn ein GObjSub
   * im D_OPEN seine Sub-Grid ausbreitet, meldet er hier die volle Sub-Grid-
   * Größe + Header-Reserve, und der Parent-Grid streckt seine Spalte mit.
   */
  override GetSize(mysize: CSize): boolean {
    if (this.m_GOSubState === GOStateSub.D_CLOSED) {
      return super.GetSize(mysize);
    }
    // D_OPEN: Sub-Grids bottom-up neu berechnen, dann eigene Bounding-Box.
    // Welle G27: bei N>1 Sub-Grids wird die TOTAL-Höhe als SUMME aller
    // Sub-Grid-Heights + Trenner-Padding berechnet (vertikal stacked, 1:1
    // zum C++-GObjAlt). Breite bleibt MAX aller Sub-Grid-Widths (alle teilen
    // sich die volle Container-Breite).
    let maxCx = 0;
    let sumCy = 0;
    const colls = this.m_subView.m_Collections;
    colls.forEach((coll, idx) => {
      const subGrid = coll as unknown as {
        finalizeLayout?: (origin?: CPoint) => void;
        m_GSize?: CSize;
      };
      if (typeof subGrid.finalizeLayout === "function") {
        subGrid.finalizeLayout();
      }
      const s = subGrid.m_GSize ?? { cx: 0, cy: 0 };
      if (s.cx > maxCx) maxCx = s.cx;
      sumCy += s.cy;
      if (idx < colls.length - 1) {
        sumCy += GOBJSUB_SUBGRID_SEPARATOR;
      }
    });
    // Header-Reserve (Plan-Name + Klasse + Padding) + seitliches Padding.
    // STD_BGN_X/STD_BGN_Y liefern den Sub-Grid-Innenabstand.
    const headerHeight = GOBJSUB_HEADER_HEIGHT;
    const padding = STD_BGN_X * 2;
    const widthFromContent = maxCx + padding;
    const heightFromContent = sumCy + headerHeight + STD_BGN_Y;
    const baseW = this.m_GSize.cx;
    const baseH = this.m_GSize.cy;
    mysize.cx = widthFromContent > baseW ? widthFromContent : baseW;
    mysize.cy = heightFromContent > baseH ? heightFromContent : baseH;
    // Cache die berechnete Größe für nachfolgende GetRect/computeSizes-Aufrufe.
    this.m_GSize = { ...mysize };
    return true;
  }

  override SetSize(size: CSize): void {
    super.SetSize(size);
    // Sub-Grids erben die neue Größe NICHT direkt — sie behalten ihre eigene
    // computeSizes-Berechnung. Beim nächsten GetSize-Aufruf wird das neu
    // gerechnet.
  }

  /**
   * Verschiebt den GObjSub UND propagiert die neue Pixel-Origin in alle
   * Sub-Views (1:1 aus C++ OGObjSub.cpp Z.185 `GObjSub::SetPosition`):
   * Erst eigene Position (via GObjLink), dann OGraphView.SetPosition mit
   * derselben Origin — was OGraphView.applyPositions auf alle Sub-Collections
   * delegiert.
   *
   * Welle G7: Sub-Knoten landen relativ zur GObjSub-Origin + Header-Offset.
   */
  override SetPosition(myorg: CPoint): boolean {
    const ret = super.SetPosition(myorg);
    if (this.m_GOSubState === GOStateSub.D_OPEN) {
      // Welle G27: pro Sub-Grid wird ein eigener y-Offset berechnet —
      // kumulativ über die Heights der vorherigen Sub-Grids plus
      // Separator. Vorher bekamen alle N Sub-Grids denselben subOrigin
      // → sie lagen visuell übereinander. Jetzt vertikal gestapelt.
      let yCursor = myorg.y + GOBJSUB_HEADER_HEIGHT;
      const baseX = myorg.x + STD_BGN_X;
      const colls = this.m_subView.m_Collections;
      colls.forEach((coll, idx) => {
        const subGrid = coll as unknown as {
          applyPositions?: (origin: CPoint) => void;
          m_GSize?: CSize;
        };
        if (typeof subGrid.applyPositions === "function") {
          subGrid.applyPositions({ x: baseX, y: yCursor });
        }
        const h = subGrid.m_GSize?.cy ?? 0;
        yCursor += h;
        if (idx < colls.length - 1) {
          yCursor += GOBJSUB_SUBGRID_SEPARATOR;
        }
      });
    }
    return ret;
  }

  /**
   * Interne Re-Compute-Funktion. Berechnet die effektive Größe basierend auf
   * State + Sub-Children. Wird von SetSubState gerufen.
   */
  protected _recomputeSize(): void {
    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    this.GetRect(r);
    this.m_VirtRect = r;
    this.m_GSize = { cx: r.right - r.left, cy: r.bottom - r.top };
  }

  // ============================================================
  // GetCollection — REKURSIV (kritisch für Click-Routing)
  // ============================================================

  /**
   * Liefert die innerste Collection unter dem Cursor. Klick auf einem Kind
   * eines D_OPEN-GObjSub muss das Kind selektieren, nicht den Parent — und
   * zwar rekursiv durch alle Ebenen.
   */
  override GetCollection(virtp: CPoint): OGraphCollection | null {
    // Außerhalb des eigenen Rects? → nicht zuständig.
    if (
      virtp.x < this.m_VirtRect.left ||
      virtp.x > this.m_VirtRect.right ||
      virtp.y < this.m_VirtRect.top ||
      virtp.y > this.m_VirtRect.bottom
    ) {
      return null;
    }

    // Im D_OPEN: prüfe rekursiv ob ein Kind tiefer drin liegt.
    if (this.m_GOSubState === GOStateSub.D_OPEN) {
      for (const coll of this.m_subView.m_Collections) {
        let innerHit: OGraphCollection | null = null;
        coll.iterate((child) => {
          if (innerHit) return;
          const childColl = child.GetCollection(virtp);
          if (childColl) innerHit = childColl;
        });
        if (innerHit) return innerHit;
      }
      // Kein Kind getroffen → eigene Sub-Collection ist das Ziel.
      if (this.m_subView.m_Collections.length > 0) {
        return this.m_subView.m_Collections[0];
      }
    }

    // Im D_CLOSED oder ohne Kind-Hit: Parent-Collection (Standard).
    return this.m_OGCollection;
  }

  // ============================================================
  // IsHit — REKURSIV (sammelt alle Kinder unter dem Cursor)
  // ============================================================

  override IsHit(virtp: CPoint, list: GObject[]): boolean {
    // Erst eigenes Rect prüfen.
    const ownHit = super.IsHit(virtp, list);
    if (!ownHit) return false;
    // Im D_OPEN: rekursiv Kinder befragen.
    if (this.m_GOSubState === GOStateSub.D_OPEN) {
      for (const coll of this.m_subView.m_Collections) {
        coll.iterate((child) => {
          child.IsHit(virtp, list);
        });
      }
    }
    return true;
  }

  // ============================================================
  // CheckRegion — Standard, mit Sonderfall Open-Header
  // ============================================================

  override CheckRegion(virtp: CPoint): GORegion {
    const region = super.CheckRegion(virtp);
    // TODO Welle F: für D_OPEN den oberen Header (mit Open/Close-Icon)
    // separat behandeln und R_EDIT für Klick auf Icon liefern.
    return region;
  }

  // ============================================================
  // OnEditGo — Doppelklick öffnet/schließt
  // ============================================================

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override OnEditGo(_virtpoint: CPoint): boolean {
    const newState =
      this.m_GOSubState === GOStateSub.D_OPEN
        ? GOStateSub.D_CLOSED
        : GOStateSub.D_OPEN;
    this.SetSubState(newState);
    return true;
  }

  // ============================================================
  // OnOpenAll — Cascade-Open (C++ Z. 2139)
  // ============================================================

  override OnOpenAll(open: boolean): void {
    this.SetSubState(open ? GOStateSub.D_OPEN : GOStateSub.D_CLOSED);
    // Rekursiv durch alle Sub-Children mit OnOpenAll.
    for (const coll of this.m_subView.m_Collections) {
      coll.iterate((child) => {
        if (child instanceof GObjSub) {
          child.OnOpenAll(open);
        } else {
          child.OnOpenAll(open);
        }
      });
    }
  }

  // ============================================================
  // 4-Layer-Drawing (C++ Z. 2122-2125) — durchreichen an Kinder
  // ============================================================

  override DrawBackground(ctx: DrawContext): boolean {
    // Eigener Hintergrund (z.B. abgerundeter Container-Border).
    super.DrawBackground(ctx);
    // Bei D_OPEN: Kinder-Hintergründe in Reihenfolge.
    if (this.m_GOSubState === GOStateSub.D_OPEN) {
      for (const coll of this.m_subView.m_Collections) {
        coll.iterate((child) => child.DrawBackground(ctx));
      }
    }
    return true;
  }

  override Draw(ctx: DrawContext): boolean {
    super.Draw(ctx);
    if (this.m_GOSubState === GOStateSub.D_OPEN) {
      for (const coll of this.m_subView.m_Collections) {
        coll.iterate((child) => child.Draw(ctx));
      }
    }
    return true;
  }

  override DrawForeground(ctx: DrawContext): boolean {
    if (this.m_GOSubState === GOStateSub.D_OPEN) {
      for (const coll of this.m_subView.m_Collections) {
        coll.iterate((child) => child.DrawForeground(ctx));
      }
    }
    super.DrawForeground(ctx);
    return true;
  }

  override DrawHelpers(ctx: DrawContext): boolean {
    super.DrawHelpers(ctx);
    if (this.m_GOSubState === GOStateSub.D_OPEN) {
      for (const coll of this.m_subView.m_Collections) {
        coll.iterate((child) => child.DrawHelpers(ctx));
      }
    }
    return true;
  }

  // ============================================================
  // Convenience: Sub-View-Delegation
  // ============================================================

  /** Fügt eine Sub-Collection zu diesem GObjSub hinzu. */
  AddSubCollection(coll: OGraphCollection): void {
    this.m_subView.AddCollection(coll);
  }

  /** Liefert alle Sub-Collections. */
  GetSubCollections(): readonly OGraphCollection[] {
    return this.m_subView.m_Collections;
  }
}
