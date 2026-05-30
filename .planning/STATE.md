---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: "Gap-Closure 01-15: api-Image neu gebaut (Engine inkl. WartequeueListener jetzt dauerhaft im Image, kein docker cp mehr) + Dockerfile-Monorepo-Pfadfix. Offen: finale Browser-UAT-Approval. Siehe 01-15-RESUME-HANDOFF.md"
last_updated: "2026-05-30T12:00:00Z"
resume_file: ".planning/phases/01-live-viewer-bridge/01-15-RESUME-HANDOFF.md"
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 15
  completed_plans: 15
  percent: 100
---

## Last Session

**Timestamp:** 2026-05-30T10:00:00Z
**Stopped At:** 01-15 Grafikfenster — viele Browser-UAT-Fixes committet (8013a30..025a486):
festes Perioden-Zeitfenster (kein dynamisches Reskalieren), echte periodInfo statt hart
0/86400 (Wurzel von "Grafik nach Zoomen weg"), Zoom-Stufe "Woche" + intuitive Skala +
Content-Deckel, Warteschlangen-Treppe vorwärts (kein zeitliches Strecken). tsc 0, 99
live-stream-Tests grün. **Checkpoint Task 4 (Browser-UAT) noch OFFEN** — finale Approval
ausstehend. Voller Kontext: 01-15-RESUME-HANDOFF.md. Offene Folgepunkte: api-Image-Rebuild
(Engine im Container ist per docker cp = flüchtig), optional Kalender-Datum, dann
Code-Review + Verifikation + phase.complete.

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
