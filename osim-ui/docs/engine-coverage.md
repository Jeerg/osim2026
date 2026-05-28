# osim-engine OTX-Roundtrip-Coverage

Persistenter Bericht: pro Test-OTX → `coverage_ratio`, Roundtrip-OK/FAIL, Konsequenz für Phase 1.

Regeneriert via `uv run python scripts/otx_coverage_report.py`.

## Coverage Matrix

<!-- COVERAGE-MATRIX:BEGIN -->
| Datei | Größe | coverage_ratio | geladen | skipped | unsupp. | Roundtrip OK? | OID-Diff | Konsequenz für Phase 1 |
|-------|-------|---------------:|--------:|--------:|--------:|:-------------:|---------:|:-----------------------|
| Dummy.otx | 227.6 KB | 1.0000 | 517 | 773 | 0 | OK | 0 | **editable** |
| Fertigungsstruktur1_mit_AslFj.otx | 227.6 KB | 1.0000 | 517 | 773 | 0 | OK | 0 | **editable** |
| Bosch2_wechseln.otx | 17.3 MB | 1.0000 | 30089 | 62167 | 0 | OK | 0 | **editable** |

*Letzte Messung: 2026-05-21 06:20 UTC via `scripts/otx_coverage_report.py`*
<!-- COVERAGE-MATRIX:END -->

## Konsequenz pro Modell für Phase 1

Gemessen 2026-05-21 (Welle 0 Plan 01-01). Alle drei kanonischen Test-Modelle haben `coverage_ratio = 1.0` und einen byte-stabilen Roundtrip (`OID-Diff = 0`). Die Loader-Kommentare zur „Coverage-Lücke" in CONTEXT.md und älteren Pre-Plan-Quellen sind damit obsolet.

- **Dummy.otx** — **vollwertig editierbar (Phase 1).** 1290 OIDs, 517 geladen, 773 bewusst skipped (UI/Grafik via `_SKIP`-Liste in `otx_loader`). Save-back via `dump_simulator_to_otx` produziert byte-stabile Roundtrips. Plan 04 (Models-API) kann diesen Pfad ohne Sonderfall-Logik aktivieren.
- **Fertigungsstruktur1_mit_AslFj.otx** — **vollwertig editierbar (Phase 1).** Identische Struktur-Größe wie Dummy.otx (beide 233 KB / 1290 OIDs / coverage_ratio 1.0 in Vorstellung04). Save-back ohne Einschränkung möglich.
- **Bosch2_wechseln.otx** — **vollwertig editierbar (Phase 1).** 92 256 OIDs, 30 089 geladen, 62 167 skipped (UI/Grafik-Schwerpunkt — das Original-Modell trägt viele Layout-/Visualisierungs-Objekte aus dem MFC-Designer mit). Trotz Größe (18 MB) ist der Roundtrip byte-stabil. **Performance-Hinweis für Plan 04:** Save-back-Endpoint sollte für diese Klasse von Modellen mit > 50 000 OIDs einen Performance-Test im integration-Suite haben (heute: Loader+Writer+Re-Parser ~1 s; akzeptabel).

**Konsequenz für Plan 04 (`Models-API` / Save-back):** Der ursprünglich vorgesehene Fehler-Code `E_OTX_COVERAGE_INCOMPLETE` ist bei aktuellem Engine-Stand **kein** Phase-1-Pflichtpfad für die kanonischen drei Modelle — er bleibt aber als defensiver Vertrag im Save-back-Endpoint (zukünftige, nicht-kanonische Modelle könnten ihn auslösen). Voraussetzung: vor jedem Save-back wird `coverage_ratio == 1.0` geprüft und bei `< 1.0` 409 mit `code=E_OTX_COVERAGE_INCOMPLETE` zurückgegeben.

**Konsequenz für osim-engine-Repo (Backlog):** Kein Handlungsbedarf für die drei kanonischen Modelle. Falls in zukünftigen Wellen weitere Modelle aus `Vorstellung04/` (z.B. `AZ-Tool.otx`, `Embb-AslFj.otx`) Loader-Lücken zeigen, im osim-engine-Repo Handler ergänzen.

## Re-Messung

Bei jeder Änderung an `osim-engine/io/otx_writer.py` oder `otx_loader.py` neu messen:

```bash
uv run python scripts/otx_coverage_report.py
```

Nur die `## Coverage Matrix`-Sektion (zwischen den `COVERAGE-MATRIX`-Markern) wird überschrieben. Die `## Konsequenz pro Modell für Phase 1`-Sektion bleibt unter Editor-Hoheit.
