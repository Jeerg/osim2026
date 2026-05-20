// Plan 01-09 Task 2: LockBanner — full-width Banner ueber dem Workspace.
//
// Drei States basierend auf dem useLockStore:
//
//   - hasLock=true              → kein Banner (Default-Pfad).
//   - hasLock=false, lostAt!=null → rot, "Lock verloren — Sie haben den
//                                    Bearbeitungs-Status verloren. Bitte
//                                    Seite neu laden, um es erneut zu
//                                    versuchen." mit "Neu laden"-Button.
//   - hasLock=false, holderEmail
//     != null                    → amber, "Dieses Modell wird gerade von
//                                    {email} bearbeitet. Sie sehen es im
//                                    Read-Only-Modus."
//
// Das Banner ist eine Header-Komponente — der WorkspaceLayout mountet
// es ueber Sidebar/Main, damit beide Bereiche den Status sehen.

import { useLockStore } from "@/state/lock-store";

export function LockBanner() {
  const hasLock = useLockStore((s) => s.hasLock);
  const lostAt = useLockStore((s) => s.lostAt);
  const holderEmail = useLockStore((s) => s.holderEmail);

  if (hasLock) {
    return null;
  }

  if (lostAt !== null) {
    return (
      <div
        className="flex items-center justify-between gap-3 border-b border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        data-testid="lock-banner-lost"
        role="alert"
      >
        <span>
          <strong>Lock verloren.</strong> Sie haben den Bearbeitungs-Status
          verloren (Server hat die Verbindung getrennt oder TTL abgelaufen).
          Bitte Seite neu laden, um den Lock erneut zu beantragen — bis
          dahin werden Ihre Aenderungen nicht gespeichert.
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
          data-testid="lock-banner-reload"
        >
          Neu laden
        </button>
      </div>
    );
  }

  if (holderEmail !== null) {
    return (
      <div
        className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        data-testid="lock-banner-other-holder"
        role="status"
      >
        <strong>Read-Only.</strong> Dieses Modell wird gerade von{" "}
        <span className="font-mono">{holderEmail}</span> bearbeitet. Sie
        sehen den Stand, koennen aber nichts speichern, bis der andere
        Bearbeiter fertig ist.
      </div>
    );
  }

  return null;
}
