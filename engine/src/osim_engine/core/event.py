"""Event-Datenstrukturen und Konstanten.

Provenienz:
    - `inc/Event.h`: MAX_EVENT_TIME, OMetaEvent, Event
    - `ObjectBase/OMetaEvent.cpp`: OMetaEvent-Konstruktor

Kontrakt (siehe `docs/CONTEXT-P1-SUPPLEMENT.md` § 2 und § 3):
    - `MAX_EVENT_TIME = 500_000_000` Sekunden (~16 Jahre Simulationszeit)
    - `m_subTime ∈ [0, 3]` als Klassen-Attribut von OMetaEvent
    - Sortier-Schema im EventPool: `(time << 2) | subTime`
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar


MAX_EVENT_TIME: int = 500_000_000


class OMetaEvent:
    """Beschreibt einen Event-Typ. Subtime und Name sind Klassen-Attribute.

    C++-Äquivalent: `class DLL_OBASE OMetaEvent` aus `inc/Event.h`.
    Die `$event(N)`-Annotation in `.odh`-Files setzt `m_subTime = N`.
    Subtypen überschreiben `execute()` für ihre Event-Behandlung.
    """

    m_subTime: ClassVar[int] = 0
    m_name: ClassVar[str] = ""

    def execute(self, obj: Any, para: Any = None) -> None:
        raise NotImplementedError(
            f"OMetaEvent-Subklasse {type(self).__name__} muss execute() überschreiben"
        )


@dataclass
class Event:
    """Konkrete Event-Instanz im Pool.

    C++-Äquivalent: `class Event` aus `inc/Event.h`.
    `m_time` ist die ursprüngliche Sim-Zeit (vor dem `<<2`-Encoding).
    """

    m_time: int
    m_meta: OMetaEvent
    m_obj: Any
    m_para: Any = None

    def execute(self) -> None:
        self.m_meta.execute(self.m_obj, self.m_para)
