"""Verteilungen für stochastische Sim-Parameter (Jonsson Kap. 4.4.7).

Fünf Standard-Verteilungen, die Jonsson für die OSim-Engine definiert hat:
- konstant: liefert immer denselben Wert (nicht stochastisch, aber als Sonderfall)
- gleich: gleichverteilt im Intervall [min, max]
- normal: Normalverteilung mit Erwartungswert und Standardabweichung
- exp: Exponentialverteilung mit Erwartungswert
- lognormal: logarithmische Normalverteilung mit Erwartungswert und Standardabweichung

Reproduzierbarkeit: Alle Verteilungen ziehen aus einer gemeinsamen numpy-Generator-
Instanz, die mit einem expliziten Keim (Jonsson: m_keim=1776496601) initialisiert wird.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

import numpy as np
from pydantic import BaseModel, Field


class Konstant(BaseModel):
    type: Literal["konstant"] = "konstant"
    value: float

    def sample(self, rng: np.random.Generator) -> float:
        return self.value


class Gleich(BaseModel):
    type: Literal["gleich"] = "gleich"
    min: float
    max: float

    def sample(self, rng: np.random.Generator) -> float:
        return float(rng.uniform(self.min, self.max))


class Normal(BaseModel):
    type: Literal["normal"] = "normal"
    mean: float
    std: float

    def sample(self, rng: np.random.Generator) -> float:
        return float(rng.normal(self.mean, self.std))


class Exponential(BaseModel):
    type: Literal["exp"] = "exp"
    mean: float

    def sample(self, rng: np.random.Generator) -> float:
        return float(rng.exponential(self.mean))


class LogNormal(BaseModel):
    type: Literal["lognormal"] = "lognormal"
    mean: float
    std: float

    def sample(self, rng: np.random.Generator) -> float:
        return float(rng.lognormal(self.mean, self.std))


Distribution = Annotated[
    Union[Konstant, Gleich, Normal, Exponential, LogNormal],
    Field(discriminator="type"),
]
