"""Priority-Queue für Simulationsereignisse.

Jonsson Kap. 4.3: Ein Simulationsereignis besteht aus
  (Simulationszeitpunkt, Zielobjekt, Methode, optionale Parameter).

In Python wird das als Heap-Eintrag mit (time, seq, callback, payload)
realisiert. Die seq-Nummer sorgt für FIFO-Stabilität bei gleichem Zeit-
punkt — kritisch für deterministische Reproduzierbarkeit.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass(order=True)
class _Entry:
    time: float
    seq: int
    callback: Callable[..., None] = field(compare=False)
    payload: Any = field(compare=False, default=None)


class EventHeap:
    """Min-Heap nach (time, seq). Insertionsreihenfolge stabilisiert FIFO."""

    def __init__(self) -> None:
        self._heap: list[_Entry] = []
        self._seq = 0

    def __len__(self) -> int:
        return len(self._heap)

    def push(self, time: float, callback: Callable[..., None], payload: Any = None) -> int:
        """Fügt ein Ereignis ein und gibt die seq-Nummer (Event-ID) zurück."""
        self._seq += 1
        heapq.heappush(self._heap, _Entry(time, self._seq, callback, payload))
        return self._seq

    def pop(self) -> _Entry:
        return heapq.heappop(self._heap)

    def peek_time(self) -> float | None:
        return self._heap[0].time if self._heap else None
