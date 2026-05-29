/**
 * Inkrementeller JSONL-Tail-Reader (Plan 01-02 Task 1).
 *
 * Strategie (SPEC §8.2 + D-4.4):
 *  - Byte-Offset-Seek: der Reader merkt den zuletzt gelesenen Offset und liest
 *    beim nächsten Tick nur das Neue. Restart-fest via getOffset()/setOffset()
 *    (AC-5-Basis: nach UI-Crash kann der Offset persistiert + wiederhergestellt
 *    werden, ohne Frames doppelt zu emittieren).
 *  - Parse-Fehler pro Zeile → console.warn + Skip, nie Throw (T-01-04, DoS-
 *    Mitigation: Engine schreibt noch, halbe/korrupte Zeilen dürfen den Reader
 *    nicht killen).
 *  - Eine unvollständige letzte Zeile (kein abschließendes \n) wird bis zum
 *    nächsten Tick zurückgehalten — sie ist evtl. nur halb geschrieben.
 *  - Intervall-agnostisch: das 200ms-Polling treibt der Store/die Route
 *    (D-4.4), nicht dieser Reader. `step()` ist ein einzelner Tick.
 */

import type { Frame } from "./types";
import { isStreamTag } from "./types";

/** Ergebnis von {@link parseLines}. */
export interface ParseResult {
  frames: Frame[];
  /** Anzahl der wegen Parse-Fehler übersprungenen Zeilen. */
  skipped: number;
}

/**
 * Minimale Struktur-Validierung: ein Objekt mit den Frame-Pflichtfeldern.
 * Defensiv, weil die Engine während des Schreibens halbe Objekte hinterlassen
 * kann und ein Cast allein keine Laufzeit-Sicherheit gibt.
 */
function isValidFrame(obj: unknown): obj is Frame {
  if (typeof obj !== "object" || obj === null) return false;
  const f = obj as Record<string, unknown>;
  return (
    typeof f.t === "number" &&
    typeof f.seq === "number" &&
    isStreamTag(f.stream) &&
    typeof f.v === "object" &&
    f.v !== null
  );
}

/**
 * Parst einen Chunk vollständiger JSONL-Zeilen.
 *
 * Leere Zeilen werden ignoriert (nicht als skip gezählt). Zeilen, die nicht
 * als valides Frame parsen, werden geloggt + übersprungen — `parseLines`
 * wirft NIE. Der Aufrufer ist dafür verantwortlich, eine evtl. unvollständige
 * letzte Zeile (ohne \n) nicht hereinzugeben (siehe {@link createTailReader}).
 */
export function parseLines(chunk: string): ParseResult {
  const frames: Frame[] = [];
  let skipped = 0;

  for (const raw of chunk.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    try {
      const obj = JSON.parse(line);
      if (isValidFrame(obj)) {
        frames.push(obj);
      } else {
        skipped++;
        console.warn("[live-stream] Frame ohne Pflichtfelder übersprungen:", line);
      }
    } catch {
      skipped++;
      console.warn("[live-stream] Nicht-parsebare JSONL-Zeile übersprungen:", line);
    }
  }

  return { frames, skipped };
}

/**
 * Erkennt seq-Lücken zwischen `prevSeq` und der gegebenen Frame-Folge.
 *
 * Liefert die Liste der fehlenden seq-Nummern. Beispiel: prevSeq=0,
 * frames.seq=[1,2,5] → [3,4] (zwischen 2 und 5 fehlen 3 und 4). Da `seq`
 * global monoton über ALLE Streams läuft (01-01-SUMMARY), zeigt eine Lücke
 * Frame-Verlust an (Backpressure-Drop oder Tail-Aussetzer).
 */
export function detectGaps(prevSeq: number, frames: Frame[]): number[] {
  const gaps: number[] = [];
  let last = prevSeq;
  for (const f of frames) {
    if (last > 0 && f.seq > last + 1) {
      for (let missing = last + 1; missing < f.seq; missing++) {
        gaps.push(missing);
      }
    }
    if (f.seq > last) last = f.seq;
  }
  return gaps;
}

/** Lese-Funktion: liefert den Text ab `offset` + den Byte-Offset danach. */
export type ReadFn = (
  offset: number,
) => Promise<{ text: string; nextOffset: number }>;

export interface TailReaderOptions {
  /** Start-Offset (default 0). */
  startOffset?: number;
}

/** Öffentliche Schnittstelle des Tail-Readers. */
export interface TailReader {
  /** Ein Tick: liest ab dem gemerkten Offset, parst neue Zeilen. */
  step: () => Promise<Frame[]>;
  /** Aktueller Byte-Offset (für Persistenz / Restart-Festigkeit). */
  getOffset: () => number;
  /** Setzt den Byte-Offset (Restart vom persistierten Offset). */
  setOffset: (offset: number) => void;
}

/**
 * Baut einen Tail-Reader über die gegebene {@link ReadFn}.
 *
 * Die Read-Funktion ist injiziert (kein Datei-System-Coupling hier) — in der
 * Route liest sie per HTTP/File-API ab `offset`. Der Reader hält intern den
 * Offset plus einen Carry-Puffer für eine unvollständige letzte Zeile, damit
 * halbe Zeilen erst beim nächsten Tick (komplett) emittiert werden.
 */
export function createTailReader(
  read: ReadFn,
  opts: TailReaderOptions = {},
): TailReader {
  let offset = opts.startOffset ?? 0;
  let carry = "";

  return {
    async step(): Promise<Frame[]> {
      const { text, nextOffset } = await read(offset);
      if (text.length === 0) return [];

      const combined = carry + text;
      const lastNewline = combined.lastIndexOf("\n");

      if (lastNewline === -1) {
        // Keine vollständige Zeile — alles als Carry zurückhalten.
        carry = combined;
        offset = nextOffset;
        return [];
      }

      const complete = combined.slice(0, lastNewline + 1);
      carry = combined.slice(lastNewline + 1);
      offset = nextOffset;

      const { frames } = parseLines(complete);
      return frames;
    },
    getOffset(): number {
      return offset;
    },
    setOffset(value: number): void {
      offset = value;
      carry = "";
    },
  };
}
