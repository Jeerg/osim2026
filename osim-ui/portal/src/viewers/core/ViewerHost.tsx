// Plan 01-04 Task 2: ViewerHost — React-Mountpoint fuer einen ViewerFrame.
//
// ViewerHost ist das Bindeglied zwischen der TS-Klassen-Welt
// (ViewerFrame/ClientCtrl) und der React-Welt (ChildDialog/OCtrl).
//
// Es abonniert frame.subscribe(), damit React re-rendern kann, wenn der
// ClientCtrl-State sich aendert (z.B. nach setObj()), und mounted den
// passenden ChildDialog basierend auf clientCtrl.current.klass.

import { useEffect, useReducer, type ReactNode } from "react";
import { ChildDialog } from "./ChildDialog";
import { useModelStore } from "@/state/model-store";
import type { ViewerFrame } from "./ViewerFrame";

export interface ViewerHostProps {
  frame: ViewerFrame;
  /** Optional: was anzeigen, wenn kein Objekt geladen ist. */
  empty?: ReactNode;
  /** Optional: was anzeigen, wenn kein Viewer fuer die Klasse registriert ist. */
  unknownViewer?: (klass: string) => ReactNode;
}

export function ViewerHost({
  frame,
  empty,
  unknownViewer,
}: ViewerHostProps): ReactNode {
  // Re-render-Trigger fuer frame.update().
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => frame.subscribe(force), [frame]);

  const obj = frame.clientCtrl.current;
  const updateProperty = useModelStore((s) => s.updateProperty);

  if (!obj) {
    return (
      empty ?? (
        <div className="flex h-full items-center justify-center text-sm text-gray-500">
          Kein Objekt ausgewaehlt.
        </div>
      )
    );
  }

  const Dialog = frame.clientCtrl.pickChildDialog(obj.klass);
  if (!Dialog) {
    return (
      unknownViewer?.(obj.klass) ?? (
        <div className="flex h-full items-center justify-center text-sm text-gray-500">
          Kein Viewer fuer Klasse <code>{obj.klass}</code> registriert.
        </div>
      )
    );
  }

  // onMethodCall — Phase 1: nur als Stub im Store-State weitergegeben.
  // Plan 09 / Engine-Integration ergaenzt echte Backend-Aufrufe.
  const onMethodCall = (oid: number, method: string): void => {
    console.info(
      `[ViewerHost] method call (noop in Phase 1): oid=${oid} method=${method}`,
    );
  };

  return (
    <ChildDialog
      obj={obj}
      onPropertyChange={updateProperty}
      onMethodCall={onMethodCall}
    >
      <Dialog
        obj={obj}
        onPropertyChange={updateProperty}
        onMethodCall={onMethodCall}
      />
    </ChildDialog>
  );
}
