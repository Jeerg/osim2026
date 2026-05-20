"""Python-Sim → OTX-Text Writer.

Spiegel-Modul zu `otx_loader.py`. Wandelt einen `PSimulator` (samt
verknüpfter Auslöser, Pläne, Knoten, Kanten, Ressourcen, Einsatzzeiten,
Entscheider) zurück in das `.otx`-Textformat, das `otx_reader.py` parst.

Architektur — analog zu `otx_loader`:

    - `_WRITERS: dict[str, WriterHandler]` — Klassen-Registry, gespiegelt zu
      `otx_loader._HANDLERS`.
    - `WriterHandler.serialize(writer, py_obj, oid) -> (props, sub_refs)` —
      Subklassen produzieren das Property-Dict und die Sub-Ref-OID-Liste.
    - `register_writer(*klass_names)` — Decorator-API.
    - `OtxWriter.write(sim, original_otx=None, instances=None,
      include_unsupported_passthrough=True) -> str` — Orchestriert
      OID-Vergabe, Handler-Aufruf, Pass-Through und Header-Komposition.
    - `dump_simulator_to_otx(sim, **kwargs) -> str` — One-Shot-Convenience-API.

Format-Vertrag (verifiziert gegen `otx_reader.py`):

    Header:        `OIDArray|N!\\n`  (N = Anzahl deklarierter Top-Level-OIDs)
    Objekt-Zeile:  `#Klasse|attr;wert|attr;wert|...|$M;ref1;..;refM|!`
    Tuple-Wert:    `(x,y,...)`
    None:          `ONULL`
    Bool:          `TRUE` / `FALSE`
    OID-Annotation `m_dwObjID;MS_OID(Klasse);<oid>`

Encoding-Konvention: das Schreiben liefert `str`. Konsumenten müssen explizit
mit `path.write_text(text, encoding="latin-1")` auf Disk schreiben — Latin-1
ist die Reader-Konvention (siehe `otx_reader.parse_otx_file`).
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from osim_engine.io.otx_reader import OtxFile
from osim_engine.pps.simulator import PSimulator


_log = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Registry
# ----------------------------------------------------------------------


_WRITERS: dict[str, "WriterHandler"] = {}


class WriterHandler:
    """Basis-Klasse für Writer-Handler. Subclass + `serialize`-Override.

    `serialize` liefert ein Tupel:
        - `props: dict[str, Any]` — Attribut-Name → Python-Wert.
          Der OtxWriter wandelt die Werte über `encode_value` ins OTX-Format.
          Der `m_dwObjID`-Eintrag wird vom Writer selbst gesetzt — Handler
          dürfen ihn weglassen.
        - `sub_refs: list[int]` — OID-Liste für den `$N;...`-Basisklassen-
          Abschluss. Leer, wenn das Objekt keine Sub-Refs trägt.

    Wenn der Handler ein Container-Objekt schreibt (z.B. `PAusloeserLList`),
    enthält `sub_refs` die OIDs der Kind-Elemente in stabiler Reihenfolge.
    """

    def serialize(
        self, writer: "OtxWriter", py_obj: Any, oid: int
    ) -> tuple[dict[str, Any], list[int]]:
        raise NotImplementedError


def register_writer(*klass_names: str) -> Callable[[type], type]:
    """Registriert einen `WriterHandler` für einen oder mehrere Klassen-Namen.

    Doppelte Registrierungen werden *nicht* still überschrieben — die erste
    Registrierung gewinnt; jede Folge-Registrierung loggt eine Warning.
    """
    def decorator(cls: type) -> type:
        instance = cls()
        for name in klass_names:
            if name in _WRITERS:
                _log.warning(
                    "WriterHandler for class %r is already registered "
                    "(existing=%s, new=%s). Keeping existing.",
                    name, type(_WRITERS[name]).__name__, cls.__name__,
                )
                continue
            _WRITERS[name] = instance
        return cls
    return decorator


# ----------------------------------------------------------------------
# Encoder — Werte → OTX-Token
# ----------------------------------------------------------------------


def encode_value(value: Any) -> str:
    """Wandelt einen Python-Wert in seinen OTX-String-Token um.

    Spiegel von `otx_reader._parse_value`. Kontrakt:
        - None        → "ONULL"
        - True/False  → "TRUE"/"FALSE"
        - int         → str(int)
        - float       → str(float) (kein wiss. Format; Reader nutzt float())
        - tuple       → "(a,b,c,...)"
        - str         → str (Sondertokens `|`/`;`/`\\n` werden hier NICHT
                          escaped — der Aufrufer muss sicherstellen, dass die
                          Werte keine Sondertokens enthalten oder das Format
                          erweitern. Für die heute unterstützten OSim-Modelle
                          tritt das nicht auf — Strings sind Namen/Pfade
                          aus Latin-1-druckbaren Zeichen.)
    """
    if value is None:
        return "ONULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        # Vermeide wissenschaftliche Notation für typische Modell-Floats.
        text = repr(value)
        if "e" in text or "E" in text:
            text = f"{value:.10f}".rstrip("0").rstrip(".")
            if not text or text == "-":
                text = "0"
        return text
    if isinstance(value, tuple):
        return "(" + ",".join(encode_value(v) for v in value) + ")"
    if isinstance(value, str):
        return value
    # Fallback: str(...) (etwa Path, Enum); Reader behandelt es als plain string.
    return str(value)


# ----------------------------------------------------------------------
# Object-Zeile formatieren
# ----------------------------------------------------------------------


def format_object(
    *,
    klass: str,
    oid: int,
    props: dict[str, Any],
    sub_refs: list[int],
) -> str:
    """Komponiert die OTX-Zeile für ein einzelnes Objekt.

    Format: `#Klasse|attr;wert|...|m_dwObjID;MS_OID(Klasse);<oid>|$N;r1;..;rN|!`

    Falls `m_dwObjID` bereits in props enthalten ist, wird es nicht doppelt
    geschrieben — der vom Writer gesetzte OID-Wert hat aber Vorrang
    (Konvention für deterministische Roundtrips).
    """
    tokens: list[str] = [f"#{klass}"]

    # Properties (in Insertion-Order — Python-Dict-Spezifikation seit 3.7).
    for attr, value in props.items():
        if attr == "m_dwObjID":
            # Wird separat unten geschrieben.
            continue
        tokens.append(f"{attr};{encode_value(value)}")

    # OID-Annotation immer am Ende der Property-Liste.
    tokens.append(f"m_dwObjID;MS_OID({klass});{oid}")

    # Basisklassen-Abschluss + Sub-Refs.
    if sub_refs:
        ref_token = f"${len(sub_refs)};" + ";".join(str(r) for r in sub_refs)
        tokens.append(ref_token)
        tokens.append("!")
    else:
        # Kombinierte Variante: "$!" = leerer Basis-Abschluss + Klassen-Ende.
        tokens.append("$!")

    return "|".join(tokens)


# ----------------------------------------------------------------------
# OID-Vergabe + Tree-Traversal
# ----------------------------------------------------------------------


def _iter_simulator_tree(sim: PSimulator):
    """Liefert (klass_name, py_obj)-Paare in deterministischer Reihenfolge.

    Reihenfolge:
      1. Simulator (ASimulator)
      2. Auslöser (m_lAusl) + ihre Parameter
      3. Durchlaufpläne (m_lDlpl) + innere Knoten/Kanten
      4. Ressourcen (m_lRessBeleg) + Verteilungen
      5. Einsatzzeiten + TagRess/TagesEinsatzzeit
      6. Entscheider-Listen (m_lZelSystem, m_lEntInfo, m_lEntStrategie, m_lEntFeld)

    Doppelreferenzen werden über `id()` deduped — jedes Python-Objekt
    erscheint genau einmal.
    """
    seen: set[int] = set()

    def emit(klass: str, obj: Any):
        if obj is None or id(obj) in seen:
            return
        seen.add(id(obj))
        yield (klass, obj)

    # 1. Simulator
    yield from emit("ASimulator", sim)

    # 2. Auslöser
    for a in sim.m_lAusl:
        cls_name = type(a).__name__
        yield from emit(cls_name, a)
        for p in getattr(a, "m_lParameter", []) or []:
            yield from emit(type(p).__name__, p)

    # 3. Pläne (inkl. Sub-Pläne über Knoten)
    def visit_plan(plan):
        yield from emit(type(plan).__name__, plan)
        for kn in getattr(plan, "m_lKnoten", []) or []:
            yield from emit(type(kn).__name__, kn)
            # Sub-Plan über Rück-/Alt-Knoten
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
            # Verteilung-Ref am Knoten
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

    # 4. Ressourcen
    for r in sim.m_lRessBeleg:
        yield from emit(type(r).__name__, r)
    for rm in sim.m_lRessMenge:
        yield from emit(type(rm).__name__, rm)
    for sp in sim.m_lSpeichProz:
        yield from emit(type(sp).__name__, sp)

    # 5. Einsatzzeiten + Sub-Strukturen
    for ez in sim.m_lEinsatz:
        yield from emit(type(ez).__name__, ez)
        for tr in getattr(ez, "m_lTagRess", []) or []:
            yield from emit(type(tr).__name__, tr)
        for te in getattr(ez, "m_lTagesEinsatzzeit", []) or []:
            yield from emit(type(te).__name__, te)

    # 6. Verteilungen ohne Knoten/Kante-Anker
    for v in getattr(sim, "m_lExtVert", []) or []:
        yield from emit(type(v).__name__, v)

    # 7. Entscheider-Strukturen
    for zs in sim.m_lZelSystem:
        yield from emit(type(zs).__name__, zs)
        for z in getattr(zs, "m_lEpZiel", []) or []:
            yield from emit(type(z).__name__, z)
    for ei in sim.m_lEntInfo:
        yield from emit(type(ei).__name__, ei)
        for info in getattr(ei, "m_lInformationen", []) or []:
            yield from emit(type(info).__name__, info)
    for es in sim.m_lEntStrategie:
        yield from emit(type(es).__name__, es)
    for ef in sim.m_lEntFeld:
        yield from emit(type(ef).__name__, ef)


# ----------------------------------------------------------------------
# OtxWriter
# ----------------------------------------------------------------------


class OtxWriter:
    """Orchestriert die Serialisierung eines PSimulator zurück nach OTX.

    Standard-Workflow:

        writer = OtxWriter()
        text = writer.write(sim, original_otx=load_result.otx,
                            instances=load_result.instances)

    OID-Strategie:
        - Wenn `instances` (oid → py_obj) übergeben wird, übernimmt der
          Writer die Original-OIDs. Damit bleibt der Roundtrip OID-stabil
          und Pass-Through-Objekte (siehe unten) referenzieren konsistent.
        - Sonst weist `assign_oids(sim)` neue OIDs in stabiler Reihenfolge
          zu (Sim=0, Auslöser ab 1, …).

    Pass-Through-Strategie (`include_unsupported_passthrough=True`):
        - Wenn `original_otx` vorhanden ist, werden alle OtxObjects, deren
          Klasse weder in `_WRITERS` noch in den geladenen Instanzen vorkommt,
          1:1 als Skelett-Zeile rausgeschrieben (Klasse, OID, leere props,
          originale sub_refs gepackt). Der Reader liest sie wieder als
          `unsupported` bzw. `skipped` — die Coverage-Ratio bleibt stabil.
    """

    def __init__(self) -> None:
        self.oid_by_id: dict[int, int] = {}
        self.obj_by_oid: dict[int, Any] = {}
        self.klass_by_oid: dict[int, str] = {}

    def get_oid(self, py_obj: Any) -> int | None:
        """Sucht die OID eines Python-Objekts in der aktuellen Map."""
        if py_obj is None:
            return None
        return self.oid_by_id.get(id(py_obj))

    def assign_oids(self, sim: PSimulator) -> dict[int, int]:
        """Vergibt deterministische OIDs für alle erreichbaren Objekte.

        Sim bekommt OID 0 (Konvention, kompatibel mit `OtxLoader.instances[0]
        = self.simulator`). Alle anderen Objekte zählen ab 1 in
        Tree-Traversal-Reihenfolge.

        Returns: `id(py_obj) → oid`-Map (auch in `self.oid_by_id` gespeichert).
        """
        self.oid_by_id.clear()
        self.obj_by_oid.clear()
        self.klass_by_oid.clear()

        next_oid = 0
        for klass, obj in _iter_simulator_tree(sim):
            if id(obj) in self.oid_by_id:
                continue
            self.oid_by_id[id(obj)] = next_oid
            self.obj_by_oid[next_oid] = obj
            self.klass_by_oid[next_oid] = klass
            next_oid += 1

        # ASimulator MUSS OID 0 haben (Loader-Konvention).
        sim_oid = self.oid_by_id.get(id(sim))
        if sim_oid != 0:
            # Re-Mappe Sim auf 0 (sollte durch Tree-Order eh passen).
            self.oid_by_id[id(sim)] = 0

        return dict(self.oid_by_id)

    def adopt_oids_from_instances(
        self, instances: dict[int, Any]
    ) -> dict[int, int]:
        """Übernimmt die OIDs aus einem `LoadResult.instances`-Dict.

        Damit kann der Writer die OID-Identität des Original-OTX-Files
        bewahren — Pass-Through-Skelette für unsupported Objekte referenzieren
        dann konsistent.
        """
        self.oid_by_id.clear()
        self.obj_by_oid.clear()
        self.klass_by_oid.clear()

        for oid, obj in instances.items():
            if obj is None:
                continue
            self.oid_by_id[id(obj)] = oid
            self.obj_by_oid[oid] = obj
            self.klass_by_oid[oid] = type(obj).__name__

        return dict(self.oid_by_id)

    # ------------------------------------------------------------------
    # Haupt-Serialisierung
    # ------------------------------------------------------------------

    def write(
        self,
        sim: PSimulator,
        *,
        original_otx: OtxFile | None = None,
        instances: dict[int, Any] | None = None,
        include_unsupported_passthrough: bool = True,
    ) -> str:
        """Serialisiert den Simulator nach OTX.

        Wenn `instances` mitkommt: OID-Übernahme aus dem Original-Load
        (deterministisch und OID-stabil). Sonst: neue OID-Vergabe.

        Wenn `original_otx` + `include_unsupported_passthrough` aktiv:
        Skelette für nicht-geladene OtxObjects werden mitgeschrieben.
        """
        # OID-Vergabe (oder Übernahme aus Loader).
        if instances is not None:
            self.adopt_oids_from_instances(instances)
        else:
            self.assign_oids(sim)

        object_lines: list[str] = []
        written_oids: set[int] = set()

        # 1. Objekte über die WriterHandler-Registry.
        for oid, py_obj in sorted(self.obj_by_oid.items()):
            klass_name = self.klass_by_oid[oid]
            handler = _WRITERS.get(klass_name)
            if handler is None:
                # Fallback: leere Property-Map, keine Sub-Refs — der Reader
                # akzeptiert ein leeres Objekt, der Loader meldet es als
                # `unsupported`.
                line = format_object(
                    klass=klass_name, oid=oid, props={}, sub_refs=[]
                )
                object_lines.append(line)
                written_oids.add(oid)
                continue
            try:
                props, sub_refs = handler.serialize(self, py_obj, oid)
            except Exception as exc:  # noqa: BLE001
                _log.warning(
                    "WriterHandler %s failed on %s#%d: %s",
                    type(handler).__name__, klass_name, oid, exc,
                )
                props, sub_refs = ({}, [])
            line = format_object(
                klass=klass_name, oid=oid, props=props, sub_refs=sub_refs
            )
            object_lines.append(line)
            written_oids.add(oid)

        # 2. Pass-Through: Original-OtxObjects, die noch fehlen.
        if include_unsupported_passthrough and original_otx is not None:
            for oid, otx_obj in sorted(original_otx.by_oid.items()):
                if oid in written_oids:
                    continue
                # 1:1-Rendition: Klasse, OID, leeres Props, originale Sub-Refs
                # (flach gemerged über alle Basisklassen-Blöcke).
                flat_subrefs = [
                    ref for block in otx_obj.sub_refs for ref in block
                ]
                line = format_object(
                    klass=otx_obj.klass,
                    oid=oid,
                    props={},
                    sub_refs=flat_subrefs,
                )
                object_lines.append(line)
                written_oids.add(oid)

        # 3. Header + zusammenbauen.
        # Reader-Konvention: `OIDArray|N!` mit N = Anzahl deklarierter Objekte.
        n = len(object_lines)
        header = f"OIDArray|{n}!"

        return "\n".join([header, *object_lines]) + "\n"


# ----------------------------------------------------------------------
# Convenience-API
# ----------------------------------------------------------------------


def dump_simulator_to_otx(
    sim: PSimulator,
    *,
    original_otx: OtxFile | None = None,
    instances: dict[int, Any] | None = None,
    include_unsupported_passthrough: bool = True,
) -> str:
    """One-shot: PSimulator → OTX-Text.

    Siehe `OtxWriter.write` für die Optionen.
    """
    writer = OtxWriter()
    return writer.write(
        sim,
        original_otx=original_otx,
        instances=instances,
        include_unsupported_passthrough=include_unsupported_passthrough,
    )


# ----------------------------------------------------------------------
# Handler-Familie — Skelette für die wichtigsten Loader-Handler.
#
# Diese minimalen Handler reichen für Roundtrip-Stabilität der Pre-Run-
# OTX-Files (Counter sind alle 0, also kein Detail-Wiring nötig). Erweitert
# wird sie in Task 2 (siehe test_otx_roundtrip.py).
# ----------------------------------------------------------------------


def _serialize_scalars(py_obj: Any, attrs: tuple[str, ...]) -> dict[str, Any]:
    """Sammelt vorhandene Attribute aus py_obj in ein Property-Dict."""
    out: dict[str, Any] = {}
    for a in attrs:
        if hasattr(py_obj, a):
            v = getattr(py_obj, a)
            # Sub-Plan-Refs / Listen werden NICHT als Skalar serialisiert.
            if isinstance(v, (list, dict, set)):
                continue
            # Methoden ignorieren.
            if callable(v) and not isinstance(v, (int, float, bool, str)):
                continue
            out[a] = v
    return out


@register_writer("ASimulator")
class _ASimulatorWriter(WriterHandler):
    SCALARS = (
        "m_periodLen", "m_periodNum", "m_periodBegin",
        "m_iProduktionBezugsPeriode", "m_iProduktionEnde",
        "m_bIsProduktionEnde", "m_keim", "m_aktKeim",
        "m_sStartDate", "m_sEndDate", "m_name", "m_sName",
    )

    def serialize(self, writer, sim, oid):
        props = _serialize_scalars(sim, self.SCALARS)
        # Container-Refs als Property (zeigt auf zugehörige LList-Pseudo-OID).
        # Für die minimale Foundation reichen wir das nicht aus — der
        # Loader iteriert by_oid, nicht über die LList-Container.
        return props, []


@register_writer("PAslEinzel")
class _PAslEinzelWriter(WriterHandler):
    SCALARS = ("m_sName", "m_iBeginTermin", "m_iPlanZeit", "m_iRealeAuftragsdauer")

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        dlpl_oid = writer.get_oid(getattr(py, "m_lDlpl", None))
        if dlpl_oid is not None:
            props["m_lDlpl"] = dlpl_oid
        return props, []


@register_writer("PDurchlaufplan")
class _PDurchlaufplanWriter(WriterHandler):
    SCALARS = ("m_sName",)

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        sk_oid = writer.get_oid(getattr(py, "m_lStartKante", None))
        ek_oid = writer.get_oid(getattr(py, "m_lEndKante", None))
        if sk_oid is not None:
            props["m_lStartKante"] = sk_oid
        if ek_oid is not None:
            props["m_lEndKante"] = ek_oid
        # Knoten + Kanten als Sub-Refs (für Loader: resolve_list("m_lKnoten")
        # erwartet eine LList — Skelett-Pass-Through übernimmt die echte
        # LList, hier reicht Sub-Refs-Container-Skeleton).
        return props, []


@register_writer("PDlplKante", "PDpKaUebergang")
class _PDpKaUebergangWriter(WriterHandler):
    SCALARS = ("m_sName", "m_iUebergangszeit")

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        # Vorgänger/Nachfolger als Property-OID-Listen wären unschön — bleibt
        # über sub_refs des Container-Objekts geregelt. Für minimal-Skelett OK.
        return props, []


def _make_simple_knoten_writer(scalars: tuple[str, ...]):
    common = ("m_sName",) + scalars

    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            props = _serialize_scalars(py, common)
            ein = writer.get_oid(getattr(py, "m_lKanteEin", None))
            aus = writer.get_oid(getattr(py, "m_lKanteAus", None))
            ober = writer.get_oid(getattr(py, "m_lKnotenOber", None))
            if ein is not None:
                props["m_lKanteEin"] = ein
            if aus is not None:
                props["m_lKanteAus"] = aus
            if ober is not None:
                props["m_lKnotenOber"] = ober
            return props, []

    return _H


register_writer("PDpKnKonstant")(
    _make_simple_knoten_writer(("m_iDurchfuehrungszeit",))
)
register_writer("PDpKnMenge")(
    _make_simple_knoten_writer(("m_iDfzProEinheit",))
)
register_writer("PDpKnMengeRuesten")(
    _make_simple_knoten_writer(("m_iDfzProEinheit", "m_iRuestzeit"))
)
register_writer("PDpKnVerteilung")(
    _make_simple_knoten_writer(("m_iVerteilZeit",))
)
