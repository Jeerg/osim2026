// Plan 01-04 Task 2: ChildDialog — React-Composition.
//
// Stellt einen Context bereit, in dem alle eingebetteten OCtrls das
// aktuelle Objekt + die Standard-Callbacks abrufen koennen. Der
// useOCtrlBinding-Hook in OCtrl.types.ts greift hier zu.
//
// In OViewer.h Abschnitt 2 entspricht das dem Child-Dialog, der das
// Object + alle OCtrls beherbergt. Hier ist es ein React-Provider, der
// die Props per Context durchreicht — idiomatisch fuer React.

import { createContext, useContext, type ReactNode } from "react";
import type {
  ChildDialogProps,
  ChildDialogProviderProps,
  MethodArg,
  Oid,
  OtxJsonNode,
  PropertyValue,
} from "./types";

interface ChildDialogContextValue {
  obj: OtxJsonNode;
  onPropertyChange: (oid: Oid, key: string, value: PropertyValue) => void;
  onMethodCall: (oid: Oid, method: string, args?: MethodArg[]) => void;
}

export const ChildDialogContext =
  createContext<ChildDialogContextValue | null>(null);

/**
 * Hook fuer alle OCtrls (und andere Sub-Components), die das aktuelle
 * ChildDialog-Objekt + die Standard-Callbacks brauchen.
 */
export function useChildDialog(): ChildDialogContextValue {
  const ctx = useContext(ChildDialogContext);
  if (!ctx) {
    throw new Error(
      "useChildDialog must be used inside a <ChildDialog> provider",
    );
  }
  return ctx;
}

/**
 * ChildDialog-Provider — Wrappt die konkrete ChildDialog-Komponente
 * (aus der viewer-registry) in einen Context-Provider, der das aktuelle
 * Objekt und die Standard-Callbacks fuer alle OCtrls bereitstellt.
 */
export function ChildDialog(props: ChildDialogProviderProps): ReactNode {
  const { obj, onPropertyChange, onMethodCall, children } = props;
  return (
    <ChildDialogContext.Provider value={{ obj, onPropertyChange, onMethodCall }}>
      {children}
    </ChildDialogContext.Provider>
  );
}

/**
 * Re-export — viele Konsumenten importieren beides aus diesem Modul.
 */
export type { ChildDialogProps };
