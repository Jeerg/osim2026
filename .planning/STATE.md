---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 01-14-PLAN.md (Streaming-Listener auf echte Belegung + WartequeueListener)
last_updated: "2026-05-29T18:30:00Z"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 15
  completed_plans: 14
  percent: 0
---

## Last Session

**Timestamp:** 2026-05-29T18:30:00Z
**Stopped At:** Completed 01-14-PLAN.md (Streaming-Listener auf echte Belegung + WartequeueListener)

## Decisions

- Bosch2_wechseln hat 100% eaKeineBelegung — leere Belegung ist modelltreu, kein Python-Bug
- PDlplKnoten.get_assoz_mit + PAssozBeleg LinkStatus-API 1:1 gegen C++ portiert
- fill_shadow_list ohne LinkStatus-Filter (1:1 zu C++ FillShadowList)
- Symptom-Ursache: Streaming-Listener greifen m_oProzCurrent falsch ab — behoben in 01-14
- EinsatzListener sampelt m_oProzCurrent via Zustands-Diff je PRessBeleg (SPEC §4.1)
- Loader-Bug: m_lRessourcen (OTX-Attr) statt m_lRessBeleg + m_lAssozRess-Wiring fehlte
- embb_pre_run.otx ist geeignetes Integrations-Modell (echte Ressourcen-Belegung)
