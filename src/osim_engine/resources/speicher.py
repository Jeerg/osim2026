"""PSpeicherProz — Wartelisten-Container für transiente Prozesse.

Provenienz: `OSimPro/PSpeicherProz.odh` + `OSimPro/PSpeicherProz.cpp`.

Ein `PSpeicherProz` ist die Warteliste, die zwischen einem Knoten und
den Aktor-Ressourcen (`PRessBeleg.m_bAktAsActor=True`) liegt: der Knoten
legt einen Prozess in einen Speicher (über `PAssozSpeicher.platziere_proz`),
und ein angeschlossener Aktor (V8 / Phase 3) entnimmt ihn später.

In V5.5 ist der **Speicher als passiver Container** implementiert. Die
Aktor-Entnahme (`OnProzEingefuegt` → ProzWaehlen → BearbeitBeginnen) folgt
mit Phase 3. Tests in V5.5 verifizieren das Container-Verhalten:
Einfügen / Listener-Notifikation / IsWaiting / DeleteProz.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from osim_engine.pps.sim_object import PSimObj

if TYPE_CHECKING:
    from osim_engine.pps.knoten.base import PDlplKnoten
    from osim_engine.pps.prozess.base import PtProzess
    from osim_engine.pps.simulator import PSimulator
    from osim_engine.pps.trigger import PtTrigger
    from osim_engine.resources.beleg import PRessBeleg


class SpeicherProzListener:
    """C++-Vorlage: `PListenerSpeicherProz` (PSpeicherProz.odh:92).

    Analog `KnotenListener` / `RessBelegListener`. V5.5 nur die passiven
    Notifikationen `on_proz_einfuegen` / `on_proz_entnommen`.
    """

    def __init__(self) -> None:
        self.m_oSProz: "PSpeicherProz | None" = None

    def attach(self, sproz: "PSpeicherProz") -> None:
        assert self.m_oSProz is None
        sproz._listeners.insert(0, self)
        self.m_oSProz = sproz

    def detach(self) -> None:
        if self.m_oSProz is None:
            return
        try:
            self.m_oSProz._listeners.remove(self)
        except ValueError:
            pass
        self.m_oSProz = None

    def on_proz_einfuegen(self, proz: "PtProzess") -> None: ...
    def on_proz_entnommen(self, proz: "PtProzess") -> None: ...


class PSpeicherProz(PSimObj):
    """C++-Äquivalent: `PSpeicherProz` (`PSpeicherProz.odh:24`)."""

    def __init__(self, simulator: "PSimulator | None") -> None:
        super().__init__(simulator)
        # m_sName über PSimObj
        self.m_lProzesse: list["PtProzess"] = []
        self.m_lRessourcen: list["PRessBeleg"] = []

        self._listeners: list[SpeicherProzListener] = []

    # ------------------------------------------------------------------
    # Lifecycle — PSpeicherProz.odh:74-83
    # ------------------------------------------------------------------

    def on_sim_begin(self, sim, deep: bool = True) -> None:
        """C++: alle existierenden Prozesse löschen."""
        super().on_sim_begin(sim, deep=deep)
        self.m_lProzesse.clear()

    # ------------------------------------------------------------------
    # Container-API
    # ------------------------------------------------------------------

    def proz_einfuegen(self, proz: "PtProzess") -> None:
        """C++: `PSpeicherProz::ProzEinfuegen` (PSpeicherProz.cpp:22-45).

        Reihenfolge (Phase 3 wichtig — Aktor-Notifikation kann synchron
        entnehmen):
            1. proz in m_lProzesse
            2. Listener-Notify
            3. Bus-Emit `speicher.einfuegen` (VOR der Aktor-Kaskade,
               damit der Topic-Stream den Einfügungs-Zeitpunkt korrekt
               vor einer eventuellen sofortigen Entnahme zeigt)
            4. Aktor-Notifikation — Phase 3 macht das scharf
               (PRessBeleg.on_proz_eingefuegt). In V5.5 ohne Wirkung
               (PAktor-Stub).
        """
        self.m_lProzesse.append(proz)

        for listener in list(self._listeners):
            listener.on_proz_einfuegen(proz)

        self.p_simulator.bus.emit(
            "speicher.einfuegen",
            speicher=self.m_sName,
            proz_id=proz.m_sName,
            anzahl=len(self.m_lProzesse),
        )

        # Aktoren-Notifikation kann synchron `on_akt_beginn` → speicher-
        # Remove triggern. Bus-Emit oben kommt zuerst, damit die Topic-
        # Reihenfolge `einfuegen` → `entnommen` korrekt ist.
        for ress in list(self.m_lRessourcen):
            ress.on_proz_eingefuegt(self, proz)

    def is_waiting(
        self, trigger: "PtTrigger", knoten: "PDlplKnoten"
    ) -> bool:
        """C++: `PSpeicherProz::IsWaiting` (PSpeicherProz.cpp:49-65).

        TRUE wenn ein Prozess im Speicher den passenden (trigger, knoten)-Key hat.
        """
        for proz in self.m_lProzesse:
            if proz.m_oTrigger is trigger and proz.m_oKnoten is knoten:
                return True
        return False

    def delete_proz(
        self, trigger: "PtTrigger", knoten: "PDlplKnoten"
    ) -> bool:
        """C++: `PSpeicherProz::DeleteProz` (PSpeicherProz.cpp:69-95).

        Entfernt den ersten passenden Prozess und liefert TRUE. C++-Vorbehalt:
        nur aufrufen, wenn `is_waiting` zuvor TRUE lieferte (Asserts auf
        Status `ptWart`).
        """
        from osim_engine.pps.prozess.base import PtStatus

        for i, proz in enumerate(self.m_lProzesse):
            if proz.m_oTrigger is trigger and proz.m_oKnoten is knoten:
                assert proz.m_eStatus == PtStatus.PT_WART, (
                    f"PSpeicherProz.delete_proz: Prozess hat Status "
                    f"{proz.m_eStatus}, erwartet PT_WART"
                )
                self.m_lProzesse.pop(i)
                self.on_proz_entnommen(proz)
                return True
        return False

    def on_proz_entnommen(self, proz: "PtProzess") -> None:
        """C++: `PSpeicherProz::OnProzEntnommen` (PSpeicherProz.cpp:115-121).

        Wird vom Aktor (Phase 3) gerufen oder von `delete_proz`. Notifiziert
        die Listener-Kette.
        """
        for listener in list(self._listeners):
            listener.on_proz_entnommen(proz)

        self.p_simulator.bus.emit(
            "speicher.entnommen",
            speicher=self.m_sName,
            proz_id=proz.m_sName,
            anzahl=len(self.m_lProzesse),
        )

    # ------------------------------------------------------------------
    # KPI-Helpers
    # ------------------------------------------------------------------

    def get_proz_anzahl(self) -> int:
        """C++: `PSpeicherProz::GetProzAnzahl` (PSpeicherProz.cpp:108-111)."""
        return len(self.m_lProzesse)

    def get_bestand(self) -> int:
        """C++: `PSpeicherProz::GetBestand` (PSpeicherProz.cpp:100-104)
        wirft OException — wir auch (Stub für KPI-Hierarchie).
        """
        raise NotImplementedError(
            "PSpeicherProz.get_bestand ist 1:1 zum C++-Stub nicht implementiert."
        )
