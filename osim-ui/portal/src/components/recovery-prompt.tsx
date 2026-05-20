// Plan 01-09 Task 1: Recovery-Prompt — Modal-Dialog.
//
// Wird vom use-tree-loader (Plan 05 erweitert) gemounted, wenn ein
// dirty Snapshot in IndexedDB gefunden wurde. Bietet zwei Aktionen:
//
//   - "Wiederherstellen"  → onAccept: lade Tree aus snapshot.tree,
//                            setze dirty=snapshot.dirty, behalte
//                            snapshot.version. Snapshot in IDB bleibt
//                            erhalten, bis ein erfolgreicher Save ihn
//                            loescht.
//
//   - "Verwerfen"         → onDiscard: loesche Snapshot in IDB, lade
//                            Server-Stand frisch.
//
// Phase 1: simples Tailwind-Modal mit fixed overlay, kein shadcn (CONTEXT
// D-08-Decision). Plan 09+ kann shadcn-Dialog nachziehen.

import type { RecoveryCheck } from "@/persistence/recovery";

export interface RecoveryPromptProps {
  check: RecoveryCheck;
  onAccept: () => void;
  onDiscard: () => void;
}

function formatSavedAt(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RecoveryPrompt({
  check,
  onAccept,
  onDiscard,
}: RecoveryPromptProps) {
  if (!check.snapshot) return null;
  const snap = check.snapshot;
  const dirtyCount = snap.dirty.length;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="recovery-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-prompt-title"
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2
          id="recovery-prompt-title"
          className="text-lg font-semibold text-gray-900"
        >
          Ungespeicherte Aenderungen gefunden
        </h2>
        <p className="mt-3 text-sm text-gray-700">
          Dieses Modell hat <strong>{dirtyCount}</strong>{" "}
          {dirtyCount === 1 ? "lokale Aenderung" : "lokale Aenderungen"}{" "}
          aus einer fruheren Sitzung (Stand:{" "}
          <span className="font-mono">{formatSavedAt(snap.savedAt)}</span>),
          die noch nicht zum Server gespeichert wurden.
        </p>
        {check.serverIsNewer && (
          <div
            className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
            data-testid="recovery-prompt-conflict-warning"
          >
            <strong>Achtung:</strong> Der Server hat zwischenzeitlich Version{" "}
            <code>{check.serverVersion}</code>, deine Aenderungen basieren auf
            Version <code>{snap.version}</code>. Beim Wiederherstellen wird
            deine Version weiter editiert; der naechste Save erzeugt eine neue
            Version, der zwischenzeitliche Server-Stand wird ueberschrieben.
            Konflikt-Auflosung mit Merge ist erst Phase 4+.
          </div>
        )}
        <p className="mt-3 text-sm text-gray-700">
          Moechtest du die lokalen Aenderungen wiederherstellen oder
          verwerfen?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            data-testid="recovery-prompt-discard"
          >
            Verwerfen
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            data-testid="recovery-prompt-accept"
          >
            Wiederherstellen
          </button>
        </div>
      </div>
    </div>
  );
}
