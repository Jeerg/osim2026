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
    # Entscheider-Listen — meist leer in Phase-1..4-Modellen
    "EPEntFeldLList", "EPEntInformationssystemLList",
    "EPEntStrategieLList", "EPZelSystemLList",
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


# ----------------------------------------------------------------------
# Auslöser + Parameter
# ----------------------------------------------------------------------


@register_handler("PAslEinzel")
class _PAslEinzelHandler(ClassHandler):
    def instantiate(self, loader: OtxLoader, obj: OtxObject) -> Any:
        from osim_engine.pps.ausloeser.einzel import PAslEinzel
        a = PAslEinzel(loader.simulator)
        copy_scalars(a, obj, ("m_sName", "m_iBeginTermin"))
        return a

    def wire(self, loader: OtxLoader, py: Any, obj: OtxObject) -> None:
        py.m_lDlpl = resolve_ref(loader, obj, "m_lDlpl")
        for p in resolve_list(loader, obj, "m_lParameter"):
            py.m_lParameter.append(p)


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
register_handler("PDpKnVerteilung")(
    _make_knoten_handler(
        "osim_engine.pps.knoten.zeitvorgabe",
        "PDpKnVerteilung",
        ("m_iVerteilZeit",),
    )
)
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


# PTagRess + PTagesEinsatzzeit sind interne Hilfs-Objekte ohne sim-Argument.
# Wir behandeln sie als "skip" — der EinsatzzeitTag baut sie selbst auf.
register_skip("PTagRess", "PTagesEinsatzzeit")


# ----------------------------------------------------------------------
# Assoziationen (Beleg + Menge)
# ----------------------------------------------------------------------


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
# Convenience-API
# ----------------------------------------------------------------------


def load_otx_file(path: Path | str) -> LoadResult:
    """One-shot: OTX-Datei einlesen + laden + LoadResult zurückgeben."""
    otx = parse_otx_file(path)
    loader = OtxLoader()
    return loader.load(otx)
