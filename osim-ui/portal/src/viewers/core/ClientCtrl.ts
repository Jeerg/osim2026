import type { ComponentType } from "react";
import type { ViewerRegistry } from "@/viewers/core/ViewerRegistry";
import type {
  OBaseObj,
  ViewerHint,
  ViewerProps,
} from "@/viewers/core/types";

/**
 * Routing-State pro Viewer-Instanz. Plain TS-Klasse, KEINE React-Hooks —
 * `ClientCtrl` ist bewusst Framework-agnostisch (1:1-Konzept-Port der
 * C++-`OClientCtrl`-Klasse aus `OSim2004/inc/OViewer.h`).
 *
 * Die Kopplung zum ModelStore (Plan 07) erfolgt über die Constructor-
 * Callbacks `getState` / `setSelection` / `setViewerHint`. So bleibt
 * `ClientCtrl` testbar ohne Zustand-Provider-Mock.
 *
 * Die Aufgabe ist schlank: Routing (welcher Viewer zu welchem Objekt?). Das
 * MFC-`OViewer`-System hatte zusätzlich eine elaborate Push-Choreographie
 * (`WM_OCTRL_FILL`, `WM_OCTRL_STORE`, `WM_OCTRL_INIT`) — die wird in React
 * vollständig durch den Reconciler + kontrollierte Inputs ersetzt (siehe
 * RESEARCH.md §Pattern 1, "Was bewusst NICHT portiert wird").
 */
export class ClientCtrl {
  constructor(
    private readonly registry: ViewerRegistry,
    private readonly getState: () => {
      selection: number | null;
      viewerHint: ViewerHint | null;
    },
    private readonly onSelectionChange: (oid: number | null) => void,
    private readonly onHintChange: (hint: ViewerHint | null) => void,
  ) {}

  /**
   * Liefert die für `obj` zuständige Viewer-Component. Berücksichtigt den
   * aktuellen `viewerHint` aus dem Store-State.
   *
   * Returns:
   *   - `ComponentType<ViewerProps>` wenn registriert oder Fallback gesetzt
   *   - `null` wenn `obj === null`
   *   - `undefined` wenn weder Eintrag noch Fallback existieren
   */
  resolveViewer(obj: OBaseObj | null): ComponentType<ViewerProps> | undefined | null {
    if (!obj) return null;
    const hint = this.getState().viewerHint ?? undefined;
    return this.registry.resolve(obj.klass, hint);
  }

  /**
   * Setzt die aktuelle Selektion (oid oder null). Delegiert an den Store-
   * Callback aus dem Constructor.
   */
  setObject(oid: number | null): void {
    this.onSelectionChange(oid);
  }

  /**
   * Wechselt den aktiven Viewer-Hint (z.B. "std" → "design"). Ein nachfolgender
   * `resolveViewer` liefert dann die Hint-Variante.
   */
  setViewerHint(hint: ViewerHint | null): void {
    this.onHintChange(hint);
  }
}
