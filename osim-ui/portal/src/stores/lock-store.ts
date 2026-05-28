/**
 * useLockStore — Single-Editor-Lock-State (Plan 01-11 Task 2).
 *
 * Verantwortung:
 *  - Haelt Lock-Token + expiresAt fuer das aktuell geoeffnete Modell.
 *  - Status-Maschine: `idle` → `own` ↔ `foreign` / `expired`.
 *  - Actions `acquire/heartbeat/release/reset` rufen die API-Funktionen aus
 *    `@/api/locks` und mappen Erfolg/Fehler in den Store-State.
 *  - KEINE Timer/Intervals — die leben im `useLockHeartbeat`-Hook (Task 3),
 *    der `heartbeat()` periodisch dispatcht.
 *  - KEIN `persist` — Lock-Token sind session-spezifisch, sollen nicht
 *    persistiert werden (LocalStorage-Token nach Crash waere stale).
 *
 * Status-Semantik:
 *  - `idle`: kein Lock-Request gestellt (initial / nach reset).
 *  - `own`: aktueller User haelt den Lock — Edits + Save erlaubt.
 *  - `foreign`: anderer User haelt den Lock (409 beim acquire) — Read-Only-Mode.
 *  - `expired`: Lock war eigen, ist abgelaufen / wurde uebernommen (404 beim
 *    heartbeat). Read-Only mit Toast "Bitte Seite neu laden".
 */

import { toast } from "sonner";
import { create } from "zustand";

import { apiErrorMessage } from "@/api/error-message";
import { ApiError } from "@/api/fetch";
import {
  acquireLock,
  heartbeatLock,
  releaseLock,
  type LockConflict,
} from "@/api/locks";

export type LockStatus = "idle" | "own" | "foreign" | "expired";

interface LockState {
  modelId: string | null;
  token: string | null;
  expiresAt: Date | null;
  ownerUid: string | null;
  ownerEmail: string | null;
  status: LockStatus;
}

interface LockActions {
  /**
   * Versucht, einen Lock zu acquiren. Return: true bei Erfolg (`status="own"`),
   * false bei Conflict (409, `status="foreign"`) oder anderem Fehler
   * (`status="idle"`). Toast-Errors werden vom Store selbst gefeuert.
   */
  acquire: (modelId: string) => Promise<boolean>;

  /**
   * Sendet einen Heartbeat. Return: true bei Erfolg (200, expiresAt update),
   * false bei 404 E_LOCK_EXPIRED (`status="expired"`) oder anderem Fehler.
   * Nur sinnvoll wenn status==="own"; bei foreign/expired/idle no-op.
   */
  heartbeat: () => Promise<boolean>;

  /**
   * Released den eigenen Lock (asynchron). Bei jedem Fehler: still ignorieren
   * (idempotent vom Backend). Setzt Status auf `idle`.
   */
  release: () => Promise<void>;

  /** Setzt den Store auf initial-State zurueck — fuer Route-Unmount. */
  reset: () => void;
}

const INITIAL: LockState = {
  modelId: null,
  token: null,
  expiresAt: null,
  ownerUid: null,
  ownerEmail: null,
  status: "idle",
};

/**
 * Type-Guard fuer den 409-Conflict-Body. Backend liefert
 * `{detail: {code: "E_MODEL_LOCKED", owner_user_uid, owner_email, expires_at, message}}`
 * — gemaess Plan 04 HTTPException-Pattern und der app/main.py-Mapping-
 * Konvention (siehe ProblemDetail).
 *
 * Da der TenantAuthMiddleware in main.py den `detail`-Dict in ein
 * ProblemDetail-Top-Level mapped (code, owner_user_uid, ...), versuchen wir
 * beide Pfade:
 *  1. err.body als ProblemDetail mit top-level Feldern.
 *  2. err.body.detail als Dict mit den Feldern.
 */
function extractLockConflict(err: ApiError): LockConflict | null {
  const body = err.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return null;
  // Variante 1: top-level
  const top = body as Partial<LockConflict>;
  if (
    typeof top.code === "string" &&
    typeof top.owner_user_uid === "string" &&
    typeof top.expires_at === "string"
  ) {
    return {
      code: "E_MODEL_LOCKED",
      owner_user_uid: top.owner_user_uid,
      owner_email: typeof top.owner_email === "string" ? top.owner_email : null,
      expires_at: top.expires_at,
    };
  }
  // Variante 2: nested detail
  const detail = body.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as Partial<LockConflict>;
    if (
      typeof d.owner_user_uid === "string" &&
      typeof d.expires_at === "string"
    ) {
      return {
        code: "E_MODEL_LOCKED",
        owner_user_uid: d.owner_user_uid,
        owner_email: typeof d.owner_email === "string" ? d.owner_email : null,
        expires_at: d.expires_at,
      };
    }
  }
  // Variante 3: ProblemDetail ohne Owner-Info (Backend strippt extra-Felder
  // im exception_handler — siehe app/main.py). Wir nehmen einen Lock-Konflikt
  // trotzdem ernst, wenn `code === E_MODEL_LOCKED` gesetzt ist; Owner-Info
  // ist dann unbekannt, der Read-Only-Mode greift trotzdem.
  if (typeof top.code === "string" && top.code === "E_MODEL_LOCKED") {
    return {
      code: "E_MODEL_LOCKED",
      owner_user_uid: typeof top.owner_user_uid === "string" ? top.owner_user_uid : "",
      owner_email: typeof top.owner_email === "string" ? top.owner_email : null,
      expires_at:
        typeof top.expires_at === "string"
          ? top.expires_at
          : new Date(Date.now() + 60_000).toISOString(),
    };
  }
  return null;
}

export const useLockStore = create<LockState & LockActions>((set, get) => ({
  ...INITIAL,

  acquire: async (modelId: string) => {
    // Idempotenz-Guard für React-StrictMode-Double-Mount + Schnell-Klicks:
    // Wenn wir den Lock für dieses Modell bereits halten oder gerade halten,
    // ist ein zweiter acquire kein 409-Konflikt, sondern ein No-Op.
    const current = get();
    if (current.modelId === modelId && current.status === "own" && current.token) {
      return true;
    }
    try {
      const res = await acquireLock(modelId);
      set({
        modelId,
        token: res.token,
        expiresAt: new Date(res.expires_at),
        ownerUid: null,
        ownerEmail: null,
        status: "own",
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Wenn wir den Lock im Store schon halten (Race: StrictMode-Double-
        // Mount triggert acquire-2 während acquire-1 noch in-flight ist; das
        // Backend lehnt acquire-2 mit 409 ab, weil acquire-1 schon committet
        // hat), ist das KEIN echter Foreign-Lock. Beibehalten was wir haben.
        const after = get();
        if (after.modelId === modelId && after.status === "own" && after.token) {
          return true;
        }
        const conflict = extractLockConflict(err);
        if (conflict) {
          set({
            modelId,
            token: null,
            expiresAt: new Date(conflict.expires_at),
            ownerUid: conflict.owner_user_uid,
            ownerEmail: conflict.owner_email,
            status: "foreign",
          });
          toast.warning(apiErrorMessage(err));
          return false;
        }
      }
      // Andere Fehler: status bleibt idle, Toast wird gefeuert.
      set({ ...INITIAL });
      toast.error(apiErrorMessage(err, "Lock konnte nicht angefordert werden"));
      return false;
    }
  },

  heartbeat: async () => {
    const { modelId, token, status } = get();
    if (!modelId || !token || status !== "own") {
      // Kein Lock zu refreshen — kein Fehler, einfach no-op.
      return false;
    }
    try {
      const res = await heartbeatLock(modelId, token);
      set({ expiresAt: new Date(res.expires_at) });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Lock ist weg (TTL abgelaufen oder Owner-Mismatch). User MUSS neu
        // laden, weil der State des Modells inzwischen vom Server divergiert
        // sein koennte.
        set({ status: "expired", token: null });
        toast.error(
          apiErrorMessage(err, "Lock abgelaufen — bitte Seite neu laden"),
        );
        return false;
      }
      // Transienter Netzwerkfehler: NICHT auf expired schalten, sonst wuerde
      // ein einmaliger 500er den User in Read-Only zwingen. Toast + bleiben
      // in `own` — naechster Heartbeat-Tick retry.
      toast.error(apiErrorMessage(err, "Heartbeat fehlgeschlagen"));
      return false;
    }
  },

  release: async () => {
    const { modelId, token } = get();
    if (!modelId || !token) {
      set({ ...INITIAL });
      return;
    }
    try {
      await releaseLock(modelId, token);
    } catch {
      // Idempotent — Backend liefert eh 204; Netzwerkfehler ist Worst-Case
      // ein nicht-released Lock, den der TTL aufraeumt.
    }
    set({ ...INITIAL });
  },

  reset: () => {
    set({ ...INITIAL });
  },
}));
