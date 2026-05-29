---
status: partial
phase: 01-live-viewer-bridge
source: [01-VERIFICATION.md, UAT.md]
started: "2026-05-29"
updated: "2026-05-29"
---

## Current Test

[awaiting human testing — Stack hochfahren mit `bash scripts/dev-up.sh`, dann http://localhost:3002/live, Login jwfischer69@gmail.com / 123456]

> Vollständige Schritt-für-Schritt-Anleitung in `UAT.md` (gleiche Phase). Diese Datei trackt nur den Pending-Status für `/gsd:progress` und `/gsd:audit-uat`.

## Tests

### 1. AC-3 — UI Tail-Pickup < 1s
expected: Neue Zeilen in stream.jsonl erscheinen in der `/live`-UI innerhalb < 1s.
result: [pending]
blocker: M1-Transport-Lücke — `/live` liest aktuell über `noopRead`; es gibt keine Datei-Read-Brücke Portal↔runs/<id>/stream.jsonl. HTTP/WS-Transport ist SPEC §4 explizit M2. Engine-Seite + UI-Komponenten sind isoliert bewiesen; das echte Live-Wiring braucht den M2-Transport oder einen lokalen File-Read-Shim.

### 2. AC-5 — Crash-Robustheit / Offset-Restart
expected: UI mitten im Stream killen, neu starten → resumed vom Byte-Offset; Engine schreibt unterbrechungsfrei weiter.
result: [pending]

### 3. AC-6 — 1000-Event-Demo visuell
expected: Demo-Lauf zeigt live Gantt + KPI in der UI, Latenz < 1s (mit Simulator-Grafik / Grafik-Viewer, NICHT Standard-Viewer).
result: [pending]
note: abhängig von Test 1 (Transport).

### 4. AC-7 — Schema-Version-Mismatch
expected: Major-Mismatch → gelbes Warn-Banner, KEIN Crash (best-effort, D-OP-4). Komponenten-seitig bereits per vitest bewiesen; hier visuelle Bestätigung im laufenden Stack.
result: [pending]

### 5. AC-9 — C++/Python KPI-Parity-Spot-Check
expected: Für 1 Demo-Sim gleiche KPI-Werte (±1) wie OSim2004. Manuell (D-OP-6).
result: [pending]
note: OSim2004-C++-Baum nicht im Workspace → Referenz ist SPEC §6.3-Hand-Werte (UAT.md §5, Pfad B), oder C++-Baum verfügbar machen für echten 1:1-Abgleich.

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
