// Plan 01-09 Task 2: Tests fuer useLockHeartbeat.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useLockHeartbeat } from "../use-lock-heartbeat";
import { useLockStore } from "@/state/lock-store";
import React from "react";
void React;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
  useLockStore.getState().acquireLock();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  useLockStore.getState().reset();
});

function Harness({
  modelId,
  hasLock,
  intervalMs,
}: {
  modelId: number;
  hasLock: boolean;
  intervalMs: number;
}) {
  useLockHeartbeat({ modelId, hasLock, intervalMs });
  return <div>hb</div>;
}

describe("useLockHeartbeat", () => {
  it("ohne hasLock: kein Heartbeat-Call", async () => {
    render(<Harness modelId={1} hasLock={false} intervalMs={50} />);
    await new Promise((r) => setTimeout(r, 200));
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(0);
  });

  it("mit hasLock: ruft POST /lock/heartbeat alle intervalMs", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({
          holder_uid: "u",
          holder_email: "e",
          acquired_at: "2026-05-20T00:00:00Z",
          last_heartbeat_at: "2026-05-20T00:00:01Z",
          expires_at: "2026-05-20T00:15:00Z",
          is_self: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    render(<Harness modelId={42} hasLock={true} intervalMs={50} />);
    await waitFor(
      () => {
        const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        expect((calls[0][0] as string)).toContain(
          "/api/v1/models/42/lock/heartbeat",
        );
      },
      { timeout: 2000 },
    );
  });

  it("Heartbeat-Fehler 409: setzt useLockStore.lostAt", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ detail: "lock by other" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<Harness modelId={1} hasLock={true} intervalMs={50} />);
    await waitFor(
      () => {
        expect(useLockStore.getState().hasLock).toBe(false);
        expect(useLockStore.getState().lostAt).not.toBeNull();
      },
      { timeout: 2000 },
    );
  });
});
