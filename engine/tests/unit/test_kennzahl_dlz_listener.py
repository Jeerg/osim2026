"""Unit-Test: KennzahlDlzListener liest die Auslöser-DLZ-Akkumulatoren.

Der Listener emittiert am Perioden-Ende EINEN ``kennzahl_dlz``-Frame mit einem
record je Auslöser, der mindestens eine Auslösung abgeschlossen hat
(``m_iPtkAusloesungCount > 0``). Quelle der Werte sind die vom Auslöser selbst
akkumulierten OSim-Größen (PAusloeser GetKnzMittlDlfz, m_dPtkDurchlaufzeit /
m_iPtkAusloesungCount). Read-only, kein Sim-Kern-Eingriff.

Self-contained: konstruiert den Listener mit Fakes (kein OTX-Lauf nötig).
"""

from __future__ import annotations

from osim_engine.streaming.listeners.kennzahl_dlz import KennzahlDlzListener


class _FakeSeq:
    def __init__(self) -> None:
        self._n = 0

    def next(self) -> int:
        self._n += 1
        return self._n


class _FakeWriter:
    def __init__(self) -> None:
        self.frames: list = []
        self.flushed = 0

    def write(self, frame) -> None:  # noqa: ANN001
        self.frames.append(frame)

    def flush(self) -> None:
        self.flushed += 1


class _FakeDlpl:
    def __init__(self, name: str, oid: int = -1) -> None:
        self.m_sName = name
        self.oid = oid


class _FakeAusl:
    def __init__(self, name, oid, dlz_sum, count, dlpl=None) -> None:  # noqa: ANN001
        self.m_sName = name
        self.oid = oid
        self.m_dPtkDurchlaufzeit = dlz_sum
        self.m_iPtkAusloesungCount = count
        self.m_lDlpl = dlpl


class _FakeSim:
    def __init__(self, ausl, period_num=1) -> None:  # noqa: ANN001
        self.m_lAusl = ausl
        self.m_periodNum = period_num
        self._t = 2678400

    def evt_curr_time(self) -> int:
        return self._t


def _make(ausl, period_num=1):  # noqa: ANN001
    writer = _FakeWriter()
    listener = KennzahlDlzListener(_FakeSeq(), writer)
    listener.m_sim = _FakeSim(ausl, period_num)
    return writer, listener


def test_emit_ein_frame_pro_periode_mit_records():
    """Ein Frame, kind=period, period_num = m_periodNum-1, ein record je Auslöser."""
    ausl = [
        _FakeAusl('"A"', 47, dlz_sum=2935.0, count=1, dlpl=_FakeDlpl("Plan-X", 7)),
        _FakeAusl('"B"', 53, dlz_sum=5572.0, count=2, dlpl=_FakeDlpl("Plan-Y")),
    ]
    writer, listener = _make(ausl, period_num=1)

    listener.on_period_end(2678400)

    assert len(writer.frames) == 1
    f = writer.frames[0]
    assert f.stream == "kennzahl_dlz"
    assert f.v["kind"] == "period"
    assert f.v["period_num"] == 0  # m_periodNum(1) - 1
    recs = f.v["records"]
    assert recs[0] == {
        "ausloeser": '"A"', "ausloeser_oid": 47,
        "durchlaufplan": "Plan-X", "durchlaufplan_oid": 7,
        "dlz_sum": 2935.0, "count": 1,
    }
    assert recs[1]["durchlaufplan"] == "Plan-Y"
    assert recs[1]["durchlaufplan_oid"] == -1  # Fake-Dlpl ohne oid → Default -1
    assert recs[1]["count"] == 2
    assert writer.flushed == 1


def test_ausloeser_ohne_abschluss_uebersprungen():
    """count == 0 → kein record (OSim: 0/0 ist keine DLZ)."""
    ausl = [
        _FakeAusl('"A"', 1, dlz_sum=0.0, count=0),
        _FakeAusl('"B"', 2, dlz_sum=100.0, count=1, dlpl=_FakeDlpl("P", 3)),
    ]
    writer, listener = _make(ausl)

    listener.on_period_end(2678400)

    recs = writer.frames[0].v["records"]
    assert [r["ausloeser"] for r in recs] == ['"B"']


def test_leere_slots_und_kein_plan_defensiv():
    """Auslöser ohne Namen (leerer Slot) übersprungen; ohne m_lDlpl → null/-1."""
    class _NoName:
        m_sName = None
        oid = -1
        m_dPtkDurchlaufzeit = 5.0
        m_iPtkAusloesungCount = 1
        m_lDlpl = None

    ausl = [_NoName(), _FakeAusl('"C"', 9, dlz_sum=300.0, count=3, dlpl=None)]
    writer, listener = _make(ausl)

    listener.on_period_end(2678400)

    recs = writer.frames[0].v["records"]
    assert len(recs) == 1
    assert recs[0]["ausloeser"] == '"C"'
    assert recs[0]["durchlaufplan"] is None
    assert recs[0]["durchlaufplan_oid"] == -1


def test_leere_ausloeser_liste_frame_mit_leeren_records():
    """Keine Auslöser → trotzdem ein Frame mit records=[] (Stream bleibt present)."""
    writer, listener = _make([])

    listener.on_period_end(2678400)

    assert len(writer.frames) == 1
    assert writer.frames[0].v["records"] == []
