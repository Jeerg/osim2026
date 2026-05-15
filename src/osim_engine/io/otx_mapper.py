"""Mapper: OtxFile → SimModel.

Übersetzt eine geparste `.otx`-Datei in das Engine-Datenmodell.
Phase 1: erkennt nur die Phase-1-Konstrukte (PDurchlaufplan, PDpKnKonstant,
PDlplKante). Spätere Phasen (Ressourcen, Aktoren, Entitäten, Hierarchie)
werden später ergänzt.

Eigenheiten von Jeergs OSIM-Format:
- Klassennamen schreiben "Dlp" sowohl als "Dlp" als auch als "Dlpl" (Tippvariation)
- Knoten-Klassennamen beginnen mit "PDpKn..." (Konstant, Verteilung, ...)
- Kanten-Klassen sind PDlplKante (mit l!)
- Vorgänger/Nachfolger einer Kante sind LList-Container, deren sub_refs die
  Knoten-OIDs enthalten
- Start-/End-Kante sind nicht explizit markiert, sondern aus den Vor-/Nachfolger-
  Listen abgeleitet (leere predecessors = Start, leere successors = End)
"""

from __future__ import annotations

from osim_engine.io.otx_reader import OtxFile, OtxObject
from osim_engine.model.core import (
    Edge,
    NodeKonstant,
    NodeVerteilung,
    Plan,
    TriggerSingle,
)
from osim_engine.model.distribution import (
    Exponential,
    Gleich,
    Konstant,
    LogNormal,
    Normal,
)
from osim_engine.model.sim_model import SimModel
from osim_engine.model.sim_params import SimParams


# Knotentypen aus dem OSIM-Code → Pydantic-Typen
_NODE_KONSTANT_CLASSES = {"PDpKnKonstant", "PDlpKnoKonstant"}
_NODE_VERTEILUNG_CLASSES = {"PDpKnVerteilung", "PDlpKnoVerteilung"}
_EDGE_CLASSES = {"PDlplKante", "PDlpKante", "PDlplKanUebergang", "PDlpKanUebergang"}
_PLAN_CLASSES = {"PDurchlaufplan"}
_TRIGGER_SINGLE_CLASSES = {"PAslEinzel"}


def _resolve_node_oids(file: OtxFile, llist_oid: int | None) -> list[int]:
    """Löst eine *LList-OID in eine Liste von enthaltenen Knoten-/Kanten-OIDs auf."""
    if llist_oid is None:
        return []
    obj = file.by_oid.get(llist_oid)
    if obj is None:
        return []
    if obj.sub_refs:
        # Erste (und einzige) Sub-Ref-Liste ist die enthaltene Element-Liste
        return list(obj.sub_refs[0])
    return []


def _otx_node_to_pydantic(obj: OtxObject) -> NodeKonstant | NodeVerteilung | None:
    """Wandelt ein OSIM-Knoten-Objekt in ein Pydantic-Node-Modell um."""
    name = str(obj.attrs.get("m_sName", "")).strip()
    nid = f"N{obj.oid}"
    if obj.klass in _NODE_KONSTANT_CLASSES:
        dur = obj.attrs.get("m_iDurchfuehrungszeit", 0)
        if not isinstance(dur, (int, float)):
            dur = 0
        return NodeKonstant(id=nid, name=name, duration=float(dur))
    if obj.klass in _NODE_VERTEILUNG_CLASSES:
        # Phase 1: ohne echte Verteilungs-Auflösung (TODO: m_lVerteilung)
        return NodeKonstant(id=nid, name=name, duration=0.0)
    return None


def _otx_edge_to_pydantic(obj: OtxObject, file: OtxFile, plan_oid: int) -> Edge | None:
    """Wandelt ein OSIM-Kanten-Objekt in ein Pydantic-Edge-Modell um.

    Vorgänger/Nachfolger werden über die jeweiligen LList-Container aufgelöst.
    Die OID des umgebenden Plans wird herausgefiltert (Jonsson-Konvention:
    PDurchlaufplan ist selbst ein PDlpKnoten und steht in den Vor-/Nachfolger-
    Listen von Start-/End-Kanten — für die Engine-Topologie bedeutet das aber
    "leere Vor-/Nachfolger" = Start- bzw. Endkante).
    """
    eid = f"E{obj.oid}"
    pred_oids = [o for o in _resolve_node_oids(file, obj.attrs.get("m_lVorgaenger"))
                 if o != plan_oid]
    succ_oids = [o for o in _resolve_node_oids(file, obj.attrs.get("m_lNachfolger"))
                 if o != plan_oid]
    transition = obj.attrs.get("m_iUebergangszeit", 0)
    if not isinstance(transition, (int, float)):
        transition = 0
    return Edge(
        id=eid,
        predecessors=[f"N{o}" for o in pred_oids],
        successors=[f"N{o}" for o in succ_oids],
        transition_time=float(transition),
    )


def map_otx_to_simmodel(file: OtxFile) -> SimModel:
    """Wandelt eine geparste OtxFile in ein SimModel um.

    Konvention: OSIM hat oft ein einziges ASimulator-Top-Level-Objekt. Jeder
    PDurchlaufplan unterhalb davon wird zu einem Plan im SimModel.
    """
    plans: list[Plan] = []
    triggers: list[TriggerSingle] = []

    # Alle PDurchlaufplan-Objekte sammeln
    for oid, obj in file.by_oid.items():
        if obj.klass in _PLAN_CLASSES:
            plan = _build_plan(obj, file)
            if plan is not None:
                plans.append(plan)

    # Auslöser sammeln (PAslEinzel)
    for oid, obj in file.by_oid.items():
        if obj.klass in _TRIGGER_SINGLE_CLASSES:
            trg = _build_trigger_single(obj, file, plans)
            if trg is not None:
                triggers.append(trg)

    # Wenn kein Auslöser im File, aber wir haben mind. 1 Plan,
    # fügen wir einen Default-Auslöser bei t=0 ein, damit etwas simuliert wird.
    if not triggers and plans:
        triggers.append(
            TriggerSingle(
                id="auto_trigger_0",
                plan_id=plans[0].id,
                begin_time=0.0,
            )
        )

    return SimModel(
        name=f"Imported from .otx ({len(plans)} plans, {len(triggers)} triggers)",
        sim_params=SimParams(period_length=86400, horizon_periods=30),
        plans=plans,
        triggers=triggers,
    )


def _build_plan(plan_obj: OtxObject, file: OtxFile) -> Plan | None:
    pid = f"P{plan_obj.oid}"
    name = str(plan_obj.attrs.get("m_sName", "")).strip()

    knoten_oids = _resolve_node_oids(file, plan_obj.attrs.get("m_lKnoten"))
    kanten_oids = _resolve_node_oids(file, plan_obj.attrs.get("m_lKanten"))

    nodes = []
    for noid in knoten_oids:
        obj = file.by_oid.get(noid)
        if obj is None:
            continue
        n = _otx_node_to_pydantic(obj)
        if n is not None:
            nodes.append(n)

    edges = []
    start_edge_id: str | None = None
    end_edge_id: str | None = None
    for eoid in kanten_oids:
        obj = file.by_oid.get(eoid)
        if obj is None:
            continue
        e = _otx_edge_to_pydantic(obj, file, plan_obj.oid)
        if e is None:
            continue
        edges.append(e)
        if not e.predecessors:
            start_edge_id = e.id
        if not e.successors:
            end_edge_id = e.id

    if not nodes or not edges:
        return None

    # Falls keine eindeutige Start-/End-Kante gefunden wurde, nehmen wir
    # pragmatisch die erste / letzte Kante.
    if start_edge_id is None:
        start_edge_id = edges[0].id
    if end_edge_id is None:
        end_edge_id = edges[-1].id

    return Plan(
        id=pid,
        name=name,
        nodes=nodes,
        edges=edges,
        start_edge=start_edge_id,
        end_edge=end_edge_id,
    )


def _build_trigger_single(
    obj: OtxObject,
    file: OtxFile,
    plans: list[Plan],
) -> TriggerSingle | None:
    """PAslEinzel → TriggerSingle. Plan-Zuordnung über `m_lDurchlaufplan`-Referenz."""
    tid = f"T{obj.oid}"
    plan_oid = obj.attrs.get("m_lDurchlaufplan")
    plan_id: str | None = None
    if isinstance(plan_oid, int):
        plan_id = f"P{plan_oid}"
    if plan_id is None and plans:
        plan_id = plans[0].id
    if plan_id is None:
        return None

    begin = obj.attrs.get("m_tBeginnTermin", 0)
    if not isinstance(begin, (int, float)):
        begin = 0
    return TriggerSingle(id=tid, plan_id=plan_id, begin_time=float(begin))
