// Plan 01-09 Task 2: Save-Button im WorkspaceLayout-Header.
//
// States:
//   - tree=null / hasLock=false: gar nicht sichtbar.
//   - dirty=0, saving=false:        "Gespeichert"  (grau, disabled).
//   - dirty>0,  saving=false:        "Speichern (N)" (blau, enabled).
//   - dirty>0,  saving=true:         "Speichere..."  (blau, disabled).
//
// onClick triggert saveModel() — identische Save-Pipeline wie Auto-Save
// (Single-Source-of-Truth in use-save-model.ts).
//
// Tastenkuerzel Strg+S (Cmd+S) ist in use-save-shortcut.ts implementiert
// und nutzt dieselbe Save-Pipeline.

import { useState } from "react";
import { useModelStore } from "@/state/model-store";
import { saveModel } from "@/hooks/use-save-model";

export interface SaveButtonProps {
  modelId: number;
  hasLock: boolean;
}

export function SaveButton({ modelId, hasLock }: SaveButtonProps) {
  const tree = useModelStore((s) => s.tree);
  const version = useModelStore((s) => s.version);
  const dirtyCount = useModelStore((s) => s.dirty.size);
  const saving = useModelStore((s) => s.saving);
  const [lastError, setLastError] = useState<string | null>(null);

  if (!hasLock || !tree || version == null) {
    return null;
  }

  const isClean = dirtyCount === 0;
  const disabled = isClean || saving;

  const label = saving
    ? "Speichere..."
    : isClean
      ? "Gespeichert"
      : `Speichern (${dirtyCount})`;

  const classes = isClean
    ? "rounded bg-gray-200 px-3 py-1 font-medium text-gray-600 cursor-not-allowed"
    : saving
      ? "rounded bg-blue-700 px-3 py-1 font-medium text-white opacity-70 cursor-progress"
      : "rounded bg-blue-700 px-3 py-1 font-medium text-white hover:bg-blue-800";

  async function onClick() {
    if (disabled) return;
    setLastError(null);
    try {
      await saveModel({ modelId, tree: tree!, expectedVersion: version! });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastError(msg);
      console.warn("[SaveButton] Save fehlgeschlagen:", err);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={classes}
        data-testid="workspace-save"
        title={
          isClean
            ? "Alles gespeichert (v" + String(version) + ")"
            : "Speichern (Strg+S)"
        }
      >
        {label}
      </button>
      {lastError && (
        <span
          className="text-xs text-red-700"
          data-testid="save-button-error"
          title={lastError}
        >
          Fehler: {lastError.slice(0, 40)}
          {lastError.length > 40 && "..."}
        </span>
      )}
    </div>
  );
}
