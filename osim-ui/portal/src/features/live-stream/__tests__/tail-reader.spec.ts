/**
 * Tests für den inkrementellen JSONL-Tail-Reader (Plan 01-02 Task 1).
 *
 * Vertrag aus 01-01-SUMMARY.md / SPEC §6.2:
 *   { t: number, stream: StreamTag, seq: number, v: object, wall_t?, meta_event? }
 *
 * Test-Cases (siehe Plan <behavior>):
 *  1. parseLines: 2 valide + 1 kaputte Zeile → 2 Frames, skipped=1, kein Throw.
 *  2. Tail-Step: 1. step über 2 Zeilen → 2 Frames; nach Anhängen 2 weiterer
 *     Zeilen liefert 2. step genau die 2 neuen Frames (Offset-Seek).
 *  3. detectGaps: seq [1,2,5] meldet Lücke zwischen 2 und 5.
 *  4. Restart: Reader mit via setOffset() gesetztem Offset liest ab da weiter.
 */

import { describe, expect, it, vi } from "vitest";
import {
  parseLines,
  detectGaps,
  createTailReader,
} from "../tail-reader";
import type { Frame } from "../types";

function line(seq: number, stream = "gantt_durchlauf"): string {
  return JSON.stringify({ t: seq * 10, stream, seq, v: { kind: "start" } });
}

describe("parseLines", () => {
  it("parst 2 valide Zeilen zu 2 Frames", () => {
    const chunk = `${line(1)}\n${line(2)}\n`;
    const { frames, skipped } = parseLines(chunk);
    expect(frames).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(frames[0].seq).toBe(1);
    expect(frames[1].stream).toBe("gantt_durchlauf");
  });

  it("überspringt eine kaputte Mittelzeile (skip+log, kein Throw)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chunk = `${line(1)}\n{ kaputt :: nope\n${line(3)}\n`;
    const { frames, skipped } = parseLines(chunk);
    expect(frames).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(frames[0].seq).toBe(1);
    expect(frames[1].seq).toBe(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignoriert leere Zeilen", () => {
    const chunk = `\n${line(1)}\n\n`;
    const { frames, skipped } = parseLines(chunk);
    expect(frames).toHaveLength(1);
    expect(skipped).toBe(0);
  });
});

describe("detectGaps", () => {
  it("meldet eine Lücke zwischen 2 und 5", () => {
    const frames: Frame[] = [1, 2, 5].map((s) => JSON.parse(line(s)) as Frame);
    const gaps = detectGaps(0, frames);
    // Erwartet: nach seq 2 fehlen 3 und 4 vor seq 5.
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps).toContain(3);
  });

  it("meldet keine Lücke bei lückenloser Folge", () => {
    const frames: Frame[] = [1, 2, 3].map((s) => JSON.parse(line(s)) as Frame);
    expect(detectGaps(0, frames)).toEqual([]);
  });
});

describe("createTailReader", () => {
  it("liefert beim 2. step nur die neuen Frames (Offset-Seek)", async () => {
    let content = `${line(1)}\n${line(2)}\n`;
    const read = vi.fn(async (offset: number) => {
      const text = content.slice(offset);
      return { text, nextOffset: content.length };
    });
    const reader = createTailReader(read);

    const first = await reader.step();
    expect(first.map((f) => f.seq)).toEqual([1, 2]);

    // 2 weitere Zeilen anhängen.
    content += `${line(3)}\n${line(4)}\n`;
    const second = await reader.step();
    expect(second.map((f) => f.seq)).toEqual([3, 4]);
  });

  it("ist restart-fest: setOffset() lässt ab dem Offset weiterlesen", async () => {
    const content = `${line(1)}\n${line(2)}\n${line(3)}\n`;
    const firstLineBytes = `${line(1)}\n`.length;
    const read = vi.fn(async (offset: number) => ({
      text: content.slice(offset),
      nextOffset: content.length,
    }));
    const reader = createTailReader(read);
    reader.setOffset(firstLineBytes);
    expect(reader.getOffset()).toBe(firstLineBytes);

    const frames = await reader.step();
    // seq 1 wurde via Offset übersprungen.
    expect(frames.map((f) => f.seq)).toEqual([2, 3]);
  });

  it("hält eine unvollständige letzte Zeile (kein \\n) zurück (T-01-04)", async () => {
    let content = `${line(1)}\n${JSON.stringify({ t: 20, stream: "gantt_durchlauf", seq: 2, v: {} }).slice(0, 12)}`;
    const read = vi.fn(async (offset: number) => ({
      text: content.slice(offset),
      nextOffset: content.length,
    }));
    const reader = createTailReader(read);

    const first = await reader.step();
    // Nur die abgeschlossene Zeile 1 wird emittiert; die halbe Zeile wartet.
    expect(first.map((f) => f.seq)).toEqual([1]);

    // Rest der Zeile 2 trifft im nächsten Tick ein.
    content = `${line(1)}\n${line(2)}\n`;
    const second = await reader.step();
    expect(second.map((f) => f.seq)).toEqual([2]);
  });
});
