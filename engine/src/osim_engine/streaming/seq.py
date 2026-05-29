"""Geteilter, global monotoner Sequenz-Zähler über ALLE Sub-Streams (SPEC §6.2).

Alle Listener teilen sich EINE ``SeqCounter``-Instanz, damit die ``seq``-Werte
über die gesamte ``stream.jsonl`` streng monoton steigen — die UI nutzt sie zur
Lücken-Erkennung.
"""

from __future__ import annotations


class SeqCounter:
    """Mutable monotone Sequenz. ``next()`` liefert 1, 2, 3, ... ."""

    __slots__ = ("_value",)

    def __init__(self, start: int = 0) -> None:
        self._value = start

    def next(self) -> int:
        self._value += 1
        return self._value

    @property
    def value(self) -> int:
        return self._value
