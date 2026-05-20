// Plan 01-05 Task 1: DirtyIndicator — kleine Anzeige im WorkspaceLayout-
// Header, die signalisiert, ob es ungespeicherte Aenderungen gibt.
//
// Subscribe nur auf dirty.size (primitive); die Set-Identitaet selbst
// wuerde sonst bei jedem store-Update ein neues Set liefern.

import { useModelStore } from "@/state/model-store";

export function DirtyIndicator() {
  const dirtyCount = useModelStore((s) => s.dirty.size);
  if (dirtyCount === 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-gray-500"
        data-testid="dirty-indicator-clean"
      >
        <span className="h-2 w-2 rounded-full bg-gray-300" />
        alles gespeichert
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-orange-700"
      data-testid="dirty-indicator-dirty"
    >
      <span className="h-2 w-2 rounded-full bg-orange-500" />
      {dirtyCount} ungespeicherte{" "}
      {dirtyCount === 1 ? "Aenderung" : "Aenderungen"}
    </span>
  );
}
