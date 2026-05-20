"""OVerteilung-Hierarchie — 7 Subtypen.

Provenienz: `OSimBase/OVerteilung.cpp` (Klassen-Definitionen) +
`OSimBase/OVerteilung.odh` (Klassen-Header).

Jede Subklasse überschreibt `hole_zufallswert()`. Die Verteilungs-Logik
selbst liegt in `OVerteil` (Modul-Singleton `s_verteil`).
"""

from __future__ import annotations

from osim_engine.core.distribution import s_verteil


class OVerteilung:
    """Abstrakte Basis. OSimBase/OVerteilung.cpp:20-24.

    `m_wertBasis` ist der zentrale Parameter (Bedeutung je nach Subtyp).
    """

    def __init__(self, wert_basis: float = 0.0) -> None:
        self.m_wertBasis: float = wert_basis

    def hole_zufallswert(self) -> float:
        raise NotImplementedError(
            f"OVerteilung-Subklasse {type(self).__name__} muss hole_zufallswert() überschreiben"
        )


class OVerteilungKonstant(OVerteilung):
    """Konstanter Wert — OSimBase/OVerteilung.cpp:32-35."""

    def hole_zufallswert(self) -> float:
        return self.m_wertBasis


class OVerteilungGleich(OVerteilung):
    """Gleichverteilung in [0, m_wertBasis) — OSimBase/OVerteilung.cpp:43-46.

    **Wichtig**: nicht `vert_gleich_range`, sondern Skalierung des
    Standard-Gleichverteilten mit `m_wertBasis`. Bei `m_wertBasis=10`
    liefert das Werte in [0, 10).
    """

    def hole_zufallswert(self) -> float:
        return self.m_wertBasis * s_verteil.vert_gleich()


class OVerteilungNormal(OVerteilung):
    """Normalverteilung — OSimBase/OVerteilung.cpp:54-57.

    `m_wertBasis` = Erwartungswert, `m_stdAbweich` = Standardabweichung.
    Nutzt Jeerg-Rejection in `vert_norm`.
    """

    def __init__(self, wert_basis: float = 0.0, std_abweich: float = 1.0) -> None:
        super().__init__(wert_basis)
        self.m_stdAbweich: float = std_abweich

    def hole_zufallswert(self) -> float:
        return s_verteil.vert_norm(self.m_wertBasis, self.m_stdAbweich)


class OVerteilungNormalGrenz(OVerteilung):
    """Abgeschnittene Normalverteilung — OSimBase/OVerteilung.cpp:65-69."""

    def __init__(
        self,
        wert_basis: float = 0.0,
        std_abweich: float = 1.0,
        min_grenze: float = 0.0,
        max_grenze: float = 0.0,
    ) -> None:
        super().__init__(wert_basis)
        self.m_stdAbweich: float = std_abweich
        self.m_minGrenze: float = min_grenze
        self.m_maxGrenze: float = max_grenze

    def hole_zufallswert(self) -> float:
        return s_verteil.vert_norm_grenz(
            self.m_wertBasis, self.m_stdAbweich, self.m_minGrenze, self.m_maxGrenze
        )


class OVerteilungExponential(OVerteilung):
    """Exponentialverteilung mit Erwartungswert — OSimBase/OVerteilung.cpp:77-80."""

    def hole_zufallswert(self) -> float:
        return s_verteil.vert_expo(self.m_wertBasis, 0.0)


class OVerteilungLogNormal(OVerteilung):
    """Log-Normalverteilung — OSimBase/OVerteilung.cpp:88-91."""

    def __init__(self, wert_basis: float = 0.0, std_abweich: float = 1.0) -> None:
        super().__init__(wert_basis)
        self.m_stdAbweich: float = std_abweich

    def hole_zufallswert(self) -> float:
        return s_verteil.vert_log_norm(self.m_wertBasis, self.m_stdAbweich)


class OVerteilungExponentialVersch(OVerteilung):
    """Rechtsverschobene Exponentialverteilung — OSimBase/OVerteilung.cpp:99-102."""

    def __init__(self, wert_basis: float = 0.0, rechts_versch: float = 0.0) -> None:
        super().__init__(wert_basis)
        self.m_rechtsVersch: float = rechts_versch

    def hole_zufallswert(self) -> float:
        return s_verteil.vert_expo(self.m_wertBasis, self.m_rechtsVersch)
