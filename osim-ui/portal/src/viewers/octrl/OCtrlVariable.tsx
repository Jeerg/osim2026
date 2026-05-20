// Plan 01-04 Task 3: OCtrlVariable — Text-/Zahl-Input.
//
// Portierung von OCtrlVariable.h (C++): Edit-Control fuer string/int/float.
// Variant wird ueber metadata.type entschieden ("string" | "int" | "float").
//
// Phase-1-Design: kontrollierter Input direkt am Store; keine lokale draft-
// State-Schicht (vermeidet das react-hooks/set-state-in-effect-Antipattern
// aus React 19). Numerische Werte werden bei onChange validiert; ungueltige
// Eingaben triggern KEINEN setValue (Revert "implizit" auf vorigen Wert).

import type { ChangeEvent } from "react";
import { useOCtrlBinding, type OCtrlProps } from "../core/OCtrl.types";

export function OCtrlVariable({
  property,
  label,
  readonly,
}: OCtrlProps) {
  const { value, setValue, metadata } = useOCtrlBinding<string | number | null>(
    property,
  );
  const isNumeric = metadata.type === "int" || metadata.type === "float";

  const display = value == null ? "" : String(value);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (isNumeric) {
      if (raw.trim() === "") {
        setValue(null);
        return;
      }
      const parsed =
        metadata.type === "int" ? parseInt(raw, 10) : parseFloat(raw);
      if (Number.isNaN(parsed)) {
        // Ungueltig — nicht uebernehmen. Der Input zeigt den verworfenen
        // Wert kurz an, sobald der Store-Wert zurueckspielt rendert er
        // wieder den letzten guelten Wert.
        return;
      }
      setValue(parsed);
    } else {
      setValue(raw);
    }
  }

  return (
    <label className="block text-sm">
      {(label ?? metadata.label) && (
        <span className="mb-1 block font-medium text-gray-700">
          {label ?? metadata.label}
        </span>
      )}
      <input
        type={isNumeric ? "number" : "text"}
        value={display}
        onChange={onChange}
        disabled={readonly}
        readOnly={readonly}
        data-testid={`octrl-variable-${property}`}
        className="block w-full rounded border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
      />
    </label>
  );
}
