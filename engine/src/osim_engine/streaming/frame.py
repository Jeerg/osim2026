"""Frame-Dataclass — eine Zeile des `stream.jsonl` (SPEC §6.2).

Jedes Frame serialisiert zu genau einer eigenständigen JSON-Zeile mit den
Pflichtfeldern `t`, `stream`, `seq`, `v` und optional `wall_t`/`meta_event`.

Discretion D-1.4: getypte `@dataclass` statt Pydantic — leichtgewichtig,
kein Runtime-Overhead; Schema-Validation läuft nur in Tests/CI.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

# Sub-Stream-Tags (SPEC §6.2 + 01-14-Erweiterung). Reihenfolge = SPEC.
# gantt_wartequeue wurde in 01-14 als neuer Full-Stream hinzugefügt.
STREAM_TAGS: tuple[str, ...] = (
    "lifecycle",
    "gantt_durchlauf",
    "gantt_einsatz",
    "gantt_wartequeue",
    "gantt_schicht",
    "kpi_auswertung",
    "reporting_record",
)


@dataclass(slots=True)
class Frame:
    """Ein Stream-Frame. C++-Äquivalent gibt es nicht — neuer Vertrag.

    Felder (SPEC §6.2):
        t          Sim-Zeit in Sekunden (entspricht C++ ``EvtCurrTime()``)
        stream     Sub-Stream-Tag, einer aus ``STREAM_TAGS``
        seq        global monoton steigende Sequenznummer (Lücken-Erkennung UI)
        v          Stream-spezifischer Payload (validiert gegen schema/<stream>.json)
        wall_t     optional: Wall-Clock-Zeit (ISO-8601), für Latenz-Debug
        meta_event optional: Name des auslösenden OMetaEvent
    """

    t: int
    stream: str
    seq: int
    v: dict
    wall_t: str | None = None
    meta_event: str | None = None

    def serialize(self) -> str:
        """Gibt das Frame als eine JSON-Zeile (ohne Newline) zurück.

        Optionale Felder erscheinen nur, wenn sie gesetzt sind — so bleibt
        der Standard-Frame exakt ``{t, stream, seq, v}`` (SPEC §6.2).
        """
        obj: dict = {"t": self.t, "stream": self.stream, "seq": self.seq, "v": self.v}
        if self.wall_t is not None:
            obj["wall_t"] = self.wall_t
        if self.meta_event is not None:
            obj["meta_event"] = self.meta_event
        return json.dumps(obj, ensure_ascii=False)
