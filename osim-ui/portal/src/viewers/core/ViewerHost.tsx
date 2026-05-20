// Plan 01-04 Task 2: ViewerHost — React-Mountpoint fuer einen ViewerFrame.
//
// ViewerHost ist das Bindeglied zwischen der TS-Klassen-Welt
// (ViewerFrame/ClientCtrl) und der React-Welt (ChildDialog/OCtrl).
//
// Es abonniert frame.subscribe(), damit React re-rendern kann, wenn der
// ClientCtrl-State sich aendert (z.B. nach setObj()), und mounted den
// passenden ChildDialog basierend auf clientCtrl.current.klass.

import { useEffect, useReducer, useRef, type ReactNode } from "react";
import { ChildDialog } from "./ChildDialog";
import { useModelStore } from "@/state/model-store";
import type { ViewerFrame } from "./ViewerFrame";
import type { MethodArg, Oid, OtxJsonNode } from "./types";

/**
 * Methoden-Dispatcher fuer onMethodCall. Plan 09 / Engine-Integration
 * kann das mit echten Backend-Roundtrips erweitern. Phase 1 routet die
 * vorhandenen "store-affecting" Methoden direkt auf den model-store.
 *
 * Wird als Prop uebergeben, damit der Konsument (Plan 09) die Strategie
 * austauschen kann (z.B. async Engine-Call).
 */
export interface ViewerMethodDispatcher {
  /**
   * Wird gerufen wenn ein Add-Skeleton angelegt werden soll. Liefert
   * Default-Properties fuer die anzulegende Klasse.
   */
  getDefaultProperties?: (klass: string) => Record<string, unknown>;
  /**
   * Wird fuer nicht aufgeloeste Methoden gerufen (alle ausser "addChild" /
   * "removeChild"). Default: console.info-Stub.
   */
  onCustomMethod?: (oid: Oid, method: string, args?: MethodArg[]) => void;
}

export interface ViewerHostProps {
  frame: ViewerFrame;
  /** Optional: was anzeigen, wenn kein Objekt geladen ist. */
  empty?: ReactNode;
  /** Optional: was anzeigen, wenn kein Viewer fuer die Klasse registriert ist. */
  unknownViewer?: (klass: string) => ReactNode;
  /** Optional: Methoden-Dispatcher (siehe ViewerMethodDispatcher). */
  methodDispatcher?: ViewerMethodDispatcher;
}

export function ViewerHost({
  frame,
  empty,
  unknownViewer,
  methodDispatcher,
}: ViewerHostProps): ReactNode {
  // Re-render-Trigger fuer frame.update().
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => frame.subscribe(force), [frame]);

  const obj = frame.clientCtrl.current;
  const updateProperty = useModelStore((s) => s.updateProperty);
  const addChildSkeleton = useModelStore((s) => s.addChildSkeleton);
  const removeNode = useModelStore((s) => s.removeNode);

  // Dispatcher in einem Ref halten, damit der onMethodCall-Callback
  // stabil bleibt (sonst re-rendert ChildDialog bei jedem Tree-Update).
  const dispatcherRef = useRef(methodDispatcher);
  useEffect(() => {
    dispatcherRef.current = methodDispatcher;
  }, [methodDispatcher]);

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

  // onMethodCall — Phase 1: routet "addChild"/"removeChild" auf den
  // model-store. Andere Methoden gehen an methodDispatcher.onCustomMethod
  // (Plan 09 / Engine-Roundtrip).
  const onMethodCall = (
    oid: Oid,
    method: string,
    args?: MethodArg[],
  ): void => {
    if (method === "addChild") {
      // args[0] = property-Name in OCtrlList (z.B. "m_lKnoten" oder
      // direkt die childKlass — die Caller-Konvention wird in der
      // konkreten Viewer-Implementierung festgelegt). In Plan 05 nutzen
      // die Viewer direkte childKlass-Strings (kein property-Lookup).
      const childKlass = typeof args?.[0] === "string" ? args[0] : null;
      if (!childKlass) {
        console.warn("[ViewerHost] addChild ohne childKlass-Argument.");
        return;
      }
      const getDefaults =
        dispatcherRef.current?.getDefaultProperties ??
        (() => ({}));
      addChildSkeleton(
        oid,
        childKlass,
        getDefaults as (k: string) => Record<string, import("./types").PropertyValue>,
      );
      return;
    }
    if (method === "removeChild") {
      const targetOid = typeof args?.[0] === "number" ? args[0] : null;
      if (targetOid == null) {
        console.warn("[ViewerHost] removeChild ohne oid-Argument.");
        return;
      }
      // Confirmation-Dialog (Phase 1: simple confirm()).
      if (typeof window !== "undefined" && window.confirm) {
        const ok = window.confirm(
          `Knoten ${targetOid} wirklich entfernen? (Rueckgaengig per Undo)`,
        );
        if (!ok) return;
      }
      removeNode(targetOid);
      return;
    }
    dispatcherRef.current?.onCustomMethod?.(oid, method, args);
  };

  return (
    <ChildDialog
      obj={obj as OtxJsonNode}
      onPropertyChange={updateProperty}
      onMethodCall={onMethodCall}
    >
      <Dialog
        obj={obj as OtxJsonNode}
        onPropertyChange={updateProperty}
        onMethodCall={onMethodCall}
      />
    </ChildDialog>
  );
}
