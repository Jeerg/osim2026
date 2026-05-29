# Golden-Records für die Stream-Schema-Validierung (AC-1 / D-2.4)

Dieses Verzeichnis enthält deterministische JSONL-Golden-Records, gegen die
`tests/integration/test_streaming_schema.py` die JSON-Schemas aus
`src/osim_engine/streaming/schemas/` validiert. Die Schema-Validation läuft
**ausschließlich in den Tests/CI** (D-1.4) — der Writer und die Listener
validieren zur Laufzeit nicht (kein Runtime-Overhead).

## Dateinamens-Konvention

Pro Sub-Stream `<tag>` existieren zwei Golden-Dateien:

- `<tag>.full.jsonl` — der **vollständige** Frame-Vertrag (alle SPEC-§6.3-Felder
  belegt, so wie der Stream nach Schließung der Quell-Slices aussieht).
- `<tag>.partial.jsonl` — der **partial**-Frame, wie ihn die Engine **heute**
  tatsächlich emittiert, solange die Quell-Slices (P5-D/P5-L/P5-M) Skelett sind.
  Partial-Frames tragen `v.partial=true` und lassen die noch nicht verdrahteten
  Felder weg bzw. setzen sie auf Null-Default.

Beide Varianten müssen gegen **dasselbe** Schema valide sein: optionale
partial-Felder sind im Schema nicht `required`, damit ein partial-Frame nicht
am Schema scheitert (D-2.4).

## Coverage-Lücken

Coverage-Lücken erscheinen hier als **leere oder minimale** partial-Records —
nicht als fehlende Dateien. So bleibt sichtbar, welche Streams heute partial
sind (`gantt_einsatz`, `gantt_schicht`, `kpi_auswertung`, `reporting_record`)
und welche bereits full (`lifecycle`, `gantt_durchlauf`-Vertrag). Mit jeder
P5-Slice-Closure wandert das jeweilige Feld vom `.partial`- in den `.full`-Pfad,
ohne den Stream-Vertrag (und damit `schema_version`) zu brechen.

## Negativ-Pin

`lifecycle.broken.jsonl` enthält eine bewusst defekte Zeile (fehlendes
Pflichtfeld `seq`). Der Negativ-Test (`pytest.raises`) stellt sicher, dass die
Validierung diese Zeile ablehnt — ein Schema, das alles durchwinkt, fällt damit
auf.
