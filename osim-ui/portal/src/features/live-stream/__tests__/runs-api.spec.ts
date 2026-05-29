/**
 * Tests für den runs-API-Client (Plan 01-09 Task 1).
 *
 * Vertrag aus 01-08-SUMMARY.md:
 *   POST /api/v1/models/{model_id}/runs -> StartRunResponse
 *   GET  /api/v1/runs/{run_id}/stream?offset=<n> -> { text, next_offset }
 *   GET  /api/v1/runs/{run_id}/meta -> MetaJson
 *
 * Schwerpunkt: `buildStreamReadFn` muss
 *  - die richtige URL mit dem übergebenen Offset bauen, und
 *  - das Backend-`next_offset` (snake_case) auf die tail-reader-ReadFn-Signatur
 *    `nextOffset` (camelCase) mappen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// apiFetch wird gemockt — kein echter Netzwerk-/Firebase-Pfad im Unit-Test.
vi.mock("@/api/fetch", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/api/fetch";
import {
  buildStreamReadFn,
  fetchRunMeta,
  startRun,
} from "@/api/runs";

const apiFetchMock = vi.mocked(apiFetch);

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe("startRun", () => {
  it("POSTet auf /api/v1/models/{id}/runs und liefert die StartRunResponse", async () => {
    apiFetchMock.mockResolvedValueOnce({
      run_id: "run-42",
      model_id: "model-7",
      coverage_ratio: 1,
      status: "running",
    });

    const resp = await startRun("model-7");

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/models/model-7/runs",
      { method: "POST" },
    );
    expect(resp.run_id).toBe("run-42");
    expect(resp.coverage_ratio).toBe(1);
  });
});

describe("buildStreamReadFn", () => {
  it("baut die Stream-URL mit dem übergebenen Offset", async () => {
    apiFetchMock.mockResolvedValueOnce({ text: "", next_offset: 0 });
    const read = buildStreamReadFn("run-42");

    await read(128);

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/runs/run-42/stream?offset=128",
    );
  });

  it("mapped next_offset (snake) auf nextOffset (camel) der ReadFn-Signatur", async () => {
    apiFetchMock.mockResolvedValueOnce({
      text: '{"t":1,"stream":"lifecycle","seq":1,"v":{}}\n',
      next_offset: 256,
    });
    const read = buildStreamReadFn("run-42");

    const result = await read(0);

    expect(result).toEqual({
      text: '{"t":1,"stream":"lifecycle","seq":1,"v":{}}\n',
      nextOffset: 256,
    });
    // Kein next_offset-Leak in das ReadFn-Resultat (Signatur ist camelCase-only).
    expect("next_offset" in result).toBe(false);
  });

  it("startet bei Offset 0 für den ersten Poll", async () => {
    apiFetchMock.mockResolvedValueOnce({ text: "", next_offset: 0 });
    const read = buildStreamReadFn("abc");

    await read(0);

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/v1/runs/abc/stream?offset=0",
    );
  });
});

describe("fetchRunMeta", () => {
  it("GETtet die meta.json des Runs", async () => {
    apiFetchMock.mockResolvedValueOnce({
      run_id: "run-42",
      schema_version: "1.0",
      streams: {},
    });

    const meta = await fetchRunMeta("run-42");

    expect(apiFetchMock).toHaveBeenCalledWith("/api/v1/runs/run-42/meta");
    expect(meta.run_id).toBe("run-42");
    expect(meta.schema_version).toBe("1.0");
  });
});
