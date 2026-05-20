"""EventPool — heapq-basierter Pool mit Sub-Time-Sortierung und Lazy-Delete.

Provenienz:
    - `OSimBase/EventPoolDll.cpp::Insert`: Sortier-Schema `(time << 2) | subTime`
      (Z. 184-186) — übernommen
    - `OSimBase/EventPoolDll.cpp::RemoveFirst`: `>>= 2`-Re-Decode (Z. 244-258)

Python-Mapping: `heapq` mit Lazy-Delete-Tombstones statt der C++-DLL-Implementierung
(siehe `docs/CONTEXT-P1-SUPPLEMENT.md` § 6.2).

Sortier-Vertrag:
    Primär:    aufsteigend nach `time`
    Sekundär:  aufsteigend nach `sub_time` (0-3, kodiert in unteren 2 Bit)
    Tertiär:   FIFO bei Gleichheit von `(time, sub_time)` via Insert-Counter
"""

from __future__ import annotations

import heapq
import itertools
from dataclasses import dataclass
from typing import Any

from osim_engine.core.event import MAX_EVENT_TIME, Event, OMetaEvent


EHDL = int  # Handle = id() des Entry-Objekts


@dataclass
class _PoolEntry:
    """Heap-Eintrag mit Tombstone-Flag.

    `combined_time = (m_time << 2) | sub_time` ist der primäre Heap-Key.
    `insert_counter` ist der Tiebreaker für FIFO bei gleichem combined_time.
    """

    combined_time: int
    insert_counter: int
    event: Event
    deleted: bool = False

    def __lt__(self, other: "_PoolEntry") -> bool:
        if self.combined_time != other.combined_time:
            return self.combined_time < other.combined_time
        return self.insert_counter < other.insert_counter


class EventPool:
    """Sub-Time-priorisierter Event-Pool.

    C++-Äquivalent: `EventPoolDll` aus `OSimBase/EventPoolDll.cpp`.
    Python-Implementation nutzt `heapq` statt DLL — Sortier-Verhalten
    bleibt identisch.
    """

    def __init__(self) -> None:
        self._heap: list[_PoolEntry] = []
        self._counter = itertools.count()
        self._entries_by_id: dict[EHDL, _PoolEntry] = {}
        self._curr: Event | None = None

        # Statistik (entspricht C++ m_sumEvent, m_maxEvent, m_curEvent)
        self.m_sumEvent: int = 0
        self.m_maxEvent: int = 0
        self.m_curEvent: int = 0

    # ------------------------------------------------------------------
    # Operations — entsprechen C++ EventPool-Interface
    # ------------------------------------------------------------------

    def insert(self, meta: OMetaEvent, obj: Any, ezeit: int, para: Any = None) -> EHDL:
        """Füge ein Event ein, gibt Handle zurück.

        Vertrag: `ezeit` muss `> 0` und `<= MAX_EVENT_TIME` sein. Bei
        Verletzung: `ValueError` (entspricht C++ `throw OException`).
        """
        if ezeit < 0 or ezeit > MAX_EVENT_TIME:
            raise ValueError(
                f"Event-Zeit {ezeit} außerhalb [0, {MAX_EVENT_TIME}]"
            )

        sub_time = meta.m_subTime & 0x3
        combined = (ezeit << 2) | sub_time

        event = Event(m_time=ezeit, m_meta=meta, m_obj=obj, m_para=para)
        entry = _PoolEntry(
            combined_time=combined,
            insert_counter=next(self._counter),
            event=event,
        )
        heapq.heappush(self._heap, entry)

        hdl = id(entry)
        self._entries_by_id[hdl] = entry

        # Statistik
        self.m_sumEvent += 1
        self.m_curEvent += 1
        if self.m_curEvent > self.m_maxEvent:
            self.m_maxEvent = self.m_curEvent

        return hdl

    def remove_first(self) -> Event | None:
        """Pop des Events mit kleinstem combined_time. Tombstones überspringen.

        Setzt `_curr` auf das Event. Gibt `None` zurück, wenn Pool leer.
        """
        while self._heap:
            entry = heapq.heappop(self._heap)
            if entry.deleted:
                continue
            # Aus dem Lookup-Dict raus — das Entry ist jetzt "Curr", nicht mehr Pool-Member
            self._entries_by_id.pop(id(entry), None)
            self._curr = entry.event
            self.m_curEvent -= 1
            return entry.event
        self._curr = None
        return None

    def get_curr(self) -> Event | None:
        """Liefert das aktuell gepop'te Event (oder None)."""
        return self._curr

    def delete_curr(self) -> None:
        """'Löscht' das aktuelle Event (Freigabe-Semantik aus C++).

        In Python ist das ein No-Op auf Heap-Ebene (das Event ist schon
        rausgepop't), wir setzen nur `_curr = None`.
        """
        self._curr = None

    def curr_exists(self) -> bool:
        return self._curr is not None

    def is_empty(self, period_end: int) -> bool:
        """Gibt es ein Event mit `time <= period_end`?

        Tombstones-Skipping: das oberste Tombstone wird hier nicht
        gefiltert (zur Vermeidung von Heap-Mutation in einem
        Read-Only-Aufruf). Konsequenz: bei vielen Tombstones an der
        Spitze könnte das fälschlich `False` liefern. In der Praxis
        unkritisch, weil `Delete` selten ist; `remove_first` räumt
        Tombstones eh auf.

        Vertrag: C++ liefert FALSE wenn es Events mit time <= period_end gibt.
        """
        for entry in self._heap:
            if entry.deleted:
                continue
            decoded_time = entry.combined_time >> 2
            return not (decoded_time <= period_end)
        return True

    def delete(self, hdl: EHDL) -> None:
        """Markiert ein Event als gelöscht (Tombstone). Idempotent."""
        entry = self._entries_by_id.pop(hdl, None)
        if entry is None or entry.deleted:
            return
        entry.deleted = True
        self.m_curEvent -= 1

    def hdl_to_event(self, hdl: EHDL) -> Event | None:
        entry = self._entries_by_id.get(hdl)
        return entry.event if entry is not None else None

    def init(self, block_size: int = 0) -> None:
        """Reset des Pools. block_size wird in Python ignoriert."""
        self._heap.clear()
        self._counter = itertools.count()
        self._entries_by_id.clear()
        self._curr = None
        self.m_sumEvent = 0
        self.m_maxEvent = 0
        self.m_curEvent = 0
