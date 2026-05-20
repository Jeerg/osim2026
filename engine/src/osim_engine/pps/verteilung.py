"""PVerteilung-Familie aus OSimPro/PVerteilung.{odh,cpp}.

Process-spezifische Verteilungs-Klassen, die in OTX-Modellen über
`m_lVerteil`-Referenzen an `PDpKnVerteilung`/`PDpKaVerteilung` gebunden
sind. Eigenständig zum `OVerteilung`-Stamm in `core/verteilung.py`
(unterschiedliche Attribut-Namen, separate `GetZufallswert`-API).

Provenienz: `OSimPro/PVerteilung.odh` + `OSimPro/PVerteilung.cpp`.

Externer Zufallsgenerator: Jede `PVerteilung` darf einen
`m_lPVertExt`-Verweis auf eine `PVertExtern`-Instanz tragen. Ist dieser
gesetzt, wird statt `OSimulator::s_verteil` der private Generator dieser
`PVertExtern` verwendet (eigener Keim, eigener Anti-Flag-State).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.core.distribution import OVerteil, STD_KEIM, s_verteil

if TYPE_CHECKING:
    pass


# ----------------------------------------------------------------------
# PVertExtern — eigener gekapselter Zufallsgenerator
# ----------------------------------------------------------------------


class PVertExtern:
    """Eigener Zufallsgenerator pro Verteilung. OSimPro/PVerteilung.odh:170-194.

    Im OTX als Top-Level-Objekt referenziert. `m_keim` ist der initiale
    Keim, `m_Internerkeim` der jeweils aktuelle Stand.
    """

    def __init__(self, simulator=None) -> None:
        self.m_sName: str = ""
        # OTX-Default 1776496601.0 — wird beim Load überschrieben
        self.m_keim: float = STD_KEIM
        self.m_Internerkeim: float = STD_KEIM
        self.m_verteil: OVerteil = OVerteil(self.m_Internerkeim)
        # Auf externen Keim schalten — analog C++ Konstruktor (Z. 187)
        self._keim_ref: list[float] = [self.m_Internerkeim]
        self.m_verteil.externer_keim(self._keim_ref)

    def on_sim_reset(self, deep: bool = True) -> None:
        """Setzt den internen Keim zurück. OSimPro/PVerteilung.odh:189-193."""
        self.m_Internerkeim = self.m_keim
        self._keim_ref[0] = self.m_keim


class PVertExternLList(list):
    """LList-Container für PVertExtern. OSimPro/PVerteilung.odh:197-204."""


# ----------------------------------------------------------------------
# PVerteilung — abstrakte Basis
# ----------------------------------------------------------------------


class PVerteilung:
    """Abstrakte Basis. OSimPro/PVerteilung.odh:22-41.

    Subklassen müssen `hole_zufallswert` (C++ `GetZufallswert`) und
    `hole_mittelwert` (C++ `GetMittelwert`) überschreiben.
    `reduziere_vorgabezeit` ist optional (Default: wirft NotImplementedError
    — entspricht C++ `throw new OException()`).
    """

    def __init__(self, simulator=None) -> None:
        self.m_sName: str = ""
        self.m_lPVertExt: PVertExtern | None = None

    def _gen(self) -> OVerteil:
        """Liefert den zuständigen Generator — extern wenn gesetzt, sonst global."""
        if self.m_lPVertExt is not None:
            return self.m_lPVertExt.m_verteil
        return s_verteil

    def reduziere_vorgabezeit(self, prozent: float) -> None:
        """C++: `throw new OException()` in der Basis."""
        raise NotImplementedError(
            f"reduziere_vorgabezeit nicht definiert für {type(self).__name__}"
        )

    def hole_zufallswert(self) -> float:
        raise NotImplementedError(
            f"{type(self).__name__} muss hole_zufallswert überschreiben"
        )

    def hole_mittelwert(self) -> float:
        raise NotImplementedError(
            f"{type(self).__name__} muss hole_mittelwert überschreiben"
        )

    # OSim-Lifecycle (1:1 zur C++-Basisklasse)
    def on_sim_reset(self, deep: bool = True) -> None:
        pass


# ----------------------------------------------------------------------
# PVertKonstant
# ----------------------------------------------------------------------


class PVertKonstant(PVerteilung):
    """Konstante Verteilung. OSimPro/PVerteilung.cpp:29-44."""

    def __init__(self, simulator=None) -> None:
        super().__init__(simulator)
        self.m_fKonstante: float = 0.0

    def reduziere_vorgabezeit(self, prozent: float) -> None:
        self.m_fKonstante -= (self.m_fKonstante * prozent) / 100

    def hole_zufallswert(self) -> float:
        return self.m_fKonstante

    def hole_mittelwert(self) -> float:
        return self.m_fKonstante


# ----------------------------------------------------------------------
# PVertGleich
# ----------------------------------------------------------------------


class PVertGleich(PVerteilung):
    """Gleichverteilung [m_fMinimum, m_fMaximum]. OSimPro/PVerteilung.cpp:52-65."""

    def __init__(self, simulator=None) -> None:
        super().__init__(simulator)
        self.m_fMinimum: float = 0.0
        self.m_fMaximum: float = 1.0

    def hole_zufallswert(self) -> float:
        gen = self._gen()
        return self.m_fMinimum + gen.vert_gleich() * (self.m_fMaximum - self.m_fMinimum)

    def hole_mittelwert(self) -> float:
        return (self.m_fMaximum + self.m_fMinimum) / 2


# ----------------------------------------------------------------------
# PVertNormal
# ----------------------------------------------------------------------


class PVertNormal(PVerteilung):
    """Normalverteilung. OSimPro/PVerteilung.cpp:73-85."""

    def __init__(self, simulator=None) -> None:
        super().__init__(simulator)
        self.m_fErwartungsw: float = 0.0
        self.m_fStandardabw: float = 1.0

    def hole_zufallswert(self) -> float:
        gen = self._gen()
        return gen.vert_norm(self.m_fErwartungsw, self.m_fStandardabw)

    def hole_mittelwert(self) -> float:
        return self.m_fErwartungsw


# ----------------------------------------------------------------------
# PVertLogNorm
# ----------------------------------------------------------------------


class PVertLogNorm(PVerteilung):
    """Log-Normalverteilung. OSimPro/PVerteilung.cpp:93-105."""

    def __init__(self, simulator=None) -> None:
        super().__init__(simulator)
        self.m_fErwartungsw: float = 0.0
        self.m_fStandardabw: float = 1.0

    def hole_zufallswert(self) -> float:
        gen = self._gen()
        return gen.vert_log_norm(self.m_fErwartungsw, self.m_fStandardabw)

    def hole_mittelwert(self) -> float:
        return self.m_fErwartungsw


# ----------------------------------------------------------------------
# PVertExponential
# ----------------------------------------------------------------------


class PVertExponential(PVerteilung):
    """Rechtsverschobene Exponentialverteilung. OSimPro/PVerteilung.cpp:113-126.

    Hinweis: C++ `GetMittelwert` wirft OException — Python liefert
    NotImplementedError beim Aufruf.
    """

    def __init__(self, simulator=None) -> None:
        super().__init__(simulator)
        self.m_fErwartungsw: float = 0.0
        # m_iRechtsVerschiebung: C++ int, in OTX double-codiert
        self.m_iRechtsVerschiebung: float = 0.0

    def hole_zufallswert(self) -> float:
        gen = self._gen()
        return gen.vert_expo(self.m_fErwartungsw, self.m_iRechtsVerschiebung)

    def hole_mittelwert(self) -> float:
        raise NotImplementedError(
            "PVertExponential::GetMittelwert ist im C++-Original Stub (throw OException)"
        )


# ----------------------------------------------------------------------
# PVertBeta
# ----------------------------------------------------------------------


class PVertBeta(PVerteilung):
    """Beta-Verteilung in [m_fUntereGrenze, m_fObereGrenze]. OSimPro/PVerteilung.cpp:131-145.

    Hinweis: C++ `GetMittelwert` wirft OException.
    """

    def __init__(self, simulator=None) -> None:
        super().__init__(simulator)
        self.m_fUntereGrenze: float = 0.0
        self.m_fObereGrenze: float = 0.0
        self.m_fAlpha: float = 0.0
        self.m_fBeta: float = 0.0

    def hole_zufallswert(self) -> float:
        gen = self._gen()
        return gen.vert_beta_range(
            self.m_fUntereGrenze, self.m_fObereGrenze, self.m_fAlpha, self.m_fBeta
        )

    def hole_mittelwert(self) -> float:
        raise NotImplementedError(
            "PVertBeta::GetMittelwert ist im C++-Original Stub (throw OException)"
        )


# ----------------------------------------------------------------------
# PVertBetaPERT
# ----------------------------------------------------------------------


class PVertBetaPERT(PVerteilung):
    """Beta-PERT-Verteilung. OSimPro/PVerteilung.cpp:161-269.

    C++-Original ist mit Preprocessor-#ifdef-Pfaden gebaut. Effektiv aktiv
    ist `INC_IFIP_VERT_BETA_VERBREITERN` (Z. 154-157), das einfach
    `VertBetaPERT(m_fhaeufigsterWert, m_foptimistischerWert, m_fpessimistischerWert)`
    aufruft (die zwei kommentierten Verbreiterungs-Zeilen sind disabled).

    `ReduziereVorgabezeit` (Z. 161-166): alle drei Werte werden um
    `prozent` Prozent reduziert.

    `GetMittelwert` (Z. 263-269): klassische PERT-Schätzung
    `(opt + 4*haeufig + pes) / 6`.
    """

    def __init__(self, simulator=None) -> None:
        super().__init__(simulator)
        self.m_fpessimistischerWert: float = 0.0
        self.m_fhaeufigsterWert: float = 0.0
        self.m_foptimistischerWert: float = 0.0

    def reduziere_vorgabezeit(self, prozent: float) -> None:
        self.m_fhaeufigsterWert -= (self.m_fhaeufigsterWert * prozent) / 100
        self.m_foptimistischerWert -= (self.m_foptimistischerWert * prozent) / 100
        self.m_fpessimistischerWert -= (self.m_fpessimistischerWert * prozent) / 100

    def hole_zufallswert(self) -> float:
        gen = self._gen()
        # m = haeufigster, a = optimistisch (unter), b = pessimistisch (ober)
        return gen.vert_beta_pert(
            self.m_fhaeufigsterWert,
            self.m_foptimistischerWert,
            self.m_fpessimistischerWert,
        )

    def hole_mittelwert(self) -> float:
        return (
            self.m_foptimistischerWert
            + 4 * self.m_fhaeufigsterWert
            + self.m_fpessimistischerWert
        ) / 6
