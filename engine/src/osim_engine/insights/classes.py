"""OSimINSIGHTS-Klassen — Slice P5-N (geschlossen via D-3.2).

Provenienz: `OSimINSIGHTS/I*.{odh,cpp}` und die `ISimulatorViewerAusw*`-Familie
(11 Reporting-Sichten, SPEC §6.3 / D-3.3).

Ursprünglich waren diese Klassen reine Marker-Stubs (P5-N). Mit Phase 01-03
(D-3.2) werden sie zu **echten Period-Aggregatoren**: jede Klasse hostet
inkrementelle Counter (O(1)-Update pro Sim-Event, KEIN Re-Scan am Period-Ende —
D-3.1 / SPEC §7.3) und liefert per `snapshot(period_num)` ein dict mit den
SPEC-§6.3-Feldern. `reset_period()` setzt die Counter für die nächste Periode
zurück (period-only-Aggregation, D-3.4 — keine Sliding-Windows in Phase 01).

Die Klassen-Identität/Vererbung bleibt unverändert (bestehende OTX-Loader-
Konsumenten und `test_p5n_insights.py` brechen nicht) — die Counter sind reine
additive Erweiterungen.

Aggregator-Arithmetik (gepinnt in `tests/integration/test_streaming_kpi.py`):
    - Auftrags-Aggregate: `durchlaufzeit_avg = durchlaufzeit_sum / count_abgeschlossen`
    - Betriebsmittel: `auslastung_pct = bearbeitungs_zeit / period_len * 100`
Diese Ableitung entspricht der C++-Referenz `ISimulatorViewerAusw*` und ist für
den AC-9-Spot-Check deterministisch.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.simulator import PSimulator


class ISimObj(PSimObj):
    """C++: ISimObj — OSimINSIGHTS/ISimObj.{odh,cpp}.

    Aggregator-Basis: stellt `snapshot(period_num)` / `reset_period()` als
    minimalen Default bereit, sodass jede Reporting-Sicht period-end einen
    kind-tauglichen Frame liefern kann (partial für noch-Skelett-Slices).
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)

    # ------------------------------------------------------------------
    # Aggregator-Protokoll (D-3.1/D-3.4) — Default: leerer Snapshot.
    # ------------------------------------------------------------------

    def snapshot(self, period_num: int) -> dict:
        """Minimaler period-end-Snapshot (nur `period_num`). Subklassen
        erweitern um ihre SPEC-§6.3-Felder."""
        return {"period_num": period_num}

    def reset_period(self) -> None:
        """Counter für die neue Periode zurücksetzen (period-only, D-3.4).
        Default no-op (Subklassen überschreiben)."""
        return None


class IInfo(ISimObj):
    """C++: IInfo — Reporting-Info-Container."""


class ISimulator(ISimObj):
    """C++: ISimulator — Top-Level-Reporting-Sicht (``gesamt``-Roll-up).

    Aggregiert period-weite Gesamtzahlen über alle Auftrags-/Ressourcen-Sichten.
    In Phase 01 minimal: Auftrags-Durchsatz + offene Aufträge als Gesamt-KPI.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.count_auftraege_gesamt: int = 0
        self.count_auftraege_fertig: int = 0

    def update_auftrag_gesamt(self) -> None:
        self.count_auftraege_gesamt += 1

    def update_auftrag_fertig(self) -> None:
        self.count_auftraege_fertig += 1

    def snapshot(self, period_num: int) -> dict:
        offen = self.count_auftraege_gesamt - self.count_auftraege_fertig
        return {
            "period_num": period_num,
            "count_auftraege_gesamt": self.count_auftraege_gesamt,
            "count_auftraege_fertig": self.count_auftraege_fertig,
            "count_auftraege_offen": offen,
        }

    def reset_period(self) -> None:
        self.count_auftraege_gesamt = 0
        self.count_auftraege_fertig = 0


class IArbeitszeit(ISimObj):
    """C++: IArbeitszeit — Arbeitszeit-Reporting (``schicht``-Quelle).

    Schicht-Aggregat: Soll-/Iststunden pro Periode. Source-Slice (P5-M
    Arbeitszeit) heute Skelett → partial-Snapshot mit Null-Default.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.sollstunden: float = 0.0
        self.iststunden: float = 0.0

    def update_sollstunden(self, stunden: float) -> None:
        self.sollstunden += stunden

    def update_iststunden(self, stunden: float) -> None:
        self.iststunden += stunden

    def snapshot(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            "sollstunden": round(self.sollstunden, 2),
            "iststunden": round(self.iststunden, 2),
        }

    def reset_period(self) -> None:
        self.sollstunden = 0.0
        self.iststunden = 0.0


class IAuftrag(ISimObj):
    """C++: IAuftrag — Auftrags-Reporting (Period-Durchsatz-Aggregat).

    Gemeinsame Counter-Mechanik für alle Auftrags-Sichten (prod_auftrag /
    best_auftrag / kauf / eigen). Felder nach SPEC §6.3:
    count_gesamt/abgeschlossen/laufend/verspaetet + durchlaufzeit_avg/max/min.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.count_gesamt: int = 0
        self.count_abgeschlossen: int = 0
        self.count_verspaetet: int = 0
        self.durchlaufzeit_sum: int = 0
        self.durchlaufzeit_max: int = 0
        self.durchlaufzeit_min: int = 0

    # ---- O(1)-Updates pro Event (D-3.1) -------------------------------

    def update_auftrag_start(self) -> None:
        """Ein Auftrag dieser Sicht ist gestartet (zählt zu count_gesamt)."""
        self.count_gesamt += 1

    def update_auftrag_ende(self, durchlaufzeit: int, verspaetet: bool = False) -> None:
        """Ein Auftrag ist abgeschlossen. O(1): nur Summen/Extrema fortschreiben."""
        self.count_abgeschlossen += 1
        if verspaetet:
            self.count_verspaetet += 1
        self.durchlaufzeit_sum += durchlaufzeit
        if self.count_abgeschlossen == 1:
            self.durchlaufzeit_min = durchlaufzeit
            self.durchlaufzeit_max = durchlaufzeit
        else:
            self.durchlaufzeit_min = min(self.durchlaufzeit_min, durchlaufzeit)
            self.durchlaufzeit_max = max(self.durchlaufzeit_max, durchlaufzeit)

    def snapshot(self, period_num: int) -> dict:
        avg = (
            self.durchlaufzeit_sum // self.count_abgeschlossen
            if self.count_abgeschlossen
            else 0
        )
        return {
            "period_num": period_num,
            "count_gesamt": self.count_gesamt,
            "count_abgeschlossen": self.count_abgeschlossen,
            "count_laufend": self.count_gesamt - self.count_abgeschlossen,
            "count_verspaetet": self.count_verspaetet,
            "durchlaufzeit_avg": avg,
            "durchlaufzeit_max": self.durchlaufzeit_max,
            "durchlaufzeit_min": self.durchlaufzeit_min if self.count_abgeschlossen else 0,
        }

    def reset_period(self) -> None:
        self.count_gesamt = 0
        self.count_abgeschlossen = 0
        self.count_verspaetet = 0
        self.durchlaufzeit_sum = 0
        self.durchlaufzeit_max = 0
        self.durchlaufzeit_min = 0


class IBestellauftrag(IAuftrag):
    """C++: IBestellauftrag — Bestell-Reporting (``best_auftrag``-Sicht)."""


class IFertigungsauftrag(IAuftrag):
    """C++: IFertigungsauftrag — Fertigungs-Reporting (``prod_auftrag``-Sicht)."""


class IBetriebsmittel(ISimObj):
    """C++: IBetriebsmittel — Maschinen-Reporting (``betr``-Sicht).

    Period-Auslastung nach SPEC §6.3: auslastung_pct/ruest_pct/stillstand_pct
    relativ zur Periodenlänge + haupt_nutzungsart (dominanter Zeitanteil).
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.bearbeitungs_zeit: int = 0
        self.ruest_zeit: int = 0
        self.stillstand_zeit: int = 0
        self.period_len: int = 0

    def set_period_len(self, period_len: int) -> None:
        self.period_len = period_len

    def update_bearbeitung(self, dauer: int) -> None:
        self.bearbeitungs_zeit += dauer

    def update_ruest(self, dauer: int) -> None:
        self.ruest_zeit += dauer

    def update_stillstand(self, dauer: int) -> None:
        self.stillstand_zeit += dauer

    def _pct(self, teil: int) -> float:
        if not self.period_len:
            return 0.0
        return round(teil / self.period_len * 100.0, 1)

    def snapshot(self, period_num: int) -> dict:
        anteile = {
            "bearbeitung": self.bearbeitungs_zeit,
            "ruesten": self.ruest_zeit,
            "stillstand": self.stillstand_zeit,
        }
        haupt = max(anteile, key=lambda k: anteile[k]) if any(anteile.values()) else "stillstand"
        return {
            "period_num": period_num,
            "auslastung_pct": self._pct(self.bearbeitungs_zeit),
            "ruest_pct": self._pct(self.ruest_zeit),
            "stillstand_pct": self._pct(self.stillstand_zeit),
            "haupt_nutzungsart": haupt,
        }

    def reset_period(self) -> None:
        self.bearbeitungs_zeit = 0
        self.ruest_zeit = 0
        self.stillstand_zeit = 0
        # period_len bleibt erhalten (konstante Periodenlänge über den Lauf).


class IBetrPers(ISimObj):
    """C++: IBetrPers — Betrieb-Personal-Reporting (Schicht-Quelle)."""


class IDurchlaufplan(ISimObj):
    """C++: IDurchlaufplan — Plan-Reporting."""


class ILager(ISimObj):
    """C++: ILager — Lager-Reporting."""


class IPerson(ISimObj):
    """C++: IPerson — Personen-Reporting (``pers``-Sicht).

    Personal-Auslastung pro Periode. Source-Slice (P5-M) heute Skelett →
    partial-Snapshot mit Null-Default.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.einsatz_zeit: int = 0
        self.period_len: int = 0

    def set_period_len(self, period_len: int) -> None:
        self.period_len = period_len

    def update_einsatz(self, dauer: int) -> None:
        self.einsatz_zeit += dauer

    def snapshot(self, period_num: int) -> dict:
        pct = (
            round(self.einsatz_zeit / self.period_len * 100.0, 1)
            if self.period_len
            else 0.0
        )
        return {
            "period_num": period_num,
            "einsatz_zeit": self.einsatz_zeit,
            "auslastung_pct": pct,
        }

    def reset_period(self) -> None:
        self.einsatz_zeit = 0


class IProzess(ISimObj):
    """C++: IProzess — Prozess-Reporting.

    Quelle für die Aggregate ``wschlange`` (Warteschlangen-Länge) und
    ``nbearbeit`` (Nicht-Bearbeitungs-Zeit). Source-Slice heute Skelett →
    partial-Snapshot mit Null-Default.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.wartende: int = 0
        self.warte_max: int = 0
        self.nbearbeit_zeit: int = 0

    def update_warteschlange(self, laenge: int) -> None:
        self.wartende = laenge
        self.warte_max = max(self.warte_max, laenge)

    def update_nicht_bearbeitung(self, dauer: int) -> None:
        self.nbearbeit_zeit += dauer

    def snapshot(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            "warte_aktuell": self.wartende,
            "warte_max": self.warte_max,
            "nbearbeit_zeit": self.nbearbeit_zeit,
        }

    def reset_period(self) -> None:
        self.wartende = 0
        self.warte_max = 0
        self.nbearbeit_zeit = 0


class IGonzo(ISimObj):
    """C++: IGonzo — Reporting-Aggregate (``kalkulation``-Sicht).

    Kosten-/Kalkulations-Roll-up. Source-Slice heute Skelett →
    partial-Snapshot mit Null-Default.
    """

    def __init__(self, simulator: "PSimulator | None" = None) -> None:
        super().__init__(simulator)
        self.kosten_sum: float = 0.0

    def update_kosten(self, betrag: float) -> None:
        self.kosten_sum += betrag

    def snapshot(self, period_num: int) -> dict:
        return {
            "period_num": period_num,
            "kosten_sum": round(self.kosten_sum, 2),
        }

    def reset_period(self) -> None:
        self.kosten_sum = 0.0
