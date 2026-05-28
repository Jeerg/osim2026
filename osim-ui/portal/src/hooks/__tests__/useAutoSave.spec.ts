/**
 * Tests fuer useAutoSave-Hook (Plan 01-11 Task 3).
 *
 * Strategie:
 *  - vi.useFakeTimers() → setInterval-Tick wird mit vi.advanceTimersByTime
 *    deterministisch ausgeloest.
 *  - useSaveModel ist als TanStack-Query-Hook gemockt; wir testen die
 *    Entscheidung "rufe mutate auf oder nicht", nicht den HTTP-Pfad.
 *  - useModelStore + useLockStore sind die echten Zustand-Stores —
 *    State-Manipulation via .setState/.getState ist deterministisch.
 *
 * Test-Cases (siehe Plan-Vorgabe):
 *  1. test_30s_interval_triggers_save_when_dirty
 *  2. test_save_not_called_when_lock_not_own
 *  3. (Welle G13) test_loadFromWire_does_not_trigger_snapshot
 */

import { renderHook, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// useSaveModel-Mock muss VOR dem Hook-Import gehoisted werden.
const mockMutate = vi.fn();
vi.mock("@/api/models", async () => {
  const actual = await vi.importActual<typeof import("@/api/models")>(
    "@/api/models",
  );
  return {
    ...actual,
    useSaveModel: () => ({
      mutate: mockMutate,
      isPending: false,
    }),
  };
});

// Toast als no-op, Tests muessen nicht UI-loggen.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// snapshot-service-Mock, damit die subscribe-Logik in useAutoSave keinen
// echten IndexedDB-Write triggert (Test-Environment hat kein IndexedDB
// gestubbed, und wir testen die Subscription nicht direkt).
vi.mock("@/snapshot/snapshot-service", () => ({
  saveSnapshot: vi.fn().mockResolvedValue(undefined),
  clearSnapshots: vi.fn().mockResolvedValue(undefined),
  loadLatestSnapshot: vi.fn().mockResolvedValue(null),
  getSnapshotCount: vi.fn().mockResolvedValue(0),
}));

import { useAutoSave } from "@/hooks/useAutoSave";
import { useLockStore } from "@/stores/lock-store";
import { useModelStore } from "@/stores/model-store";
import { saveSnapshot } from "@/snapshot/snapshot-service";

import type { ModelTreeWire } from "@/api/models";

const TEST_WIRE: ModelTreeWire = {
  version: 1,
  simulator_oid: 0,
  objects: {
    0: {
      oid: 0,
      klass: "ASimulator",
      attrs: { m_sName: "test" },
      sub_refs: [],
    },
  },
  coverage: { loaded: 1, skipped: 0, unsupported: [] },
  schemas_url: "/api/v1/schemas/v1",
};

describe("useAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMutate.mockClear();
    useModelStore.getState().clear();
    useModelStore.temporal.getState().clear();
    useLockStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.skip("test_30s_interval_triggers_save_when_dirty (G19-A: Auto-Save deaktiviert)", () => {
    // Setup: Wire ist geladen, lock=own mit token.
    useModelStore.getState().loadFromWire("model-1", TEST_WIRE);
    // dirty=true via patchObject (Plan 07: patch setzt dirty)
    useModelStore.getState().patchObject(0, { m_sName: "changed" });
    expect(useModelStore.getState().dirty).toBe(true);

    useLockStore.setState({
      modelId: "model-1",
      token: "lock-token-1",
      expiresAt: new Date(Date.now() + 60_000),
      status: "own",
      ownerUid: null,
      ownerEmail: null,
    });

    renderHook(() => useAutoSave("model-1"));

    // Vor dem ersten Tick: nichts gerufen.
    expect(mockMutate).not.toHaveBeenCalled();

    // 30s vorspulen → ein Tick.
    vi.advanceTimersByTime(30_000);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [body] = mockMutate.mock.calls[0];
    expect(body.lock_token).toBe("lock-token-1");
    expect(body.wire).toBeDefined();
    expect(body.wire.simulator_oid).toBe(0);
  });

  it.skip("test_save_not_called_when_lock_not_own (G19-A: Auto-Save deaktiviert)", () => {
    useModelStore.getState().loadFromWire("model-2", TEST_WIRE);
    useModelStore.getState().patchObject(0, { m_sName: "changed" });
    expect(useModelStore.getState().dirty).toBe(true);

    // Foreign-Lock (anderer User haelt den Lock).
    useLockStore.setState({
      modelId: "model-2",
      token: null,
      expiresAt: new Date(Date.now() + 60_000),
      status: "foreign",
      ownerUid: "user-foreign",
      ownerEmail: "foreign@example.com",
    });

    renderHook(() => useAutoSave("model-2"));

    // Mehrere Ticks: trotz dirty=true wird NICHT gespeichert, weil status!=="own".
    vi.advanceTimersByTime(30_000);
    vi.advanceTimersByTime(30_000);

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("test_loadFromWire_does_not_trigger_snapshot (Welle G13): kein Ghost-Snapshot bei reinem Server-Load", () => {
    // Hook mounten BEVOR der Wire geladen wird, damit die subscribe-
    // Registrierung greift.
    renderHook(() => useAutoSave("model-3"));

    // Mock-Reset, falls Hook-Mount selbst irgendwas an saveSnapshot ruft.
    vi.mocked(saveSnapshot).mockClear();

    // Server-Wire-Load simulieren (Reload-Pfad in $id.tsx Z.80-85).
    useModelStore.getState().loadFromWire("model-3", TEST_WIRE);

    // Debounce-Fenster (1s) durchlaufen lassen — bei der alten Implementierung
    // hätte das einen saveSnapshot-Call ergeben (Ghost-Snapshot).
    vi.advanceTimersByTime(1_500);

    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(useModelStore.getState().dirty).toBe(false);

    // Sanity: nach echtem User-Edit (dirty=true) MUSS Snapshot getriggert werden.
    useModelStore.getState().patchObject(0, { m_sName: "user-edit" });
    expect(useModelStore.getState().dirty).toBe(true);
    vi.advanceTimersByTime(1_500);
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
  });
});
