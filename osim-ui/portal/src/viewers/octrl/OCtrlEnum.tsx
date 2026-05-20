// Plan 01-04 Task 3: OCtrlEnum — Dropdown.
// Portierung von OCtrlEnum.h / OCtrlEnumGroup.h (C++): Radio-Group oder
// Combobox. Phase 1: einfache <select>-Dropdown.
import { useOCtrlBinding, type OCtrlProps } from "../core/OCtrl.types";

export function OCtrlEnum({ property, label, readonly }: OCtrlProps) {
  const { value, setValue, metadata } = useOCtrlBinding<string | number | null>(
    property,
  );
  const options = metadata.enumValues ?? [];
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">
        {label ?? metadata.label ?? property}
      </span>
      <select
        value={value == null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          // Wenn die Optionen number sind, parse zu number.
          const isNumberOpt = options.some((o) => typeof o.value === "number");
          setValue(isNumberOpt ? Number(raw) : raw);
        }}
        disabled={readonly}
        data-testid={`octrl-enum-${property}`}
        className="block w-full rounded border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-gray-100"
      >
        {value == null && <option value="">—</option>}
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
