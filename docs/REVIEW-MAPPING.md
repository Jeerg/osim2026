# REVIEW-MAPPING — Python-Datei ↔ C++-Datei

**Stand:** 2026-05-17, nach Abschluss C0-S + V1 + V2 + V3.
**Zweck:** Side-by-side-Review der Python-Portierung gegen die OSim2004-
Quellen. Pro Python-Modul: welche C++-Klassen es portiert, welche `.cpp`-
und `.odh`-Files die Vorlage waren, welche Zeilen die zentralen Methoden
liegen.

**Quell-Repo**:
`C:/Users/JörgWFischer/PycharmProjects/OSim2004/OSimV01(Fj)/`

---

## Stochastik-Schicht (C0-S)

| Python-Modul | C++-Vorlage | Provenienz-Notiz |
|---|---|---|
| `src/osim_engine/core/distribution.py::OVerteil` | `inc/OVerteil.h` (Header) + `OFC/OVerteil.cpp::Zufall/VertGleich/VertNorm*/VertExpo/VertLogNorm` | Bit-genau (siehe `osim2004-trace/README-EXTRAHIERT.md` für die Provenienz-Tabelle) |
| `src/osim_engine/core/distribution.py::s_verteil` (Modul-Singleton) | `OSimulator::s_verteil` (`OSimulator.odh`) | SUPPLEMENT § 6.3 |
| `src/osim_engine/core/verteilung.py::OVerteilung + 7 Subtypen` | `OSimBase/OVerteilung.cpp` (Z. 20-102) | 1:1, Methode `hole_zufallswert` pro Subtyp |
| `src/osim_engine/core/event.py::OMetaEvent + Event + MAX_EVENT_TIME` | `inc/Event.h` (alle 79 Zeilen) | SUPPLEMENT § 2 |
| `src/osim_engine/core/event_pool.py::EventPool` | `OSimBase/EventPoolDll.{h,cpp}` | heapq + Tombstones statt DLL; Sortier-Schema `(time<<2)\|subTime` 1:1 (SUPPLEMENT § 3) |

---

## OSimBase-Layer (V1)

| Python-Modul | C++-Vorlage | Methoden-Mapping |
|---|---|---|
| `src/osim_engine/core/sim_object.py::OSimObj` | `OSimBase/OSimObj.odh` + `.cpp` | Delegate-Properties (period_*, is_ptk, is_simulating) entsprechen C++-Methoden. Tree-Lifecycle-Hooks (on_sim_begin/period_*) als no-op-Defaults für Subklassen |
| `src/osim_engine/core/listener.py::OListenerSimulator` | `OSimBase/OSimulator.odh` Sektion OListenerSimulator | attach/detach/on_*-Hooks 1:1; intrusive-list → list[T] (SUPPLEMENT § 6.1) |
| `src/osim_engine/core/simulator.py::OSimulator` | `OSimBase/OSimulator.odh` + `OSimBase/OSimulator.cpp` | `start()` re-entrant über `m_simStatus`; `evt_do_next` mit Ptk-Switching aus EventPoolDll.cpp:568-590; `period_end = begin + len - 1` (inklusive) wie C++ |

**V1-Reichweite-Details siehe `docs/CONTEXT-P1-osimbase.md` (B1)**.

---

## PPS-Layer Basis (V1)

| Python-Modul | C++-Vorlage | Methoden-Mapping |
|---|---|---|
| `src/osim_engine/pps/sim_object.py::PSimObj` | `OSimPro/PSimObj.odh` + `.cpp` | Zeit-Helpers (sek/minute/stunde/tag_2_szeit). Tracing/SimInfo als no-op |
| `src/osim_engine/pps/simulator.py::PSimulator` | `OSimPro/PSimulator.odh` + `.cpp` | 12-Listen-API deklariert; on_sim_begin/reset leert Warteschlange; `register_plan/knoten/ausloeser` als V1/V2-Setup-Helpers |
| `src/osim_engine/pps/prozess_dll.py::PProzessDLL` | `OSimPro/PProzessDLL` (intrusive DLL) | List-basiert statt DLL — `m_oNext`/`m_oPrev` am Prozess entfallen |
| `src/osim_engine/pps/prozess/base.py::PtProzess` | `OSimPro/PtProzess.odh` (Basis) + `.cpp` | `m_eStatus`, `m_oKnoten`, `m_oTrigger`, `m_oProzOber`, `m_oEntitaet`. `bearbeit_beginnen/beenden/unterbrechen` als virtuell |
| `src/osim_engine/pps/prozess/zeitvorgabe.py::PtProzZeitvorgabe + EvtBearbeitEnde` | `OSimPro/PtProzess.odh` Sektion PtProzZeitvorgabe + `.cpp` | `EvtBearbeitEnde` mit `m_subTime=2` ($event(2)). `bearbeit_beginnen` plant Event |
| `src/osim_engine/pps/knoten/base.py::PDlplKnoten + KnotenListener` | `OSimPro/PDlplKnoten.odh` + `.cpp` | V2-Erweiterung: m_lKanteAus-Routing in on_proz_beendet; V1-Fallback bleibt für Auslöser-direkt-an-Knoten. KnotenListener attach/detach. KPI-Defaults (V3) |
| `src/osim_engine/pps/knoten/zeitvorgabe.py::PDpKnZeitvorgabe + Konstant + Verteilung` | `OSimPro/PDpKnZeitvorgabe.odh` + `.cpp` (Z. 24-397) | `proz_weitergeben` wörtlich Z. 31-69 (SUPPLEMENT § 1.2). `get_durchfuehrungszeit` wörtlich Z. 172-187 (Konstant) bzw. Z. 374-397 (Verteilung) |
| `src/osim_engine/pps/trigger.py::PtTrigger` | `OSimPro/PtTrigger.odh` + `.cpp` | V1 minimal: `m_iTrigNum`, `m_oAusloeser`, `on_prz_created`, `on_dlpl_beendet` |
| `src/osim_engine/pps/ausloeser/base.py::PAusloeser` | `OSimPro/PAusloeser.odh` Sektion PAusloeser + `.cpp` | `dlpl_ausloesen` mit Duck-Typing (V1: PDpKnKonstant direkt; V2: PDurchlaufplan) |
| `src/osim_engine/pps/ausloeser/einzel.py::PAslEinzel + EvtAuslTriggern` | `OSimPro/PAusloeser.odh` Sektion PAslEinzel + `.cpp` | `EvtAuslTriggern` mit `m_subTime=1` ($event(1)). Genau 1 Auslösung pro Sim |

---

## PPS-Layer Plan-Graph (V2)

| Python-Modul | C++-Vorlage | Methoden-Mapping |
|---|---|---|
| `src/osim_engine/pps/verknuepfung.py::PtVerknuepfung` | `OSimPro/PtVerknuepfung.odh` + `.cpp` | `m_iAnzProz`-Dekrement (Z. 22-32). Wirft bei <=0 |
| `src/osim_engine/pps/prozess/durchlaufplan.py::PtProzDurchlaufplan` | `OSimPro/PtProzess.odh` Sektion PtProzDurchlaufplan + `.cpp` (Z. 670-757) | find/add/remove_verknpf 1:1 |
| `src/osim_engine/pps/kante/base.py::PDlplKante + KanteListener` | `OSimPro/PDlplKante.odh` + `.cpp` (Z. 90-216) | `proz_weitergeben` mit voller Routing-Logik (Z. 115-185): Start/End/Innen-Kante, Join-Counter via PtVerknuepfung |
| `src/osim_engine/pps/kante/uebergang.py::PDpKaUebergang + EvtUebergangEnde` | `OSimPro/PDlplKante.odh` Sektion PDpKaUebergang (Z. 286-320) + `.cpp` (Z. 766-843) | Spiegelprozess-Pattern (SUPPLEMENT § 4); `EvtUebergangEnde` mit `m_subTime=3` |
| `src/osim_engine/pps/kante/verteilung.py::PDpKaVerteilung` | `OSimPro/PDlplKante.odh` Sektion PDpKaVerteilung (Z. 367-419) + `.cpp` (Z. 925-992) | Wie PDpKaUebergang, aber verteilte Übergangszeit |
| `src/osim_engine/pps/durchlaufplan.py::PDurchlaufplan` | `OSimPro/PDurchlaufplan.odh` + `.cpp` | `dlpl_ausloesen` (Z. 52-81), `bearbeit_beginnen` (Z. 84-96), `on_dlpl_beendet` (Z. 99-125), `proz_weitergeben` (Z. 40-43). V3: `get_knz_min_dlfz` + `prz_kosten_berechnen` (siehe unten) |

---

## PPS-Layer KPI (V3)

| Methode | Python | C++-Vorlage |
|---|---|---|
| `PDlplKnoten.get_knz_mittl_dlfz` | `src/.../knoten/base.py` | `PDlplKnoten::GetKnzMittlDlfz` |
| `PDlplKnoten.prz_kosten_berechnen` (Default) | `src/.../knoten/base.py` | `PDlplKnoten::PrzKostenBerechnen` |
| `PDpKnKonstant.get_knz_min_dlfz` | `src/.../knoten/zeitvorgabe.py` | `PDpKnKonstant::GetKnzMinDlfz` (PDpKnZeitvorgabe.cpp:191-196) — returns `GetKnzMittlDlfz` |
| `PDpKaUebergang.get_knz_min_dlfz` | `src/.../kante/uebergang.py` | `PDpKaUebergang::GetKnzMinDlfz` (PDlplKante.cpp:834-837) — returns `m_iUebergangszeit` |
| `PDpKaVerteilung.get_knz_min_dlfz` | `src/.../kante/verteilung.py` | `PDpKaVerteilung::GetKnzMinDlfz` (PDlplKante.cpp:999-1003) — Mittelwert |
| `PDurchlaufplan.get_knz_min_dlfz` | `src/.../durchlaufplan.py::get_knz_min_dlfz + _calc_krit_weg_rek` | `PDurchlaufplan::GetKnzMinDlfz + CalcKritWegRek` (PDurchlaufplan.cpp:204-305) |
| `PDurchlaufplan.prz_kosten_berechnen` | `src/.../durchlaufplan.py::prz_kosten_berechnen + _calc_proz_kosten_rek` | `PDurchlaufplan::PrzKostenBerechnen + CalcProzKostenRek` (PDurchlaufplan.cpp:315-406) |
| `PDurchlaufplan.min_prz_kosten_berechnen` | `src/.../durchlaufplan.py::min_prz_kosten_berechnen + _calc_min_proz_kosten_rek` | `PDurchlaufplan::MinPrzKostenBerechnen + CalcMinProzKostenRek` (PDurchlaufplan.cpp:433-520) |
| `PDurchlaufplan.get_knz_periodenkosten` | `src/.../durchlaufplan.py` | `PDurchlaufplan::GetKnzPeriodenkosten` (PDurchlaufplan.cpp:409-427) |

---

## Observability (V1)

Komplett Python-erfunden, kein C++-Pendant. Dokumentation:
`docs/CONTEXT-P1-EVENTBUS.md`.

| Python-Modul | Zweck |
|---|---|
| `src/osim_engine/observability/bus.py::EventBus` | Pub/Sub mit fnmatch-Pattern |
| `src/osim_engine/observability/sinks/jsonl.py::JsonlSink` | Append-only JSONL-Trace |
| `src/osim_engine/observability/sinks/testing.py::TraceCaptureSink` | In-Memory für pytest |

---

## Out-of-Scope für Phase 1

Aus dem `porting-plan.md` explizit ausgegrenzt (kommen in P2-P5):

| Klasse | Geplante Phase | Grund |
|---|---|---|
| `OVerteil::VertDreieck/VertBeta*/VertGamma/Shuffle` | P5 | nur in PEntscheider-Pfaden |
| `PDpKnAlternativ` + Subtypen | P4 | Alternative-Entscheider |
| `PDpKnAELogik` + Subtypen | P5 | Entscheider-Logik |
| `PDpKnRuecksprung` + Subtypen | P4 | Wiederholung |
| `PDpKnExtern` + `PDpKaExtern` + `PDpKaEntitaet*` | P4 | externe Steuerung + Entitäten |
| `PDpKnMenge` + `PDpKnMengeRuesten` | P4 | mengenabhängige Zeit |
| `PtProzRuesten` + `PtProzExtern` + `PtProzRuecksprung` + `PtProzAlternativ` + `PtProzEntAufgabe*` + `PtProzACOSplit` | P4-P5 | Subtypen für später |
| `PRess*` + `PAssoz*` + `PEinsatzzeit` + `PAktor` + `PSpeicherProz` | P2-P3 | Ressourcen-System |
| `EP*` + `PEntscheider` + `PGenerator` (nur Stub) | P5 | Entscheider + Generator |
| `OSimAZeit/` (vollständig) | P5 | nur Skelett in P1 |
| `OSimINSIGHTS/` | P5 | Reporting |
| Alle UI-Klassen (`OGfx*`, `*GObj`, `*DesignItem`, `OMetaViewer*`, `ObjectBase`, `OFC` außer `OVerteil`, `OArchive`) | nicht portiert | UI/Persistenz/Reflektion ersetzt durch JSON + Pydantic am IO-Rand |

---

## Bekannte C++-Eigenheiten (1:1 portiert)

Punkte, an denen der Python-Code das tut, was OSim2004 tut, was aber
möglicherweise nicht das ist, was der Autor wollte. **Wir verändern nichts.**

1. **`CalcProzKostenRek` propagiert nur Hauptweg-Kosten an Join-Nachfolger**:
   nach Join wird `dEinKosten = dEinKostenNext` aus dem ersten (Hauptweg)
   Nachfolger gesetzt, NICHT die akkumulierte `kJ.m_dHelp`-Summe. Test
   `test_v3_kpi.py::test_kosten_verteilung_split_propagiert_hauptweg`
   dokumentiert das.

2. **`VertLogNorm` nutzt `VertNorm(0.0, 1.0)`** als Standard-Normal-Komponente.
   Mit den Jeerg-Rejection-Konditionen wird das zu einer Halb-Normalverteilung
   (nur positive Samples). SUPPLEMENT § 1.4 verweist auf das Verhalten.

3. **`VertExpo` nutzt `Zufall()` direkt**, nicht `VertGleich()`. Bei
   antithetisch=1 ergibt das andere Werte. SUPPLEMENT § Verteilungen.

4. **`OVerteilGleich.HoleZufallswert` = `m_wertBasis * VertGleich()`**, nicht
   `VertGleich(0, m_wertBasis)`. Subtiler Unterschied bei der Clamping-Logik:
   das Multiplikations-Pattern hat kein Clamping.

5. **`PDurchlaufplan.on_proz_beendet` wirft `RuntimeError`** — Pläne bekommen
   nur `on_dlpl_beendet`, nicht `on_proz_beendet`. Identisch zu C++
   `throw new OException`.

---

## Review-Strategie

Für ein Side-by-side-Review pro Modul empfehle ich:

1. **Python-Datei öffnen** (z. B. `src/osim_engine/core/distribution.py`)
2. **C++-Vorlage öffnen** aus dieser Tabelle (z. B. `OFC/OVerteil.cpp`)
3. **Pro Methode:**
   - Liest sich die Python-Version wörtlich wie die C++-Version?
   - Stimmen Konstanten, Operatoren-Reihenfolge, Klammerung?
   - Werden alle Counter inkrementiert (Reihenfolge)?
   - Sind C++-Pointer-Semantiken (`oprX`) korrekt in Python-Referenzen abgebildet?
4. **Test inspizieren:** liegt in `tests/diff/` oder `tests/integration/` ein
   Test, der das verifiziert?

Module-Reihenfolge für Review (von trivial nach komplex):

1. `core/event.py` — kleinste Datei, klare Konstanten
2. `core/distribution.py::OVerteil.zufall` (LCG) — bit-genau prüfbar
3. `core/verteilung.py` — pro Subtyp 3-5 Zeilen
4. `core/event_pool.py` — Sortier-Algorithmik
5. `core/simulator.py` — Event-Loop, Period-Mechanik
6. `pps/prozess_dll.py` + `pps/prozess/base.py` + `pps/prozess/zeitvorgabe.py`
7. `pps/knoten/base.py` + `pps/knoten/zeitvorgabe.py`
8. `pps/kante/*` + `pps/durchlaufplan.py`
9. `pps/trigger.py` + `pps/ausloeser/*`
