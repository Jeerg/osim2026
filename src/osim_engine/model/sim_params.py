"""Globale Simulationsparameter (Jonsson Kap. 4.3, OSimulator)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SimParams(BaseModel):
    """Steuert Periodisierung, Stochastik-Keim und Lauf-Horizont.

    Jonsson modelliert dies in OSimulator mit m_dPeriodenLaenge, m_keim,
    m_periodNum etc. Hier als externer Konfig-Block.
    """

    period_length: int = Field(
        default=86400,
        description="Länge einer Simulationsperiode in Zeiteinheiten "
        "(Default 86400 = 1 Tag in Sekunden, wie bei Jonsson)",
    )
    horizon_periods: int = Field(
        default=1,
        description="Anzahl zu simulierender Perioden",
    )
    seed: int = Field(
        default=1776496601,
        description="Keim für den Zufallszahlengenerator (Jonsson-Default 1776496601)",
    )
    ptk_begin: int | None = Field(
        default=None,
        description="Anfang der Protokollierungsperiode (None = ab Sim-Beginn 0)",
    )
    ptk_end: int | None = Field(
        default=None,
        description="Ende der Protokollierungsperiode (None = bis Sim-Ende)",
    )

    @property
    def effective_ptb(self) -> int:
        return self.ptk_begin if self.ptk_begin is not None else 0

    @property
    def effective_pte(self) -> int:
        return (
            self.ptk_end
            if self.ptk_end is not None
            else self.period_length * self.horizon_periods
        )
