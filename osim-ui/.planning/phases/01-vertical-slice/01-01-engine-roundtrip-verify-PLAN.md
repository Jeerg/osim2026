---
phase: 01-vertical-slice
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - tests/backend/test_otx_roundtrip.py
  - tests/backend/conftest.py
  - tests/backend/fixtures/__init__.py
  - tests/backend/fixtures/otx_models.py
  - scripts/otx_coverage_report.py
  - docs/engine-coverage.md
autonomous: true
requirements:
  - SC-3
  - SC-8
priority: critical

must_haves:
  truths:
    - "Es ist verifiziert, dass osim_engine.io.otx_writer.dump_simulator_to_otx existiert und für Dummy.otx einen byte-stabilen Roundtrip liefert."
    - "Coverage-Lücken für Fertigungsstruktur1 und Bosch2_wechseln sind benannt und ihre Konsequenz für Phase 1 ist entschieden (Modell wird unterstützt / Modell ist read-only / Modell ist excluded)."
    - "Latin-1-Encoding-Roundtrip (Pitfall #3) ist mit einem Umlaut-haltigen Test-Klassen-Namen abgesichert."
  artifacts:
    - path: "tests/backend/test_otx_roundtrip.py"
      provides: "Roundtrip-Coverage-Suite für die drei kanonischen OTX-Testfiles"
      contains: "def test_dummy_roundtrip"
    - path: "tests/backend/fixtures/otx_models.py"
      provides: "Pfade zu den drei kanonischen Test-OTX-Files aus OSim2004/Vorstellung04"
      contains: "DUMMY_OTX"
    - path: "scripts/otx_coverage_report.py"
      provides: "Offline-Coverage-Skript, das parse->write->parse-Diff misst und einen Bericht erzeugt"
      contains: "def main"
    - path: "docs/engine-coverage.md"
      provides: "Persistenter Bericht: pro Test-OTX → coverage_ratio, Roundtrip-OK/FAIL, Konsequenz für Phase 1"
      contains: "## Coverage Matrix"
  key_links:
    - from: "tests/backend/test_otx_roundtrip.py"
      to: "osim_engine.io.otx_loader + osim_engine.io.otx_writer"
      via: "Editable-Install von osim-engine via uv-source ../osim-engine/engine"
      pattern: "from osim_engine.io.otx_(loader|writer) import"
    - from: "scripts/otx_coverage_report.py"
      to: "docs/engine-coverage.md"
      via: "Script schreibt Markdown-Tabelle; Test-Suite liest sie nicht, aber dokumentiert sie als Audit-Trail"
      pattern: "## Coverage Matrix"
---

<objective>
Welle 0 von Phase 1: Verifizieren, dass der bereits existierende `osim_engine.io.otx_writer.dump_simulator_to_otx` für unsere drei kanonischen OSim2004-Test-Modelle (Dummy.otx, Fertigungsstruktur1_mit_AslFj.otx, Bosch2_wechseln.otx) einen praktisch brauchbaren Roundtrip leistet. Wir IMPLEMENTIEREN den Writer NICHT (er existiert bereits, 1125 LoC, verifiziert in RESEARCH.md §Summary) — wir MESSEN Coverage, dokumentieren Lücken und entscheiden pro Modell, ob es in Phase 1 vollwertig editierbar, nur read-only oder excluded ist.

Purpose: Phase 1 verspricht "Save-back als versionierte OTX" (SC-8). Diese Welle ist die einzige fachliche Vorab-Prüfung, ob dieses Versprechen für reale Modelle haltbar ist. Ohne diese Welle baut Plan 04 (Models-API) gegen eine unbewiesene Annahme.

Output: pytest-Suite die bei `uv run pytest tests/backend/test_otx_roundtrip.py` grün ist (mit `@pytest.mark.xfail` für dokumentierte Lücken), persistenter Coverage-Bericht in `docs/engine-coverage.md`, und ein Skript für nachfolgende Re-Messungen wenn die Engine sich ändert.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-vertical-slice/01-CONTEXT.md
@.planning/phases/01-vertical-slice/01-RESEARCH.md
@.planning/phases/01-vertical-slice/01-PATTERNS.md
@.planning/research/osim-engine-api.md
@CLAUDE.md
</context>

<interfaces>
<!-- Engine-API, die wir in dieser Welle gegen testen. NICHT aus dem Code extrahiert; aus RESEARCH.md §Summary + osim-engine-api.md verifiziert. -->

Vom Engine-Repo verfügbar (osim_engine.io.otx_loader):
```python
def load_otx_file(path: Path | str) -> LoadResult
@dataclass
class LoadResult:
    simulator: PSimulator
    loaded: dict[str, int]         # klass -> count
    skipped: dict[str, int]
    unsupported: dict[str, int]
    coverage_ratio: float          # 0.0..1.0
    otx: OtxFile                   # raw parser-output (by_oid: dict[int, OtxObject])
```

Vom Engine-Repo verfügbar (osim_engine.io.otx_writer):
```python
def dump_simulator_to_otx(
    sim: PSimulator,
    original_otx: OtxFile | None = None,
    instances: list[Any] | None = None,
    include_unsupported_passthrough: bool = True,
) -> str
class OtxWriter: ...
```

Vom Engine-Repo verfügbar (osim_engine.io.otx_reader):
```python
def parse_otx_file(path: Path | str) -> OtxFile
@dataclass
class OtxFile:
    by_oid: dict[int, OtxObject]
    raw_text: str | None
@dataclass
class OtxObject:
    oid: int
    klass: str
    attrs: dict[str, Any]
    sub_refs: list[list[int]]
```

Datei-Encoding ist immer Latin-1 (Pitfall #3).
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: pyproject.toml — Engine als editable-install + Test-Marker registrieren</name>
  <files>pyproject.toml</files>
  <read_first>
    - pyproject.toml (aktueller Zustand: pyproject hat asyncpg aber noch keine uv-source für engine; Test-Marker fehlen)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `pyproject.toml` — Vorlage übernehmen)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Assumptions Log A8 (Engine-Pfad ist `../osim-engine/engine`)
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\pyproject.toml (3fls-Vorlage für pytest-Marker und filterwarnings, NUR lesen)
  </read_first>
  <behavior>
    - `uv sync` läuft fehlerfrei und installiert osim-engine in den Workspace.
    - `python -c "from osim_engine.io.otx_writer import dump_simulator_to_otx; print('ok')"` druckt "ok".
    - `pytest --markers` listet die Marker `requires_postgres`, `requires_firebase_emulator`, `requires_minio`, `requires_engine` und `integration`.
    - `pytest --strict-markers` schlägt nicht mit `PytestUnknownMarkWarning` an.
  </behavior>
  <action>
    Erweitere pyproject.toml gegenüber dem aktuellen Stand wie folgt (per D-18 und PATTERNS.md Sektion `pyproject.toml`):

    1. ENTFERNE die Zeile `"asyncpg>=0.30",` aus `dependencies` und FÜGE statt dessen `"psycopg[binary]>=3.2",` hinzu (Korrektur D-18 nach Pattern-Mapping: 3fls-Parität sync + psycopg3, nicht async + asyncpg).
    2. ENTFERNE die folgenden runtime-deps, die in Phase 1 nicht gebraucht werden: `google-cloud-storage`, `google-cloud-pubsub`, `websockets`. Halte stattdessen `boto3>=1.42.69` ergänzt für Minio via S3-API.
    3. FÜGE `python-multipart>=0.0.20` zu `dependencies` hinzu (für FastAPI UploadFile in Plan 04).
    4. FÜGE in `[tool.pytest.ini_options]` Folgendes hinzu:
       - `addopts = ["-ra", "--strict-markers"]`
       - `filterwarnings = ["error::pytest.PytestUnknownMarkWarning"]`
       - `markers = ["requires_postgres: Test benötigt Postgres @ localhost:5432", "requires_firebase_emulator: Test benötigt Firebase Auth Emulator @ localhost:9099", "requires_minio: Test benötigt Minio @ localhost:9000", "requires_engine: Test benötigt importierbare osim_engine-Installation", "integration: Integration-Test mit echter DB"]`
    5. FÜGE einen NEUEN Top-Level-Block hinzu:

       [tool.uv.sources]
       osim-engine = { path = "../osim-engine/engine", editable = true }

       UND ergänze `"osim-engine"` als Dependency in `dependencies` (Eintrag muss vor [dependency-groups] stehen).
    6. Lasse den `[tool.mypy]`-Block unverändert.

    Begründung für jeden Eintrag in einem kurzen Kommentar im pyproject.toml-Header (`# Phase 1 — sync psycopg3 + uv-source für engine + Test-Marker (D-18, RESEARCH §Assumption A8)`) verankern.

    Führe danach `uv sync` aus, anschließend `uv run python -c "from osim_engine.io.otx_writer import dump_simulator_to_otx; from osim_engine.io.otx_loader import load_otx_file; print('ok')"`.
  </action>
  <verify>
    <automated>uv sync 2>&amp;1 | tail -5 &amp;&amp; uv run python -c "from osim_engine.io.otx_writer import dump_simulator_to_otx; from osim_engine.io.otx_loader import load_otx_file; print('ok')" &amp;&amp; uv run pytest --strict-markers --collect-only tests/backend 2>&amp;1 | tail -5</automated>
  </verify>
  <done>
    pyproject.toml hat psycopg statt asyncpg, hat uv-source für osim-engine, hat alle 5 pytest-Marker registriert. Import beider Engine-Module ist erfolgreich. `pytest --strict-markers --collect-only` zeigt keine UnknownMarkWarning-Errors.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fixtures-Modul mit Test-OTX-Pfaden + conftest mit requires_engine-Marker-Logik</name>
  <files>tests/backend/conftest.py, tests/backend/fixtures/__init__.py, tests/backend/fixtures/otx_models.py, tests/__init__.py, tests/backend/__init__.py</files>
  <read_first>
    - C:\Users\JörgWFischer\PycharmProjects\tbx_stzrim\tests\conftest.py (3fls-Vorlage: `_load_dotenv_if_present`, `pytest_collection_modifyitems`-Hook für auto-skip — wir übernehmen NUR den Marker-auto-skip-Pfad, KEIN dotenv-Walk-up in dieser Welle)
    - .planning/phases/01-vertical-slice/01-PATTERNS.md (Sektion `tests/backend/conftest.py`)
    - C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\Vorstellung04 (Verzeichnis verifizieren — Dateien Dummy.otx, Fertigungsstruktur1_mit_AslFj.otx, Bosch2_wechseln.otx müssen existieren; mit Glob)
  </read_first>
  <behavior>
    - Importieren von `tests.backend.fixtures.otx_models` exportiert die Konstanten `DUMMY_OTX`, `FERTIGUNGSSTRUKTUR1_OTX`, `BOSCH2_WECHSELN_OTX` als `pathlib.Path` mit absoluten Pfaden in den OSim2004-Workspace.
    - Wenn die OTX-Files NICHT vorhanden sind, wirft der Helper `require_otx(path)` `pytest.skip(...)` statt `FileNotFoundError`.
    - `pytest tests/backend -m "not requires_engine"` skipped alle mit `@pytest.mark.requires_engine` markierten Tests, wenn das Engine-Modul nicht importierbar ist (Auto-Skip-Hook).
    - `tests/__init__.py`, `tests/backend/__init__.py`, `tests/backend/fixtures/__init__.py` existieren als leere Markerdateien.
  </behavior>
  <action>
    Erstelle die Marker-`__init__.py`-Dateien (leerer Inhalt) für `tests/`, `tests/backend/`, `tests/backend/fixtures/`.

    Erstelle `tests/backend/fixtures/otx_models.py` mit:
    - Konstante `OSIM2004_VORSTELLUNG04 = Path(r"C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\Vorstellung04")`
    - Konstanten `DUMMY_OTX = OSIM2004_VORSTELLUNG04 / "Dummy.otx"`, `FERTIGUNGSSTRUKTUR1_OTX = OSIM2004_VORSTELLUNG04 / "Fertigungsstruktur1_mit_AslFj.otx"`, `BOSCH2_WECHSELN_OTX = OSIM2004_VORSTELLUNG04 / "Bosch2_wechseln.otx"`
    - Funktion `require_otx(path: Path) -> Path` die `pytest.skip(f"Test-OTX nicht gefunden: {path}")` wirft wenn die Datei fehlt, sonst path zurückgibt
    - Funktion `engine_available() -> bool` die `importlib.util.find_spec("osim_engine.io.otx_writer") is not None` prüft

    Erstelle `tests/backend/conftest.py` mit:
    - `pytest_collection_modifyitems(config, items)`-Hook der `requires_engine`-markierte Tests skipped wenn `engine_available()` False zurückgibt (Pattern aus tbx_stzrim/tests/conftest.py — kürzer, ohne DB/Firebase/Minio-Checks die kommen in Plan 05)
    - Fixture `dummy_otx_path() -> Path` die `require_otx(DUMMY_OTX)` zurückgibt
    - Fixture `fertigungsstruktur1_otx_path() -> Path` analog
    - Fixture `bosch2_otx_path() -> Path` analog
    - Skip-Reason-String als Modul-Konstante `_SKIP_REASON_NO_ENGINE = "osim_engine ist nicht importierbar — uv sync ausführen"`

    KEINE async-Fixtures, KEIN httpx in dieser Welle (Plan 05 erweitert das später).
  </action>
  <verify>
    <automated>uv run pytest tests/backend --collect-only -q 2>&amp;1 | tail -10 &amp;&amp; uv run python -c "from tests.backend.fixtures.otx_models import DUMMY_OTX, engine_available; print('engine_available:', engine_available()); print('DUMMY exists:', DUMMY_OTX.exists())"</automated>
  </verify>
  <done>
    Drei `__init__.py`-Dateien existieren. `tests/backend/fixtures/otx_models.py` exportiert DUMMY_OTX, FERTIGUNGSSTRUKTUR1_OTX, BOSCH2_WECHSELN_OTX, require_otx, engine_available. `tests/backend/conftest.py` hat `pytest_collection_modifyitems` und drei OTX-Path-Fixtures. Import-Pfad funktioniert ohne ImportError.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Roundtrip-Test-Suite + Coverage-Skript + Coverage-Bericht</name>
  <files>tests/backend/test_otx_roundtrip.py, scripts/otx_coverage_report.py, docs/engine-coverage.md</files>
  <read_first>
    - tests/backend/fixtures/otx_models.py (aus Task 2 — die Fixtures werden hier konsumiert)
    - tests/backend/conftest.py (aus Task 2)
    - .planning/phases/01-vertical-slice/01-RESEARCH.md §Common Pitfalls #3 (Latin-1) und #7 (Coverage-Lücken)
    - .planning/research/osim-engine-api.md §Public API + §IO-Module (für genaue Signaturen von load_otx_file, dump_simulator_to_otx, parse_otx_file)
  </read_first>
  <behavior>
    - Test `test_dummy_roundtrip` lädt Dummy.otx via `load_otx_file`, ruft `dump_simulator_to_otx(sim, original_otx=loaded.otx, include_unsupported_passthrough=True)` auf, parsed das Ergebnis erneut via `parse_otx_file` (auf Latin-1-encoded Bytes via tempfile), vergleicht `set(by_oid.keys())` zwischen Original und Roundtrip — muss identisch sein.
    - Test `test_dummy_roundtrip_coverage_ratio` prüft `load_otx_file(DUMMY_OTX).coverage_ratio == 1.0`.
    - Test `test_fertigungsstruktur1_roundtrip` analog für Fertigungsstruktur1; darf `@pytest.mark.xfail(strict=False, reason="Coverage-Lücken siehe docs/engine-coverage.md")` haben wenn Bericht eine Lücke dokumentiert.
    - Test `test_bosch2_roundtrip` analog für Bosch2_wechseln; darf xfail haben.
    - Test `test_latin1_umlaut_roundtrip` baut programmatisch einen minimalen PSimulator mit `m_sName="Maschine Größer 5"` (ä/ö/ü/ß), serialisiert via Writer, parsed via Reader, prüft dass der Umlaut-String byte-stabil zurück kommt.
    - Alle Tests haben `@pytest.mark.requires_engine` UND `@pytest.mark.integration`.
    - `python scripts/otx_coverage_report.py` ohne Argumente druckt Markdown-Tabelle nach stdout UND schreibt sie nach `docs/engine-coverage.md`.
  </behavior>
  <action>
    Erstelle `tests/backend/test_otx_roundtrip.py` mit 5 Tests aus dem `<behavior>`-Block. Verwende `tempfile.NamedTemporaryFile(suffix=".otx", delete=False)` für Roundtrip-Zwischenschritte (Latin-1-Encoding explizit: `tmp.write(otx_text.encode("latin-1"))`).

    Vergleichs-Logik für die Roundtrips:
    - Lade Original via `load_otx_file(path)` → `LoadResult`.
    - Schreibe via `dump_simulator_to_otx(result.simulator, original_otx=result.otx, include_unsupported_passthrough=True)` → `str`.
    - Schreibe Ergebnis als Latin-1 in tempfile, lade per `parse_otx_file(tmp)` → `OtxFile` (das ist der rohe Parser, nicht der Loader).
    - Assert: `set(original_otx.by_oid.keys()) == set(roundtrip_otx.by_oid.keys())` (Objekt-Identität via OID).
    - Soft-Assert (über pytest.warns oder log): Anzahl Objekte pro Klasse darf nicht abweichen — schreibe Differenzen in `docs/engine-coverage.md`-Bericht beim Coverage-Skript-Lauf.

    Erstelle `scripts/otx_coverage_report.py`:
    - Modul-Docstring: "Misst Coverage und Roundtrip-Fitness für die drei kanonischen OSim2004-Test-OTX-Files. Output: docs/engine-coverage.md."
    - Funktion `measure(path: Path) -> dict` die {file, size_bytes, coverage_ratio, classes_loaded, classes_skipped, classes_unsupported, roundtrip_ok, oid_diff_count, missing_oids, extra_oids} zurückgibt
    - Funktion `main()` die für jede der drei Test-OTX-Files measure() ausführt und eine Markdown-Tabelle nach `docs/engine-coverage.md` schreibt mit den Spalten: Datei | Größe (KB) | coverage_ratio | Roundtrip OK? | OID-Diff | Konsequenz für Phase 1
    - `if __name__ == "__main__": main()`
    - Setze `sys.path.insert(0, str(Path(__file__).parent.parent))` damit das Skript aus repo-root läuft.

    Erstelle `docs/engine-coverage.md` als initial-leeres Template mit Sektionen:
    - `# osim-engine OTX-Roundtrip-Coverage` (Datum-Stempel)
    - `## Coverage Matrix` (Tabelle wird vom Skript bei jedem Lauf überschrieben)
    - `## Konsequenz pro Modell für Phase 1` (manuelle Sektion, anfangs mit Platzhalter "wird nach erstem Skript-Lauf gefüllt")
    - `## Re-Messung` (Hinweis: `python scripts/otx_coverage_report.py` regeneriert die Coverage-Matrix)

    Führe nach Erstellung `uv run python scripts/otx_coverage_report.py` aus, prüfe den Output, fülle die `## Konsequenz pro Modell für Phase 1`-Sektion mit der tatsächlich gemessenen Lage (z.B. "Dummy.otx: vollwertig editierbar; Fertigungsstruktur1: vollwertig editierbar; Bosch2_wechseln: Phase 1 read-only wenn Roundtrip nicht byte-stabil — Save-back-Endpoint MUSS bei diesem Modell ein 409 mit code=E_OTX_COVERAGE_INCOMPLETE liefern, siehe Plan 04").

    Markiere `test_fertigungsstruktur1_roundtrip` und `test_bosch2_roundtrip` mit `@pytest.mark.xfail(strict=False, reason="siehe docs/engine-coverage.md")` NUR wenn der Coverage-Bericht zeigt, dass sie nicht durchgehen. Wenn sie durchgehen: KEIN xfail.

    KEINE fenced code-blocks in dieser action — Implementierungs-Details kommen aus den read_first-Quellen.
  </action>
  <verify>
    <automated>uv run pytest tests/backend/test_otx_roundtrip.py -x -m "requires_engine" 2>&amp;1 | tail -15 &amp;&amp; uv run python scripts/otx_coverage_report.py 2>&amp;1 | tail -10 &amp;&amp; grep -c "Coverage Matrix" docs/engine-coverage.md</automated>
  </verify>
  <done>
    5 Tests in test_otx_roundtrip.py, alle haben requires_engine-Marker. test_dummy_roundtrip + test_dummy_roundtrip_coverage_ratio + test_latin1_umlaut_roundtrip sind grün (kein xfail). Fertigungsstruktur1 und Bosch2-Tests laufen ohne unbedingt grün zu sein — sie dokumentieren die tatsächliche Coverage. Skript scripts/otx_coverage_report.py läuft fehlerfrei und schreibt nach docs/engine-coverage.md. docs/engine-coverage.md enthält die `## Coverage Matrix`-Sektion sowie eine manuell gefüllte `## Konsequenz pro Modell für Phase 1`-Sektion mit konkreten Aussagen pro Test-OTX. Alle anderen Pläne können auf docs/engine-coverage.md verlinken.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Testfile → tempfile-Roundtrip | OTX-Text wird aus Engine-Reader gelesen und wieder geschrieben; tempfiles könnten in einem Multi-User-CI-System geleakt werden |
| Engine ↔ Test-Suite | Engine läuft im Test-Prozess; bei Crash (z.B. Loader-Bug) failt der Test, nicht die Test-Runtime |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Information Disclosure | tempfile bei Roundtrip-Test | accept | tempfile.NamedTemporaryFile(delete=False) wird nach Vergleich manuell mit `path.unlink(missing_ok=True)` in `finally` entfernt; im Test ist OS-Schutz ausreichend (Single-User-Dev-Maschine, CI in isolated Runner) |
| T-01-02 | Tampering | Bosch2_wechseln.otx wird aus extern beschafftem OSim2004-Workspace gelesen | accept | Read-Only-Zugriff; KEIN Write-Back in OSim2004/-Workspace; keine PII im File |
| T-01-03 | DoS | Bosch2_wechseln ist 18 MB; Test-Laufzeit pro Lauf möglicherweise 30+ s | mitigate | Marker `@pytest.mark.requires_engine` + `@pytest.mark.integration` ermöglicht selective skip via `-m "not integration"` für schnelle CI-Runs |
</threat_model>

<verification>
- `uv run pytest tests/backend/test_otx_roundtrip.py -x -m requires_engine` ist grün (xfail OK für F-/B-Modelle, NICHT für Dummy)
- `uv run python scripts/otx_coverage_report.py` läuft ohne Exception, schreibt docs/engine-coverage.md
- `docs/engine-coverage.md` enthält für jedes der 3 Modelle eine Aussage in der "Konsequenz für Phase 1"-Sektion
- `uv run pytest --strict-markers --collect-only` bleibt grün (Marker korrekt registriert)
</verification>

<success_criteria>
SC-3 (Phase 1 SC liste: "OTX-Upload → Engine-Parse → JSON-Tree") ist FÜR DUMMY.otx vorab abgesichert: wir wissen dass Roundtrip funktioniert und coverage_ratio = 1.0 ist.
SC-8 (Save-back = neue OTX-Version) ist FÜR DIE 3 KANONISCHEN MODELLE vorab gemessen: wir wissen welche Modelle in Phase 1 vollwertig editierbar sind, welche read-only und welche excluded. Plan 04 nutzt docs/engine-coverage.md als Wahrheits-Quelle für die Save-back-Logik (insbesondere für die Fehlermeldung E_OTX_COVERAGE_INCOMPLETE).
</success_criteria>

<output>
After completion, create `.planning/phases/01-vertical-slice/01-01-SUMMARY.md` with:
- Coverage-Matrix-Snapshot (von docs/engine-coverage.md kopiert)
- Liste der Modelle mit ihrem Phase-1-Status (editable / read-only / excluded)
- Konkrete Konsequenzen für Plan 04: welche Fehler-Codes der Save-back-Endpoint werfen muss
- Hinweis ob Engine-Lücken existieren, die ins osim-engine-Repo zurück getragen werden sollten (Backlog für Phase 2+)
</output>
</content>
</invoke>