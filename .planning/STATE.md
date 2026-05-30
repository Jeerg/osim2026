---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: "01-16: /live als PSim-Menübaum (Simulation/Kennzahlen/Auswertung getrennt, Steuerleiste oben, Durchlaufplan-Gantt raus) + OSim-treue Kennzahlen aus dem Sim-Stream (kennzahlen.ts: mittlere DLZ je Auslöser/Durchlaufplan + über-alles, Anzahl, Auslastungs-Näherung; OChartCtrl-3D-Balken). Engine: gantt_durchlauf-start trägt durchlaufplan_oid/-id + soll_end_termin. SPECs: LIVE-LAYOUT-SPEC, KENNZAHLEN-SPEC. api-Image neu, läuft. Offen: Browser-UAT der Kennzahlen-Charts; danach P5-D (echte Auslastung)."
last_updated: "2026-05-30T14:45:00Z"
resume_file: ".planning/phases/01-live-viewer-bridge/01-16-RESUME-HANDOFF.md"
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 15
  completed_plans: 15
  percent: 100
---

## Last Session

**Timestamp:** 2026-05-30T14:45:00Z
**Stopped At:** 01-16 — drei Blöcke abgeschlossen + committet (c76ddf4..01d34e6):
(A) 01-15 fertig: api-Image neu (Engine eingebacken, kein docker cp) + Dockerfile-
Monorepo-Pfadfix + Warteschlangen-Sprung-Bug (UI-Volumen: stream-spez. Caps,
kein Spread-Push, Decimation). (B) /live nach PSim umgebaut: linker Menübaum
(Simulation/Kennzahlen/Auswertung), Steuerleiste oben, Durchlaufplan-Gantt raus.
(C) OSim-treue Kennzahlen aus dem Sim-Stream (kennzahlen.ts, jede Formel mit
OSim-Zeilenzitat; Engine streamt durchlaufplan_oid/-id + soll_end_termin) + 4
Charts (mittl. DLZ Auslöser/Durchlaufplan, Anzahl, Auslastungs-Näherung). tsc 0,
118 UI-Tests grün, eslint 0; Engine streaming + 4 neue grün. api-Image neu, läuft.
**OFFEN: Browser-UAT der Kennzahlen-Charts durch Nutzer** (gibt Rückmeldung in
neuer Session). Voller Kontext: 01-16-RESUME-HANDOFF.md. Danach: P5-D (echte
Auslastung), dann Liefertermintreue-Chart. Achtung skip-worktree-Falle (Memory).

## Decisions

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
