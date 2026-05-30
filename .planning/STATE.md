---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: "01-16: OSim-Treue-Offensive abgeschlossen (7 Commits auf main, api-Image neu). (A) DLZ exakt aus Auslöser-Akkumulatoren (kennzahl_dlz-Stream) + Charts von 3D auf 2D; ø-Balken bit-exakt in BEIDEN OSim-Modi (count==0-Auslöser mit-emittiert + NoZeroInEval-Schalter). (B) Umfassender Read-Side-Treue-Audit aller wertliefernden Streams gegen C++ (.planning/AUDIT-OSIM-TREUE.md). (C) Gefundene Fehler gefixt: gesamt-Durchsatz −28955→5864/5740/124 (aus m_iPtkBeg/AusloesungCount); Teil-Spalte = Durchlaufplan-Name (m_durch->m_name, war Auslöser-Name); gantt_wartequeue zählt jetzt 1:1 alle Knoten-Prozesse (waiting+in Bearbeitung, 96→110, Trajektorie identisch=reproduzierbar); restmenge/beschreibung ehrlich gegatet (FEMOS nicht portiert). Grundlage: osim2004-trace garantiert bit-exakte RNG/Event-Basis → 1:1-Formel-Port=exakte Zahlen. OFFEN: Browser-UAT ÜBER DEN GRAFIK-VIEWER (Memory-Hartregel; bei Exception Modell anpassen). DANACH: Modell-Portierung (P5-D/P5-M/FEMOS/Kosten) + ERP-Instanz-Modell als eigene Phasen. Voller Kontext: 01-16-RESUME-HANDOFF.md."
last_updated: "2026-05-30T23:30:00Z"
resume_file: ".planning/phases/01-live-viewer-bridge/01-16-RESUME-HANDOFF.md"
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 15
  completed_plans: 15
  percent: 100
---

## Last Session

**Timestamp:** 2026-05-30T23:30:00Z
**Stopped At:** 01-16 OSim-Treue-Offensive — 7 Commits auf main (0e930fc..122261e),
api-Image neu+läuft. (A) DLZ exakt aus den OSim-Auslöser-Akkumulatoren neu
aufgebaut (neuer kennzahl_dlz-Stream; gantt_durchlauf-ende war pro Operation,
nicht pro Auslösung → DLZ war leer+falsch). Charts 3D→2D. ø-Balken bit-exakt in
BEIDEN OSim-Modi (count==0 mit-emittiert + NoZeroInEval-Schalter). (B) Umfassender
Read-Side-Treue-Audit gegen C++ (.planning/AUDIT-OSIM-TREUE.md). (C) Fixes: gesamt
−28955→5864/5740/124; Teil-Spalte=Durchlaufplan-Name (m_durch->m_name); wartequeue
1:1 (waiting+in Bearbeitung, 96→110, Trajektorie identisch); restmenge/beschreibung
ehrlich gegatet. Grundlage: osim2004-trace = bit-exakte RNG/Event-Basis → 1:1-Port
= exakte Zahlen. **OFFEN: Browser-UAT ÜBER DEN GRAFIK-VIEWER (Memory-Hartregel;
bei Exception MODELL anpassen).** Danach: Modell-Portierung (P5-D/M/FEMOS/Kosten)
+ ERP-Instanz-Modell als eigene Phasen. Voller Kontext: 01-16-RESUME-HANDOFF.md.
Vorbestehend rot (NICHT diese Session): 4× gantt_einsatz-partial, eabelegen-Wächter
(obsolet seit 01-14), test_day_of_sim_parity (tzdata fehlt). skip-worktree: alle
geänderten Dateien waren H (sauber).

## Decisions

- osim2004-trace garantiert bit-exakte RNG/Event-Basis → 1:1-Formel-Port liefert zwangsläufig exakte Zahlen (altes OSim muss nicht laufen)
- DLZ-Quelle = on_dlpl_beendet-Akkumulatoren (m_dPtkDurchlaufzeit/m_iPtkAusloesungCount), NICHT gantt_durchlauf start/ende (pro Operation, falsch)
- ø-Default = OSim NoZeroInEval=0 (÷ GetCount alle), Schalter für NoZeroInEval=1 (÷ ≠0); count==0-Auslöser dafür mit-emittiert
- Teil-Spalte überall = m_durch->m_name = Durchlaufplan-Name (ausl.m_lDlpl), nicht Auslöser-Name
- FEMOS-abhängige Felder (restmenge/beschreibung/Kosten/Bestände) = gaten (null+missing_slice), NIE erfinden — exakt erst nach Modell-Portierung
- m_lPtkWartschl ist reine KPI-Liste (nicht in Sim-Entscheidungen) → Lebensdauer an knoten.add/remove_prozess koppeln ist reproduzierbarkeits-neutral
- Sim-Verifikation IMMER über Grafik-Viewer; bei Exception Modell anpassen (Memory feedback-sim-grafik-viewer-immer)
- Bosch2_wechseln hat 100% eaKeineBelegung — leere Belegung ist modelltreu, kein Python-Bug
- PDlplKnoten.get_assoz_mit + PAssozBeleg LinkStatus-API 1:1 gegen C++ portiert
- fill_shadow_list ohne LinkStatus-Filter (1:1 zu C++ FillShadowList)
- Symptom-Ursache: Streaming-Listener greifen m_oProzCurrent falsch ab — behoben in 01-14
- EinsatzListener sampelt m_oProzCurrent via Zustands-Diff je PRessBeleg (SPEC §4.1)
- Loader-Bug: m_lRessourcen (OTX-Attr) statt m_lRessBeleg + m_lAssozRess-Wiring fehlte
- embb_pre_run.otx ist geeignetes Integrations-Modell (echte Ressourcen-Belegung)
- inline-style fuer OID-Farben ist 1:1-Treue, kein UI-Branding — Ausnahme von Token-Regel
- Qualifikation-Modus gated '(Slice offen)' — Quali-Stream ist P5-M abhaengig
- data-testid=live-start-run als E2E+Unit-kompatibler Ankerpunkt (GrafikfensterControls)
- Grafikfenster-Lanes kommen aus PBetriebsmittel.m_sName (autoritativ, pre-start) + Frame-Fallback
- useModelStore.setActiveModelId(id) fuer moduluebergreifende Modell-Persistenz ohne Wire-Load
- live.tsx liest modelId aus useModelStore statt lokalem useState

- Bosch2_wechseln hat 100% eaKeineBelegung — leere Belegung ist modelltreu, kein Python-Bug
- PDlplKnoten.get_assoz_mit + PAssozBeleg LinkStatus-API 1:1 gegen C++ portiert
- fill_shadow_list ohne LinkStatus-Filter (1:1 zu C++ FillShadowList)
- Symptom-Ursache: Streaming-Listener greifen m_oProzCurrent falsch ab — behoben in 01-14
- EinsatzListener sampelt m_oProzCurrent via Zustands-Diff je PRessBeleg (SPEC §4.1)
- Loader-Bug: m_lRessourcen (OTX-Attr) statt m_lRessBeleg + m_lAssozRess-Wiring fehlte
- embb_pre_run.otx ist geeignetes Integrations-Modell (echte Ressourcen-Belegung)
- inline-style fuer OID-Farben ist 1:1-Treue, kein UI-Branding — Ausnahme von Token-Regel
- Qualifikation-Modus gated '(Slice offen)' — Quali-Stream ist P5-M abhaengig
- data-testid=live-start-run als E2E+Unit-kompatibler Ankerpunkt (GrafikfensterControls)
- Grafikfenster-Lanes kommen aus PBetriebsmittel.m_sName (autoritativ, pre-start) + Frame-Fallback
- useModelStore.setActiveModelId(id) fuer moduluebergreifende Modell-Persistenz ohne Wire-Load
- live.tsx liest modelId aus useModelStore statt lokalem useState
