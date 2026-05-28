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
        # Welle G15 (osim-ui Bug): WriterHandler brauchen Zugriff auf das
        # original_otx, um m_l*-Container-Pointer (PDurchlaufplan.m_lKnoten,
        # ASimulator.m_lAusl, etc.) 1:1 zu übernehmen. Die Python-Instanzen
        # haben diese Pointer nicht — der Loader hat sie zu Python-Listen
        # aufgelöst. Wird in write() gesetzt.
        self._original_otx: OtxFile | None = None

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
        self,
        instances: dict[int, Any],
        original_otx: OtxFile | None = None,
    ) -> dict[int, int]:
        """Übernimmt die OIDs aus einem `LoadResult.instances`-Dict.

        Damit kann der Writer die OID-Identität des Original-OTX-Files
        bewahren — Pass-Through-Skelette für unsupported Objekte referenzieren
        dann konsistent.

        Wenn `original_otx` mitkommt, wird der OTX-Klassen-Name aus dem Original
        übernommen (statt `type(obj).__name__`). Das ist nötig, weil OTX-Labels
        und Python-Klassen-Namen abweichen können — z.B. der `PSimulator`
        wird im OTX als `ASimulator` serialisiert (siehe ASimulator-Handler im
        Loader, der die vor-instanzierte PSimulator-Instanz unter OID 0
        wiederverwendet).
        """
        self.oid_by_id.clear()
        self.obj_by_oid.clear()
        self.klass_by_oid.clear()

        for oid, obj in instances.items():
            if obj is None:
                continue
            self.oid_by_id[id(obj)] = oid
            self.obj_by_oid[oid] = obj
            # Bevorzuge die OTX-Klassen-Annotation; falle nur darauf zurück,
            # wenn das Original nichts liefert.
            otx_klass: str | None = None
            if original_otx is not None:
                src_obj = original_otx.by_oid.get(oid)
                if src_obj is not None:
                    otx_klass = src_obj.klass
            self.klass_by_oid[oid] = otx_klass or type(obj).__name__

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
        # Welle G15: original_otx auf self speichern, damit Handler darauf
        # zugreifen können (PDurchlaufplan-Container-Pointer-Übernahme).
        self._original_otx = original_otx

        # OID-Vergabe (oder Übernahme aus Loader).
        if instances is not None:
            self.adopt_oids_from_instances(instances, original_otx=original_otx)
        else:
            self.assign_oids(sim)

        object_lines: list[str] = []
        written_oids: set[int] = set()

        # 1. Objekte über die WriterHandler-Registry.
        for oid, py_obj in sorted(self.obj_by_oid.items()):
            klass_name = self.klass_by_oid[oid]
            handler = _WRITERS.get(klass_name)
            if handler is None:
                # Welle G19-D (Fortsetzung von G15): props={} verlor wieder
                # die m_l*-Container und Sub-Refs. Wenn original_otx
                # verfügbar ist, komplette attrs + sub_refs übernehmen.
                src_obj = (
                    original_otx.by_oid.get(oid) if original_otx is not None else None
                )
                if src_obj is not None:
                    flat_subrefs = [
                        ref for block in src_obj.sub_refs for ref in block
                    ]
                    line = format_object(
                        klass=klass_name,
                        oid=oid,
                        props=dict(src_obj.attrs),
                        sub_refs=flat_subrefs,
                    )
                else:
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

            # Welle G19-D: GENERISCHE m_l*-Container-Pointer-Übernahme.
            # Der WriterHandler kennt nicht alle m_l*-Attribute (z.B.
            # ASimulator hat 25+ Container-Listen, der Handler nennt nur
            # die wichtigen). Pro Klasse die m_l*-Lücken aus dem Original
            # auffüllen. Wenn der Handler schon eine Value für ein m_l*
            # gesetzt hat (z.B. handler-resolved m_lStartKante), bleibt
            # die — nur unbeschriebene m_l*-Slots werden aus original_otx
            # ergänzt.
            #
            # Konsequenz: Jeder Roundtrip ohne Wire-Mutation ist semantisch
            # stabil. Bei Wire-Mutationen mit Listen-Edits (Phase 2)
            # muss der Apply-Pfad (otx_json_tree._apply_wire_to_instances)
            # die m_l*-Werte explizit überschreiben — die Generic-Adoption
            # tritt dann zurück.
            if original_otx is not None:
                src_obj = original_otx.by_oid.get(oid)
                if src_obj is not None:
                    for attr_name, attr_val in src_obj.attrs.items():
                        if attr_name.startswith("m_l") and attr_name not in props:
                            props[attr_name] = attr_val
                    # sub_refs aus dem Original übernehmen wenn Handler
                    # keine geliefert hat. format_object erwartet eine flat
                    # list[int] — wir flatten aus list[list[int]] (Reader-
                    # Format mit Basisklassen-Blöcken). Diese Flach-Form
                    # ist beim Pass-Through bereits etabliert.
                    if not sub_refs and src_obj.sub_refs:
                        sub_refs = [
                            ref for block in src_obj.sub_refs for ref in block
                        ]

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
                # Welle G15 (osim-ui Bug-Fix): props={} verlor m_lKnoten/
                # m_lKanten/m_lAusl-Pointer aus dem Original — beim Re-Load
                # waren die LLists komplett leer (Modell-Korruption beim
                # ersten Save). Korrektur: die originalen attrs 1:1
                # übernehmen. WriterHandler-Klassen kommen oben aus dem
                # Re-Serialize-Pfad mit den korrekten neuen Werten; nur die
                # nicht-handler-bewehrten Klassen brauchen Pass-Through.
                flat_subrefs = [
                    ref for block in otx_obj.sub_refs for ref in block
                ]
                # attrs aus Original übernehmen (vollständig). Filter:
                # Reader-spezifische Hilfs-Keys raus (header "size", etc.).
                # In OtxObject.attrs sind ausschließlich domain-Properties,
                # also kann der dict 1:1 übernommen werden.
                line = format_object(
                    klass=otx_obj.klass,
                    oid=oid,
                    props=dict(otx_obj.attrs),
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
    # Welle G15: Container-Pointer aus dem Original übernehmen, sonst gehen
    # m_lAusl, m_lDlpl, m_lBetriebsmittel etc. beim ersten Save verloren →
    # Re-Load liefert leere Listen → Modell-Korruption.
    CONTAINER_POINTERS = (
        "m_lAusl", "m_lDlpl", "m_lBetriebsmittel", "m_lPersonal",
        "m_lRessMenge", "m_lEinsatzWunsch", "m_lKapBedarf", "m_lPerson",
        "m_lGenerator", "m_lParameterMenge", "m_lParameter",
        "m_lTrigger", "m_lProzess", "m_lAssozBeleg", "m_lAssozRessource",
        "m_lRessBeleg", "m_lSpeicherProz", "m_lTagRess",
        "m_lOViewerInfo", "m_lGridColRowInfo",
    )

    def serialize(self, writer, sim, oid):
        props = _serialize_scalars(sim, self.SCALARS)
        _adopt_container_pointers(writer, oid, props, self.CONTAINER_POINTERS)
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


def _adopt_container_pointers(writer, oid, props, attr_names):
    """Welle G15: übernimmt m_l*-Container-OID-Pointer 1:1 aus original_otx.

    Hintergrund: PDurchlaufplan.m_lKnoten ist im OTX ein int-Pointer auf
    einen PDlplKnotenLList-Container (eigenes OtxObject). Der Loader löst
    das zu `py.m_lKnoten: list[Knoten]` auf — die Python-Instanz hat den
    OTX-Pointer nicht mehr. Beim Re-Serialisieren würde der Pointer
    verloren gehen → re-Load liefert leere Knoten-Liste → Modell-
    Korruption.

    Diese Funktion übernimmt die int-Pointer 1:1 aus dem original_otx,
    falls vorhanden. Wenn kein original_otx existiert (frisch erzeugter
    Sim), bleibt der Pointer leer — der Reader liefert dann eine leere
    Liste, was korrekt ist für einen leeren Plan.
    """
    src = getattr(writer, "_original_otx", None)
    if src is None:
        return
    src_obj = src.by_oid.get(oid)
    if src_obj is None:
        return
    for name in attr_names:
        if name in src_obj.attrs:
            props[name] = src_obj.attrs[name]


@register_writer("PDurchlaufplan")
class _PDurchlaufplanWriter(WriterHandler):
    SCALARS = ("m_sName",)
    CONTAINER_POINTERS = ("m_lKnoten", "m_lKanten")

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        sk_oid = writer.get_oid(getattr(py, "m_lStartKante", None))
        ek_oid = writer.get_oid(getattr(py, "m_lEndKante", None))
        # Welle G19-D: nur schreiben wenn das Original sie hatte. Der Loader
        # infert m_lStartKante/m_lEndKante via _infer_start_kante/_infer_end_kante
        # wenn nicht explizit im OTX. Beim Roundtrip würden wir sonst neue
        # Properties einführen die im Original nicht standen.
        src = getattr(writer, "_original_otx", None)
        src_obj = src.by_oid.get(oid) if src is not None else None
        # Nur ECHTE Original-Werte (>0) zählen — ONULL/0 entspricht "nicht
        # gesetzt" und wäre vom Loader inferiert.
        src_sk = src_obj.attrs.get("m_lStartKante") if src_obj is not None else None
        src_ek = src_obj.attrs.get("m_lEndKante") if src_obj is not None else None
        src_had_sk = isinstance(src_sk, int) and src_sk > 0
        src_had_ek = isinstance(src_ek, int) and src_ek > 0
        # Wenn original_otx fehlt (frischer Sim), beide Defaults: schreiben.
        if sk_oid is not None and (src_obj is None or src_had_sk):
            props["m_lStartKante"] = sk_oid
        if ek_oid is not None and (src_obj is None or src_had_ek):
            props["m_lEndKante"] = ek_oid
        # m_lKnoten/m_lKanten kommen via _adopt_container_pointers + dem
        # generischen m_l*-Lückenfüller in OtxWriter.write().
        _adopt_container_pointers(writer, oid, props, self.CONTAINER_POINTERS)
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


# ----------------------------------------------------------------------
# Knoten-Familie mit Verteilung-Ref (PDpKnVerteilung-Variante)
# ----------------------------------------------------------------------


def _make_knoten_with_verteilung_writer(scalars: tuple[str, ...]):
    common = ("m_sName",) + scalars

    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            props = _serialize_scalars(py, common)
            for attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber",
                         "m_lVerteil"):
                ref_oid = writer.get_oid(getattr(py, attr, None))
                if ref_oid is not None:
                    props[attr] = ref_oid
            return props, []

    return _H


register_writer("PDpKnRueckKonstant")(
    _make_knoten_with_verteilung_writer(("m_iWiederholungenZiel",))
)
register_writer("PDpKnAlternativVerteilung")(
    _make_knoten_with_verteilung_writer(())
)


@register_writer("PDpKaVerteilung")
class _PDpKaVerteilungWriter(WriterHandler):
    SCALARS = ("m_sName", "m_iAktVerteilungszeit")

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        verteil = writer.get_oid(getattr(py, "m_lVerteil", None))
        if verteil is not None:
            props["m_lVerteil"] = verteil
        return props, []


# ----------------------------------------------------------------------
# PAlternativeVerteilung
# ----------------------------------------------------------------------


@register_writer("PAlternativeVerteilung")
class _PAlternativeVerteilungWriter(WriterHandler):
    SCALARS = ("m_sName", "m_fAuswahlWarschlkt")

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        dlpl = writer.get_oid(getattr(py, "m_lDlpl", None))
        if dlpl is not None:
            props["m_lDlpl"] = dlpl
        return props, []


# ----------------------------------------------------------------------
# PVerteilung-Familie
# ----------------------------------------------------------------------


def _make_pvert_writer(scalars: tuple[str, ...]):
    common = ("m_sName",) + scalars

    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            props = _serialize_scalars(py, common)
            ext = writer.get_oid(getattr(py, "m_lPVertExt", None))
            if ext is not None:
                props["m_lPVertExt"] = ext
            return props, []

    return _H


register_writer("PVertKonstant")(_make_pvert_writer(("m_fKonstante",)))
register_writer("PVertGleich")(_make_pvert_writer(("m_fMinimum", "m_fMaximum")))
register_writer("PVertNormal")(
    _make_pvert_writer(("m_fErwartungsw", "m_fStandardabw"))
)
register_writer("PVertLogNorm")(
    _make_pvert_writer(("m_fErwartungsw", "m_fStandardabw"))
)
register_writer("PVertExponential")(
    _make_pvert_writer(("m_fErwartungsw", "m_iRechtsVerschiebung"))
)
register_writer("PVertBeta")(
    _make_pvert_writer(
        ("m_fUntereGrenze", "m_fObereGrenze", "m_fAlpha", "m_fBeta"),
    )
)
register_writer("PVertBetaPERT")(
    _make_pvert_writer(
        ("m_fpessimistischerWert", "m_fhaeufigsterWert", "m_foptimistischerWert"),
    )
)


@register_writer("PVertExtern")
class _PVertExternWriter(WriterHandler):
    SCALARS = ("m_sName", "m_keim", "m_Internerkeim")

    def serialize(self, writer, py, oid):
        return _serialize_scalars(py, self.SCALARS), []


# ----------------------------------------------------------------------
# Parameter-Familie
# ----------------------------------------------------------------------


def _make_parameter_writer(scalar: str):
    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            return _serialize_scalars(py, ("m_sName", scalar)), []

    return _H


register_writer("PParameterMenge")(_make_parameter_writer("m_iWert"))
register_writer("PParameterID")(_make_parameter_writer("m_iWert"))
register_writer("PParameterPrioritaet")(_make_parameter_writer("m_iWert"))
register_writer("PParameterFloat")(_make_parameter_writer("m_dWert"))


# ----------------------------------------------------------------------
# Ressourcen
# ----------------------------------------------------------------------


def _make_ressource_writer():
    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            return _serialize_scalars(py, ("m_sName",)), []

    return _H


register_writer("PBetriebsmittel")(_make_ressource_writer())
register_writer("PPerson")(_make_ressource_writer())


# ----------------------------------------------------------------------
# Einsatzzeiten
# ----------------------------------------------------------------------


@register_writer("PEinsatzzeitTag")
class _PEinsatzzeitTagWriter(WriterHandler):
    SCALARS = (
        "m_sName", "m_iBeginn", "m_iEnde",
        "m_iPauseBeginn", "m_iPauseEnde", "m_iPauseDauer",
    )

    def serialize(self, writer, py, oid):
        return _serialize_scalars(py, self.SCALARS), []


@register_writer("PTagRess")
class _PTagRessWriter(WriterHandler):
    SCALARS = ("m_iTag",)

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        ress = writer.get_oid(getattr(py, "m_oRessBeleg", None))
        if ress is not None:
            props["m_oRessBeleg"] = ress
        return props, []


@register_writer("PTagesEinsatzzeit")
class _PTagesEinsatzzeitWriter(WriterHandler):
    SCALARS = ("m_iEinsatzAnfang", "m_iEinsatzEnde")

    def serialize(self, writer, py, oid):
        return _serialize_scalars(py, self.SCALARS), []


# ----------------------------------------------------------------------
# Assoziationen
# ----------------------------------------------------------------------


def _make_assoz_writer():
    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            props = _serialize_scalars(py, ("m_sName",))
            # m_LinkStatusList ist ein Scalar-Pointer auf eine
            # PAssozBelegLinkStatusList (pro-Ressource-Belegungs-Status).
            # Die generische m_l*-Container-Adoption in write() erfasst ihn
            # NICHT, weil "m_LinkStatusList" mit "m_L" (Großbuchstabe) beginnt
            # und `startswith("m_l")` case-sensitiv ist. Ohne explizite
            # Übernahme verliert der Roundtrip den Pointer → LinkStatusList +
            # LinkInfo werden orphaned, und der pro-Ressource gesetzte Status
            # (osim-ui Matrix-Cell-Edit) geht beim Save→Reload verloren.
            # 1:1 aus original_otx übernehmen (OID-stabil über den instances-
            # Pfad; bei osim-ui-Saves trägt original_otx nach dem Wire-
            # Reconcile bereits den aktualisierten Pointer).
            src = (
                writer._original_otx.by_oid.get(oid)
                if writer._original_otx is not None
                else None
            )
            if src is not None and "m_LinkStatusList" in src.attrs:
                props["m_LinkStatusList"] = src.attrs["m_LinkStatusList"]
            return props, []

    return _H


register_writer("PAssozBeleg")(_make_assoz_writer())
register_writer("PAssozRessEnt")(_make_assoz_writer())
register_writer("PAssozELogikEnt")(_make_assoz_writer())


# Phase 01.3 Welle 2 — PAssozMenge-Familie (Material-Fluss-Assoziationen)
#
# C++-Vorlage: OSimPro/PAssozRessource.odh:579-898 (PAssozMenge + 4 Subklassen).
# AUDIT-Bezug: .planning/phases/01.3-…/01.3-01-AUDIT.md
#   - Sektion 2.7 (Konsolidiertes Attribut-Inventar)
#   - Sektion 4.3 (KEIN LinkStatusList-Spezialfall in dieser Familie)
#   - Sektion 4.4 (m_lMengRess MUSS expliziter Scalar-Pointer-Serializer sein,
#     analog _PTagRessWriter.m_oRessBeleg — Klein-l-Präfix würde sonst falsch
#     von der generischen m_l*-Container-Adoption behandelt).
#
# Pattern: Factory-Funktion (wie _make_assoz_writer), weil 5 Klassen mit
# gleichem m_lMengRess-Pattern, aber unterschiedlichen Mengen-Skalaren.


def _make_passozmenge_writer(extra_scalars: tuple[str, ...] = ()):
    """Factory für PAssozMenge-Subklassen-Writer.

    Schreibt:
        - m_sName + ggf. zusätzliche Skalare (m_iMengeAus / m_iMengeEin /
          m_iMengeAbfr) via _serialize_scalars.
        - m_lMengRess als Scalar-OID-Pointer via writer.get_oid (None-Guard
          analog _PTagRessWriter.m_oRessBeleg).

    Kein LinkStatusList-Pass-Through nötig (siehe AUDIT.md Sektion 4.3 —
    keine PAssozMenge-Subklasse hat ein m_L<Großbuchstabe>-Attribut).
    """
    scalars = ("m_sName",) + extra_scalars

    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            props = _serialize_scalars(py, scalars)
            ref = writer.get_oid(getattr(py, "m_lMengRess", None))
            if ref is not None:
                props["m_lMengRess"] = ref
            return props, []

    return _H


register_writer("PAssozMenge")(_make_passozmenge_writer(()))
register_writer("PAssozMengeErzgt")(_make_passozmenge_writer(("m_iMengeAus",)))
register_writer("PAssozMengeVerbr")(_make_passozmenge_writer(("m_iMengeEin",)))
register_writer("PAssozMengeVerbrZwischen")(_make_passozmenge_writer(("m_iMengeEin",)))
register_writer("PAssozMengeAbfr")(_make_passozmenge_writer(("m_iMengeAbfr",)))


# ----------------------------------------------------------------------
# Entscheider-Datenstrukturen
# ----------------------------------------------------------------------


@register_writer("EPEntInformation")
class _EPEntInformationWriter(WriterHandler):
    SCALARS = (
        "m_sName", "m_iID", "m_sPropertyClassName", "m_sParentClassName",
        "m_iObereGrenze", "m_iUntereGrenze", "m_bIsMin",
    )

    def serialize(self, writer, py, oid):
        return _serialize_scalars(py, self.SCALARS), []


@register_writer("EPEntInformationssystem")
class _EPEntInformationssystemWriter(WriterHandler):
    def serialize(self, writer, py, oid):
        return _serialize_scalars(py, ("m_sName",)), []


def _make_ziel_writer():
    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            return _serialize_scalars(py, (
                "m_sName", "m_sZielStrKen", "m_iAusrichtung", "m_iGewichtung",
            )), []

    return _H


register_writer("EPZiel")(_make_ziel_writer())
register_writer("EPKrzDurchlaufzeit")(_make_ziel_writer())


@register_writer("EPZelSystem")
class _EPZelSystemWriter(WriterHandler):
    def serialize(self, writer, py, oid):
        return _serialize_scalars(py, ("m_sName",)), []


@register_writer("EPEntFeld")
class _EPEntFeldWriter(WriterHandler):
    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, ("m_sName",))
        for attr in ("m_oPPerson", "m_oZelSystem", "m_oEntInf", "m_oEntStrategie"):
            ref = writer.get_oid(getattr(py, attr, None))
            if ref is not None:
                props[attr] = ref
        return props, []


@register_writer("EPAszEntFeld")
class _EPAszEntFeldWriter(WriterHandler):
    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, ("m_sName",))
        for attr in ("m_lKnoten", "m_lOberAssoz"):
            ref = writer.get_oid(getattr(py, attr, None))
            if ref is not None:
                props[attr] = ref
        return props, []


# ----------------------------------------------------------------------
# rsv-Strategien (Phase 5-E)
# ----------------------------------------------------------------------


def _make_rsv_writer(scalars: tuple[str, ...]):
    common = (
        "m_sName", "m_bEntscheidungErzwingen", "m_bEntscheidungAktivieren",
        "m_eReaktion", "m_iAnzahl", "m_bRuecksetzenNachZeitspanne",
        "m_iRuecksetzZeitspanne", "m_iZstSpanne",
    )

    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            return _serialize_scalars(py, common + scalars), []

    return _H


register_writer("EPEntStrKrzRessBase")(_make_rsv_writer(()))
register_writer("EPEntStrKrzRessBedarf")(_make_rsv_writer((
    "m_iProzAnzahl", "m_dArbInhalt", "m_dDstAuslastung",
)))
register_writer("EPEntStrKrzRessArbSuchen")(_make_rsv_writer((
    "m_bGegenrechnen", "m_bWechselAuchNachZuordnung",
    "m_bGruppenBeruecksichtigen", "m_bGegenseitigZuordnen",
    "m_bLinksStatusSofortSetzen", "m_bZuordnungsmengeAusGruppeExtrahieren",
    "m_eWahlverhalten",
    "m_iErlaubteWechselProGruppe", "m_iErlaubteZuordnungProGruppe",
    "m_iErlaubteZuordnungProRessource",
    "m_fProzAnteilEinsatzeitAnRuecksetzzeit", "m_bEinsatzzeitBeachten",
    "m_iBrachDistance", "m_iBrachLevel", "m_iPrzAnzahl",
    "m_dArbInhalt", "m_dAuslastung",
)))


# ----------------------------------------------------------------------
# eet-Strategien (Phase 5-F)
# ----------------------------------------------------------------------


def _make_eet_writer(scalars: tuple[str, ...] = ()):
    common = (
        "m_sName", "m_bEntscheidungErzwingen", "m_bEntscheidungAktivieren",
    )

    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            return _serialize_scalars(py, common + scalars), []

    return _H


register_writer("EPEntStrAltExternRessBelegBase")(_make_eet_writer())
register_writer("EPEntStrKrzKapVeraenderungBase")(_make_eet_writer((
    "m_bIsDynPausendauer", "m_iStaffelDelta",
    "m_iPrzZugArbInhalt", "m_iZugArbInhalt",
    "m_iPrzZugEglArbInhalt", "m_iZugEglArbInhalt",
    "m_iDpKnAnzFuerPrgEglArbInhalt",
)))
register_writer("EPEntStrKrzKapVerPrgAutrag")(_make_eet_writer((
    "m_bIsDynPausendauer", "m_fPrzZugPrgBedarf", "m_fPrzZugWslArbInhalt",
)))
register_writer("EPEntStrArbVertMitWechsel")(_make_eet_writer((
    "m_bIsDynPausendauer", "m_bIsTausche", "m_bIsTauscheSpaet",
    "m_bIsUmlageWstByRessAnzahl", "m_iMaxTauschversuche",
    "m_fPrzZugGesamt", "m_bIsDumperNurTauschen", "m_iEinsatzzuschlag",
)))


# ----------------------------------------------------------------------
# Aufgabe-Knoten (Phase 5-D)
# ----------------------------------------------------------------------


def _make_aufgabe_knoten_writer(scalars: tuple[str, ...] = ()):
    common = ("m_sName", "m_eRessUsage", "m_iVerteilZeit") + scalars

    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            props = _serialize_scalars(py, common)
            for attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber",
                         "m_lVerteil"):
                ref = writer.get_oid(getattr(py, attr, None))
                if ref is not None:
                    props[attr] = ref
            return props, []

    return _H


register_writer("EPEntAltProzesswege")(_make_aufgabe_knoten_writer())
register_writer("EPEntAuftragsgroesse")(
    _make_aufgabe_knoten_writer(("m_iShadowMenge",))
)
register_writer("EPEntKrzRessourcenEinsatz")(_make_aufgabe_knoten_writer())
register_writer("EPEntKrzRessourcenEinsatzRess")(_make_aufgabe_knoten_writer())
register_writer("EPEntReihenfolge")(_make_aufgabe_knoten_writer())
register_writer("EPEntKrzKapazitaetsVeraenderung")(_make_aufgabe_knoten_writer())


# ----------------------------------------------------------------------
# PAlternativ-ELogik / -Split + zugehörige Knoten
# ----------------------------------------------------------------------


@register_writer("PAlternativeELogik")
class _PAlternativeELogikWriter(WriterHandler):
    SCALARS = (
        "m_sName", "m_fAuswahlWarschlkt",
        "m_iQualitaetsfaehigkeit", "m_iFlexibilitaet", "m_dUser",
    )

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        dlpl = writer.get_oid(getattr(py, "m_lDlpl", None))
        if dlpl is not None:
            props["m_lDlpl"] = dlpl
        return props, []


@register_writer("PAlternativeSplit")
class _PAlternativeSplitWriter(WriterHandler):
    SCALARS = ("m_sName", "m_fAuswahlWarschlkt")

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        dlpl = writer.get_oid(getattr(py, "m_lDlpl", None))
        if dlpl is not None:
            props["m_lDlpl"] = dlpl
        return props, []


@register_writer("PDpKnAlternativELogik")
class _PDpKnAlternativELogikWriter(WriterHandler):
    SCALARS = (
        "m_sName", "m_eZFunktionTyp",
        "m_iZGTermintreue", "m_iZGQualitaet", "m_iZGDlz",
        "m_iZGKosten", "m_iZGKapauslastung", "m_iZGBestaende",
        "m_iZGFlexibilitaet", "m_iGDringlichkeit",
    )

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        for attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber"):
            ref = writer.get_oid(getattr(py, attr, None))
            if ref is not None:
                props[attr] = ref
        return props, []


@register_writer("PDpKnAlternativSplit")
class _PDpKnAlternativSplitWriter(WriterHandler):
    SCALARS = ("m_sName",)

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        for attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber"):
            ref = writer.get_oid(getattr(py, attr, None))
            if ref is not None:
                props[attr] = ref
        return props, []


# ----------------------------------------------------------------------
# ACO-Familie (Phase 5-J/K)
# ----------------------------------------------------------------------


@register_writer("ACOAnt")
class _ACOAntWriter(WriterHandler):
    SCALARS = (
        "m_sName", "m_iBeginTermin", "m_iPlanZeit", "m_iRealeAuftragsdauer",
    )

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        dlpl = writer.get_oid(getattr(py, "m_lDlpl", None))
        if dlpl is not None:
            props["m_lDlpl"] = dlpl
        return props, []


def _make_aco_split_logik_writer():
    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            props = _serialize_scalars(py, ("m_sName", "m_eRessUsage"))
            for attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber",
                         "m_lVerteil"):
                ref = writer.get_oid(getattr(py, attr, None))
                if ref is not None:
                    props[attr] = ref
            return props, []

    return _H


register_writer("ACOSplit")(_make_aco_split_logik_writer())
register_writer("ACOLogik")(_make_aco_split_logik_writer())


def _make_aco_knoten_writer(scalars: tuple[str, ...]):
    common = ("m_sName",) + scalars

    class _H(WriterHandler):
        def serialize(self, writer, py, oid):
            props = _serialize_scalars(py, common)
            for attr in ("m_lKanteEin", "m_lKanteAus", "m_lKnotenOber"):
                ref = writer.get_oid(getattr(py, attr, None))
                if ref is not None:
                    props[attr] = ref
            return props, []

    return _H


register_writer("ACODpKnSplit")(
    _make_aco_knoten_writer(("m_iDfzProEinheit", "m_iRuestzeit"))
)
register_writer("ACOReihenfolge")(
    _make_aco_knoten_writer(("m_iDfzProEinheit", "m_iRuestzeit"))
)


# ----------------------------------------------------------------------
# EPAslEntAufExtern (Auslöser-Entscheider, Phase 5-B)
# ----------------------------------------------------------------------


@register_writer("EPAslEntAufExtern")
class _EPAslEntAufExternWriter(WriterHandler):
    SCALARS = (
        "m_sName", "m_iBeginTermin", "m_bTaeglichWiederholen",
        "m_iSollDauer", "m_iMaxWarteZeit",
    )

    def serialize(self, writer, py, oid):
        props = _serialize_scalars(py, self.SCALARS)
        dlpl = writer.get_oid(getattr(py, "m_lDlpl", None))
        if dlpl is not None:
            props["m_lDlpl"] = dlpl
        ent = writer.get_oid(getattr(py, "m_lEntitaet", None))
        if ent is not None:
            props["m_lEntitaet"] = ent
        return props, []
