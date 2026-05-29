/**
 * Live-Stream Zustand-Store (Plan 01-02 Task 2).
 *
 * D-4.2: EIGENSTÄNDIGER Store, bewusst getrennt vom Navigator- und
 * Viewer-State — Live-Stream-State hat einen anderen Lebenszyklus
 * (Tail-Reader-Tick, Frame-Buffer pro Stream, Stream-Filter, Gap-Marker).
 * Es gibt keinen Import aus den bestehenden Modellierungs-Stores.
 *
 * Verantwortlichkeiten:
 *  - Frames pro Stream-Tag getrennt halten (`byStream`).
 *  - Aktiven Stream auswählen + filtern (`setActiveStream` / `selectActiveFrames`,
 *    AC-4).
 *  - seq-Lücken erkennen (`detectGaps` gegen `lastSeq`) → `hasGap` (Gap-Marker).
 *  - meta.json-Status aufnehmen (`setMeta`) für dropCount + Wave-3-Banner.
 *  - Per-Stream-Buffer auf eine Obergrenze cappen (T-01-05: unbegrenztes
 *    Frame-Wachstum bei langen Läufen vermeiden; Ring/slice von hinten).
 */

import { create } from "zustand";
import { detectGaps } from "./tail-reader";
import type { Frame, MetaJson, StreamStatus, StreamTag } from "./types";
import { STREAM_TAGS } from "./types";

/**
 * Per-Stream-Buffer-Obergrenze. Korrespondiert mit dem Engine-seitigen
 * Bounded-Buffer (D-OP-3: 10.000 Frames). Älteste Frames werden verworfen,
 * die jüngsten bleiben (Live-Sicht ist „aktuelles Fenster", nicht Full-History
 * — Replay ist Phase 6).
 */
export const MAX_FRAMES_PER_STREAM = 10_000;

function emptyByStream(): Record<StreamTag, Frame[]> {
  return STREAM_TAGS.reduce(
    (acc, tag) => {
      acc[tag] = [];
      return acc;
    },
    {} as Record<StreamTag, Frame[]>,
  );
}

interface LiveStreamState {
  /** Frames getrennt nach Stream-Tag. */
  byStream: Record<StreamTag, Frame[]>;
  /** Aktuell gefilterter Stream (Tab-Auswahl), null = keiner. */
  activeStream: StreamTag | null;
  /** Mindestens eine seq-Lücke seit dem letzten reset() erkannt? */
  hasGap: boolean;
  /** Höchste bisher gesehene seq (global, für Gap-Detection). */
  lastSeq: number;
  /** Verworfene Frames laut meta.json (Backpressure-Drop, D-OP-3). */
  dropCount: number;
  /** Pro-Stream-Status aus meta.json (partial/full, D-2.2). */
  streamStatus: Partial<Record<StreamTag, StreamStatus>>;
}

interface LiveStreamActions {
  /** Nimmt neue Frames auf, verteilt nach Stream, aktualisiert Gap-Marker. */
  ingest: (frames: Frame[]) => void;
  /** Setzt den aktiven (gefilterten) Stream. */
  setActiveStream: (tag: StreamTag | null) => void;
  /** Selector: Frames des aktiven Streams (oder [] wenn keiner aktiv). */
  selectActiveFrames: () => Frame[];
  /** Nimmt meta.json auf (dropCount + Stream-Status für Banner). */
  setMeta: (meta: MetaJson) => void;
  /** Leert alle Buffer + setzt Gap-/Seq-/Drop-State zurück. */
  reset: () => void;
}

const initialState: LiveStreamState = {
  byStream: emptyByStream(),
  activeStream: null,
  hasGap: false,
  lastSeq: 0,
  dropCount: 0,
  streamStatus: {},
};

export const useLiveStreamStore = create<LiveStreamState & LiveStreamActions>(
  (set, get) => ({
    ...initialState,

    ingest: (frames) => {
      if (frames.length === 0) return;
      const state = get();

      // Gap-Detection gegen die bisher höchste seq (global, alle Streams).
      const gaps = detectGaps(state.lastSeq, frames);
      const maxSeq = frames.reduce(
        (m, f) => (f.seq > m ? f.seq : m),
        state.lastSeq,
      );

      // Frames pro Stream anhängen + auf Obergrenze cappen.
      const next = emptyByStream();
      for (const tag of STREAM_TAGS) next[tag] = state.byStream[tag];
      const touched = new Set<StreamTag>();
      for (const f of frames) {
        if (!touched.has(f.stream)) {
          next[f.stream] = next[f.stream].slice();
          touched.add(f.stream);
        }
        next[f.stream].push(f);
      }
      for (const tag of touched) {
        if (next[tag].length > MAX_FRAMES_PER_STREAM) {
          next[tag] = next[tag].slice(next[tag].length - MAX_FRAMES_PER_STREAM);
        }
      }

      set({
        byStream: next,
        lastSeq: maxSeq,
        hasGap: state.hasGap || gaps.length > 0,
      });
    },

    setActiveStream: (tag) => set({ activeStream: tag }),

    selectActiveFrames: () => {
      const { activeStream, byStream } = get();
      return activeStream ? byStream[activeStream] : [];
    },

    setMeta: (meta) =>
      set({
        dropCount: meta.drop_count ?? 0,
        streamStatus: meta.streams ?? {},
      }),

    reset: () =>
      set({
        byStream: emptyByStream(),
        activeStream: null,
        hasGap: false,
        lastSeq: 0,
        dropCount: 0,
        streamStatus: {},
      }),
  }),
);
