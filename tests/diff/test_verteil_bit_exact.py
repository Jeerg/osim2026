"""Bit-genaue Verteilungs-Tests gegen Referenz-Fixtures.

Pro Subtyp ein Test, der die ersten 1000 Samples gegen die Fixture vergleicht.
Setup für jeden Test:
    - reset_lcg-Fixture (autouse aus conftest.py) setzt Modul-Singleton zurück
    - Verteilungs-Instanz mit denselben Parametern wie in generate_fixtures.py

Stand: Stabilitäts-Test (Python ↔ Python). Wird zum echten C++-vs-Python-
Vergleich, sobald `osim2004-trace/verteil/*.c` gebaut werden kann.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from osim_engine.core.verteilung import (
    OVerteilungKonstant,
    OVerteilungGleich,
    OVerteilungNormal,
    OVerteilungNormalGrenz,
    OVerteilungExponential,
    OVerteilungLogNormal,
    OVerteilungExponentialVersch,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _read_fixture(name: str) -> list[dict]:
    with (FIXTURES / name).open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh]


def _assert_samples_match(verteilung, fixture_records: list[dict]) -> None:
    for ref in fixture_records:
        sample = verteilung.hole_zufallswert()
        assert sample == ref["sample"], (
            f"Divergenz bei call_no={ref['call_no']}: "
            f"Python={sample!r} vs Fixture={ref['sample']!r}"
        )


# ----------------------------------------------------------------------
# Konstant
# ----------------------------------------------------------------------


def test_verteilung_konstant_bit_exact() -> None:
    fixture = _read_fixture("verteil_konstant_5.jsonl")
    v = OVerteilungKonstant(wert_basis=5.0)
    _assert_samples_match(v, fixture)


def test_verteilung_konstant_returns_basis_independent_of_lcg() -> None:
    """Konstant nutzt den LCG nicht — Werte bleiben gleich bei beliebigem Seed."""
    v = OVerteilungKonstant(wert_basis=42.0)
    samples = [v.hole_zufallswert() for _ in range(100)]
    assert all(s == 42.0 for s in samples)


# ----------------------------------------------------------------------
# Gleich
# ----------------------------------------------------------------------


def test_verteilung_gleich_bit_exact() -> None:
    fixture = _read_fixture("verteil_gleich_10.jsonl")
    v = OVerteilungGleich(wert_basis=10.0)
    _assert_samples_match(v, fixture)


def test_verteilung_gleich_in_range() -> None:
    """Alle Samples in [0, wert_basis)."""
    v = OVerteilungGleich(wert_basis=10.0)
    samples = [v.hole_zufallswert() for _ in range(1000)]
    assert all(0.0 <= s < 10.0 for s in samples)


# ----------------------------------------------------------------------
# Normal (Jeerg-Rejection)
# ----------------------------------------------------------------------


def test_verteilung_normal_bit_exact() -> None:
    fixture = _read_fixture("verteil_normal_ew100_sa10.jsonl")
    v = OVerteilungNormal(wert_basis=100.0, std_abweich=10.0)
    _assert_samples_match(v, fixture)


def test_verteilung_normal_mean_within_reasonable_range() -> None:
    """Sanity: Mittelwert ~ ew bei ausreichend vielen Samples."""
    v = OVerteilungNormal(wert_basis=100.0, std_abweich=10.0)
    samples = [v.hole_zufallswert() for _ in range(1000)]
    mean = sum(samples) / len(samples)
    # großzügige Toleranz (Box-Müller-Polynom + Jeerg-Rejection biasen leicht)
    assert 80.0 < mean < 120.0


# ----------------------------------------------------------------------
# Normal mit Grenzen
# ----------------------------------------------------------------------


def test_verteilung_normal_grenz_bit_exact() -> None:
    fixture = _read_fixture(
        "verteil_normal_grenz_ew100_sa20_min50_max200.jsonl"
    )
    v = OVerteilungNormalGrenz(
        wert_basis=100.0, std_abweich=20.0, min_grenze=50.0, max_grenze=200.0
    )
    _assert_samples_match(v, fixture)


def test_verteilung_normal_grenz_within_bounds() -> None:
    """Alle Samples in [min, max] (oder == ew als Fallback nach 10000 Versuchen)."""
    v = OVerteilungNormalGrenz(
        wert_basis=100.0, std_abweich=20.0, min_grenze=50.0, max_grenze=200.0
    )
    samples = [v.hole_zufallswert() for _ in range(1000)]
    for s in samples:
        # entweder im Bereich, oder Fallback auf ew=100
        assert (50.0 <= s <= 200.0) or s == 100.0


# ----------------------------------------------------------------------
# Exponential
# ----------------------------------------------------------------------


def test_verteilung_expo_bit_exact() -> None:
    fixture = _read_fixture("verteil_expo_ew100.jsonl")
    v = OVerteilungExponential(wert_basis=100.0)
    _assert_samples_match(v, fixture)


def test_verteilung_expo_positive() -> None:
    """Expo-Samples mit rv=0 sind positiv."""
    v = OVerteilungExponential(wert_basis=100.0)
    samples = [v.hole_zufallswert() for _ in range(1000)]
    assert all(s > 0.0 for s in samples)


# ----------------------------------------------------------------------
# Log-Normal
# ----------------------------------------------------------------------


def test_verteilung_log_normal_bit_exact() -> None:
    fixture = _read_fixture("verteil_log_normal_ew100_sa10.jsonl")
    v = OVerteilungLogNormal(wert_basis=100.0, std_abweich=10.0)
    _assert_samples_match(v, fixture)


def test_verteilung_log_normal_with_zero_basis_returns_zero() -> None:
    """Bei ew <= 0: VertLogNorm liefert 0.0 (OFC/OVerteil.cpp:373)."""
    v = OVerteilungLogNormal(wert_basis=0.0, std_abweich=1.0)
    assert v.hole_zufallswert() == 0.0


# ----------------------------------------------------------------------
# Exponential mit Rechtsverschiebung
# ----------------------------------------------------------------------


def test_verteilung_expo_versch_bit_exact() -> None:
    fixture = _read_fixture("verteil_expo_versch_ew100_rv10.jsonl")
    v = OVerteilungExponentialVersch(wert_basis=100.0, rechts_versch=10.0)
    _assert_samples_match(v, fixture)
