/**
 * Tests für den Live-Stream Zustand-Store (Plan 01-02 Task 2).
 *
 * D-4.2: EIGENSTÄNDIGER Store — NICHT useNavigatorStore/viewer-store.
 *
 * Test-Cases (siehe Plan <behavior>):
 *  1. ingest verteilt Frames getrennt nach Stream-Tag.
 *  2. setActiveStream + selectActiveFrames filtert auf einen Stream (AC-4).
 *  3. ingest mit seq-Lücke setzt hasGap; reset() leert + setzt zurück.
 *  4. setMeta setzt dropCount + streams-Status.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useLiveStreamStore } from "../store";
import type { Frame, MetaJson } from "../types";

function frame(seq: number, stream: Frame["stream"]): Frame {
  return { t: seq * 10, stream, seq, v: { kind: "start" } };
}

describe("useLiveStreamStore", () => {
  beforeEach(() => {
    useLiveStreamStore.getState().reset();
  });

  it("verteilt ingestete Frames getrennt nach Stream-Tag", () => {
    useLiveStreamStore
      .getState()
      .ingest([frame(1, "lifecycle"), frame(2, "gantt_durchlauf")]);
    const { byStream } = useLiveStreamStore.getState();
    expect(byStream.lifecycle).toHaveLength(1);
    expect(byStream.gantt_durchlauf).toHaveLength(1);
    expect(byStream.lifecycle[0].seq).toBe(1);
  });

  it("filtert via setActiveStream + selectActiveFrames auf einen Stream (AC-4)", () => {
    const store = useLiveStreamStore.getState();
    store.ingest([
      frame(1, "lifecycle"),
      frame(2, "gantt_durchlauf"),
      frame(3, "gantt_durchlauf"),
    ]);
    store.setActiveStream("gantt_durchlauf");
    const active = useLiveStreamStore.getState().selectActiveFrames();
    expect(active).toHaveLength(2);
    expect(active.every((f) => f.stream === "gantt_durchlauf")).toBe(true);
  });

  it("liefert [] aus selectActiveFrames wenn kein aktiver Stream gesetzt ist", () => {
    expect(useLiveStreamStore.getState().selectActiveFrames()).toEqual([]);
  });

  it("setzt hasGap bei seq-Lücke; reset() leert Buffer + setzt hasGap zurück", () => {
    const store = useLiveStreamStore.getState();
    store.ingest([frame(1, "gantt_durchlauf"), frame(2, "gantt_durchlauf")]);
    expect(useLiveStreamStore.getState().hasGap).toBe(false);

    // Lücke: seq springt von 2 auf 5.
    store.ingest([frame(5, "gantt_durchlauf")]);
    expect(useLiveStreamStore.getState().hasGap).toBe(true);

    store.reset();
    const after = useLiveStreamStore.getState();
    expect(after.hasGap).toBe(false);
    expect(after.byStream.gantt_durchlauf).toHaveLength(0);
    expect(after.lastSeq).toBe(0);
  });

  it("setMeta setzt dropCount + speichert Stream-Status", () => {
    const meta: MetaJson = {
      run_id: "2026-05-29T08-00-00-0001",
      schema_version: "1.0",
      drop_count: 7,
      streams: {
        gantt_durchlauf: { status: "partial", missing_slices: ["P5-D"] },
      },
    };
    useLiveStreamStore.getState().setMeta(meta);
    const state = useLiveStreamStore.getState();
    expect(state.dropCount).toBe(7);
    expect(state.streamStatus.gantt_durchlauf?.status).toBe("partial");
  });

  it("cappt den Per-Stream-Buffer auf die Obergrenze (T-01-05)", () => {
    const store = useLiveStreamStore.getState();
    const many: Frame[] = [];
    for (let i = 1; i <= 12000; i++) many.push(frame(i, "gantt_durchlauf"));
    store.ingest(many);
    const buf = useLiveStreamStore.getState().byStream.gantt_durchlauf;
    expect(buf.length).toBeLessThanOrEqual(10000);
    // Jüngste Frames bleiben erhalten (Ring/slice von hinten).
    expect(buf[buf.length - 1].seq).toBe(12000);
  });
});
