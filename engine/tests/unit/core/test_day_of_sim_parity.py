"""Parity test for the Day-of-Sim arithmetic between OSim2004 (C++) and osim-engine.

Source of truth for C++ semantics — extracted from
``OSim2004/OSimV01(Fj)/OSimBase/OSimulator.cpp``:

- ``DateStr2CTime(m_sStartDate)`` (L650)
    Parses a German date string "DD.MM.YYYY" into an MFC ``CTime`` constructed
    at 00:00:00 LOCAL time of that day.
- ``Simtime2Date(int stime)`` (L700)
    ``basetime + CTimeSpan(stime)`` — sim-time is **seconds-since-basetime**.
- ``Date2Simtime(CTime *date)`` (L686)
    ``(date - basetime).GetTotalSeconds()`` — inverse of Simtime2Date.
- ``GetBeginOfDay(CTime *date)`` (L736)
    Builds a new CTime at ``00:00:00 LOCAL`` of the given date's year/month/day,
    returns ``(that - basetime).GetTotalSeconds()``.
- ``GetBeginOfDay(int szeit)`` (L761)
    ``GetBeginOfDay(Simtime2Date(szeit))``.
- ``GetEndOfDay(int szeit)`` (L732)
    ``GetBeginOfDay(szeit) + 86400`` (note: NOT DST-aware end-of-day).
- ``GetDaysFromBegin(int szeit)`` (L772)
    ``(Simtime2Date(szeit) - basetime).GetDays()`` — ``GetDays()`` is
    integer-division of total seconds by 86400.

This test pins **what the C++ algorithm would produce** and asserts that the
Python port returns the same value for every sim-time we probe — including
DST transitions, year boundaries, and very large offsets.

Functions that have NO Python equivalent today are marked ``xfail`` with
explicit "drift candidate" reason, so the test suite stays green while
documenting the gap.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from typing import Callable

import pytest

try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except ImportError:  # pragma: no cover
    pytest.skip("zoneinfo unavailable", allow_module_level=True)

from osim_engine.core.simulator import OSimulator

# Reference timezone — must match what an OSim2004 user runs the C++ binary
# under. Berlin covers DST and is the historical setting for STZ-RIM.
TZ = ZoneInfo("Europe/Berlin")

# Canonical start date matching OSimulator default (``m_sStartDate = "01.12.2003"``).
DEFAULT_START_DATE = "01.12.2003"


# ---------------------------------------------------------------------------
# Reference implementation — re-derives the C++ algorithm in pure Python.
# ---------------------------------------------------------------------------

def _parse_german_date(s: str) -> datetime:
    """C++ ``DateStr2CTime``: 'DD.MM.YYYY' -> CTime(YYYY, MM, DD, 0, 0, 0) LOCAL."""
    day, month, year = (int(x) for x in s.split("."))
    return datetime(year, month, day, 0, 0, 0, tzinfo=TZ)


def cpp_simtime_to_date(start_date: str, stime: int) -> datetime:
    """C++ ``Simtime2Date``: basetime + stime seconds."""
    base = _parse_german_date(start_date)
    return base + timedelta(seconds=stime)


def cpp_date_to_simtime(start_date: str, when: datetime) -> int:
    """C++ ``Date2Simtime``: (when - basetime) in total seconds."""
    base = _parse_german_date(start_date)
    return int((when - base).total_seconds())


def cpp_get_begin_of_day_int(start_date: str, szeit: int) -> int:
    """C++ ``GetBeginOfDay(int szeit)`` — floor szeit to start-of-local-day in
    sim-seconds.

    Note: C++ extracts year/month/day from the CTime and builds a NEW CTime at
    00:00 LOCAL. Across DST transitions the result is what 'midnight local
    time' actually maps to in UTC, which is *not* simply ``(szeit // 86400) * 86400``.
    """
    date = cpp_simtime_to_date(start_date, szeit)
    midnight = datetime(date.year, date.month, date.day, 0, 0, 0, tzinfo=TZ)
    return cpp_date_to_simtime(start_date, midnight)


def cpp_get_end_of_day_int(start_date: str, szeit: int) -> int:
    """C++ ``GetEndOfDay(int szeit)`` = ``GetBeginOfDay(szeit) + 86400``.

    Quirk: this is NOT 'next midnight' across DST — it's exactly 86400 seconds
    later. Documented intentionally to preserve C++ behavior bit-for-bit.
    """
    return cpp_get_begin_of_day_int(start_date, szeit) + 86400


def cpp_get_days_from_begin(start_date: str, szeit: int) -> int:
    """C++ ``GetDaysFromBegin(int szeit)`` = total seconds // 86400."""
    date = cpp_simtime_to_date(start_date, szeit)
    base = _parse_german_date(start_date)
    return int((date - base).total_seconds()) // 86400


# ---------------------------------------------------------------------------
# Probe vectors — sim-times across DST, year boundary, large offset.
# ---------------------------------------------------------------------------

# Probe set covers:
#   - sim-time 0 (Tagesbeginn)
#   - mid-day, exactly one day, exactly two days
#   - the first DST spring-forward AFTER start-date 01.12.2003 (28.03.2004)
#   - the first DST fall-back AFTER start-date (31.10.2004)
#   - a year boundary (31.12.2003 23:59 -> 01.01.2004)
#   - a 10-year offset
def _seconds_until(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> int:
    return cpp_date_to_simtime(
        DEFAULT_START_DATE,
        datetime(year, month, day, hour, minute, 0, tzinfo=TZ),
    )


PROBES: list[tuple[str, int]] = [
    ("sim-start 00:00", 0),
    ("sim-start +12h",  43_200),
    ("sim-start +1d",   86_400),
    ("sim-start +2d",   172_800),
    ("Silvester 23:59",  _seconds_until(2003, 12, 31, 23, 59)),
    ("Neujahr 00:01",    _seconds_until(2004, 1,  1,  0,  1)),
    ("DST spring fwd before 02:00", _seconds_until(2004, 3, 28, 1, 30)),
    ("DST spring fwd after  03:00", _seconds_until(2004, 3, 28, 3, 30)),
    ("DST fall back before 02:00",  _seconds_until(2004, 10, 31, 1, 30)),
    ("DST fall back after  03:00",  _seconds_until(2004, 10, 31, 3, 30)),
    ("10y offset (01.12.2013 12:00)", _seconds_until(2013, 12, 1, 12, 0)),
]


# ---------------------------------------------------------------------------
# Tests — Python port vs C++ reference.
# ---------------------------------------------------------------------------

@pytest.fixture
def sim() -> OSimulator:
    s = OSimulator()
    s.m_sStartDate = DEFAULT_START_DATE  # explicit, matches the default
    return s


@pytest.mark.parametrize("label,szeit", PROBES, ids=[p[0] for p in PROBES])
def test_get_days_from_begin_matches_cpp(sim: OSimulator, label: str, szeit: int) -> None:
    """``get_days_from_begin`` must match C++ ``GetDaysFromBegin`` bit-for-bit."""
    expected = cpp_get_days_from_begin(DEFAULT_START_DATE, szeit)
    actual = sim.get_days_from_begin(szeit)
    assert actual == expected, (
        f"[{label}] szeit={szeit}: "
        f"Python returned {actual}, C++ would return {expected}"
    )


@pytest.mark.parametrize("label,szeit", PROBES, ids=[p[0] for p in PROBES])
@pytest.mark.xfail(
    reason="DRIFT CANDIDATE: simulator.get_begin_of_day() not yet ported from "
    "C++ OSimulator::GetBeginOfDay(int) at OSimulator.cpp L761. Spec frozen "
    "in this test; remove xfail when implemented.",
    strict=True,
    raises=AttributeError,
)
def test_get_begin_of_day_matches_cpp(sim: OSimulator, label: str, szeit: int) -> None:
    expected = cpp_get_begin_of_day_int(DEFAULT_START_DATE, szeit)
    actual = sim.get_begin_of_day(szeit)  # type: ignore[attr-defined]
    assert actual == expected, (
        f"[{label}] szeit={szeit}: "
        f"Python returned {actual}, C++ would return {expected}"
    )


@pytest.mark.parametrize("label,szeit", PROBES, ids=[p[0] for p in PROBES])
@pytest.mark.xfail(
    reason="DRIFT CANDIDATE: simulator.get_end_of_day() not yet ported from "
    "C++ OSimulator::GetEndOfDay(int) at OSimulator.cpp L732. Quirk to preserve: "
    "result is GetBeginOfDay+86400 NOT next-midnight (asymmetric across DST).",
    strict=True,
    raises=AttributeError,
)
def test_get_end_of_day_matches_cpp(sim: OSimulator, label: str, szeit: int) -> None:
    expected = cpp_get_end_of_day_int(DEFAULT_START_DATE, szeit)
    actual = sim.get_end_of_day(szeit)  # type: ignore[attr-defined]
    assert actual == expected, (
        f"[{label}] szeit={szeit}: "
        f"Python returned {actual}, C++ would return {expected}"
    )


@pytest.mark.parametrize("label,szeit", PROBES, ids=[p[0] for p in PROBES])
@pytest.mark.xfail(
    reason="DRIFT CANDIDATE: simulator.simtime_to_date() not yet ported from "
    "C++ OSimulator::Simtime2Date(int) at OSimulator.cpp L700.",
    strict=True,
    raises=AttributeError,
)
def test_simtime_to_date_matches_cpp(sim: OSimulator, label: str, szeit: int) -> None:
    expected = cpp_simtime_to_date(DEFAULT_START_DATE, szeit)
    actual = sim.simtime_to_date(szeit)  # type: ignore[attr-defined]
    assert actual == expected, (
        f"[{label}] szeit={szeit}: "
        f"Python returned {actual}, C++ would return {expected}"
    )


def test_date_to_simtime_round_trip() -> None:
    """``Date2Simtime`` and ``Simtime2Date`` must round-trip.

    Currently xfail-equivalent: ``date_to_simtime`` not present in port.
    Kept as a separate test so the round-trip property is documented even
    when only one direction exists.
    """
    sim_obj = OSimulator()
    sim_obj.m_sStartDate = DEFAULT_START_DATE
    for label, szeit in PROBES:
        try:
            date = sim_obj.simtime_to_date(szeit)  # type: ignore[attr-defined]
            back = sim_obj.date_to_simtime(date)   # type: ignore[attr-defined]
        except AttributeError:
            pytest.xfail("simtime_to_date / date_to_simtime not ported")
        assert back == szeit, f"[{label}] round-trip failed: {szeit} -> {date} -> {back}"


# ---------------------------------------------------------------------------
# Diagnostic-only report (run via:  pytest -s -m diagnostic ...)
# ---------------------------------------------------------------------------

@pytest.mark.diagnostic
def test_print_drift_report() -> None:
    """Print a side-by-side table of every probe — what C++ would compute vs
    what Python returns (or 'MISSING' for not-ported functions). Run with -s
    to see the table.
    """
    sim_obj = OSimulator()
    sim_obj.m_sStartDate = DEFAULT_START_DATE

    print("\nDay-of-Sim parity report (start_date={}):".format(DEFAULT_START_DATE))
    print(
        f"{'probe':<32} {'szeit':>11} | "
        f"{'days_cpp':>9} {'days_py':>9} | "
        f"{'BOD_cpp':>11} {'BOD_py':>11} | "
        f"{'EOD_cpp':>11} {'EOD_py':>11}"
    )

    def safe(call: Callable[[], object]) -> str:
        try:
            return str(call())
        except AttributeError:
            return "MISSING"

    for label, szeit in PROBES:
        days_cpp = cpp_get_days_from_begin(DEFAULT_START_DATE, szeit)
        days_py = sim_obj.get_days_from_begin(szeit)
        bod_cpp = cpp_get_begin_of_day_int(DEFAULT_START_DATE, szeit)
        eod_cpp = cpp_get_end_of_day_int(DEFAULT_START_DATE, szeit)
        bod_py = safe(lambda: sim_obj.get_begin_of_day(szeit))  # type: ignore[attr-defined]
        eod_py = safe(lambda: sim_obj.get_end_of_day(szeit))    # type: ignore[attr-defined]
        print(
            f"{label:<32} {szeit:>11} | "
            f"{days_cpp:>9} {days_py:>9} | "
            f"{bod_cpp:>11} {bod_py:>11} | "
            f"{eod_cpp:>11} {eod_py:>11}"
        )
