# python-reference — Python-Substitut bis C-Compiler verfügbar

**Warum gibt es das?**
Solange kein C-Compiler installiert ist, kann `osim2004-trace/` nicht
gebaut werden. Damit fehlen die `.jsonl`-Fixtures unter
`tests/diff/fixtures/`. Dieses Subverzeichnis enthält einen
Python-Reference-Generator, der **dieselbe** Bit-Logik wie der Mini-C-Code
implementiert und die Fixtures erzeugt.

**Trade-off**
Ein Vergleich Python ↔ Python-Generator beweist nur **Stabilität**, nicht
bit-Treue zur C++-Referenz. Sobald `osim2004-trace/{lcg,verteil,eventpool}`
gebaut werden kann (`make fixtures` oder `build.bat`), sollten die hier
generierten Fixtures durch die C-Outputs ersetzt werden. Erst dann ist
die Diff-Test-Strategie vollwertig.

**Implementation-Hinweis**
Der Python-Reference-Generator nutzt **bewusst die Python-Implementation
aus `src/osim_engine/core/`**. Das ist tautologisch (testet sich selbst
gegen sich selbst), liefert aber:

- Stabile Fixtures für CI (kein Flakiness)
- Regressionsschutz: wenn jemand `src/osim_engine/core/distribution.py`
  ändert, brechen die Tests, weil die Fixtures noch die alten Werte haben
- Brücke zur C-Variante: derselbe Output-Format-Vertrag (kompakte JSONL,
  `%.17g`-Float-Präzision via `repr()`)

## Verwendung

```bash
cd osim2004-trace/python-reference
python generate_fixtures.py
# erzeugt alle .jsonl-Files unter ../../tests/diff/fixtures/
```

Reproduzierbar: identische Aufrufparameter wie `Makefile`-Target `fixtures`.
