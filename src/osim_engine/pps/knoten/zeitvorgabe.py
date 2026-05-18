"""PDpKnZeitvorgabe-Familie — Knoten mit Durchführungszeit-Vorgabe.

Provenienz: `OSimPro/PDpKnZeitvorgabe.odh` + `OSimPro/PDpKnZeitvorgabe.cpp`.
Siehe `docs/CONTEXT-P1-SUPPLEMENT.md` § 1 für die volle Sektion.

V1 implementiert PDpKnZeitvorgabe (abstract) + PDpKnKonstant.
PDpKnVerteilung folgt in V2.
P4-C ergänzt PDpKnMenge (Durchführungszeit = Menge × Dfz/Einheit) und
PDpKnMengeRuesten (zusätzliche Rüstzeit).
"""

from __future__ import annotations

from abc import abstractmethod
from typing import TYPE_CHECKING, Any

from osim_engine.pps.knoten.base import PDlplKnoten

if TYPE_CHECKING:
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator


class PDpKnZeitvorgabe(PDlplKnoten):
    """Abstract: PDlplKnoten mit Durchführungszeit-Vorgabe.

    C++-Äquivalent: `class PDpKnZeitvorgabe : public PDlplKnoten`
    (PDpKnZeitvorgabe.odh:19).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iZeitRedBeiProzEnde: int = 0
        self.m_fZeitstressparameter: float = 0.0
        self.m_iErmuedungsparameter: int = 0
        self.m_iPtkKumDurchfuehrungszeit: int = 0
        self.m_iPtkDurchfuehrungszeitCount: int = 0
        self.m_lKlassZeit: Any = None  # PKlasseZeit (P4)

    @abstractmethod
    def get_durchfuehrungszeit(self, proz: "PtProzess") -> int:
        """Pure virtual. C++: `int GetDurchfuehrungszeit(oprPtProzess) = 0`."""
        ...

    def on_rec_init(self, deep: bool = True) -> None:
        super().on_rec_init(deep=deep)
        self.m_iPtkKumDurchfuehrungszeit = 0
        self.m_iPtkDurchfuehrungszeitCount = 0

    def proz_weitergeben(self, proz_ober: "PtProzess | None", ent: Any) -> None:
        """Instanziiert PtProzZeitvorgabe.

        C++: PDpKnZeitvorgabe.cpp:31-69. Zwei Hauptpfade:
            1. `m_lAssozSpeich is not None` (V5.5+, Aktor-Pipeline):
               Prozess wird in den verbundenen Speicher abgelegt und
               wartet dort auf Entnahme durch einen Aktor — KEIN
               `bearbeit_beginnen`. Der Aktor-Pfad ist in V5.5 passiv;
               der Prozess bleibt im Speicher, bis Phase 3 ihn entnimmt.
            2. Sonst (V1-V4-Standardpfad): `add_prozess` +
               `bearbeit_beginnen`; bei Fehlschlag in zentrale
               Warteschlange.
        """
        from osim_engine.pps.prozess.zeitvorgabe import PtProzZeitvorgabe

        proz = PtProzZeitvorgabe(self.p_simulator)
        proz.m_oKnoten = self
        proz.m_oTrigger = proz_ober.m_oTrigger if proz_ober is not None else None
        proz.m_oProzOber = proz_ober
        proz.m_oEntitaet = ent

        ober_name = proz_ober.m_sName if proz_ober is not None else "<root>"
        proz.m_sName = f"{ober_name}|{self.m_sName}"
        proz.m_iErzeugungzeitpunkt = self.p_simulator.evt_curr_time()

        self.m_iPtkProzessCount += 1

        # Trigger notifizieren
        if proz.m_oTrigger is not None:
            proz.m_oTrigger.on_prz_created(proz)

        # EventBus
        self.p_simulator.bus.emit("proz.create",
                                  proz_id=proz.m_sName,
                                  knoten=self.m_sName,
                                  trigger_id=(proz.m_oTrigger.m_sName
                                              if proz.m_oTrigger else None))

        # V5.5: Speicher-Pfad — Prozess in Aktor-Warteliste ablegen
        if self.m_lAssozSpeich is not None:
            self.m_lAssozSpeich.platziere_proz(proz)
            return

        # V1-V4-Pfad: direkt in Knoten-Liste + BearbeitBeginnen
        self.add_prozess(proz)

        if not self.bearbeit_beginnen(proz):
            # Fehlschlag → in zentrale Warteschlange (re-try beim nächsten
            # Ressourcen-Freigabe-Event via proz_wart_ausloesen)
            self.p_simulator.m_oWarteSchl.add_tail(proz)


class PDpKnKonstant(PDpKnZeitvorgabe):
    """Konstante Durchführungszeit. C++: `PDpKnKonstant` (PDpKnZeitvorgabe.odh:97).

    Wörtlich aus PDpKnZeitvorgabe.cpp:172-187.
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iDurchfuehrungszeit: int = 0

    def get_durchfuehrungszeit(self, proz: "PtProzess") -> int:
        sim = self.p_simulator
        if sim.m_bIsProduktionEnde and self.m_iZeitRedBeiProzEnde > 0:
            red_wert = 1 - self.m_iZeitRedBeiProzEnde / 100
            return int(self.m_iDurchfuehrungszeit * red_wert)
        self.m_iPtkKumDurchfuehrungszeit += self.m_iDurchfuehrungszeit
        self.m_iPtkDurchfuehrungszeitCount += 1
        return self.m_iDurchfuehrungszeit

    def get_knz_min_dlfz(self, z_klass=None) -> float:
        """Konstante Knoten: kritischer-Weg-Anteil = konstante Dauer.

        C++ PDpKnZeitvorgabe.cpp:75-78: PDpKnKonstant nutzt GetKnzMittlDlfz,
        die wiederum auf m_iDurchfuehrungszeit fällt zurück wenn noch keine
        Ausführungen.
        """
        if self.m_iPtkAusloesungCount > 0:
            return self.get_knz_mittl_dlfz(z_klass)
        return float(self.m_iDurchfuehrungszeit)


class PDpKnVerteilung(PDpKnZeitvorgabe):
    """Verteilte Durchführungszeit. C++: `PDpKnVerteilung` (PDpKnZeitvorgabe.odh:176).

    Wörtlich aus PDpKnZeitvorgabe.cpp:374-397 (siehe SUPPLEMENT § 1.4).

    Zwei Modi (gesteuert über `simulator.pre_compute_kante_verteilung`):
        - lazy (Default, False): m_iVerteilZeit wird in get_durchfuehrungszeit
          gezogen; rejection-loop bis wert > 0
        - eager (True): m_iVerteilZeit wird in on_sim_begin schon gezogen
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iVerteilZeit: int = 0
        # m_lVerteil: Optional[OVerteilung] — von außen gesetzt
        self.m_lVerteil: Any = None

    def on_sim_begin(self, sim, deep: bool = True) -> None:
        super().on_sim_begin(sim, deep=deep)
        if not getattr(self.p_simulator, "pre_compute_kante_verteilung", False):
            self.m_iVerteilZeit = 0
        else:
            assert self.m_lVerteil is not None, "PDpKnVerteilung ohne m_lVerteil"
            self.m_iVerteilZeit = -1
            while self.m_iVerteilZeit <= 0:
                self.m_iVerteilZeit = int(self.m_lVerteil.hole_zufallswert())

    def get_durchfuehrungszeit(self, proz: "PtProzess") -> int:
        sim = self.p_simulator
        if not getattr(sim, "pre_compute_kante_verteilung", False):
            assert self.m_lVerteil is not None, "PDpKnVerteilung ohne m_lVerteil"
            zeit = -1
            while zeit <= 0:
                zeit = int(self.m_lVerteil.hole_zufallswert())
            self.m_iVerteilZeit = zeit
        if sim.m_bIsProduktionEnde and self.m_iZeitRedBeiProzEnde > 0:
            red_wert = 1 - self.m_iZeitRedBeiProzEnde / 100
            return int(self.m_iVerteilZeit * red_wert)
        self.m_iPtkKumDurchfuehrungszeit += self.m_iVerteilZeit
        self.m_iPtkDurchfuehrungszeitCount += 1
        return self.m_iVerteilZeit

    def get_knz_min_dlfz(self, z_klass=None) -> float:
        """Verteilte Knoten: zurückgegeben wird Mittelwert der Samples oder
        letzter Wert wenn noch keine Aggregat-Daten.
        """
        if self.m_iPtkAusloesungCount > 0:
            return self.get_knz_mittl_dlfz(z_klass)
        # Fallback: letzter Sample-Wert (oder 0 wenn noch nicht gezogen)
        return float(self.m_iVerteilZeit)


class PDpKnMenge(PDpKnZeitvorgabe):
    """Mengenabhängige Durchführungszeit. C++: `PDpKnMenge`
    (PDpKnZeitvorgabe.odh:274).

    Durchführungszeit = `Menge × m_iDfzProEinheit`. Die Menge wird über
    den Auslöser-Parameter `"menge"` (PARAM_MENGE) gelesen. Bei
    Produktionsende mit `m_iZeitRedBeiProzEnde > 0` greift die
    Zeit-Reduktion (Default 0 → keine Reduktion).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iDfzProEinheit: int = 0

    def get_durchfuehrungszeit(self, proz: "PtProzess") -> int:
        """C++: `PDpKnMenge::GetDurchfuehrungszeit` (PDpKnZeitvorgabe.cpp:612-636).

        Reihenfolge wörtlich aus C++:
            1. Auslöser holen (proz.get_ausloeser())
            2. Parameter "menge" lesen (Default 0)
            3. ProduktionEnde-Branch (Zeit-Reduktion)
            4. Sonst: Kum-Counter aktualisieren + Menge × Dfz/Einheit zurück
        """
        sim = self.p_simulator
        ausl = proz.get_ausloeser()
        assert ausl is not None, (
            f"PDpKnMenge {self.m_sName!r}.get_durchfuehrungszeit: "
            "Prozess hat keinen Auslöser (Trigger oder m_oAusloeser fehlt)"
        )
        i_menge = ausl.m_lParameter.hole_parameter_int("menge", 0)

        if sim.m_bIsProduktionEnde and self.m_iZeitRedBeiProzEnde > 0:
            red_wert = 1 - self.m_iZeitRedBeiProzEnde / 100
            erg = self.m_iDfzProEinheit * red_wert
            return int(i_menge * erg)

        self.m_iPtkKumDurchfuehrungszeit += i_menge * self.m_iDfzProEinheit
        self.m_iPtkDurchfuehrungszeitCount += 1
        return i_menge * self.m_iDfzProEinheit

    def get_knz_min_dlfz(self, z_klass=None) -> float:
        """C++ PDpKnZeitvorgabe.cpp:642-645 → GetKnzMittlDlfz()."""
        return self.get_knz_mittl_dlfz(z_klass)


class PDpKnMengeRuesten(PDpKnMenge):
    """Menge + konstante Rüstzeit. C++: `PDpKnMengeRuesten`
    (PDpKnZeitvorgabe.odh:352).

    Durchführungszeit = `(Menge × m_iDfzProEinheit) + m_iRuestzeit`. Die
    Rüstzeit ist Mengen-unabhängig (für die V1-Subklasse — die echte
    Rüstprozess-Phase mit eigenen Bus-Topics gehört zu P4-D / PtProzRuesten).

    Im ProduktionEnde-Branch wird C++-1:1 NUR der Mengen-Anteil reduziert,
    die Rüstzeit bleibt voll (Zeitreduktion gilt für die Stück-Zeit, nicht
    die Rüstung — vermutlich ist das im Original gewollt; ggf. Bug, aber
    1:1-Treue siehe PDpKnZeitvorgabe.cpp:828-832).
    """

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        self.m_iRuestzeit: int = 0

    def get_durchfuehrungszeit(self, proz: "PtProzess") -> int:
        """C++: `PDpKnMengeRuesten::GetDurchfuehrungszeit`
        (PDpKnZeitvorgabe.cpp:807-837).
        """
        sim = self.p_simulator
        ausl = proz.get_ausloeser()
        assert ausl is not None, (
            f"PDpKnMengeRuesten {self.m_sName!r}.get_durchfuehrungszeit: "
            "Prozess hat keinen Auslöser"
        )
        i_menge = ausl.m_lParameter.hole_parameter_int("menge", 0)

        if sim.m_bIsProduktionEnde and self.m_iZeitRedBeiProzEnde > 0:
            red_wert = 1 - self.m_iZeitRedBeiProzEnde / 100
            erg = self.m_iDfzProEinheit * red_wert
            return int((i_menge * erg) + self.m_iRuestzeit)

        gesamt = (i_menge * self.m_iDfzProEinheit) + self.m_iRuestzeit
        self.m_iPtkKumDurchfuehrungszeit += gesamt
        self.m_iPtkDurchfuehrungszeitCount += 1
        return gesamt

    def get_knz_min_dlfz(self, z_klass=None) -> float:
        """C++ PDpKnZeitvorgabe.cpp:843-846 → GetKnzMittlDlfz()."""
        return self.get_knz_mittl_dlfz(z_klass)
