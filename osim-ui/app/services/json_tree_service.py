"""JSON-Tree-Serializer fuer den Phase-1-Browser-Server-Vertrag.

Wichtig: Das JSON-Tree-Format ist KEIN oeffentliches Engine-API, sondern
der Phase-1-spezifische Vertrag zwischen Server (Python) und Browser (TS).
Es bildet die Engine-internen ``PSimulator``-Strukturen so ab, dass das
Frontend sie als hierarchischen Tree rendern kann.

Schema (v1.0):
::

    {
      "schema_version": "1.0",
      "root": {
        "oid": 0,
        "klass": "ASimulator",
        "name": "...",
        "properties": { "m_periodLen": 86400, ... },
        "children": [ ... ],
        "unsupported": false   # optional, default false
      }
    }

Stable OIDs: wir uebernehmen die ``oid``-Mapping aus
``LoadResult.instances`` (id(py_obj) → oid). Damit kann der Browser einen
Edit-Cycle GET/PUT machen, ohne dass Properties neuen IDs zugeordnet werden
muessten. Neu vom Frontend angelegte Objekte tragen TEMPORARY-IDs (negativ);
der Server vergibt beim PUT echte OIDs und liefert in einer Antwort ein
``id_mapping`` zurueck. (Letzteres ist Phase-1-Backlog -- aktuell setzt der
Roundtrip-Test voraus, dass keine neuen Objekte angelegt werden.)

Type-Map: ``TYPE_MAP`` definiert pro OTX-Klasse, welche Properties exportiert
und welcher Python-Typ erwartet wird. Property-Werte werden auf JSON-
serializable Typen normiert (``int``/``float``/``bool``/``str``/``None``).
"""

from __future__ import annotations

from typing import Any

from osim_engine.io import LoadResult, OtxFile
from osim_engine.pps.simulator import PSimulator

SCHEMA_VERSION = "1.0"

# ---------------------------------------------------------------------------
# Type-Map -- Property-Whitelist pro Klasse.
#
# Werte:
#   "int"   -> int
#   "float" -> float
#   "bool"  -> bool
#   "str"   -> str
# Klassen ohne Eintrag haben eine leere Property-Map (read-only, nur Name + OID).
# Die Reihenfolge im Tuple ist die Display-Reihenfolge im Frontend.
# ---------------------------------------------------------------------------


TYPE_MAP: dict[str, dict[str, str]] = {
    "ASimulator": {
        # Die OSimulator-Basisklasse nutzt m_name (NICHT m_sName) als Display-Label;
        # nachrangig wird m_sName fuer Subklassen unterstuetzt.
        "m_name": "str",
        "m_sName": "str",
        "m_periodLen": "int",
        "m_periodNum": "int",
        "m_periodBegin": "int",
        "m_iProduktionBezugsPeriode": "int",
        "m_iProduktionEnde": "int",
        "m_bIsProduktionEnde": "bool",
        "m_keim": "int",
        "m_aktKeim": "int",
        "m_sStartDate": "str",
        "m_sEndDate": "str",
    },
    # Ausloeser
    "PAslEinzel": {
        "m_sName": "str",
        "m_iBeginTermin": "int",
    },
    "EPAslEntAufExtern": {
        "m_sName": "str",
        "m_iBeginTermin": "int",
        "m_bTaeglichWiederholen": "bool",
        "m_iSollDauer": "int",
        "m_iMaxWarteZeit": "int",
    },
    "ACOAnt": {
        "m_sName": "str",
        "m_iBeginTermin": "int",
        "m_iPlanZeit": "int",
        "m_iRealeAuftragsdauer": "int",
    },
    # Parameter
    "PParameterMenge": {"m_sName": "str", "m_iWert": "int"},
    "PParameterID": {"m_sName": "str", "m_iWert": "int"},
    "PParameterPrioritaet": {"m_sName": "str", "m_iWert": "int"},
    "PParameterFloat": {"m_sName": "str", "m_dWert": "float"},
    # Plaene
    "PDurchlaufplan": {"m_sName": "str"},
    # Knoten -- Standard
    "PDpKnKonstant": {"m_sName": "str", "m_iDurchfuehrungszeit": "int"},
    "PDpKnMenge": {"m_sName": "str", "m_iDfzProEinheit": "int"},
    "PDpKnMengeRuesten": {
        "m_sName": "str",
        "m_iDfzProEinheit": "int",
        "m_iRuestzeit": "int",
    },
    "PDpKnVerteilung": {"m_sName": "str", "m_iVerteilZeit": "int"},
    "PDpKnRueckKonstant": {"m_sName": "str", "m_iWiederholungenZiel": "int"},
    "PDpKnAlternativVerteilung": {"m_sName": "str"},
    "PDpKnAlternativELogik": {
        "m_sName": "str",
        "m_iZGTermintreue": "int",
        "m_iZGQualitaet": "int",
        "m_iZGDlz": "int",
        "m_iZGKosten": "int",
        "m_iZGKapauslastung": "int",
        "m_iZGBestaende": "int",
        "m_iZGFlexibilitaet": "int",
        "m_iGDringlichkeit": "int",
    },
    "PDpKnAlternativSplit": {"m_sName": "str"},
    # Alternativen
    "PAlternativeVerteilung": {
        "m_sName": "str",
        "m_fAuswahlWarschlkt": "float",
    },
    "PAlternativeELogik": {
        "m_sName": "str",
        "m_fAuswahlWarschlkt": "float",
        "m_iQualitaetsfaehigkeit": "int",
        "m_iFlexibilitaet": "int",
        "m_dUser": "float",
    },
    "PAlternativeSplit": {
        "m_sName": "str",
        "m_fAuswahlWarschlkt": "float",
    },
    # Kanten
    "PDlplKante": {"m_sName": "str", "m_iUebergangszeit": "int"},
    "PDpKaUebergang": {"m_sName": "str", "m_iUebergangszeit": "int"},
    "PDpKaVerteilung": {"m_sName": "str", "m_iAktVerteilungszeit": "int"},
    # Verteilungen
    "PVertKonstant": {"m_sName": "str", "m_fKonstante": "float"},
    "PVertGleich": {
        "m_sName": "str",
        "m_fMinimum": "float",
        "m_fMaximum": "float",
    },
    "PVertNormal": {
        "m_sName": "str",
        "m_fErwartungsw": "float",
        "m_fStandardabw": "float",
    },
    "PVertLogNorm": {
        "m_sName": "str",
        "m_fErwartungsw": "float",
        "m_fStandardabw": "float",
    },
    "PVertExponential": {
        "m_sName": "str",
        "m_fErwartungsw": "float",
        "m_iRechtsVerschiebung": "int",
    },
    "PVertBeta": {
        "m_sName": "str",
        "m_fUntereGrenze": "float",
        "m_fObereGrenze": "float",
        "m_fAlpha": "float",
        "m_fBeta": "float",
    },
    "PVertBetaPERT": {
        "m_sName": "str",
        "m_fpessimistischerWert": "float",
        "m_fhaeufigsterWert": "float",
        "m_foptimistischerWert": "float",
    },
    "PVertExtern": {"m_sName": "str", "m_keim": "float"},
    # Ressourcen
    "PBetriebsmittel": {"m_sName": "str"},
    "PPerson": {"m_sName": "str"},
    # Einsatzzeit / Schichten
    "PEinsatzzeitTag": {
        "m_sName": "str",
        "m_iBeginn": "int",
        "m_iEnde": "int",
        "m_iPauseBeginn": "int",
        "m_iPauseEnde": "int",
        "m_iPauseDauer": "int",
    },
    "PTagRess": {"m_iTag": "int"},
    "PTagesEinsatzzeit": {
        "m_iEinsatzAnfang": "int",
        "m_iEinsatzEnde": "int",
    },
    # Assoziationen
    "PAssozBeleg": {"m_sName": "str"},
    "PAssozRessEnt": {"m_sName": "str"},
    "PAssozELogikEnt": {"m_sName": "str"},
    # Entscheider
    "EPEntInformation": {
        "m_sName": "str",
        "m_iID": "int",
        "m_sPropertyClassName": "str",
        "m_sParentClassName": "str",
        "m_iObereGrenze": "int",
        "m_iUntereGrenze": "int",
        "m_bIsMin": "bool",
    },
    "EPEntInformationssystem": {"m_sName": "str"},
    "EPZiel": {
        "m_sName": "str",
        "m_sZielStrKen": "str",
        "m_iAusrichtung": "int",
        "m_iGewichtung": "int",
    },
    "EPKrzDurchlaufzeit": {
        "m_sName": "str",
        "m_sZielStrKen": "str",
        "m_iAusrichtung": "int",
        "m_iGewichtung": "int",
    },
    "EPZelSystem": {"m_sName": "str"},
    "EPEntFeld": {"m_sName": "str"},
    "EPAszEntFeld": {"m_sName": "str"},
}

# ---------------------------------------------------------------------------
# Serializer: PSimulator → JSON-Tree
# ---------------------------------------------------------------------------


def _coerce(value: Any, py_type: str) -> Any:
    """Konvertiert einen Engine-Wert zu seinem JSON-serializable Typ."""
    if value is None:
        return None
    try:
        if py_type == "int":
            return int(value)
        if py_type == "float":
            return float(value)
        if py_type == "bool":
            return bool(value)
        if py_type == "str":
            return str(value)
    except (TypeError, ValueError):
        return None
    return value


def _properties_for(py_obj: Any, klass: str) -> dict[str, Any]:
    """Sammelt die JSON-Properties fuer ein Objekt anhand TYPE_MAP."""
    spec = TYPE_MAP.get(klass, {})
    props: dict[str, Any] = {}
    for attr, py_type in spec.items():
        if hasattr(py_obj, attr):
            props[attr] = _coerce(getattr(py_obj, attr), py_type)
    return props


def _node(
    *,
    oid: int,
    klass: str,
    name: str,
    properties: dict[str, Any],
    children: list[dict[str, Any]] | None = None,
    unsupported: bool = False,
) -> dict[str, Any]:
    """Erzeugt einen einzelnen JSON-Tree-Knoten."""
    out: dict[str, Any] = {
        "oid": oid,
        "klass": klass,
        "name": name,
        "properties": properties,
        "children": children or [],
    }
    if unsupported:
        out["unsupported"] = True
    return out


def _name_of(py_obj: Any, klass: str, oid: int) -> str:
    """Bevorzugt m_sName (haeufigste Konvention), faellt sonst auf m_name
    zurueck (ASimulator + OSimulator-Subklassen). Wenn beides fehlt, dann
    'Klasse#OID'."""
    for attr in ("m_sName", "m_name"):
        v = getattr(py_obj, attr, None)
        if isinstance(v, str) and v.strip():
            return v
    return f"{klass}#{oid}"


def serialize_simulator_to_tree(
    sim: PSimulator,
    *,
    load_result: LoadResult | None = None,
    original_otx: OtxFile | None = None,
) -> dict[str, Any]:
    """Erzeugt das vollstaendige JSON-Tree-Dokument fuer einen PSimulator.

    Args:
        sim: zu serialisierender Simulator.
        load_result: optional. Wenn vorhanden, werden die im Loader vergebenen
            OIDs uebernommen (stabile Identitaet fuer GET/PUT).
            Sonst werden OIDs deterministisch vergeben (Reihenfolge wie
            ``OtxWriter.assign_oids``).
        original_otx: optional. Wenn vorhanden, wird das OTX-Klassen-Label
            fuer Sim aus dem Original genommen (ASimulator statt PSimulator).
    """
    # ID-Map (id(py_obj) → oid) aufbauen
    id_to_oid: dict[int, int] = {}
    klass_of: dict[int, str] = {}  # oid -> klass-label
    if load_result is not None:
        for oid, obj in load_result.instances.items():
            if obj is None:
                continue
            id_to_oid[id(obj)] = oid
            otx_klass: str | None = None
            if original_otx is not None:
                src = original_otx.by_oid.get(oid)
                if src is not None:
                    otx_klass = src.klass
            klass_of[oid] = otx_klass or type(obj).__name__
        # ASimulator-OID 0 sicher mappen, falls Sim noch fehlt.
        if id(sim) not in id_to_oid:
            id_to_oid[id(sim)] = 0
            klass_of[0] = klass_of.get(0, "ASimulator")
    else:
        # Deterministisch in Tree-Order vergeben.
        next_oid = 0
        for klass, obj in _iter_tree(sim):
            if id(obj) not in id_to_oid:
                id_to_oid[id(obj)] = next_oid
                klass_of[next_oid] = klass
                next_oid += 1

    def klass_for(py_obj: Any) -> str:
        oid = id_to_oid.get(id(py_obj))
        if oid is not None and oid in klass_of:
            return klass_of[oid]
        return type(py_obj).__name__

    def oid_for(py_obj: Any) -> int | None:
        return id_to_oid.get(id(py_obj))

    # ----------------------------------------------------------------------
    # Tree-Aufbau
    # ----------------------------------------------------------------------

    def make_node(py_obj: Any) -> dict[str, Any] | None:
        oid = oid_for(py_obj)
        if oid is None:
            return None
        klass = klass_for(py_obj)
        props = _properties_for(py_obj, klass)
        name = _name_of(py_obj, klass, oid)
        unsupported = klass not in TYPE_MAP
        return _node(
            oid=oid,
            klass=klass,
            name=name,
            properties=props,
            unsupported=unsupported,
        )

    sim_oid = oid_for(sim)
    sim_klass = klass_for(sim)  # ASimulator (wenn original_otx gegeben), sonst PSimulator
    root = _node(
        oid=sim_oid if sim_oid is not None else 0,
        klass=sim_klass,
        name=_name_of(sim, sim_klass, sim_oid or 0),
        properties=_properties_for(sim, sim_klass),
    )

    # 1) Ausloeser-Gruppe
    ausl_group = _group_container("Ausloeser", "ausloeser-list")
    for a in sim.m_lAusl:
        a_node = make_node(a)
        if a_node is None:
            continue
        # Parameter als Kinder des Ausloesers
        for p in getattr(a, "m_lParameter", []) or []:
            p_node = make_node(p)
            if p_node is not None:
                a_node["children"].append(p_node)
        ausl_group["children"].append(a_node)
    if ausl_group["children"]:
        root["children"].append(ausl_group)

    # 2) Plaene
    plan_group = _group_container("Durchlaufplaene", "plan-list")
    seen_plans: set[int] = set()

    def add_plan(plan: Any, parent_children: list[dict[str, Any]]) -> None:
        if id(plan) in seen_plans:
            return
        seen_plans.add(id(plan))
        p_node = make_node(plan)
        if p_node is None:
            return
        # Knoten + Kanten als Subgroups, damit das Frontend sauber gruppieren kann.
        kn_group = _group_container("Knoten", "knoten-list")
        for kn in getattr(plan, "m_lKnoten", []) or []:
            k_node = make_node(kn)
            if k_node is None:
                continue
            # Verteilung am Knoten -> als Kind
            v = getattr(kn, "m_lVerteil", None)
            if v is not None:
                v_node = make_node(v)
                if v_node is not None:
                    k_node["children"].append(v_node)
            # Alternativen
            for alt in getattr(kn, "m_lAlternativen", []) or []:
                alt_node = make_node(alt)
                if alt_node is None:
                    continue
                alt_dlpl = getattr(alt, "m_lDlpl", None)
                if alt_dlpl is not None:
                    # Sub-Plan unter der Alternative
                    add_plan(alt_dlpl, alt_node["children"])
                k_node["children"].append(alt_node)
            # Rueck-/Alt-Knoten Sub-Plan
            sub = getattr(kn, "m_lDlpl", None)
            if sub is not None and not isinstance(sub, list):
                add_plan(sub, k_node["children"])
            elif isinstance(sub, list):
                for sp in sub:
                    add_plan(sp, k_node["children"])
            kn_group["children"].append(k_node)
        if kn_group["children"]:
            p_node["children"].append(kn_group)

        ka_group = _group_container("Kanten", "kante-list")
        for ka in getattr(plan, "m_lKanten", []) or []:
            ka_node = make_node(ka)
            if ka_node is None:
                continue
            v = getattr(ka, "m_lVerteil", None)
            if v is not None:
                v_node = make_node(v)
                if v_node is not None:
                    ka_node["children"].append(v_node)
            ka_group["children"].append(ka_node)
        if ka_group["children"]:
            p_node["children"].append(ka_group)

        parent_children.append(p_node)

    for plan in sim.m_lDlpl:
        add_plan(plan, plan_group["children"])
    if plan_group["children"]:
        root["children"].append(plan_group)

    # 3) Ressourcen
    ress_group = _group_container("Ressourcen", "ressource-list")
    for r in sim.m_lRessBeleg:
        r_node = make_node(r)
        if r_node is not None:
            ress_group["children"].append(r_node)
    if ress_group["children"]:
        root["children"].append(ress_group)

    # 4) Einsatzzeiten / Schichten
    einsatz_group = _group_container("Einsatzzeiten", "einsatz-list")
    for ez in sim.m_lEinsatz:
        e_node = make_node(ez)
        if e_node is None:
            continue
        for tr in getattr(ez, "m_lTagRess", []) or []:
            tr_node = make_node(tr)
            if tr_node is not None:
                e_node["children"].append(tr_node)
        for te in getattr(ez, "m_lTagesEinsatzzeit", []) or []:
            te_node = make_node(te)
            if te_node is not None:
                e_node["children"].append(te_node)
        einsatz_group["children"].append(e_node)
    if einsatz_group["children"]:
        root["children"].append(einsatz_group)

    # 5) Entscheider-Strukturen (Phase 5+, hier read-only displayed)
    entsch_group = _group_container("Entscheider", "entsch-list")
    for zs in sim.m_lZelSystem:
        zs_node = make_node(zs)
        if zs_node is None:
            continue
        for z in getattr(zs, "m_lEpZiel", []) or []:
            z_node = make_node(z)
            if z_node is not None:
                zs_node["children"].append(z_node)
        entsch_group["children"].append(zs_node)
    for ei in sim.m_lEntInfo:
        ei_node = make_node(ei)
        if ei_node is not None:
            entsch_group["children"].append(ei_node)
    for es in sim.m_lEntStrategie:
        es_node = make_node(es)
        if es_node is not None:
            entsch_group["children"].append(es_node)
    for ef in sim.m_lEntFeld:
        ef_node = make_node(ef)
        if ef_node is not None:
            entsch_group["children"].append(ef_node)
    if entsch_group["children"]:
        root["children"].append(entsch_group)

    return {"schema_version": SCHEMA_VERSION, "root": root}


def _group_container(label: str, klass_tag: str) -> dict[str, Any]:
    """Ein synthetischer Gruppen-Knoten -- kein OTX-Pendant.

    Frontend kann diese Knoten ueber ``klass = "_group"`` identifizieren
    und anders rendern (keine Property-Edits, nur Tree-Faltung).
    """
    return {
        "oid": -1,
        "klass": "_group",
        "name": label,
        "properties": {"_group_kind": klass_tag},
        "children": [],
    }


# ---------------------------------------------------------------------------
# Tree-Iterator (analog OtxWriter._iter_simulator_tree, hier intern fuer
# deterministische OID-Vergabe wenn kein LoadResult mitkommt).
# ---------------------------------------------------------------------------


def _iter_tree(sim: PSimulator):
    """Yields ``(klass_name, py_obj)`` in stabiler Tree-Reihenfolge."""
    seen: set[int] = set()

    def emit(klass: str, obj: Any):
        if obj is None or id(obj) in seen:
            return
        seen.add(id(obj))
        yield (klass, obj)

    yield from emit("ASimulator", sim)
    for a in sim.m_lAusl:
        yield from emit(type(a).__name__, a)
        for p in getattr(a, "m_lParameter", []) or []:
            yield from emit(type(p).__name__, p)

    def visit_plan(plan):
        yield from emit(type(plan).__name__, plan)
        for kn in getattr(plan, "m_lKnoten", []) or []:
            yield from emit(type(kn).__name__, kn)
            sub = getattr(kn, "m_lDlpl", None)
            if sub is not None:
                if isinstance(sub, list):
                    for sp in sub:
                        yield from visit_plan(sp)
                else:
                    yield from visit_plan(sub)
            for alt in getattr(kn, "m_lAlternativen", []) or []:
                yield from emit(type(alt).__name__, alt)
                alt_dlpl = getattr(alt, "m_lDlpl", None)
                if alt_dlpl is not None:
                    yield from visit_plan(alt_dlpl)
            v = getattr(kn, "m_lVerteil", None)
            if v is not None:
                yield from emit(type(v).__name__, v)
        for ka in getattr(plan, "m_lKanten", []) or []:
            yield from emit(type(ka).__name__, ka)
            v = getattr(ka, "m_lVerteil", None)
            if v is not None:
                yield from emit(type(v).__name__, v)

    for p in sim.m_lDlpl:
        yield from visit_plan(p)
    for r in sim.m_lRessBeleg:
        yield from emit(type(r).__name__, r)
    for ez in sim.m_lEinsatz:
        yield from emit(type(ez).__name__, ez)
        for tr in getattr(ez, "m_lTagRess", []) or []:
            yield from emit(type(tr).__name__, tr)
        for te in getattr(ez, "m_lTagesEinsatzzeit", []) or []:
            yield from emit(type(te).__name__, te)


# ---------------------------------------------------------------------------
# Deserializer: JSON-Tree → PSimulator (Property-Edits zurueckspielen)
# ---------------------------------------------------------------------------


def apply_tree_to_simulator(
    tree: dict[str, Any],
    *,
    load_result: LoadResult,
) -> PSimulator:
    """Spielt Property-Edits aus dem JSON-Tree zurueck in den PSimulator.

    Phase-1-Vertrag:
      - **Keine Topologie-Aenderungen**: Knoten/Kanten/Plaene werden nicht
        neu angelegt, geloescht oder neu verknuepft.
      - **Nur skalare Property-Edits** (Felder aus TYPE_MAP).
      - Nicht-existente OIDs im Tree werden ignoriert.
      - Properties, die nicht in TYPE_MAP fuer die Klasse stehen, werden
        ignoriert.

    Diese Restriktion macht den Save-back-Pfad deterministisch und
    Roundtrip-stabil. Topologische Edits (neue Knoten etc.) brauchen eine
    eigene Spec mit id_mapping (Plan 01-04+).

    Args:
        tree: vom Frontend gesendetes JsonTreeDocument.
        load_result: bezogen aus dem letzten Server-Load (OIDs müssen
                     uebereinstimmen).

    Returns:
        Der modifizierte PSimulator (= load_result.simulator, in-place).
    """
    if not isinstance(tree, dict):
        raise ValueError("Tree muss ein dict sein.")
    if tree.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(
            f"Unbekannte schema_version: {tree.get('schema_version')!r}"
        )
    root = tree.get("root")
    if not isinstance(root, dict):
        raise ValueError("Tree braucht 'root' (dict).")

    instances = load_result.instances

    def visit(node: dict[str, Any]) -> None:
        if not isinstance(node, dict):
            return
        klass = node.get("klass")
        oid_raw = node.get("oid")
        if isinstance(oid_raw, int) and klass != "_group":
            obj = instances.get(oid_raw)
            if obj is not None:
                _apply_properties(obj, klass or "", node.get("properties") or {})
        for child in node.get("children", []) or []:
            visit(child)

    visit(root)
    return load_result.simulator


def _apply_properties(
    py_obj: Any, klass: str, properties: dict[str, Any]
) -> None:
    """Setzt die Properties aus dem JSON-Tree zurueck auf das Python-Objekt.

    Nur Properties aus TYPE_MAP[klass] werden uebernommen. Type-Coercion
    erfolgt analog ``_coerce``.
    """
    spec = TYPE_MAP.get(klass, {})
    for attr, value in properties.items():
        if attr not in spec:
            continue  # ignoriere unbekannte Property
        coerced = _coerce(value, spec[attr])
        try:
            setattr(py_obj, attr, coerced)
        except AttributeError:
            # read-only property -> ignorieren
            pass
