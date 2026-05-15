"""Wurzel-Modell: aggregiert Pläne, Auslöser und Sim-Parameter zu einem Lauf."""

from __future__ import annotations

from pydantic import BaseModel, Field

from osim_engine.model.core import Plan, Trigger
from osim_engine.model.sim_params import SimParams


class SimModel(BaseModel):
    """Vollständiges Sim-Modell — entspricht Jonssons PSimulator mit Listen.

    Wird aus JSON deserialisiert (load_model) und an Simulator übergeben.
    """

    name: str = "unnamed simulation"
    sim_params: SimParams = Field(default_factory=SimParams)
    plans: list[Plan]
    triggers: list[Trigger]

    def plan_by_id(self, plan_id: str) -> Plan:
        for p in self.plans:
            if p.id == plan_id:
                return p
        raise KeyError(f"Plan '{plan_id}' nicht im Modell")
