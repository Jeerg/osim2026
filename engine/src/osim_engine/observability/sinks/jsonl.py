"""JsonlSink — append-only JSONL-Trace.

Siehe `docs/CONTEXT-P1-EVENTBUS.md` § 4.1. Format pro Zeile:
    {"t":86400,"subt":2,"topic":"proz.bearbeit.start","data":{...}}
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any


class JsonlSink:
    """Schreibt jedes empfangene Event als JSONL-Zeile in eine Datei."""

    def __init__(self, path: Path | str) -> None:
        self._fh: io.TextIOBase = Path(path).open("w", encoding="utf-8")

    def receive(self, topic: str, data: dict[str, Any], sim_time: int, sub_time: int) -> None:
        record = {"t": sim_time, "subt": sub_time, "topic": topic, "data": data}
        self._fh.write(json.dumps(record, separators=(",", ":")) + "\n")

    def close(self) -> None:
        if not self._fh.closed:
            self._fh.close()

    def __enter__(self) -> "JsonlSink":
        return self

    def __exit__(self, *exc) -> None:
        self.close()
