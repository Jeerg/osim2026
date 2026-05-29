"""Listener-Factory-Registry — der Erweiterungspunkt für alle Stream-Listener.

Wave-2-Listener (auswertung/einsatz/schicht/reporting) registrieren ihre
Factory hier per Import ihres Moduls, OHNE ``attach.py`` oder
``listeners/__init__.py`` zu editieren (kein Shared-Write). Das hält den
Engine↔UI-Vertrag kontraktstabil über die Folge-Pläne hinweg.

Eine ``ListenerFactory`` ist ein Callable ``(seq_counter, writer) ->
OListenerSimulator``:
    - ``seq_counter`` ist der geteilte, mutable Sequenz-Zähler (global monotone
      ``seq`` über ALLE Streams, SPEC §6.2)
    - ``writer`` ist der gemeinsame ``JsonlStreamWriter``
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from osim_engine.core.listener import OListenerSimulator
    from osim_engine.streaming.jsonl_writer import JsonlStreamWriter
    from osim_engine.streaming.seq import SeqCounter

    ListenerFactory = Callable[[SeqCounter, JsonlStreamWriter], OListenerSimulator]
else:
    ListenerFactory = Callable

# Modul-globale Registry. Reihenfolge = Registrierungs-Reihenfolge.
LISTENER_FACTORIES: list["ListenerFactory"] = []


def _factory_key(factory: "ListenerFactory") -> str:
    """Stabiler Idempotenz-Schlüssel über den Factory-/Klassennamen."""
    return getattr(factory, "__name__", repr(factory))


def register_listener(factory: "ListenerFactory") -> None:
    """Trägt eine Factory ein. Idempotent über den Factory-/Klassennamen:
    Doppelregistrierung desselben Namens lässt die Registry unverändert."""
    key = _factory_key(factory)
    existing = {_factory_key(f) for f in LISTENER_FACTORIES}
    if key in existing:
        return
    LISTENER_FACTORIES.append(factory)
