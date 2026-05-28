/**
 * Tests fuer useLockStore (Plan 01-11 Task 2).
 *
 * Strategie: vi.mock auf `@/api/locks` — wir testen die State-Maschine des
 * Stores, nicht die HTTP-Schicht. Die echten API-Funktionen sind in Plan 04
 * (Backend) abgedeckt.
 *
 * Test-Cases (siehe Plan-Vorgabe):
 *  1. test_acquire_success_sets_own_status
 *  2. test_acquire_409_sets_foreign_status_with_owner
 *  3. test_heartbeat_404_sets_expired
 *  4. test_release_resets_to_idle
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock VOR dem useLockStore-Import, weil der Store beim Import die API-
// Funktionen aufloest. vi.mock ist hoisted, daher arbeitet das auch ohne
// vi.doMock.
vi.mock("@/api/locks", () => ({
  acquireLock: vi.fn(),
  heartbeatLock: vi.fn(),
  releaseLock: vi.fn(),
}));

// Toast als no-op mocken, damit Tests nicht UI-Errors loggen.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { ApiError } from "@/api/fetch";
import {
  acquireLock,
  heartbeatLock,
  releaseLock,
} from "@/api/locks";
import { useLockStore } from "@/stores/lock-store";

const mockedAcquireLock = vi.mocked(acquireLock);
const mockedHeartbeatLock = vi.mocked(heartbeatLock);
const mockedReleaseLock = vi.mocked(releaseLock);

describe("useLockStore", () => {
  beforeEach(() => {
    // Store-State und Mock-History zwischen Tests zuruecksetzen.
    useLockStore.getState().reset();
    vi.clearAllMocks();
  });

  it("test_acquire_success_sets_own_status", async () => {
    const expiresAt = "2026-05-21T11:00:00Z";
    mockedAcquireLock.mockResolvedValue({
      token: "token-abc",
      expires_at: expiresAt,
    });

    const ok = await useLockStore.getState().acquire("model-A");
    expect(ok).toBe(true);

    const s = useLockStore.getState();
    expect(s.status).toBe("own");
    expect(s.token).toBe("token-abc");
    expect(s.modelId).toBe("model-A");
    expect(s.ownerUid).toBeNull();
    expect(s.ownerEmail).toBeNull();
    expect(s.expiresAt).toEqual(new Date(expiresAt));
    expect(mockedAcquireLock).toHaveBeenCalledWith("model-A");
  });

  it("test_acquire_409_sets_foreign_status_with_owner", async () => {
    // Backend liefert 409 mit Conflict-Body (Plan 04 HTTPException-Pattern;
    // ProblemDetail-Mapping in main.py kann den dict in top-level felder
    // entpacken).
    const conflictBody = {
      code: "E_MODEL_LOCKED",
      owner_user_uid: "user-bob",
      owner_email: "bob@example.com",
      expires_at: "2026-05-21T11:05:00Z",
      message: "Modell wird gerade von ... bearbeitet.",
    };
    mockedAcquireLock.mockRejectedValue(
      new ApiError(409, "Conflict", conflictBody),
    );

    const ok = await useLockStore.getState().acquire("model-B");
    expect(ok).toBe(false);

    const s = useLockStore.getState();
    expect(s.status).toBe("foreign");
    expect(s.modelId).toBe("model-B");
    expect(s.token).toBeNull();
    expect(s.ownerUid).toBe("user-bob");
    expect(s.ownerEmail).toBe("bob@example.com");
    expect(s.expiresAt).toEqual(new Date(conflictBody.expires_at));
  });

  it("test_heartbeat_404_sets_expired", async () => {
    // Schritt 1: erfolgreich acquiren, damit der Store in `own`-Status ist.
    mockedAcquireLock.mockResolvedValue({
      token: "token-xyz",
      expires_at: "2026-05-21T11:00:00Z",
    });
    await useLockStore.getState().acquire("model-C");
    expect(useLockStore.getState().status).toBe("own");

    // Schritt 2: Heartbeat schlaegt mit 404 fehl → expired.
    mockedHeartbeatLock.mockRejectedValue(
      new ApiError(404, "Not Found", {
        code: "E_LOCK_EXPIRED",
        message: "Bearbeitungs-Sperre abgelaufen",
      }),
    );

    const ok = await useLockStore.getState().heartbeat();
    expect(ok).toBe(false);

    const s = useLockStore.getState();
    expect(s.status).toBe("expired");
    expect(s.token).toBeNull();
    expect(mockedHeartbeatLock).toHaveBeenCalledWith("model-C", "token-xyz");
  });

  it("test_release_resets_to_idle", async () => {
    // Setup: acquire → status="own"
    mockedAcquireLock.mockResolvedValue({
      token: "token-rel",
      expires_at: "2026-05-21T11:00:00Z",
    });
    await useLockStore.getState().acquire("model-D");
    expect(useLockStore.getState().status).toBe("own");

    mockedReleaseLock.mockResolvedValue(undefined);

    await useLockStore.getState().release();

    const s = useLockStore.getState();
    expect(s.status).toBe("idle");
    expect(s.token).toBeNull();
    expect(s.modelId).toBeNull();
    expect(s.expiresAt).toBeNull();
    expect(mockedReleaseLock).toHaveBeenCalledWith("model-D", "token-rel");
  });
});
