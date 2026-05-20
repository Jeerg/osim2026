// Plan 01-04 Task 3: OCtrlBool — Checkbox.
// Portierung von OCtrlBool.h (C++): CButton im Checkbox-Style.
import { useOCtrlBinding, type OCtrlProps } from "../core/OCtrl.types";

export function OCtrlBool({ property, label, readonly }: OCtrlProps) {
  const { value, setValue, metadata } = useOCtrlBinding<boolean | null>(property);
  const checked = Boolean(value);
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setValue(e.target.checked)}
        disabled={readonly}
        data-testid={`octrl-bool-${property}`}
        className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500 disabled:bg-gray-100"
      />
      <span className={readonly ? "text-gray-500" : "text-gray-700"}>
        {label ?? metadata.label ?? property}
      </span>
    </label>
  );
}
