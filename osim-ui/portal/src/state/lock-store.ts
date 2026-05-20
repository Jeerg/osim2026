// Plan 01-09 Task 2: Globaler Lock-Status-Store.
//
// Der use-tree-loader (Plan 05) verwaltet den Lock-Acquire/Release-
// Lifecycle. Der Heartbeat (Plan 01-09 Task 2) muss aber ueber Page-
// Reloads / Re-Renders hinweg den AKTUELLEN Lock-Status kennen — z.B.
// um zu wissen, ob ein Lock-Verlust passiert ist (401/409 auf
// Heartbeat-Request).
//
// Dieser kleine Zustand-Store haelt zwei Bits:
//   - hasLock: True wenn der aktuelle User der Lock-Holder ist.
//   - lostAt: Timestamp wenn ein Heartbeat fehlgeschlagen ist (lock
//     verloren). UI mountet daraufhin einen Banner "Lock verloren —
//     bitte neu laden".
//
// Wird vom use-tree-loader gefuellt (initial bei acquire-lock-Erfolg)
// und vom use-lock-heartbeat aktualisiert (auf 0 wenn Heartbeat 4xx).

import { create } from "zustand";

export interface LockState {
  /** True wenn der aktuelle User der Lock-Holder ist. */
  hasLock: boolean;
  /** Timestamp wenn der Lock verloren ging (sonst null). */
  lostAt: number | null;
  /** E-Mail des Lock-Holders (anderer User, falls hasLock=false). */
  holderEmail: string | null;

  /** Setzt hasLock=true und cleared lostAt/holderEmail. */
  acquireLock: () => void;
  /** Setzt hasLock=false und lostAt=Date.now() (Verlust-Notification). */
  loseLock: () => void;
  /** Setzt hasLock=false und holderEmail (anderer User haelt Lock). */
  reportOtherHolder: (email: string) => void;
  /** Reset (z.B. beim Wechsel des Modells). */
  reset: () => void;
}

export const useLockStore = create<LockState>((set) => ({
  hasLock: false,
  lostAt: null,
  holderEmail: null,

  acquireLock: () => set({ hasLock: true, lostAt: null, holderEmail: null }),
  loseLock: () => set({ hasLock: false, lostAt: Date.now() }),
  reportOtherHolder: (email) =>
    set({ hasLock: false, lostAt: null, holderEmail: email }),
  reset: () => set({ hasLock: false, lostAt: null, holderEmail: null }),
}));
