"""Unit-Test: gantt_durchlauf-start trägt die Kennzahl-Bezugsfelder.

KENNZAHLEN-SPEC §3: damit das UI die OSim-Durchlaufzeit-Kennzahlen wahlweise
nach Auslöser ODER nach Durchlaufplan gruppieren kann (PDurchlaufplanLList,
PDurchlaufplan.cpp:2072-2117) und die Liefertermintreue berechnen kann
(PAusloeser.cpp:163-177), muss der GanttListener am start-Frame folgende
read-only abgeleiteten Felder mitschreiben:

    durchlaufplan_oid  = ausloeser.m_lDlpl.oid
    durchlaufplan_id   = ausloeser.m_lDlpl.m_sName
    soll_end_termin    = start_time + m_iSollDauer   (1:1 PAusloeser.cpp:1457)
                         bzw. -1 wenn m_iSollDauer == -1 (KPI deaktiviert)

Self-contained: konstruiert den GanttListener mit Fakes (kein OTX-Lauf nötig).
"""

from __future__ import annotations

from osim_engine.streaming.listeners.gantt import GanttListener


# ---------------------------------------------------------------------------
# Fakes (minimal, nur was der Listener liest)
# ---------------------------------------------------------------------------


class _FakeSeq:
    def __init__(self) -> None:
        self._n = 0

    def next(self) -> int:
        self._n += 1
        return self._n


class _FakeWriter:
    def __init__(self) -> None:
        self.frames: list = []

    def write(self, frame) -> None:  # noqa: ANN001
        self.frames.append(frame)


class _FakeMeta:
    def __init__(self, name: str) -> None:
        self.m_name = name


class _FakeEvent:
    def __init__(self, obj, meta_name: str) -> None:  # noqa: ANN001
        self.m_obj = obj
        self.m_meta = _FakeMeta(meta_name)


class _FakePool:
    def __init__(self) -> None:
        self._curr = None

    def set_curr(self, event) -> None:  # noqa: ANN001
        self._curr = event

    def curr_exists(self) -> bool:
        return self._curr is not None

    def get_curr(self):
        return self._curr


class _FakeSim:
    def __init__(self) -> None:
        self._evt_pool = _FakePool()
        self._t = 0

    def evt_curr_time(self) -> int:
        return self._t


class _FakeDlpl:
    def __init__(self, name: str, oid: int) -> None:
        self.m_sName = name
        self.oid = oid


class _FakeAusloeser:
    def __init__(self, name: str, oid: int, dlpl=None, soll_dauer: int = 0) -> None:  # noqa: ANN001
        self.m_sName = name
        self.oid = oid
        self.m_lDlpl = dlpl
        self.m_iSollDauer = soll_dauer


class _FakeProz:
    """In-Bearbeitung-Prozess (m_eStatus == 1 == PT_BEARB)."""

    def __init__(self, name: str, ausloeser=None, beginn: int = 0) -> None:  # noqa: ANN001
        self.m_sName = name
        self.m_eStatus = 1  # PT_BEARB
        self.m_iBearbeitBeginn = beginn
        self.m_iZeitinhaltGesamt = 0
        self.m_oRelationen: list = []
        self.m_oKnoten = None
        self._ausl = ausloeser

    def get_ausloeser(self):
        return self._ausl


def _make():
    sim = _FakeSim()
    seq = _FakeSeq()
    writer = _FakeWriter()
    listener = GanttListener(seq, writer)
    listener.m_sim = sim
    return sim, writer, listener


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_start_frame_traegt_durchlaufplan_oid_und_soll_termin():
    """durchlaufplan_oid/-id aus ausloeser.m_lDlpl; soll = start + m_iSollDauer."""
    sim, writer, listener = _make()
    dlpl = _FakeDlpl("Fertigung-A", 7)
    ausl = _FakeAusloeser("FA-100", 42, dlpl=dlpl, soll_dauer=5000)
    proz = _FakeProz("OP-10", ausloeser=ausl, beginn=1000)
    sim._t = 1000
    sim._evt_pool.set_curr(_FakeEvent(proz, "x"))

    listener.on_sim_ereig()

    assert len(writer.frames) == 1
    v = writer.frames[0].v
    assert v["kind"] == "start"
    assert v["auftrag_oid"] == 42
    assert v["durchlaufplan_oid"] == 7
    assert v["durchlaufplan_id"] == "Fertigung-A"
    # soll_end_termin = start_time(1000) + soll_dauer(5000) = 6000 (PAusloeser.cpp:1457)
    assert v["soll_end_termin"] == 6000


def test_soll_dauer_minus_eins_sentinel_bleibt_minus_eins():
    """m_iSollDauer == -1 deaktiviert die Liefertermintreue (PAusloeser.cpp:163-177)
    → soll_end_termin muss -1 sein, NICHT start-1."""
    sim, writer, listener = _make()
    ausl = _FakeAusloeser("FA-100", 42, dlpl=_FakeDlpl("P", 3), soll_dauer=-1)
    proz = _FakeProz("OP-10", ausloeser=ausl, beginn=2000)
    sim._t = 2000
    sim._evt_pool.set_curr(_FakeEvent(proz, "x"))

    listener.on_sim_ereig()

    assert writer.frames[0].v["soll_end_termin"] == -1


def test_defensiv_ohne_ausloeser_keine_crashes():
    """Kein Auslöser → Durchlaufplan-/Soll-Felder defensiv -1 / None (kein Crash)."""
    sim, writer, listener = _make()
    proz = _FakeProz("OP-10", ausloeser=None, beginn=0)
    sim._t = 0
    sim._evt_pool.set_curr(_FakeEvent(proz, "x"))

    listener.on_sim_ereig()

    v = writer.frames[0].v
    assert v["durchlaufplan_oid"] == -1
    assert v["durchlaufplan_id"] is None
    assert v["soll_end_termin"] == -1


def test_ausloeser_ohne_dlpl_defensiv():
    """Auslöser ohne m_lDlpl → oid -1 / id None, soll dennoch berechnet."""
    sim, writer, listener = _make()
    ausl = _FakeAusloeser("FA-100", 42, dlpl=None, soll_dauer=100)
    proz = _FakeProz("OP-10", ausloeser=ausl, beginn=500)
    sim._t = 500
    sim._evt_pool.set_curr(_FakeEvent(proz, "x"))

    listener.on_sim_ereig()

    v = writer.frames[0].v
    assert v["durchlaufplan_oid"] == -1
    assert v["durchlaufplan_id"] is None
    assert v["soll_end_termin"] == 600  # 500 + 100
