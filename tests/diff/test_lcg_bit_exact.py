"""Bit-genauer Vergleich des Python-LCG gegen Referenz-Fixture.

Die Fixture `tests/diff/fixtures/lcg_10000_seed1776496601.jsonl` ist aktuell
mit dem Python-Reference-Generator erzeugt (kein C-Compiler verfügbar).
Sobald `osim2004-trace/lcg/main.c` gebaut werden kann, sollte die Fixture
durch C-Output ersetzt werden — dann wird dieser Test zum echten
C++-vs-Python-Vergleich.

Stand: Stabilitäts-Test (Python ↔ Python).
"""

from __future__ import annotations

import json
from pathlib import Path

from osim_engine.core.distribution import OVerteil, STD_KEIM


FIXTURE = Path(__file__).parent / "fixtures" / "lcg_10000_seed1776496601.jsonl"


def test_lcg_10000_samples_bit_exact() -> None:
    """Alle 10000 Samples müssen Bit-für-Bit identisch zur Fixture sein."""
    verteil = OVerteil(seed=STD_KEIM)

    with FIXTURE.open(encoding="utf-8") as fh:
        for line_no, line in enumerate(fh):
            ref = json.loads(line)
            keim_before = verteil.keim
            result = verteil.zufall()

            assert keim_before == ref["keim_before"], (
                f"keim_before-Divergenz bei Call {line_no}: "
                f"Python={keim_before!r} vs Fixture={ref['keim_before']!r}"
            )
            assert verteil.keim == ref["keim_after"], (
                f"keim_after-Divergenz bei Call {line_no}: "
                f"Python={verteil.keim!r} vs Fixture={ref['keim_after']!r}"
            )
            assert result == ref["result"], (
                f"result-Divergenz bei Call {line_no}: "
                f"Python={result!r} vs Fixture={ref['result']!r}"
            )


def test_lcg_first_sample_is_documented_constant() -> None:
    """Erstes Sample mit STD_KEIM: bekannter Wert (Sanity-Check)."""
    verteil = OVerteil(seed=STD_KEIM)
    first = verteil.zufall()
    # keim_after = fmod(6636085 * 1776496601 + 907633385, 2^32)
    #            = 2501197012.0
    # result    = 2501197012.0 / 4294967296.0 = 0.5823553102090955
    assert verteil.keim == 2501197012.0
    assert first == 0.5823553102090955


def test_lcg_anti_flag_inverts_output() -> None:
    """Antithetisch: result = 1 - regular_result. Keim entwickelt sich gleich."""
    a = OVerteil(seed=STD_KEIM)
    b = OVerteil(seed=STD_KEIM)
    b.antithetisch(1)

    regular = a.zufall()
    anti = b.zufall()
    assert anti == 1.0 - regular
    assert a.keim == b.keim   # Keim entwickelt sich unabhängig vom Flag identisch


def test_naechster_keim_advances_n_steps() -> None:
    a = OVerteil(seed=STD_KEIM)
    a.naechster_keim(100)

    b = OVerteil(seed=STD_KEIM)
    for _ in range(100):
        b.zufall()

    assert a.keim == b.keim


def test_interner_keim_setter() -> None:
    v = OVerteil(seed=STD_KEIM)
    v.zufall()  # Keim weiterschalten
    old = v.interner_keim(42.0)
    assert old != STD_KEIM
    assert v.keim == 42.0


def test_externer_keim_via_list_ref() -> None:
    """Externer Keim wird als list[float] mit einem Element übergeben (mutable Ref)."""
    extern = [12345.0]
    v = OVerteil(seed=STD_KEIM)
    v.externer_keim(extern)
    v.zufall()
    # extern[0] muss aktualisiert worden sein
    assert extern[0] != 12345.0
    assert v.keim == extern[0]
