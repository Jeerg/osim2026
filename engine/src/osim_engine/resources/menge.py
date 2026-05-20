"""PRessMenge — Bestands-Ressource (Material/Lager).

Provenienz: `OSimPro/PRessMenge.odh` + `OSimPro/PRessMenge.cpp`.

V5-Slice "Material/Speicher": eine `PRessMenge` modelliert einen
quantitativen Bestand (Stück, Liter, kg, …). Konsumenten- und
Erzeuger-Knoten greifen darauf über `PAssozMenge`-Assoziationen zu:

    - `PAssozMengeVerbr.OnProzBeginn` ruft `RessAbbuchen` (Verbrauch
      mit Prozess-Start)
    - `PAssozMengeErzgt.OnProzEnde` ruft `RessZubuchen` (Erzeugung mit
      Prozess-Ende)
    - `PAssozMengeAbfr.RessVerfuegbar` prüft nur, ohne abzubuchen

Bestand:
    - `m_iBestandAnfang` — Initial-Bestand am Sim-Beginn
    - `m_iBestandAktuell` — laufender Bestand
    - `m_iBestandMax` — Kapazität (`-1` = unbegrenzt)

Wenn `m_iBestandMax != -1` und das Lager voll ist, schlägt eine Zubuchungs-
Anfrage fehl — der Erzeuger-Prozess wandert in die zentrale Warteschlange.
`RessAbbuchen` triggert dann `ProzWartAusloesen`, damit der wartende Erzeuger
nach genug Platz erneut startet. Analog triggert `RessZubuchen` das
ProzWartAusloesen für wartende Verbraucher.

Die `m_lErlZubuchung`-Logik aus C++ (Reservierung verkauft-aber-noch-nicht-
gebucht) ist in V5 1:1 portiert — relevant nur für bounded storage.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from osim_engine.resources.ressource import PRessource

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


@dataclass
class _ErlZubuchung:
    """C++: `PRMenge_ErlZubuchung` — vorgemerkte Zubuchung.

    Wenn `RessVerfuegbar(menge, proz, abbuchen=False)` Erfolg meldet, hält
    die Liste fest *wer* zubuchen darf, damit die Belegung der freien
    Plätze konsistent bleibt — sonst könnten zwei parallele Erzeuger
    denselben Platz reservieren. Wird in `RessZubuchen` wieder entfernt.
    """

    m_oProz: "PtProzess"
    m_iMenge: int


class PRessMenge(PRessource):
    """C++-Äquivalent: `PRessMenge` (`PRessMenge.odh:33`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)

        # Attribute (PRessMenge.odh:44-50)
        self.m_iBestandAktuell: int = 0
        self.m_iVirtBestandAktuell: int = 0
        self.m_iBestandAnfang: int = 0
        self.m_iBestandMax: int = -1  # -1 = unbegrenzt
        self.m_fAnfangswert: float = 0.0
        self.m_fKostenZusatz: float = 0.0

        # Protokoll-Counter (PRessMenge.odh:51-59)
        self.m_iPtkKummVerbMengeGesamt: int = 0
        self.m_iPtkKummErzgMengeGesamt: int = 0
        self.m_fPtkKumm_MengAb_x_ZeitAb: float = 0.0
        self.m_fPtkKumm_MengZu_x_ZeitZu: float = 0.0
        self.m_iPtkAnfragenZu: int = 0
        self.m_iPtkAbgelehnteAnfrZu: int = 0
        self.m_iPtkAnfragenAb: int = 0
        self.m_iPtkAbgelehnteAnfrAb: int = 0

        # Reservierte Zubuchungen (für bounded storage)
        self.m_lErlZubuchung: list[_ErlZubuchung] = []

    # ------------------------------------------------------------------
    # Lifecycle — PRessMenge.odh OnSimBegin / OnRecInit
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim, deep: bool = True) -> None:
        """PRessMenge.odh:85-113. Setzt Bestand auf Anfangsbestand,
        nullt alle Counter, leert Reservierungs-Liste.
        """
        super().on_sim_begin(sim, deep=deep)
        self.m_iBestandAktuell = self.m_iBestandAnfang
        self.m_iVirtBestandAktuell = self.m_iBestandAnfang
        self.m_iPtkKummVerbMengeGesamt = 0
        self.m_iPtkKummErzgMengeGesamt = 0
        self.m_fPtkKumm_MengAb_x_ZeitAb = 0.0
        self.m_fPtkKumm_MengZu_x_ZeitZu = 0.0
        self.m_iPtkAnfragenZu = 0
        self.m_iPtkAbgelehnteAnfrZu = 0
        self.m_iPtkAnfragenAb = 0
        self.m_iPtkAbgelehnteAnfrAb = 0
        self.m_lErlZubuchung.clear()

    def on_rec_init(self, deep: bool = True) -> None:
        """PRessMenge.odh:116-126. Nullt nur Protokoll-Counter (Bestand
        wird NICHT zurückgesetzt — der Stand bleibt aus Vor-Aufzeichnungs-
        Phase erhalten).
        """
        self.m_iPtkKummVerbMengeGesamt = 0
        self.m_iPtkKummErzgMengeGesamt = 0
        self.m_fPtkKumm_MengAb_x_ZeitAb = 0.0
        self.m_fPtkKumm_MengZu_x_ZeitZu = 0.0
        self.m_iPtkAnfragenZu = 0
        self.m_iPtkAbgelehnteAnfrZu = 0
        self.m_iPtkAnfragenAb = 0
        self.m_iPtkAbgelehnteAnfrAb = 0

    # ------------------------------------------------------------------
    # Sim-Methoden — PRessMenge.cpp:27-156
    # ------------------------------------------------------------------

    def ress_verfuegbar(
        self,
        i_menge: int,
        proz: "PtProzess",
        abbuchen: bool = True,
    ) -> bool:
        """C++: `PRessMenge::RessVerfuegbar` (PRessMenge.cpp:27-75).

        Zwei Modi:
            - abbuchen=True (Verbrauchsanfrage): liefert TRUE wenn
              `m_iBestandAktuell >= i_menge`. Counter `m_iPtkAnfragenAb`
              wird erhöht; `m_iPtkAbgelehnteAnfrAb` bei FALSE.
            - abbuchen=False (Zubuchungsanfrage): liefert TRUE wenn
              `m_iBestandMax == -1` (unbegrenzt) ODER wenn
              `m_iBestandMax - m_iBestandAktuell - sum(reservierungen) >= i_menge`.
              Bei TRUE wird die Zubuchung in `m_lErlZubuchung` reserviert.
              Counter `m_iPtkAnfragenZu`; `m_iPtkAbgelehnteAnfrZu` bei FALSE.
        """
        if abbuchen:
            self.m_iPtkAnfragenAb += 1
            if self.m_iBestandAktuell >= i_menge:
                return True
            self.m_iPtkAbgelehnteAnfrAb += 1
            return False

        self.m_iPtkAnfragenZu += 1
        if self.m_iBestandMax == -1:
            return True

        i_menge_versp_zub = sum(e.m_iMenge for e in self.m_lErlZubuchung)
        if (self.m_iBestandMax - self.m_iBestandAktuell - i_menge_versp_zub) >= i_menge:
            self.m_lErlZubuchung.append(_ErlZubuchung(m_oProz=proz, m_iMenge=i_menge))
            return True

        self.m_iPtkAbgelehnteAnfrZu += 1
        return False

    def ress_abbuchen(self, i_menge: int, proz: "PtProzess") -> None:
        """C++: `PRessMenge::RessAbbuchen` (PRessMenge.cpp:78-101).

        Bestand reduzieren, Protokoll führen. Bei bounded storage wird
        `proz_wart_ausloesen` getriggert (Platz wieder frei → wartende
        Erzeuger könnten jetzt zubuchen).
        """
        assert i_menge > 0, f"ress_abbuchen mit i_menge={i_menge}"
        assert self.m_iBestandAktuell >= i_menge, (
            f"Bestand {self.m_iBestandAktuell} < abzubuchen {i_menge}"
        )

        self.m_iBestandAktuell -= i_menge
        self.m_iPtkKummVerbMengeGesamt += i_menge
        self.m_fPtkKumm_MengAb_x_ZeitAb += i_menge * self.p_simulator.evt_curr_time()

        self.p_simulator.bus.emit(
            "ress.abbuchen",
            ressource=self.m_sName,
            menge=i_menge,
            bestand=self.m_iBestandAktuell,
            proz_id=proz.m_sName,
        )

        if self.m_iBestandMax > -1:
            self.proz_wart_ausloesen()

    def ress_zubuchen(self, i_menge: int, proz: "PtProzess") -> None:
        """C++: `PRessMenge::RessZubuchen` (PRessMenge.cpp:104-155).

        Bestand erhöhen, Reservierung aus `m_lErlZubuchung` herausnehmen
        (falls bounded). Anschließend `proz_wart_ausloesen` — wartende
        Verbraucher könnten jetzt verbrauchen können.
        """
        assert i_menge > 0, f"ress_zubuchen mit i_menge={i_menge}"

        self.m_iBestandAktuell += i_menge

        if self.m_iBestandMax != -1:
            assert self.m_iBestandAktuell <= self.m_iBestandMax, (
                f"Bestand {self.m_iBestandAktuell} > Max {self.m_iBestandMax}"
            )
            # Reservierung finden + entfernen
            found_idx = -1
            for i, erlzub in enumerate(self.m_lErlZubuchung):
                if (
                    erlzub.m_oProz is proz
                    and erlzub.m_iMenge == i_menge
                    and erlzub.m_oProz.m_oTrigger is proz.m_oTrigger
                ):
                    found_idx = i
                    break
            assert found_idx >= 0, (
                f"PRessMenge.ress_zubuchen: keine passende Reservierung "
                f"für proz={proz.m_sName!r}, menge={i_menge} gefunden"
            )
            self.m_lErlZubuchung.pop(found_idx)

        self.m_iPtkKummErzgMengeGesamt += i_menge
        self.m_fPtkKumm_MengZu_x_ZeitZu += i_menge * self.p_simulator.evt_curr_time()

        self.p_simulator.bus.emit(
            "ress.zubuchen",
            ressource=self.m_sName,
            menge=i_menge,
            bestand=self.m_iBestandAktuell,
            proz_id=proz.m_sName,
        )

        self.proz_wart_ausloesen()

    # ------------------------------------------------------------------
    # ProzWartAusloesen — analog PRessBeleg
    # ------------------------------------------------------------------

    def proz_wart_ausloesen(self) -> None:
        """C++: `PRessMenge::ProzWartAusloesen` (PRessMenge.cpp:168-197).

        Snapshot-Iteration der zentralen Warteschlange, prio-aufsteigend.
        Beachte: anders als bei `PRessBeleg.proz_wart_ausloesen` gibt es
        hier kein vorzeitiges Abbruch-Kriterium (Bestand kann mehrere
        Verbraucher in Folge speisen); deshalb durchläuft die C++-Schleife
        in jeder Priorität ALLE Wartenden, ohne `rsFrei`-Bedingung.
        """
        ws = self.p_simulator.m_oWarteSchl
        snapshot = list(ws)
        if not snapshot:
            return

        max_prio = max(p.m_iPrioritaet for p in snapshot)
        for prio in range(max_prio + 1):
            for proz in snapshot:
                if proz.m_iPrioritaet != prio:
                    continue
                if ws.find(proz) < 0:
                    continue
                assert proz.m_oKnoten is not None
                if proz.m_oKnoten.bearbeit_beginnen(proz):
                    ws.remove(proz)


class PRessLager(PRessMenge):
    """C++-Äquivalent: `PRessLager` (`PRessMenge.odh:348`).

    Subtyp mit Lagertyp-Marker (Eigen/Kauf/Puffer/Produkt). V5: nur Marker,
    keine zusätzliche Logik. Die Lagertyp-spezifische Kostenrechnung kommt
    erst mit dem KPI-Layer.
    """

    # Lagertyp-Konstanten (PRessMenge.odh:339-345)
    LT_EIGEN = 2000
    LT_KAUF = 2001
    LT_PUFFER = 2002
    LT_PRODUKT = 2003

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_ltTyp: int = PRessLager.LT_EIGEN
