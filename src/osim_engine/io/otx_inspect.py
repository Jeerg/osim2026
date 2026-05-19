"""OTX-Inspektor — strukturierte Modell-Übersicht für eine OTX-Datei.

Ziel: schnell verstehen, was in einer OTX drin ist — Klassen-Häufigkeiten,
benannte Objekte, Counter-Status (alle 0 = Pre-Run, befüllt = Post-Run).

API:
    summary = inspect_otx(path)
    print(summary.format_text())

CLI:
    python -m osim_engine.io.otx_inspect <path-to-otx>
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from osim_engine.io.otx_diff import COUNTER_PREFIXES
from osim_engine.io.otx_reader import OtxFile, parse_otx_file


# ----------------------------------------------------------------------
# Datenklassen
# ----------------------------------------------------------------------


@dataclass
class ClassStat:
    klass: str
    count: int
    named_examples: list[str] = field(default_factory=list)


@dataclass
class CounterStat:
    """Aggregierte Counter-Statistik über ein Modell."""
    total_counter_fields: int = 0
    non_zero_counter_fields: int = 0
    objects_with_counters: int = 0
    objects_with_nonzero_counters: int = 0

    @property
    def run_state(self) -> str:
        """'pre-run', 'post-run', oder 'mixed'."""
        if self.non_zero_counter_fields == 0:
            return "pre-run (alle Counter = 0)"
        if self.non_zero_counter_fields == self.total_counter_fields:
            return "post-run (alle Counter belegt)"
        ratio = 100.0 * self.non_zero_counter_fields / max(self.total_counter_fields, 1)
        return f"mixed ({ratio:.0f}% Counter befüllt)"


@dataclass
class OtxSummary:
    path: Path
    declared_count: int
    parsed_oids: int
    top_level_count: int
    file_dump_active: bool
    sim_period_seconds: int
    sim_keim: int
    classes: list[ClassStat]
    counter_stat: CounterStat
    auslöser_count: int

    def format_text(self) -> str:
        lines = []
        lines.append(f"OTX-Inspektion: {self.path.name}")
        lines.append("=" * 70)
        lines.append(f"Datei-Stand:        {self.counter_stat.run_state}")
        lines.append(f"Deklarierte OIDs:   {self.declared_count}")
        lines.append(f"Geparste Objekte:   {self.parsed_oids}")
        lines.append(f"Top-Level-Objekte:  {self.top_level_count}")
        lines.append(f"Auslöser:           {self.auslöser_count}")
        lines.append(f"FileDump aktiv:     {self.file_dump_active}")
        lines.append(f"Periode:            {self.sim_period_seconds}s")
        lines.append(f"LCG-Keim:           {self.sim_keim}")
        lines.append("")
        lines.append(f"Counter-Status:")
        lines.append(f"  {self.counter_stat.total_counter_fields} Counter-Felder gesamt")
        lines.append(f"  {self.counter_stat.non_zero_counter_fields} davon nicht-null")
        lines.append(
            f"  {self.counter_stat.objects_with_nonzero_counters} / "
            f"{self.counter_stat.objects_with_counters} Objekte mit "
            f"belegten Countern"
        )
        lines.append("")
        lines.append("Klassen-Inventar (Top 20):")
        for stat in self.classes[:20]:
            example = (
                f"  z.B. {', '.join(stat.named_examples[:3])}"
                if stat.named_examples else ""
            )
            lines.append(f"  {stat.count:5}× {stat.klass:30}{example}")
        if len(self.classes) > 20:
            lines.append(f"  ... ({len(self.classes) - 20} weitere Klassen)")
        return "\n".join(lines)


# ----------------------------------------------------------------------
# Implementierung
# ----------------------------------------------------------------------


def _is_counter_attr(name: str) -> bool:
    return name.startswith(COUNTER_PREFIXES)


def _is_zero(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, (int, float)):
        return value == 0
    return False


def _summarize_classes(file: OtxFile) -> list[ClassStat]:
    by_class: dict[str, ClassStat] = {}
    for obj in file.by_oid.values():
        if obj.klass not in by_class:
            by_class[obj.klass] = ClassStat(klass=obj.klass, count=0)
        stat = by_class[obj.klass]
        stat.count += 1
        name = obj.attrs.get("m_sName")
        if isinstance(name, str) and name and len(stat.named_examples) < 5:
            stat.named_examples.append(name)
    return sorted(by_class.values(), key=lambda s: (-s.count, s.klass))


def _summarize_counters(file: OtxFile) -> CounterStat:
    stat = CounterStat()
    for obj in file.by_oid.values():
        counters = [(k, v) for k, v in obj.attrs.items() if _is_counter_attr(k)]
        if not counters:
            continue
        stat.objects_with_counters += 1
        stat.total_counter_fields += len(counters)
        nonzero = [v for _, v in counters if not _is_zero(v)]
        stat.non_zero_counter_fields += len(nonzero)
        if nonzero:
            stat.objects_with_nonzero_counters += 1
    return stat


_AUSLOESER_CLASSES = (
    "PAslEinzel", "PAslPeriodisch", "PAslZeitintervall",
    "PAslAnfangBestand", "PAslLagerbestand",
)


def _count_ausloeser(file: OtxFile) -> int:
    count = 0
    for obj in file.by_oid.values():
        if obj.klass in _AUSLOESER_CLASSES:
            count += 1
    return count


def inspect_otx(path: Path | str) -> OtxSummary:
    """Liest eine OTX und produziert eine strukturierte Modell-Übersicht."""
    path = Path(path)
    file = parse_otx_file(path)
    # ASimulator als Root erwartet
    asim = file.top_level[0] if file.top_level else None
    sim_attrs = asim.attrs if asim is not None else {}

    return OtxSummary(
        path=path,
        declared_count=file.declared_count,
        parsed_oids=len(file.by_oid),
        top_level_count=len(file.top_level),
        file_dump_active=bool(sim_attrs.get("m_bFileDump", False)),
        sim_period_seconds=int(sim_attrs.get("m_periodLen", 0)) if isinstance(
            sim_attrs.get("m_periodLen"), int
        ) else 0,
        sim_keim=int(sim_attrs.get("m_keim", 0)) if isinstance(
            sim_attrs.get("m_keim"), int
        ) else 0,
        classes=_summarize_classes(file),
        counter_stat=_summarize_counters(file),
        auslöser_count=_count_ausloeser(file),
    )


def _cli(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print("Usage: python -m osim_engine.io.otx_inspect <path-to-otx>")
        return 1
    summary = inspect_otx(Path(argv[1]))
    print(summary.format_text())
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(_cli(sys.argv))
