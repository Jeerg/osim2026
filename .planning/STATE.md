---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: "Gap-Closure 01-15: Defekt A (pre-start Lanes) + Defekt B (Modell-Persistenz) behoben — Browser-UAT ausstehend"
last_updated: "2026-05-29T20:05:00Z"
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 15
  completed_plans: 15
  percent: 100
---

## Last Session

**Timestamp:** 2026-05-29T19:30:00Z
**Stopped At:** Completed 01-15-PLAN.md (Faithful Grafikfenster + AuswertungChart + Wiring)

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
