// Plan 01-04 Task 2: ViewerFrame — TS-Klasse (KEIN React).
//
// Bildet OViewer.h Abschnitt 2 "Viewer-Frame" ab:
// - haelt Referenz auf ClientCtrl
// - delegiert setObj() an ClientCtrl
// - hat einen subscribe/notify-Mechanismus, ueber den ViewerHost (React)
//   re-rendern kann wenn ClientCtrl-State sich aendert
//
// Reduzierter Funktionsumfang gegenueber dem C++-Original (Phase 1 hat
// noch keine Menues, Toolbars, Accelerators — siehe risks-Block im Plan).

import { ClientCtrl } from "./ClientCtrl";
import type { OtxJsonNode, ViewerMenuSpec } from "./types";

export type FrameListener = () => void;

/**
 * ViewerFrame — der Top-Level-Container fuer einen Viewer.
 *
 * In React-Land wird genau ein ViewerHost-Component an einem Frame
 * gemounted; der Host abonniert subscribe() und triggert sein useState,
 * sobald notify() vom ClientCtrl kommt.
 */
export class ViewerFrame {
  readonly clientCtrl: ClientCtrl;
  readonly title: string;
  private _listeners = new Set<FrameListener>();
  /** Callback aus dem Construktor (z.B. fuer Breadcrumb-Update). */
  private _onObjChange?: (obj: OtxJsonNode | null) => void;

  constructor(
    title: string,
    onObjChange?: (obj: OtxJsonNode | null) => void,
  ) {
    this.title = title;
    this._onObjChange = onObjChange;
    this.clientCtrl = new ClientCtrl(this);
  }

  /**
   * Setzt das aktuell anzuzeigende Objekt. Delegiert an ClientCtrl,
   * der bei Bedarf den ChildDialog wechselt (OViewer.h 3.3).
   */
  setObj(obj: OtxJsonNode | null): boolean {
    const ok = this.clientCtrl.setObj(obj);
    if (ok) {
      this._onObjChange?.(obj);
    }
    return ok;
  }

  /**
   * Triggert ein Re-Render. Wird vom ClientCtrl oder von externem Code
   * (z.B. nach einem store-Reload) aufgerufen.
   */
  update(): void {
    for (const l of this._listeners) l();
  }

  /**
   * React-Komponenten subscriben hier; useEffect liefert die unsubscribe-
   * Funktion.
   */
  subscribe(listener: FrameListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Liefert den aktuellen Menu-Spec — Phase 1 default null (kein Menue).
   * Plan 09+ kann das ueberschreiben.
   */
  getMenu(): ViewerMenuSpec | null {
    return null;
  }
}
