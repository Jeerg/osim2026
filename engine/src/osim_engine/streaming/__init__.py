"""Streaming-Modul — Live-JSONL-Stream der Simulation für osim-ui (Phase 01).

Eigentümer des Engine↔UI-Vertrags (SPEC §6.2/§6.3): ein Sim-Lauf erzeugt
genau eine append-only Datei `runs/<run-id>/stream.jsonl` mit typisierten
Sub-Streams. Die Anbindung erfolgt ausschließlich listener-only über
`OListenerSimulator` + `sim.attach()` (D-1.2) — der Engine-Kern
(`core/simulator.py`) bleibt unangetastet (SPEC §5, hartes Nicht-Ziel).

Sauber getrennt von `engine/recorder.py` (Low-Level-Audit-Trace, D-1.1/D-OP-5),
dessen Buffering-Pattern hier nur *kopiert*, nicht erweitert wird.
"""
