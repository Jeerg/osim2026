// Plan 01-04 Task 3: OCtrlMethod — Button fuer Method-Call.
// Portierung von OCtrlMethod.h (C++): OCtrlDumperButton / OCtrlObserverButton.
import { useChildDialog } from "../core/ChildDialog";
import { useOCtrlBinding, type OCtrlProps } from "../core/OCtrl.types";

export interface OCtrlMethodProps extends OCtrlProps {
  /** Method-Name auf dem Objekt (default: property). */
  method?: string;
}

export function OCtrlMethod({
  property,
  label,
  method,
  readonly,
}: OCtrlMethodProps) {
  const { metadata } = useOCtrlBinding(property);
  const { obj, onMethodCall } = useChildDialog();
  const methodName = method ?? property;
  return (
    <button
      type="button"
      disabled={readonly}
      onClick={() => onMethodCall(obj.oid, methodName)}
      data-testid={`octrl-method-${property}`}
      className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
    >
      {label ?? metadata.label ?? methodName}
    </button>
  );
}
