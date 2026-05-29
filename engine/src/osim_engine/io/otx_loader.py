"""OTX → Python-Sim Loader.

Instanziiert aus einer geparsten OTX-Datei (`otx_reader`) die entsprechenden
Python-Klassen und verknüpft sie zu einem lauffähigen `PSimulator`-Modell.

Architektur: Class-Registry + Two-Pass-Loading.

    Pass 1 — Instantiate
        Für jeden OtxObject, dessen Klasse einen Handler hat, wird ein
        Python-Objekt erzeugt (ohne Referenzen — die existieren noch nicht).

    Pass 2 — Wire
        Mit allen Instanzen im `instances`-Dict werden Referenzen aufgelöst:
        Listen werden über die OTX-`sub_refs` der Container-Objekte
        dereferenziert, Single-Refs werden direkt als OID gelesen.

Stand: minimaler V1-Satz an Handlers (ASimulator, PAslEinzel, PDurchlaufplan,
PDlplKante / PDpKaUebergang, PDpKnKonstant + Familie). Für jedes nicht
abgedeckte Modell-Element wird im `LoadResult.unsupported` gezählt — keine
harte Exception. So kann die Coverage inkrementell erhöht werden.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from osim_engine.io.otx_reader import OtxFile, OtxObject, parse_otx_file
from osim_engine.pps.simulator import PSimulator


# ----------------------------------------------------------------------
# Registry
# ----------------------------------------------------------------------


_HANDLERS: dict[str, "ClassHandler"] = {}
_SKIP: set[str] = set()


class ClassHandler:
    """Basis für OTX-Klassen-Handler. Subclass + überschreiben.

    `instantiate` darf None liefern, wenn das Objekt absichtlich übersprungen
    werden soll (→ wird wie `_SKIP` gezählt).
    """

    def instantiate(self, loader: "OtxLoader", obj: OtxObject) -> Any | None:
        raise NotImplementedError

    def wire(self, loader: "OtxLoader", py_obj: Any, obj: OtxObject) -> None:
        """Default-Wire: nichts. Override für Referenz-Auflösung."""


def register_handler(*klass_names: str) -> Callable[[type], type]:
    """Registriert einen Handler für eine oder mehrere OTX-Klassennamen."""
    def decorator(cls: type) -> type:
        instance = cls()
        for name in klass_names:
            _HANDLERS[name] = instance
        return cls
    return decorator


def register_skip(*klass_names: str) -> None:
    """Markiert Klassen als „bewusst nicht geladen" (UI, Grafik, Personal)."""
    _SKIP.update(klass_names)


# ----------------------------------------------------------------------
# Skip-Liste — UI / Grafik / unbenutzte Personal-Scheduling-Reste
# ----------------------------------------------------------------------


register_skip(
    # UI/Graphics-Designer (visualisierung im Editor)
    "OViewerInfoLList", "OGfxDesignItemList", "OGfxDesignLinkList",
    "OGfxDesignPDurchlaufplan", "OGfxModeLList", "OGfxRowGrid",
    "OGfxRowLeftBar", "OGfxRowObjLList", "OGfxRowTopBar",
    "PGfxModeQuali", "PGfxModeRessBeleg", "PGfxModeWaitQueue",
    "PGridColRowInfo", "PGridColRowInfoLList", "PGObjGridInfo",
    # AZeitSim-spezifisches Personal-Scheduling
    "AAufgabeLList", "AEinsatzWunschLList", "AEinsatzzeitWunsch",
    "AEinsatzzeitWunschLList", "AGruppeLList", "AKapBedCellInfoLList",
    "AKapBedViewerInfo", "ATagPersonLList",
    # Entscheider-Listen — Container, werden über Eltern-sub_refs aufgelöst
    "EPEntFeldLList", "EPEntInformationssystemLList",
    "EPEntStrategieLList", "EPZelSystemLList",
    "EPEntInformationLList", "EPZielLList",
    # Container-Listen — werden über die sub_refs der Eltern aufgelöst
    "PAusloeserLList", "PDurchlaufplanLList",
    "PRessBelegLList", "PRessMengeLList", "PSpeicherProzLList",
    "PAssozRessourceLList", "PDlplKnotenLList", "PDlplKanteLList",
    "PEinsatzzeitLList", "PTagRessLList", "PTagesEinsatzzeitLList",
    "PPauseZyklusLList", "PRessBelegLListSimple",
    "PAssozBelegLinkStatusList", "PParameterLList",
    "PAlternativeVerteilungLList",
    "PKlasseLList", "PVertExternLList",
    # Sonstiges (Stub/Empty in V1-V4)
    "PProzessList", "PProzessDLL", "PRelationList", "PTriggerList",
    "PtProzess",  # Anchor-Prozess, nur Hilfsobjekt
    "PGenerator",  # Stub in unserer Python-Implementation
)


# ----------------------------------------------------------------------
# Loader
# ----------------------------------------------------------------------


@dataclass
class LoadResult:
    """Ergebnis eines OTX → Python-Lade-Vorgangs."""
    simulator: PSimulator
    otx: OtxFile
    instances: dict[int, Any] = field(default_factory=dict)
    loaded: Counter = field(default_factory=Counter)
    skipped: Counter = field(default_factory=Counter)
    unsupported: Counter = field(default_factory=Counter)
    warnings: list[str] = field(default_factory=list)

    @property
    def coverage_ratio(self) -> float:
        """Anteil der gelidaen Klassen-Instanzen an der Gesamt-Menge."""
        total = sum(self.loaded.values()) + sum(self.unsupported.values())
        return sum(self.loaded.values()) / total if total > 0 else 0.0

    def summary(self) -> str:
        lines = [
            f"OTX-Loader-Result: {sum(self.loaded.values())} geladen, "
            f"{sum(self.skipped.values())} skipped, "
            f"{sum(self.unsupported.values())} unsupported "
            f"(Coverage: {self.coverage_ratio:.0%})"
        ]
        if self.unsupported:
            lines.append("Unsupported (top 10):")
            for klass, n in self.unsupported.most_common(10):
                lines.append(f"  {n:4}× {klass}")
        if self.warnings:
            lines.append(f"Warnings: {len(self.warnings)}")
            for w in self.warnings[:5]:
                lines.append(f"  {w}")
        return "\n".join(lines)


class OtxLoader:
    """Orchestriert den OTX → Python-Lade-Vorgang."""

    def __init__(self) -> None:
        self.simulator: PSimulator = PSimulator()
        self.otx: OtxFile | None = None
        self.instances: dict[int, Any] = {}
        self.warnings: list[str] = []
        # Pre-register PSimulator under ASimulator's OID 0 — Handler nutzt das
        self.instances[0] = self.simulator

    def load(self, otx: OtxFile) -> LoadResult:
        """Lädt eine geparste OTX-Datei und liefert LoadResult."""
        self.otx = otx
        result = LoadResult(simulator=self.simulator, otx=otx)

        # Pass 1: Instanziieren
        for oid, obj in otx.by_oid.items():
            if obj.klass in _SKIP:
                result.skipped[obj.klass] += 1
                continue
            handler = _HANDLERS.get(obj.klass)
            if handler is None:
                result.unsupported[obj.klass] += 1
                continue
            try:
                py = handler.instantiate(self, obj)
            except Exception as e:  # noqa: BLE001
                self.warnings.append(
                    f"instantiate {obj.klass}#{oid}: {type(e).__name__}: {e}"
                )
                result.unsupported[obj.klass] += 1
                continue
            if py is None:
                result.skipped[obj.klass] += 1
                continue
            self.instances[oid] = py
            result.loaded[obj.klass] += 1

        # Pass 2: Wire
        for oid, obj in otx.by_oid.items():
            py = self.instances.get(oid)
            if py is None:
                continue
            handler = _HANDLERS.get(obj.klass)
            if handler is None:
                continue
            try:
                handler.wire(self, py, obj)
            except Exception as e:  # noqa: BLE001
                self.warnings.append(
                    f"wire {obj.klass}#{oid}: {type(e).__name__}: {e}"
                )

        result.instances = self.instances
        result.warnings = self.warnings
        return result


# ----------------------------------------------------------------------
# Helpers — Reference Resolution
# ----------------------------------------------------------------------


def resolve_list(
    loader: OtxLoader, obj: OtxObject, list_attr: str
) -> list[Any]:
    """Dereferenziert ein `m_l<Foo>`-Attribut auf eine LList-OID und holt
    die Items über deren `sub_refs`.

    Liefert `[]` wenn Attribut fehlt, ONULL ist, oder die referenzierte
    LList unbekannt ist.
    """
    list_ref = obj.attrs.get(list_attr)
    if not isinstance(list_ref, int):
        return []
    assert loader.otx is not None
    list_obj = loader.otx.by_oid.get(list_ref)
    if list_obj is None:
        return []
    items: list[Any] = []
    for ref_block in list_obj.sub_refs:
        for oid in ref_block:
            inst = loader.instances.get(oid)
            if inst is not None:
                items.append(inst)
    return items


def resolve_ref(
    loader: OtxLoader, obj: OtxObject, attr: str
) -> Any | None:
    """Dereferenziert einen Single-Ref (OID-Integer)."""
    ref = obj.attrs.get(attr)
    if not isinstance(ref, int):
        return None
    return loader.instances.get(ref)


def copy_scalars(
    py_obj: Any, otx_obj: OtxObject, attrs: tuple[str, ...]
) -> None:
    """Kopiert eine Liste skalarer Attribute (gleicher Name) 1:1."""
    for a in attrs:
        if a in otx_obj.attrs:
            setattr(py_obj, a, otx_obj.attrs[a])


# ----------------------------------------------------------------------
# Konkrete Handler — V1-Minimum
# ----------------------------------------------------------------------


@register_handler("ASimulator")
class _ASimulatorHandler(ClassHandler):
    """Root-Objekt. Nutzt die bereits angelegte PSimulator-Instanz."""

    SCALARS = (
        "m_periodLen", "m_periodNum", "m_periodBegin",
        "m_iProduktionBezugsPeriode", "m_iProduktionEnde",
        "m_bIsProduktionEnde", "m_keim", "m_aktKeim",
        "m_sStartDate", "m_sEndDate", "m_name",
        "m_bIsEntAktiv",
    )

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        # Wiederverwendung der vor-instanzierten PSimulator (bei OID 0)
        return loader.simulator

    def wire(self, loader: OtxLoader, sim: PSimulator, obj: OtxObject) -> None:
        copy_scalars(sim, obj, self.SCALARS)
        # Auslöser, Pläne, Ressourcen registrieren
        for ausl in resolve_list(loader, obj, "m_lAusl"):
            sim.register_ausloeser(ausl)
        for plan in resolve_list(loader, obj, "m_lDlpl"):
            sim.register_plan(plan)
        for ress in resolve_list(loader, obj, "m_lRessBeleg"):
            sim.register_ressource(ress)
        for rm in resolve_list(loader, obj, "m_lRessMenge"):
            sim.register_ress_menge(rm)
        for sp in resolve_list(loader, obj, "m_lSpeichProz"):
            sim.register_speicher_proz(sp)
        for ez in resolve_list(loader, obj, "m_lEinsatz"):
            sim.register_einsatzzeit(ez)
        # Phase-5 Entscheider-Listen (P5-A)
        for zs in resolve_list(loader, obj, "m_lZelSystem"):
            sim.m_lZelSystem.append(zs)
        for ei in resolve_list(loader, obj, "m_lEntInfo"):
            sim.m_lEntInfo.append(ei)
        for es in resolve_list(loader, obj, "m_lEntStrategie"):
            sim.m_lEntStrategie.append(es)
        for ef in resolve_list(loader, obj, "m_lEntFeld"):
            sim.m_lEntFeld.append(ef)


# ----------------------------------------------------------------------
# Auslöser + Parameter
# ----------------------------------------------------------------------


def _set_ausloeser_oid(loader: "OtxLoader", py_ausl: Any, obj: OtxObject) -> None:
    """Setzt die stabile Auftrag-OID auf einem PAusloeser-Objekt.

    Strategie (P5D-SCOPE §4.2):
      1. Primär: obj.oid (= m_dwObjID aus der OTX-Datei) — stabil + eindeutig.
      2. Fallback: deterministischer laufender Index über sim.m_lAusl-Reihenfolge
         (wird NACH dem Eintragen durch register_ausloeser gesetzt → Index zum
         Zeitpunkt des wire-Calls stabil, da Pass 2 erst nach Pass 1 läuft).
    Annahme offengelegt: OTX-OID ist stabiler Farbschlüssel; Index-Fallback
    liefert korrekte Segmente, aber Farben können von OSim2004 abweichen.
    """
    if isinstance(getattr(obj, "oid", None), int) and obj.oid is not None:
        py_ausl.oid = obj.oid
    elif py_ausl.oid == -1:
        # Fallback: Index in m_lAusl zum Zeitpunkt des wire-Aufrufs.
        # wire läuft in Pass 2 (nach register_ausloeser in _ASimulatorHandler.wire),
        # daher len(m_lAusl) - 1 = stabiler Index des soeben registrierten Auslösers.
        idx = len(loader.simulator.m_lAusl)
        if idx > 0:
            py_ausl.oid = idx - 1
        else:
            py_ausl.oid = 0


@register_handler("PAslEinzel")
class _PAslEinzelHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.ausloeser.einzel import PAslEinzel
        a = PAslEinzel(loader.simulator)
        copy_scalars(a, obj, ("m_sName", "m_iBeginTermin"))
        # Stabile Auftrag-OID: die OTX-OID des Auslösers (P5D-SCOPE §4.2).
        if isinstance(getattr(obj, "oid", None), int):
            a.oid = obj.oid
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_lDlpl = resolve_ref(loader, obj, "m_lDlpl")
        for p in resolve_list(loader, obj, "m_lParameter"):
            py.m_lParameter.append(p)
        # Fallback: falls oid noch -1, Index-Fallback setzen.
        _set_ausloeser_oid(loader, py, obj)


def _make_parameter_handler(py_class_name: str, scalars: tuple[str, ...]):
    class _H(ClassHandler):
        def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
            from osim_engine.pps import parameter as P
            cls = getattr(P, py_class_name)
            p = cls(loader.simulator)
            copy_scalars(p, obj, ("m_sName",) + scalars)
            return p

    return _H


# Mappings: OTX-Klasse → (Python-Klasse, scalar-fields)
register_handler("PParameterMenge")(
    _make_parameter_handler("PParameterMenge", ("m_iWert",))
)
register_handler("PParameterID")(
    _make_parameter_handler("PParameterID", ("m_iWert",))
)
register_handler("PParameterPrioritaet")(
    _make_parameter_handler("PParameterPrioritaet", ("m_iWert",))
)
register_handler("PParameterFloat")(
    _make_parameter_handler("PParameterFloat", ("m_dWert",))
)


# ----------------------------------------------------------------------
# Durchlaufplan + Kanten + Knoten (V1-V4)
# ----------------------------------------------------------------------


@register_handler("PDurchlaufplan")
class _PDurchlaufplanHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.durchlaufplan import PDurchlaufplan
        p = PDurchlaufplan(loader.simulator)
        copy_scalars(p, obj, ("m_sName",))
        return p

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        # Knoten / Kanten anhängen (Reihenfolge ist über OTX-sub_refs stabil)
        for k in resolve_list(loader, obj, "m_lKnoten"):
            py.add_knoten(k)
        for k in resolve_list(loader, obj, "m_lKanten"):
            py.add_kante(k)
        # Start- und End-Kante: zuerst explizit, dann ggf. inferieren.
        # Sub-Pläne (von Rück/Alt-Knoten) haben in der OTX keine expliziten
        # Start/End-Refs — sie werden über die Kanten-Topologie erschlossen.
        start = resolve_ref(loader, obj, "m_lStartKante")
        end = resolve_ref(loader, obj, "m_lEndKante")
        if start is None:
            start = _infer_start_kante(py)
        if end is None:
            end = _infer_end_kante(py)
        if start is not None:
            py.set_start_kante(start)
        if end is not None:
            py.set_end_kante(end)


def _infer_start_kante(plan: Any) -> Any | None:
    """Kante ohne Vorgaenger = Start-Kante (sub-plan-Topologie)."""
    for kante in plan.m_lKanten:
        if not kante.m_lVorgaenger:
            return kante
    return None


def _infer_end_kante(plan: Any) -> Any | None:
    """Kante ohne Nachfolger = End-Kante (sub-plan-Topologie)."""
    for kante in plan.m_lKanten:
        if not kante.m_lNachfolger:
            return kante
    return None


@register_handler("PDlplKante", "PDpKaUebergang")
class _PDlplKanteHandler(ClassHandler):
    """PDpKaUebergang = Standard-Übergangs-Kante (mit m_iUebergangszeit)."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.kante.uebergang import PDpKaUebergang
        k = PDpKaUebergang(loader.simulator)
        copy_scalars(k, obj, ("m_sName", "m_iUebergangszeit"))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for nach in resolve_list(loader, obj, "m_lNachfolger"):
            if nach not in py.m_lNachfolger:
                py.m_lNachfolger.append(nach)
        for vor in resolve_list(loader, obj, "m_lVorgaenger"):
            if vor not in py.m_lVorgaenger:
                py.m_lVorgaenger.append(vor)


def _make_knoten_handler(import_path: str, py_class: str, scalars: tuple[str, ...]):
    """Erstellt einen Handler für eine PDlplKnoten-Variante."""

    class _H(ClassHandler):
        def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
            mod = __import__(import_path, fromlist=[py_class])
            cls = getattr(mod, py_class)
            k = cls(loader.simulator)
            copy_scalars(k, obj, ("m_sName",) + scalars)
            return k

        def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
            # Standard-Wiring für Knoten: KanteEin, KanteAus, KnotenOber
            ein = resolve_ref(loader, obj, "m_lKanteEin")
            aus = resolve_ref(loader, obj, "m_lKanteAus")
            ober = resolve_ref(loader, obj, "m_lKnotenOber")
            if ein is not None:
                py.m_lKanteEin = ein
            if aus is not None:
                py.m_lKanteAus = aus
            if ober is not None:
                py.m_lKnotenOber = ober

    return _H


register_handler("PDpKnKonstant")(
    _make_knoten_handler(
        "osim_engine.pps.knoten.zeitvorgabe",
        "PDpKnKonstant",
        ("m_iDurchfuehrungszeit",),
    )
)
register_handler("PDpKnMenge")(
    _make_knoten_handler(
        "osim_engine.pps.knoten.zeitvorgabe",
        "PDpKnMenge",
        ("m_iDfzProEinheit",),
    )
)
register_handler("PDpKnMengeRuesten")(
    _make_knoten_handler(
        "osim_engine.pps.knoten.zeitvorgabe",
        "PDpKnMengeRuesten",
        ("m_iDfzProEinheit", "m_iRuestzeit"),
    )
)
@register_handler("PDpKnVerteilung")
class _PDpKnVerteilungHandler(ClassHandler):
    """PDpKnVerteilung — Knoten mit verteilter Durchführungszeit.

    Wie Standard-Knoten, ZUSÄTZLICH `m_lVerteil`-Ref auf eine
    PVerteilung-Instanz. Ohne diese Ref crasht `get_durchfuehrungszeit`.
    """

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.knoten.zeitvorgabe import PDpKnVerteilung
        k = PDpKnVerteilung(loader.simulator)
        copy_scalars(k, obj, ("m_sName", "m_iVerteilZeit"))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        ein = resolve_ref(loader, obj, "m_lKanteEin")
        aus = resolve_ref(loader, obj, "m_lKanteAus")
        ober = resolve_ref(loader, obj, "m_lKnotenOber")
        verteil = resolve_ref(loader, obj, "m_lVerteil")
        if ein is not None:
            py.m_lKanteEin = ein
        if aus is not None:
            py.m_lKanteAus = aus
        if ober is not None:
            py.m_lKnotenOber = ober
        if verteil is not None:
            py.m_lVerteil = verteil


@register_handler("PDpKaVerteilung")
class _PDpKaVerteilungHandler(ClassHandler):
    """PDpKaVerteilung — Übergangs-Kante mit verteilter Übergangszeit."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.kante.verteilung import PDpKaVerteilung
        k = PDpKaVerteilung(loader.simulator)
        copy_scalars(k, obj, ("m_sName", "m_iAktVerteilungszeit"))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for nach in resolve_list(loader, obj, "m_lNachfolger"):
            if nach not in py.m_lNachfolger:
                py.m_lNachfolger.append(nach)
        for vor in resolve_list(loader, obj, "m_lVorgaenger"):
            if vor not in py.m_lVorgaenger:
                py.m_lVorgaenger.append(vor)
        verteil = resolve_ref(loader, obj, "m_lVerteil")
        if verteil is not None:
            py.m_lVerteil = verteil


# ----------------------------------------------------------------------
# PVerteilung-Familie (PVert* + PVertExtern)
# ----------------------------------------------------------------------


def _make_pvert_handler(py_class: str, scalars: tuple[str, ...]):
    class _H(ClassHandler):
        def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
            from osim_engine.pps import verteilung as V
            cls = getattr(V, py_class)
            v = cls(loader.simulator)
            copy_scalars(v, obj, ("m_sName",) + scalars)
            return v

        def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
            ext = resolve_ref(loader, obj, "m_lPVertExt")
            if ext is not None:
                py.m_lPVertExt = ext

    return _H


register_handler("PVertKonstant")(
    _make_pvert_handler("PVertKonstant", ("m_fKonstante",))
)
register_handler("PVertGleich")(
    _make_pvert_handler("PVertGleich", ("m_fMinimum", "m_fMaximum"))
)
register_handler("PVertNormal")(
    _make_pvert_handler("PVertNormal", ("m_fErwartungsw", "m_fStandardabw"))
)
register_handler("PVertLogNorm")(
    _make_pvert_handler("PVertLogNorm", ("m_fErwartungsw", "m_fStandardabw"))
)
register_handler("PVertExponential")(
    _make_pvert_handler("PVertExponential", ("m_fErwartungsw", "m_iRechtsVerschiebung"))
)
register_handler("PVertBeta")(
    _make_pvert_handler(
        "PVertBeta",
        ("m_fUntereGrenze", "m_fObereGrenze", "m_fAlpha", "m_fBeta"),
    )
)
register_handler("PVertBetaPERT")(
    _make_pvert_handler(
        "PVertBetaPERT",
        ("m_fpessimistischerWert", "m_fhaeufigsterWert", "m_foptimistischerWert"),
    )
)


@register_handler("PVertExtern")
class _PVertExternHandler(ClassHandler):
    """PVertExtern — eigener Zufallsgenerator pro Verteilung."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.verteilung import PVertExtern
        e = PVertExtern(loader.simulator)
        # m_keim aus OTX → setzt auch m_Internerkeim und den Generator-Ref
        keim = obj.attrs.get("m_keim")
        intern = obj.attrs.get("m_Internerkeim")
        if isinstance(keim, (int, float)):
            e.m_keim = float(keim)
        if isinstance(intern, (int, float)):
            e.m_Internerkeim = float(intern)
        else:
            e.m_Internerkeim = e.m_keim
        e._keim_ref[0] = e.m_Internerkeim
        copy_scalars(e, obj, ("m_sName",))
        return e


@register_handler("PDpKnRueckKonstant")
class _PDpKnRueckKonstantHandler(ClassHandler):
    """PDpKnRueckKonstant — Knoten + zwingend zugehöriger Sub-Plan."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.knoten.ruecksprung import PDpKnRueckKonstant
        k = PDpKnRueckKonstant(loader.simulator)
        copy_scalars(k, obj, ("m_sName", "m_iWiederholungenZiel"))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        # Standard-Knoten-Wiring
        ein = resolve_ref(loader, obj, "m_lKanteEin")
        aus = resolve_ref(loader, obj, "m_lKanteAus")
        if ein is not None:
            py.m_lKanteEin = ein
        if aus is not None:
            py.m_lKanteAus = aus
        # Sub-Plan einhängen (set_sub_plan setzt sub.m_lKnotenOber = py)
        sub = resolve_ref(loader, obj, "m_lDlpl")
        if sub is not None:
            py.set_sub_plan(sub)


# ----------------------------------------------------------------------
# Alternativ-Knoten + PAlternative
# ----------------------------------------------------------------------


@register_handler("PDpKnAlternativVerteilung")
class _PDpKnAlternativVerteilungHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.knoten.alternativ import PDpKnAlternativVerteilung
        k = PDpKnAlternativVerteilung(loader.simulator)
        copy_scalars(k, obj, ("m_sName",))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ein in (resolve_ref(loader, obj, "m_lKanteEin"),):
            if ein is not None:
                py.m_lKanteEin = ein
        aus = resolve_ref(loader, obj, "m_lKanteAus")
        if aus is not None:
            py.m_lKanteAus = aus
        ober = resolve_ref(loader, obj, "m_lKnotenOber")
        if ober is not None:
            py.m_lKnotenOber = ober
        for alt in resolve_list(loader, obj, "m_lAlternativen"):
            py.add_alternative(alt)


@register_handler("PAlternativeVerteilung")
class _PAlternativeVerteilungHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.knoten.alternativ import PAlternativeVerteilung
        a = PAlternativeVerteilung(loader.simulator)
        copy_scalars(a, obj, ("m_sName", "m_fAuswahlWarschlkt"))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        # Sub-Plan-Wiring erfolgt im PDpKnAlternativVerteilung-Wiring
        # (add_alternative setzt sub.m_lKnotenOber = knoten). Hier nur den
        # Sub-Plan an die Alternative hängen.
        dlpl = resolve_ref(loader, obj, "m_lDlpl")
        if dlpl is not None:
            py.m_lDlpl = dlpl


# ----------------------------------------------------------------------
# Ressourcen (PBetriebsmittel, PPerson)
# ----------------------------------------------------------------------


def _make_ressource_handler(import_path: str, py_class: str):
    class _H(ClassHandler):
        def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
            mod = __import__(import_path, fromlist=[py_class])
            cls = getattr(mod, py_class)
            r = cls(loader.simulator)
            copy_scalars(r, obj, ("m_sName",))
            return r

        def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
            # AssozBeleg-Listen werden vom Plan-Wiring referenziert; hier nichts
            pass

    return _H


register_handler("PBetriebsmittel")(
    _make_ressource_handler("osim_engine.resources.beleg", "PBetriebsmittel")
)
register_handler("PPerson")(
    _make_ressource_handler("osim_engine.resources.beleg", "PPerson")
)


# ----------------------------------------------------------------------
# Einsatzzeiten (V6/V6.5) — Schichten + Tagesarbeitszeit
# ----------------------------------------------------------------------


@register_handler("PEinsatzzeitTag")
class _PEinsatzzeitTagHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.einsatzzeit import PEinsatzzeitTag
        e = PEinsatzzeitTag(loader.simulator)
        copy_scalars(
            e, obj,
            ("m_sName", "m_iBeginn", "m_iEnde",
             "m_iPauseBeginn", "m_iPauseEnde", "m_iPauseDauer"),
        )
        return e

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        # PTagRess-Liste: Wochenplan (Tag-Nr → Ressource). Ohne dieses
        # Wiring würden on_einsatz_beginn/on_einsatz_ende nie an die
        # Maschinen propagieren — Counter wie m_dPtkEinsatzzeit blieben 0.
        for tagress in resolve_list(loader, obj, "m_lTagRess"):
            py.m_lTagRess.append(tagress)
            # Rück-Link analog attach_tag_ress
            if tagress.m_oRessBeleg is not None and tagress.m_oRessBeleg not in py.m_lRessBeleg:
                py.m_lRessBeleg.append(tagress.m_oRessBeleg)
                tagress.m_oRessBeleg.m_lEinsatz = py
        # Schicht-Definitionen (Begin/End-Stunden pro Tag)
        for tagez in resolve_list(loader, obj, "m_lTagesEinsatzzeit"):
            py.m_lTagesEinsatzzeit.append(tagez)


@register_handler("PTagRess")
class _PTagRessHandler(ClassHandler):
    """Dataclass — Tag-Nr + Verweis auf PRessBeleg."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.einsatzzeit import PTagRess
        tag = obj.attrs.get("m_iTag", 0)
        return PTagRess(m_iTag=int(tag) if isinstance(tag, int) else 0)

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_oRessBeleg = resolve_ref(loader, obj, "m_oRessBeleg")


@register_handler("PTagesEinsatzzeit")
class _PTagesEinsatzzeitHandler(ClassHandler):
    """Dataclass — Schicht-Beginn/Ende in Stunden."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.einsatzzeit import PTagesEinsatzzeit
        t = PTagesEinsatzzeit()
        copy_scalars(t, obj, ("m_iEinsatzAnfang", "m_iEinsatzEnde"))
        return t


# ----------------------------------------------------------------------
# Assoziationen (Beleg + Menge)
# ----------------------------------------------------------------------


@register_handler("PAssozRessEnt")
class _PAssozRessEntHandler(ClassHandler):
    """P5-G: Entscheider-aware Belegungs-Assoz (cpp:21-111)."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.ent_beleg import PAssozRessEnt
        a = PAssozRessEnt(loader.simulator)
        copy_scalars(a, obj, ("m_sName",))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ress in resolve_list(loader, obj, "m_lRessBeleg"):
            if ress not in py.m_lRessBeleg if hasattr(py, "m_lRessBeleg") else True:
                if hasattr(py, "m_lRessBeleg") and isinstance(py.m_lRessBeleg, list):
                    py.m_lRessBeleg.append(ress)
                py.m_lRessourcen.append(ress)


@register_handler("PAssozELogikEnt")
class _PAssozELogikEntHandler(ClassHandler):
    """P5-G: Entscheider-aware ELogik-Belegungs-Assoz."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.ent_beleg import PAssozELogikEnt
        a = PAssozELogikEnt(loader.simulator)
        copy_scalars(a, obj, ("m_sName",))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ress in resolve_list(loader, obj, "m_lRessBeleg"):
            if hasattr(py, "m_lRessBeleg") and isinstance(py.m_lRessBeleg, list):
                if ress not in py.m_lRessBeleg:
                    py.m_lRessBeleg.append(ress)
            py.m_lRessourcen.append(ress)


@register_handler("PAssozBeleg")
class _PAssozBelegHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.beleg import PAssozBeleg
        a = PAssozBeleg(loader.simulator)
        copy_scalars(a, obj, ("m_sName",))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        # Liste der zugeordneten Ressourcen-Belegungen
        for ress in resolve_list(loader, obj, "m_lRessBeleg"):
            if hasattr(py, "m_lRessBeleg") and isinstance(py.m_lRessBeleg, list):
                if ress not in py.m_lRessBeleg:
                    py.m_lRessBeleg.append(ress)


# Hilfs-Strukturen, die wir noch nicht brauchen
register_skip("PAssozBelegLinkInfo")


# ----------------------------------------------------------------------
# Phase-1.3 W3: PRessMenge (Bestands-Ressource / Lager)
# (PRessMenge.odh). Voraussetzung für PAssozMenge-Roundtrip-Tests
# (Plan 01.3-04): ohne PRessMenge-Handler wird das vom Erzeuger /
# Verbraucher referenzierte Lager beim Reload nicht instanziiert →
# `m_lMengRess` bleibt None → key_link-Assertion fällt.
#
# Persistierte Skalare (siehe PRessMenge.odh:44-50):
#   m_sName, m_iBestandAnfang, m_iBestandMax, m_fAnfangswert,
#   m_fKostenZusatz
# Sim-Laufzeit-Counter (m_iPtkKummErzgMengeGesamt, …) werden NICHT
# als Loader-Scalars gelesen — sie werden in on_sim_begin / on_rec_init
# auf 0 zurückgesetzt (siehe PRessMenge.cpp). Konsistent mit dem
# Loader-Vertrag für andere Ressourcen.
# ----------------------------------------------------------------------


@register_handler("PRessMenge")
class _PRessMengeHandler(ClassHandler):
    """Bestands-Ressource (Lager). V5-Material-Fluss-Pflichtklasse."""

    SCALARS = (
        "m_sName",
        "m_iBestandAnfang",
        "m_iBestandMax",
        "m_fAnfangswert",
        "m_fKostenZusatz",
    )

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.menge import PRessMenge
        r = PRessMenge(loader.simulator)
        copy_scalars(r, obj, self.SCALARS)
        return r


# ----------------------------------------------------------------------
# Phase-1.3 W2: PAssozMenge-Familie (Material-Fluss-Assoziationen)
# (PAssozRessource.{odh:579-898,cpp}). 1 abstract + 4 konkrete Subklassen.
#
# Pattern-Quelle: _PAssozBelegHandler (oben). Wichtige Abweichung:
# `m_lMengRess` ist trotz `m_l`-Präfix ein SCALAR-POINTER auf eine
# einzelne PRessMenge (keine LList-Container) — daher `resolve_ref`
# (analog _PTagRessHandler.m_oRessBeleg), nicht `resolve_list`.
#
# Audit-Quelle: .planning/phases/01.3-.../01.3-01-AUDIT.md Sektionen 2.2-2.7.
# ----------------------------------------------------------------------


@register_handler("PAssozMenge")
class _PAssozMengeHandler(ClassHandler):
    """Abstract-Basis-Handler. Im Regelfall kommen nur Subklassen im OTX vor,
    aber der Handler ist da, falls eine Datei `PAssozMenge` direkt nennt.
    """

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.menge import PAssozMenge
        a = PAssozMenge(loader.simulator)
        copy_scalars(a, obj, ("m_sName",))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_lMengRess = resolve_ref(loader, obj, "m_lMengRess")


@register_handler("PAssozMengeErzgt")
class _PAssozMengeErzgtHandler(ClassHandler):
    """Erzeuger: am Prozess-Ende wird `m_iMengeAus` zugebucht."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.menge import PAssozMengeErzgt
        a = PAssozMengeErzgt(loader.simulator)
        copy_scalars(a, obj, ("m_sName", "m_iMengeAus"))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_lMengRess = resolve_ref(loader, obj, "m_lMengRess")


@register_handler("PAssozMengeVerbr")
class _PAssozMengeVerbrHandler(ClassHandler):
    """Verbraucher: am Prozess-Beginn wird `m_iMengeEin` abgebucht."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.menge import PAssozMengeVerbr
        a = PAssozMengeVerbr(loader.simulator)
        copy_scalars(a, obj, ("m_sName", "m_iMengeEin"))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_lMengRess = resolve_ref(loader, obj, "m_lMengRess")


@register_handler("PAssozMengeVerbrZwischen")
class _PAssozMengeVerbrZwischenHandler(ClassHandler):
    """Zwischenstand-Verbrauch. Sim-Semantik identisch zu Verbr,
    aber eigener OTX-Klassenname → eigener Handler. Geerbtes Attr
    `m_iMengeEin` wird explizit per copy_scalars gesetzt, sonst bleibt
    der Default 1.
    """

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.menge import PAssozMengeVerbrZwischen
        a = PAssozMengeVerbrZwischen(loader.simulator)
        copy_scalars(a, obj, ("m_sName", "m_iMengeEin"))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_lMengRess = resolve_ref(loader, obj, "m_lMengRess")


@register_handler("PAssozMengeAbfr")
class _PAssozMengeAbfrHandler(ClassHandler):
    """Abfrage: nur prüfen ob genug da, NICHT abbuchen."""

    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.menge import PAssozMengeAbfr
        a = PAssozMengeAbfr(loader.simulator)
        copy_scalars(a, obj, ("m_sName", "m_iMengeAbfr"))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_lMengRess = resolve_ref(loader, obj, "m_lMengRess")


# ----------------------------------------------------------------------
# Phase-5-A: Entscheider-Datenstrukturen
# (EPEntscheidung.{odh,cpp} + EPStrategie.odh)
# ----------------------------------------------------------------------


@register_handler("EPEntInformation")
class _EPEntInformationHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.entscheidung import EPEntInformation
        i = EPEntInformation(loader.simulator)
        copy_scalars(i, obj, (
            "m_sName", "m_iID", "m_sPropertyClassName", "m_sParentClassName",
            "m_iObereGrenze", "m_iUntereGrenze", "m_bIsMin",
        ))
        return i


@register_handler("EPEntInformationssystem")
class _EPEntInformationssystemHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.entscheidung import EPEntInformationssystem
        s = EPEntInformationssystem(loader.simulator)
        copy_scalars(s, obj, ("m_sName",))
        return s

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for info in resolve_list(loader, obj, "m_lInformationen"):
            if info not in py.m_lInformationen:
                py.m_lInformationen.append(info)


@register_handler("EPZiel")
class _EPZielHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.entscheidung import EPZiel
        z = EPZiel(loader.simulator)
        copy_scalars(z, obj, (
            "m_sName", "m_sZielStrKen", "m_iAusrichtung", "m_iGewichtung",
        ))
        return z

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for info in resolve_list(loader, obj, "m_lAssoziierteInformationen"):
            if info not in py.m_lAssoziierteInformationen:
                py.m_lAssoziierteInformationen.append(info)


@register_handler("EPKrzDurchlaufzeit")
class _EPKrzDurchlaufzeitHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.entscheidung import EPKrzDurchlaufzeit
        z = EPKrzDurchlaufzeit(loader.simulator)
        copy_scalars(z, obj, (
            "m_sName", "m_sZielStrKen", "m_iAusrichtung", "m_iGewichtung",
        ))
        return z

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for info in resolve_list(loader, obj, "m_lAssoziierteInformationen"):
            if info not in py.m_lAssoziierteInformationen:
                py.m_lAssoziierteInformationen.append(info)


@register_handler("EPZelSystem")
class _EPZelSystemHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.entscheidung import EPZelSystem
        z = EPZelSystem(loader.simulator)
        copy_scalars(z, obj, ("m_sName",))
        return z

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ziel in resolve_list(loader, obj, "m_lEpZiel"):
            if ziel not in py.m_lEpZiel:
                py.m_lEpZiel.append(ziel)


@register_handler("EPEntFeld")
class _EPEntFeldHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.entscheidung import EPEntFeld
        ef = EPEntFeld(loader.simulator)
        copy_scalars(ef, obj, ("m_sName",))
        return ef

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_oPPerson = resolve_ref(loader, obj, "m_oPPerson")
        py.m_oZelSystem = resolve_ref(loader, obj, "m_oZelSystem")
        py.m_oEntInf = resolve_ref(loader, obj, "m_oEntInf")
        py.m_oEntStrategie = resolve_ref(loader, obj, "m_oEntStrategie")


@register_handler("EPAszEntFeld")
class _EPAszEntFeldHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.resources.assoziation.ent_feld import EPAszEntFeld
        a = EPAszEntFeld(loader.simulator)
        copy_scalars(a, obj, ("m_sName",))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ef in resolve_list(loader, obj, "m_lEntFeldTupel"):
            if ef not in py.m_lEntFeldTupel:
                py.m_lEntFeldTupel.append(ef)
        # Parent-Knoten + Ober-/Unter-Assoz (PAssozRessource-Basis-Refs)
        py.m_lKnoten = resolve_ref(loader, obj, "m_lKnoten")
        py.m_lOberAssoz = resolve_ref(loader, obj, "m_lOberAssoz")
        for ua in resolve_list(loader, obj, "m_lUnterAssoz"):
            if ua not in py.m_lUnterAssoz:
                py.m_lUnterAssoz.append(ua)


# ----------------------------------------------------------------------
# Phase-5-E: rsv-Strategien (EPStrategie.{odh:88-369, cpp:60-1543})
# ----------------------------------------------------------------------


@register_handler("EPEntStrKrzRessBase")
class _EPEntStrKrzRessBaseHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.strategie_rsv import EPEntStrKrzRessBase
        s = EPEntStrKrzRessBase(loader.simulator)
        copy_scalars(s, obj, (
            "m_sName", "m_bEntscheidungErzwingen", "m_bEntscheidungAktivieren",
            "m_eReaktion", "m_iAnzahl", "m_bRuecksetzenNachZeitspanne",
            "m_iRuecksetzZeitspanne", "m_iZstSpanne",
        ))
        return s


@register_handler("EPEntStrKrzRessBedarf")
class _EPEntStrKrzRessBedarfHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.strategie_rsv import EPEntStrKrzRessBedarf
        s = EPEntStrKrzRessBedarf(loader.simulator)
        copy_scalars(s, obj, (
            "m_sName", "m_bEntscheidungErzwingen", "m_bEntscheidungAktivieren",
            "m_eReaktion", "m_iAnzahl", "m_bRuecksetzenNachZeitspanne",
            "m_iRuecksetzZeitspanne", "m_iZstSpanne",
            "m_iProzAnzahl", "m_dArbInhalt", "m_dDstAuslastung",
        ))
        return s


@register_handler("EPEntStrKrzRessArbSuchen")
class _EPEntStrKrzRessArbSuchenHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.strategie_rsv import EPEntStrKrzRessArbSuchen
        s = EPEntStrKrzRessArbSuchen(loader.simulator)
        copy_scalars(s, obj, (
            "m_sName", "m_bEntscheidungErzwingen", "m_bEntscheidungAktivieren",
            "m_eReaktion", "m_iAnzahl", "m_bRuecksetzenNachZeitspanne",
            "m_iRuecksetzZeitspanne", "m_iZstSpanne",
            "m_bGegenrechnen", "m_bWechselAuchNachZuordnung",
            "m_bGruppenBeruecksichtigen", "m_bGegenseitigZuordnen",
            "m_bLinksStatusSofortSetzen", "m_bZuordnungsmengeAusGruppeExtrahieren",
            "m_eWahlverhalten",
            "m_iErlaubteWechselProGruppe", "m_iErlaubteZuordnungProGruppe",
            "m_iErlaubteZuordnungProRessource",
            "m_fProzAnteilEinsatzeitAnRuecksetzzeit", "m_bEinsatzzeitBeachten",
            "m_iBrachDistance", "m_iBrachLevel", "m_iPrzAnzahl",
            "m_dArbInhalt", "m_dAuslastung",
        ))
        return s


# ----------------------------------------------------------------------
# Phase-5-H/I: PDpKnAlternativELogik + PDpKnAlternativSplit
# (PDpKnAlternativELogik.{odh:669-1000, cpp})
# ----------------------------------------------------------------------


@register_handler("PAlternativeELogik")
class _PAlternativeELogikHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.alternativ_elogik import PAlternativeELogik
        a = PAlternativeELogik(loader.simulator)
        copy_scalars(a, obj, (
            "m_sName", "m_fAuswahlWarschlkt",
            "m_iQualitaetsfaehigkeit", "m_iFlexibilitaet", "m_dUser",
        ))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        dlpl = resolve_ref(loader, obj, "m_lDlpl")
        if dlpl is not None:
            py.m_lDlpl = dlpl


@register_handler("PAlternativeSplit")
class _PAlternativeSplitHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.alternativ_elogik import PAlternativeSplit
        a = PAlternativeSplit(loader.simulator)
        copy_scalars(a, obj, ("m_sName", "m_fAuswahlWarschlkt"))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        dlpl = resolve_ref(loader, obj, "m_lDlpl")
        if dlpl is not None:
            py.m_lDlpl = dlpl


@register_handler("PDpKnAlternativELogik")
class _PDpKnAlternativELogikHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.alternativ_elogik import PDpKnAlternativELogik
        k = PDpKnAlternativELogik(loader.simulator)
        copy_scalars(k, obj, (
            "m_sName", "m_eZFunktionTyp",
            "m_iZGTermintreue", "m_iZGQualitaet", "m_iZGDlz",
            "m_iZGKosten", "m_iZGKapauslastung", "m_iZGBestaende",
            "m_iZGFlexibilitaet", "m_iGDringlichkeit",
        ))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ref_attr, py_attr in (
            ("m_lKanteEin", "m_lKanteEin"),
            ("m_lKanteAus", "m_lKanteAus"),
            ("m_lKnotenOber", "m_lKnotenOber"),
        ):
            v = resolve_ref(loader, obj, ref_attr)
            if v is not None:
                setattr(py, py_attr, v)
        for alt in resolve_list(loader, obj, "m_lAlternativen"):
            if alt not in py.m_lAlternativen:
                py.m_lAlternativen.append(alt)


@register_handler("PDpKnAlternativSplit")
class _PDpKnAlternativSplitHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.alternativ_elogik import PDpKnAlternativSplit
        k = PDpKnAlternativSplit(loader.simulator)
        copy_scalars(k, obj, ("m_sName",))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ref_attr, py_attr in (
            ("m_lKanteEin", "m_lKanteEin"),
            ("m_lKanteAus", "m_lKanteAus"),
            ("m_lKnotenOber", "m_lKnotenOber"),
        ):
            v = resolve_ref(loader, obj, ref_attr)
            if v is not None:
                setattr(py, py_attr, v)
        for alt in resolve_list(loader, obj, "m_lAlternativen"):
            if alt not in py.m_lAlternativen:
                py.m_lAlternativen.append(alt)


# Skip-Liste-Erweiterung für ELogik/Split-LLists (Container)
register_skip("PAlternativeELogikLList", "PAlternativeSplitLList")


# ----------------------------------------------------------------------
# Phase-5-F: eet-Strategien (EPStrategie.{odh:383-622, cpp:1551-3031})
# ----------------------------------------------------------------------


def _make_eet_handler(py_class_name: str, extra_scalars: tuple[str, ...] = ()):
    common_scalars = (
        "m_sName", "m_bEntscheidungErzwingen", "m_bEntscheidungAktivieren",
    )

    class _H(ClassHandler):
        def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
            from osim_engine.decisions import strategie_eet as E
            cls = getattr(E, py_class_name)
            s = cls(loader.simulator)
            copy_scalars(s, obj, common_scalars + extra_scalars)
            return s

    return _H


register_handler("EPEntStrAltExternRessBelegBase")(
    _make_eet_handler("EPEntStrAltExternRessBelegBase")
)
register_handler("EPEntStrKrzKapVeraenderungBase")(
    _make_eet_handler("EPEntStrKrzKapVeraenderungBase", (
        "m_bIsDynPausendauer", "m_iStaffelDelta",
        "m_iPrzZugArbInhalt", "m_iZugArbInhalt",
        "m_iPrzZugEglArbInhalt", "m_iZugEglArbInhalt",
        "m_iDpKnAnzFuerPrgEglArbInhalt",
    ))
)
register_handler("EPEntStrKrzKapVerPrgAutrag")(
    _make_eet_handler("EPEntStrKrzKapVerPrgAutrag", (
        "m_bIsDynPausendauer", "m_fPrzZugPrgBedarf", "m_fPrzZugWslArbInhalt",
    ))
)
register_handler("EPEntStrArbVertMitWechsel")(
    _make_eet_handler("EPEntStrArbVertMitWechsel", (
        "m_bIsDynPausendauer", "m_bIsTausche", "m_bIsTauscheSpaet",
        "m_bIsUmlageWstByRessAnzahl", "m_iMaxTauschversuche",
        "m_fPrzZugGesamt", "m_bIsDumperNurTauschen", "m_iEinsatzzuschlag",
    ))
)


# ----------------------------------------------------------------------
# Phase-5-D: Konkrete Aufgaben-Knoten
# (PDpKnAlternativELogik.{odh:158-668, cpp:411-...})
# ----------------------------------------------------------------------


def _make_aufgabe_knoten_handler(py_class_name: str, scalars: tuple[str, ...] = ()):
    """Erzeugt Handler für Aufgaben-Knoten-Subklassen.

    Aufgaben-Knoten erben von PDpKnVerteilung (V9), brauchen also dieselben
    Standard-Refs (KanteEin/Aus/KnotenOber + m_lVerteil). Plus eigene
    Attribute aus `scalars`.
    """
    class _H(ClassHandler):
        def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
            from osim_engine.decisions import aufgabe as A
            cls = getattr(A, py_class_name)
            k = cls(loader.simulator)
            copy_scalars(
                k, obj,
                ("m_sName", "m_eRessUsage", "m_iVerteilZeit") + scalars,
            )
            return k

        def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
            # Standard-Knoten-Refs (wie in PDpKnVerteilung)
            ein = resolve_ref(loader, obj, "m_lKanteEin")
            aus = resolve_ref(loader, obj, "m_lKanteAus")
            ober = resolve_ref(loader, obj, "m_lKnotenOber")
            verteil = resolve_ref(loader, obj, "m_lVerteil")
            if ein is not None:
                py.m_lKanteEin = ein
            if aus is not None:
                py.m_lKanteAus = aus
            if ober is not None:
                py.m_lKnotenOber = ober
            if verteil is not None:
                py.m_lVerteil = verteil
            # EPEntAufgabeAltIntern-Subtypen: m_lDlpl (Sub-Plan-Liste)
            if hasattr(py, "m_lDlpl") and isinstance(py.m_lDlpl, list):
                for dlpl in resolve_list(loader, obj, "m_lDlpl"):
                    if dlpl not in py.m_lDlpl:
                        py.m_lDlpl.append(dlpl)
            # EPEntAufgabeAltExternRessBeleg: m_lRessourcen
            if hasattr(py, "m_lRessourcen") and isinstance(py.m_lRessourcen, list):
                for ress in resolve_list(loader, obj, "m_lRessourcen"):
                    if ress not in py.m_lRessourcen:
                        py.m_lRessourcen.append(ress)
            # EPEntKrzRessourcenEinsatz: m_lDlplKnoten
            if hasattr(py, "m_lDlplKnoten") and isinstance(py.m_lDlplKnoten, list):
                for kn in resolve_list(loader, obj, "m_lDlplKnoten"):
                    if kn not in py.m_lDlplKnoten:
                        py.m_lDlplKnoten.append(kn)

    return _H


# Intern-Variante: erbt EPEntAufgabeAltIntern (mit m_lDlpl)
register_handler("EPEntAltProzesswege")(
    _make_aufgabe_knoten_handler("EPEntAltProzesswege")
)
register_handler("EPEntAuftragsgroesse")(
    _make_aufgabe_knoten_handler("EPEntAuftragsgroesse", ("m_iShadowMenge",))
)

# Extern-Variante: erbt EPEntAufgabeAltExtern
register_handler("EPEntKrzRessourcenEinsatz")(
    _make_aufgabe_knoten_handler("EPEntKrzRessourcenEinsatz")
)

# Extern-RessBeleg-Variante: erbt EPEntAufgabeAltExternRessBeleg
register_handler("EPEntKrzRessourcenEinsatzRess")(
    _make_aufgabe_knoten_handler("EPEntKrzRessourcenEinsatzRess")
)
register_handler("EPEntReihenfolge")(
    _make_aufgabe_knoten_handler("EPEntReihenfolge")
)
register_handler("EPEntKrzKapazitaetsVeraenderung")(
    _make_aufgabe_knoten_handler("EPEntKrzKapazitaetsVeraenderung")
)


# ----------------------------------------------------------------------
# Phase-5-J: ACOAnt (Auslöser, PAusloeser.odh:253-300)
# ----------------------------------------------------------------------


@register_handler("ACOAnt")
class _ACOAntHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.ausloeser.aco_ant import ACOAnt
        a = ACOAnt(loader.simulator)
        copy_scalars(a, obj, (
            "m_sName", "m_iBeginTermin", "m_iPlanZeit", "m_iRealeAuftragsdauer",
        ))
        # Stabile Auftrag-OID (P5D-SCOPE §4.2)
        if isinstance(getattr(obj, "oid", None), int):
            a.oid = obj.oid
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_lDlpl = resolve_ref(loader, obj, "m_lDlpl")
        for p in resolve_list(loader, obj, "m_lParameter"):
            py.m_lParameter.append(p)
        for d in resolve_list(loader, obj, "m_lACODlpl"):
            if d not in py.m_lACODlpl:
                py.m_lACODlpl.append(d)


# ----------------------------------------------------------------------
# Phase-5-K: ACOClasses (ACOClasses.{odh,cpp})
# ----------------------------------------------------------------------


@register_handler("ACOSplit")
class _ACOSplitHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.aco import ACOSplit
        k = ACOSplit(loader.simulator)
        copy_scalars(k, obj, ("m_sName", "m_eRessUsage"))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ref_attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber", "m_lVerteil"):
            v = resolve_ref(loader, obj, ref_attr)
            if v is not None:
                setattr(py, ref_attr, v)
        for d in resolve_list(loader, obj, "m_lDlpl"):
            if d not in py.m_lDlpl:
                py.m_lDlpl.append(d)


@register_handler("ACOLogik")
class _ACOLogikHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.aco import ACOLogik
        k = ACOLogik(loader.simulator)
        copy_scalars(k, obj, ("m_sName", "m_eRessUsage"))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ref_attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber", "m_lVerteil"):
            v = resolve_ref(loader, obj, ref_attr)
            if v is not None:
                setattr(py, ref_attr, v)
        for d in resolve_list(loader, obj, "m_lDlpl"):
            if d not in py.m_lDlpl:
                py.m_lDlpl.append(d)


@register_handler("ACODpKnSplit")
class _ACODpKnSplitHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.aco import ACODpKnSplit
        k = ACODpKnSplit(loader.simulator)
        copy_scalars(k, obj, ("m_sName", "m_iDfzProEinheit", "m_iRuestzeit"))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ref_attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber"):
            v = resolve_ref(loader, obj, ref_attr)
            if v is not None:
                setattr(py, ref_attr, v)


@register_handler("ACOReihenfolge")
class _ACOReihenfolgeHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.decisions.aco import ACOReihenfolge
        k = ACOReihenfolge(loader.simulator)
        copy_scalars(k, obj, ("m_sName", "m_iDfzProEinheit", "m_iRuestzeit"))
        return k

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        for ref_attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber"):
            v = resolve_ref(loader, obj, ref_attr)
            if v is not None:
                setattr(py, ref_attr, v)


# ----------------------------------------------------------------------
# Phase-5-B: EPAslEntAufExtern (Auslöser-Entscheider)
# ----------------------------------------------------------------------


@register_handler("EPAslEntAufExtern")
class _EPAslEntAufExternHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.ausloeser.ent_extern import EPAslEntAufExtern
        a = EPAslEntAufExtern(loader.simulator)
        copy_scalars(a, obj, (
            "m_sName", "m_iBeginTermin", "m_bTaeglichWiederholen",
            "m_iSollDauer", "m_iMaxWarteZeit",
        ))
        # Stabile Auftrag-OID (P5D-SCOPE §4.2)
        if isinstance(getattr(obj, "oid", None), int):
            a.oid = obj.oid
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        _set_ausloeser_oid(loader, py, obj)  # Fallback falls instantiate kein oid hatte
        py.m_lDlpl = resolve_ref(loader, obj, "m_lDlpl")
        for p in resolve_list(loader, obj, "m_lParameter"):
            py.m_lParameter.append(p)
        py.m_lEntitaet = resolve_ref(loader, obj, "m_lEntitaet")


# ----------------------------------------------------------------------
# Convenience-API
# ----------------------------------------------------------------------


def load_otx_file(path: Path | str) -> LoadResult:
    """One-shot: OTX-Datei einlesen + laden + LoadResult zurückgeben."""
    otx = parse_otx_file(path)
    loader = OtxLoader()
    return loader.load(otx)
