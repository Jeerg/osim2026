// Plan 01-04 Task 2: Viewer-Foundation Types.
//
// Diese Typen sind die Querschnitt-Vertraege fuer das gesamte Viewer-System
// (D-07). Plan 05-08 nutzt sie 1:1, ohne sie zu erweitern.

import type { FC, ReactNode } from "react";

/** Object-ID — eindeutig pro Objekt im aktuell geladenen Modell. */
export type Oid = number;

/** Klassen-Name eines OSim-Objekts (z.B. "PDurchlaufplan", "PRessBeleg"). */
export type Klass = string;

/**
 * Property-Werte sind primitiv. Falls in Phase 3+ COLORREF/LOGFONT als
 * strukturierte Werte ankommen, wird der Type-Union erweitert.
 */
export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: unknown };

/**
 * Snapshot eines OSim-Objektes wie ihn das Backend als JSON-Tree liefert
 * (OTX → osim_engine.io.otx_loader → JSON-Serialisierung).
 *
 * `unsupported`: True wenn der OTX-Reader dieses Objekt nicht voll laden
 * konnte (s. LoadResult.unsupported). Viewer sollen das visuell signalisieren.
 */
export interface OtxJsonNode {
  oid: Oid;
  klass: Klass;
  name: string;
  properties: Record<string, PropertyValue>;
  children: OtxJsonNode[];
  unsupported?: true;
}

/**
 * Method-Call-Argument: Phase 1 unterstuetzt nur primitiv-Args; falls Plan 09
 * Methoden mit Objekt-Args braucht, wird das hier ausgeweitet.
 */
export type MethodArg = string | number | boolean | null;

/**
 * Standard-Props fuer jeden ChildDialog.
 *
 * - `obj`: das aktuelle Objekt, das angezeigt/editiert wird.
 * - `onPropertyChange`: Callback fuer OCtrl-Edit-Events. Geht via
 *    ClientCtrl/Frame an den model-store.
 * - `onMethodCall`: Callback fuer OCtrlMethod-Klicks.
 */
export interface ChildDialogProps {
  obj: OtxJsonNode;
  onPropertyChange: (oid: Oid, key: string, value: PropertyValue) => void;
  onMethodCall: (oid: Oid, method: string, args?: MethodArg[]) => void;
}

/** Eine ChildDialog-Komponente ist ein React-FC mit ChildDialogProps. */
export type ChildDialogComponent = FC<ChildDialogProps>;

/** Stub-Type fuer ChildDialog-Wrapper mit Kindern (ChildDialog-Provider). */
export interface ChildDialogProviderProps extends ChildDialogProps {
  children: ReactNode;
}

/**
 * Eintrag in der viewer-registry.
 *
 * `displayName` wird in Diagnose-UIs (z.B. Plan 09 viewer-picker) angezeigt.
 * `priority` ist Phase-1-Vorbereitung; aktuell unbenutzt (registry merged
 * nicht, sondern ueberschreibt — letzte Registrierung gewinnt).
 */
export interface ViewerRegistration {
  klass: Klass;
  component: ChildDialogComponent;
  displayName: string;
  priority?: number;
}

/**
 * ViewerMenuSpec — Stub fuer Phase 3+. Phase 1 hat keine Menues; das
 * Routing-Pattern aus OViewer.h Abschnitt 3.1 (Kommando-Routing) wird
 * spaeter ergaenzt.
 */
export interface ViewerMenuSpec {
  items: Array<{
    id: string;
    label: string;
    enabled: boolean;
  }>;
}

/** Snapshot einer ChildDialog-Auswahl (fuer Tests / Debug). */
export interface ChildDialogSelection {
  klass: Klass;
  componentName: string;
  fallback: boolean;
}
