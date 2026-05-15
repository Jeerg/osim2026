"""Kern-Datenmodell: Durchlaufpläne, Knoten, Kanten, Auslöser.

Entspricht Jonsson Kap. 4.4 (Phase 1 — durchlaufplanorientierte Simulation
ohne Ressourcen). Diskriminator-basierte Unions ersetzen Jonssons Klassen-
hierarchie (PDlpKnoten → PDlpKnoZeitvorgabe → PDlpKnoKonstant / -Verteilung).
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from osim_engine.model.distribution import Distribution


# --- Knoten ----------------------------------------------------------------

class NodeKonstant(BaseModel):
    """Jonsson PDlpKnoKonstant — konstante Durchführungszeit."""

    type: Literal["konstant"] = "konstant"
    id: str
    name: str = ""
    duration: float = Field(description="Konstante Durchführungszeit in Zeiteinheiten")


class NodeVerteilung(BaseModel):
    """Jonsson PDlpKnoVerteilung — stochastische Durchführungszeit."""

    type: Literal["verteilung"] = "verteilung"
    id: str
    name: str = ""
    distribution: Distribution


Node = Annotated[
    Union[NodeKonstant, NodeVerteilung],
    Field(discriminator="type"),
]


# --- Kante -----------------------------------------------------------------

class Edge(BaseModel):
    """Jonsson PDlpKante / PDlpKanUebergang.

    Standardverhalten ist eine UND-Verknüpfung (alle Vorgänger müssen fertig
    sein, bevor Nachfolger startet). Bei mehreren Nachfolgern wird die Prozess-
    weitergabe an alle gleichzeitig durchgeführt (parallele Verzweigung).

    Eine `transition_time > 0` entspricht Jonssons PDlpKanUebergang (verzögerte
    Weitergabe, z.B. Transportzeit zwischen Arbeitsvorgängen).
    """

    id: str
    predecessors: list[str] = Field(
        default_factory=list,
        description="IDs der Vorgängerknoten (leer bei Startkante)",
    )
    successors: list[str] = Field(
        default_factory=list,
        description="IDs der Nachfolgerknoten (leer bei Endkante)",
    )
    transition_time: float = Field(
        default=0.0,
        description="Übergangszeit (PDlpKanUebergang: m_dUebergangszeit)",
    )


# --- Durchlaufplan ---------------------------------------------------------

class Plan(BaseModel):
    """Jonsson PDurchlaufplan — gerichteter Graph aus Knoten und Kanten.

    Phase 1: noch keine Hierarchisierung (PDurchlaufplan ist hier *nicht* selbst
    ein Knoten — das kommt in Phase 5 für verschachtelte Pläne).
    """

    id: str
    name: str = ""
    nodes: list[Node]
    edges: list[Edge]
    start_edge: str = Field(description="ID der Start-Kante (eingehend in ersten Knoten)")
    end_edge: str = Field(description="ID der End-Kante (ausgehend aus letztem Knoten)")


# --- Auslöser --------------------------------------------------------------

class TriggerSingle(BaseModel):
    """Jonsson PAslEinzel — einmaliger Auslöser zu festem Zeitpunkt."""

    type: Literal["single"] = "single"
    id: str
    plan_id: str = Field(description="ID des Durchlaufplans, der ausgelöst wird")
    begin_time: float = Field(description="Auslösungszeitpunkt in Zeiteinheiten")


Trigger = Annotated[
    Union[TriggerSingle],
    Field(discriminator="type"),
]
