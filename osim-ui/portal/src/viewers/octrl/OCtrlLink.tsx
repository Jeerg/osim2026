// Plan 01-04 Task 3: OCtrlLink — Objekt-Referenz mit Combobox.
//
// Portierung von OCtrlLink.h (C++): OCtrlOprChoice — Combobox mit
// Auswahl aller Objekte einer bestimmten Klasse. Phase 1: einfaches
// <select>, das mit allen Modell-Objekten der linkTargetKlass-Sorte
// gefuellt wird (oid + name als Anzeige-String).

import { useMemo } from "react";
import { useOCtrlBinding, type OCtrlProps } from "../core/OCtrl.types";
import { selectByKlass, useModelStore } from "@/state/model-store";
import type { OtxJsonNode } from "../core/types";

const EMPTY_CANDIDATES: readonly OtxJsonNode[] = [];

export function OCtrlLink({ property, label, readonly }: OCtrlProps) {
  const { value, setValue, metadata } = useOCtrlBinding<number | null>(property);

  const targetKlass = metadata.linkTargetKlass;

  // Direkte Subscription auf das Tree-Field — primitive Identitaet, kein
  // neues Array bei jedem Render-Lauf (sonst loost Zustand getSnapshot-
  // memoization und triggert Render-Loop in React 19).
  const tree = useModelStore((s) => s.tree);
  const candidates = useMemo<readonly OtxJsonNode[]>(() => {
    if (!targetKlass || !tree) return EMPTY_CANDIDATES;
    // selectByKlass benutzt den oid-Index; wir bauen ihn hier wieder fuer
    // den memo-Pfad ohne den Store erneut zu lesen.
    const out: OtxJsonNode[] = [];
    const walk = (n: OtxJsonNode): void => {
      if (n.klass === targetKlass) out.push(n);
      for (const c of n.children) walk(c);
    };
    walk(tree);
    return out;
  }, [tree, targetKlass]);
  // selectByKlass-Import beibehalten fuer Konsumenten, die direkt darauf
  // zugreifen wollen (z.B. Plan 05 Sidebar-Tree).
  void selectByKlass;

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">
        {label ?? metadata.label ?? property}
      </span>
      <select
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          setValue(raw === "" ? null : Number(raw));
        }}
        disabled={readonly}
        data-testid={`octrl-link-${property}`}
        className="block w-full rounded border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
      >
        <option value="">— ohne —</option>
        {candidates.map((c) => (
          <option key={c.oid} value={c.oid}>
            {c.name} ({c.oid})
          </option>
        ))}
      </select>
      {!targetKlass && (
        <span className="mt-1 block text-xs text-gray-500">
          (Keine linkTargetKlass in Metadaten — leere Auswahl)
        </span>
      )}
    </label>
  );
}
