// Plan 01-04 Task 2: OCtrl-Typen + useOCtrlBinding-Hook.
//
// Jeder der 9 OCtrls implementiert OCtrlProps<T> und nutzt
// useOCtrlBinding(property) zum Lesen + Schreiben des Werts. Die
// TYPE_MAP haelt pro (Klasse, Property) statische Metadaten (Enum-Werte,
// Link-Target, etc.) — wird in Plan 05+ pro konkreter Klasse befuellt.

import { useCallback } from "react";
import { useChildDialog } from "./ChildDialog";
import type { Klass, PropertyValue } from "./types";

/**
 * Metadaten fuer ein einzelnes Property eines OSim-Objekts.
 *
 * Phase 1 unterstuetzt die folgenden Typen; Plan 05+ kann erweitern.
 * Plan 09 ergaenzt strukturierte Werte (LOGFONT) wenn noetig.
 */
export type OCtrlPropertyType =
  | "string"
  | "int"
  | "float"
  | "bool"
  | "enum"
  | "link"
  | "list"
  | "colorref"
  | "logfont"
  | "method";

export interface OCtrlEnumValue {
  value: string | number;
  label: string;
}

export interface OCtrlListColumn {
  property: string;
  label: string;
  octrl: "variable" | "bool" | "enum" | "link";
}

export interface OCtrlMetadata {
  type: OCtrlPropertyType;
  /** Default-Label, falls die OCtrl-Instance keinen eigenen `label`-Prop hat. */
  label?: string;
  enumValues?: OCtrlEnumValue[];
  /** Fuer "link": Zielklasse des verlinkten Objekts. */
  linkTargetKlass?: Klass;
  /** Fuer "list": Spalten-Definition. */
  columns?: OCtrlListColumn[];
  /** Fuer "list": Klassen-Filter fuer Sub-Children. */
  childKlassFilter?: Klass | Klass[];
}

/** TYPE_MAP wird in Plan 05+ pro Klasse befuellt. */
const TYPE_MAP: Record<Klass, Record<string, OCtrlMetadata>> = {};

/**
 * Default-Metadata wenn keine spezifische Eintrag im TYPE_MAP existiert.
 * Liefert "string" fuer alles — die OCtrl-Komponente entscheidet dann
 * selbst (z.B. OCtrlBool ignoriert den Wert und schaut auf typeof value).
 */
const DEFAULT_METADATA: OCtrlMetadata = { type: "string" };

/**
 * Liefert die Metadaten fuer (klass, property). In Phase 1 noch ueberwiegend
 * Default; Plan 05+ registriert per registerTypeMetadata().
 */
export function getMetadataFor(
  klass: Klass,
  property: string,
): OCtrlMetadata {
  return TYPE_MAP[klass]?.[property] ?? DEFAULT_METADATA;
}

/**
 * Plan-05+ Hilfsfunktion: registriert die Metadaten fuer eine Klasse.
 * Idempotent — letzte Registrierung gewinnt.
 */
export function registerTypeMetadata(
  klass: Klass,
  metadata: Record<string, OCtrlMetadata>,
): void {
  TYPE_MAP[klass] = { ...(TYPE_MAP[klass] ?? {}), ...metadata };
}

/** Test-Helper — leert die TYPE_MAP. NUR fuer Tests. */
export function _clearTypeMapForTests(): void {
  for (const k of Object.keys(TYPE_MAP)) delete TYPE_MAP[k];
}

/**
 * Standard-Props fuer alle OCtrl-Komponenten.
 *
 * Der Wert-Typ ist nicht als Generic durchgereicht — jede OCtrl-Variante
 * fragt useOCtrlBinding<T>() selbststaendig mit dem passenden Typ ab.
 * Das vereinfacht die Component-Signaturen und vermeidet unused-Generic-
 * Probleme bei den 9 verschiedenen OCtrl-Files.
 */
export interface OCtrlProps {
  /** Property-Name auf dem aktuellen Objekt (z.B. "m_sName"). */
  property: string;
  /** Optional: ueberschreibt das Label aus den Metadaten. */
  label?: string;
  /** True = nur lesen (kein Edit). */
  readonly?: boolean;
}

/**
 * Bindings-Hook — der zentrale Vertrag fuer alle OCtrls:
 *
 *   const { value, setValue, metadata } = useOCtrlBinding<string>("m_sName");
 *
 * Liest aus dem aktuellen ChildDialog-Objekt, schreibt zurueck via
 * onPropertyChange (der wiederum den model-store updated).
 */
export function useOCtrlBinding<T extends PropertyValue = PropertyValue>(
  property: string,
): {
  value: T;
  setValue: (v: T) => void;
  metadata: OCtrlMetadata;
} {
  const { obj, onPropertyChange } = useChildDialog();
  const value = (obj.properties[property] ?? null) as T;
  const setValue = useCallback(
    (v: T) => onPropertyChange(obj.oid, property, v as PropertyValue),
    [obj.oid, property, onPropertyChange],
  );
  const metadata = getMetadataFor(obj.klass, property);
  return { value, setValue, metadata };
}
