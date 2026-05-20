"""Entscheider-System (Phase 5).

Provenienz: `OSimPro/EPEntscheidung.{odh,cpp}` + `OSimPro/EPStrategie.{odh,cpp}`.

Klassen-Übersicht (Slice P5-A — Datenstrukturen):

  PSimObj
  ├── EPEntInformation/LList
  ├── EPEntInformationssystem/LList   (enthält EPEntInformationLList)
  ├── EPZiel ─ EPKrzDurchlaufzeit
  ├── EPZielLList
  ├── EPZelSystem/LList                (enthält EPZielLList)
  ├── EPEntFeld/LList                  (verknüpft PPerson + ZelSystem + EntInf + EntStrategie)
  └── EPEntStrategie (abstrakt) + LList

Slice P5-B (Auslöser-Entscheider): `EPAslEntAufExtern` liegt in
`pps/ausloeser/ent_extern.py` (gehört zur PAusloeser-Familie).

Slice P5-A nutzt das Flag `PSimulator.m_bIsEntAktiv` (default `False`): die
Entscheider-Hooks sind komplett geguarded — solange das Flag nicht
explizit gesetzt wird, beeinflussen die Klassen das Sim-Verhalten nicht.
Das erlaubt 1:1-Treue zum C++-Original auch in Phase 5 ohne aktive Logik.
"""

from osim_engine.decisions.aufgabe import (
    EntAufgabeBelegStatus,
    EPEntAltProzesswege,
    EPEntAufgabeAltExtern,
    EPEntAufgabeAltExternRessBeleg,
    EPEntAufgabeAltIntern,
    EPEntAuftragsgroesse,
    EPEntKrzKapazitaetsVeraenderung,
    EPEntKrzRessourcenEinsatz,
    EPEntKrzRessourcenEinsatzRess,
    EPEntReihenfolge,
    EPEntscheidungsAufgabe,
)
from osim_engine.decisions.entscheidung import (
    EPEntFeld,
    EPEntFeldLList,
    EPEntInformation,
    EPEntInformationLList,
    EPEntInformationssystem,
    EPEntInformationssystemLList,
    EPKrzDurchlaufzeit,
    EPZelSystem,
    EPZelSystemLList,
    EPZiel,
    EPZielLList,
)
from osim_engine.decisions.strategie import EPEntStrategie, EPEntStrategieLList
from osim_engine.decisions.strategie_rsv import (
    AssozBelegLinkStatus,
    EPEntStrKrzRessArbSuchen,
    EPEntStrKrzRessBase,
    EPEntStrKrzRessBedarf,
    EPEntStrKrzRessGroupInfoList,
    EPEntStrKrzRessStatusInfoList,
    EPEntStrKrzRessZuordnungsInfoList,
    KrzBaseKnotenWaehlen,
    KrzBaseReak,
)
from osim_engine.decisions.strategie_eet import (
    EPEntStrAltExternRessBelegBase,
    EPEntStrArbVertMitWechsel,
    EPEntStrKrzKapVeraenderungBase,
    EPEntStrKrzKapVerPrgAutrag,
    GroupList,
)

__all__ = [
    "EntAufgabeBelegStatus",
    "EPEntAltProzesswege",
    "EPEntAufgabeAltExtern",
    "EPEntAufgabeAltExternRessBeleg",
    "EPEntAufgabeAltIntern",
    "EPEntAuftragsgroesse",
    "EPEntKrzKapazitaetsVeraenderung",
    "EPEntKrzRessourcenEinsatz",
    "EPEntKrzRessourcenEinsatzRess",
    "EPEntReihenfolge",
    "EPEntFeld",
    "EPEntFeldLList",
    "EPEntInformation",
    "EPEntInformationLList",
    "EPEntInformationssystem",
    "EPEntInformationssystemLList",
    "EPEntscheidungsAufgabe",
    "EPEntStrategie",
    "EPEntStrategieLList",
    "AssozBelegLinkStatus",
    "EPEntStrKrzRessArbSuchen",
    "EPEntStrKrzRessBase",
    "EPEntStrKrzRessBedarf",
    "EPEntStrKrzRessGroupInfoList",
    "EPEntStrKrzRessStatusInfoList",
    "EPEntStrKrzRessZuordnungsInfoList",
    "KrzBaseKnotenWaehlen",
    "KrzBaseReak",
    "EPEntStrAltExternRessBelegBase",
    "EPEntStrArbVertMitWechsel",
    "EPEntStrKrzKapVeraenderungBase",
    "EPEntStrKrzKapVerPrgAutrag",
    "GroupList",
    "EPKrzDurchlaufzeit",
    "EPZelSystem",
    "EPZelSystemLList",
    "EPZiel",
    "EPZielLList",
]
