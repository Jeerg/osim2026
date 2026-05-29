"""JsonlStreamWriter — buffered append-only Writer mit bounded buffer.

Eigenständige Implementierung (recorder.py bleibt unangetastet, D-1.1) — das
Buffering-/Context-Manager-Pattern ist von ``engine/recorder.py`` *kopiert*,
nicht erweitert.

Verträge:
    - Batched-Flush: nach ``batch_n`` gepufferten Frames wird auf Platte
      geschrieben + ``file.flush()`` (D-1.3, Default N=100). ``flush()`` schreibt
      sofort.
    - Bounded buffer: ``collections.deque(maxlen=max_buffer)`` (Default 10_000,
      D-OP-3). Bei Überlauf verwirft die deque das älteste Frame (drop-oldest);
      ``drop_count`` wird hochgezählt und per ``logging.warning`` gewarnt.
    - Die Sim wird NIE blockiert (SPEC §5, hartes Nicht-Ziel): kein
      ``os.fsync``-Zwang pro Frame, kein Lock-Warten.
"""

from __future__ import annotations

import collections
import io
import logging
from contextlib import AbstractContextManager
from pathlib import Path

from osim_engine.streaming.frame import Frame

logger = logging.getLogger(__name__)


class JsonlStreamWriter(AbstractContextManager):
    """Append-only JSONL-Writer mit batched-flush + drop-oldest-Backpressure."""

    def __init__(
        self,
        path: str | Path,
        batch_n: int = 100,
        max_buffer: int = 10_000,
    ) -> None:
        self.path = Path(path)
        self.batch_n = batch_n
        self.max_buffer = max_buffer
        self.drop_count: int = 0
        self._buffer: collections.deque[str] = collections.deque(maxlen=max_buffer)
        self._file: io.TextIOWrapper | None = None
        self._open()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def _open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # append-only (SPEC §6.1) — O-1: genau eine wachsende Datei pro Run.
        self._file = self.path.open("a", encoding="utf-8")

    def __enter__(self) -> "JsonlStreamWriter":
        if self._file is None:
            self._open()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        """Flusht garantiert und schließt die Datei."""
        if self._file is not None:
            self.flush()
            self._file.close()
            self._file = None

    # ------------------------------------------------------------------
    # Write-Pfad
    # ------------------------------------------------------------------

    def write(self, frame: Frame) -> None:
        """Puffert ein Frame. Bei vollem Buffer wird das älteste verworfen
        (drop-oldest, deque-maxlen-Semantik). Nach ``batch_n`` Einträgen wird
        automatisch geflusht."""
        if len(self._buffer) >= self.max_buffer:
            # deque.append würde das älteste verdrängen — wir zählen + warnen.
            self.drop_count += 1
            logger.warning(
                "JsonlStreamWriter buffer full (max_buffer=%d) — dropping oldest "
                "frame; total dropped=%d", self.max_buffer, self.drop_count,
            )
        self._buffer.append(frame.serialize())
        if len(self._buffer) >= self.batch_n:
            self.flush()

    def flush(self) -> None:
        """Schreibt alle gepufferten Zeilen auf Platte und flusht den Stream."""
        if self._file is None or not self._buffer:
            return
        lines = "".join(line + "\n" for line in self._buffer)
        self._file.write(lines)
        self._file.flush()
        self._buffer.clear()
