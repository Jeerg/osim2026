// Plan 01-04 Task 2: ChildCtrl — React-Wrapper fuer nested ChildDialogs.
//
// Bildet OViewer.h Abschnitt 2 "Child-Ctrl" ab: ein eingebetteter
// ChildDialog fuer ein Sub-Objekt. ChildCtrl konsultiert die
// viewer-registry, um den passenden Dialog fuer obj.klass zu mounten,
// und reicht die Edit-Callbacks transparent an den Parent weiter
// (Edits an Sub-Objekten landen weiterhin im selben model-store).

import type { ReactNode } from "react";
import { ChildDialog, useChildDialog } from "./ChildDialog";
import { getViewer } from "./viewer-registry";
import { FALLBACK_KLASS } from "./ClientCtrl";
import type { OtxJsonNode } from "./types";

export interface ChildCtrlProps {
  /** Das Sub-Objekt, fuer das ein eingebetteter ChildDialog gemounted wird. */
  obj: OtxJsonNode;
  /**
   * Optionaler Fallback-Renderer, falls weder klass-spezifischer Viewer
   * noch PGObjBase registriert ist.
   */
  fallback?: ReactNode;
}

export function ChildCtrl({ obj, fallback }: ChildCtrlProps): ReactNode {
  // Routing-Forwarding (OViewer.h 3.1): Edit-Events am Sub-Dialog gehen
  // zu denselben Callbacks wie am Top-Level-Dialog — der model-store
  // entscheidet anhand der oid, welcher Knoten geupdatet wird.
  const parent = useChildDialog();

  const Dialog = getViewer(obj.klass) ?? getViewer(FALLBACK_KLASS);
  if (!Dialog) {
    return (
      fallback ?? (
        <div className="rounded border border-dashed border-gray-300 p-2 text-xs text-gray-500">
          Kein Viewer fuer Klasse <code>{obj.klass}</code> registriert.
        </div>
      )
    );
  }

  return (
    <ChildDialog
      obj={obj}
      onPropertyChange={parent.onPropertyChange}
      onMethodCall={parent.onMethodCall}
    >
      <Dialog
        obj={obj}
        onPropertyChange={parent.onPropertyChange}
        onMethodCall={parent.onMethodCall}
      />
    </ChildDialog>
  );
}
