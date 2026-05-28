---
phase: 01-vertical-slice
plan: 01
subsystem: testing
tags: [pytest, otx-roundtrip, osim-engine, coverage, latin-1, fixtures]

# Dependency graph
requires:
  - phase: 00-bootstrap
    provides: Repo-Skelett, osim-engine als Workspace-Sibling, tests/-Verzeichnis
provides:
  - "Verifikation: osim_engine.io.otx_writer.dump_simulator_to_otx liefert für alle drei kanonischen Test-Modelle (Dummy / Fertigungsstruktur1 / Bosch2_wechseln) einen byte-stabilen Roundtrip mit coverage_ratio=1.0"
  - "pytest-Infrastruktur für Engine-Tests: requires_engine-Marker + Auto-Skip-Hook + OTX-Path-Fixtures"
  - "scripts/otx_coverage_report.py — wiederholbare Coverage-Messung mit Markdown-Output"
  - "docs/engine-coverage.md — persistenter Audit-Trail, alle Folge-Pläne können darauf verlinken"
  - "Klare Phase-1-Konsequenz: KEIN Modell ist read-only/excluded; E_OTX_COVERAGE_INCOMPLETE bleibt als defensiver Vertrag im Save-back-Endpoint, ist aber kein Pflichtpfad für die kanonischen drei Modelle"
affects: [01-02-backend-foundation, 01-04-storage-models-locks-api, 01-05-compose-stack-integration-tests, 01-11-save-strategy-indexeddb]

# Tech tracking
tech-stack:
  added:
    - "psycopg[binary]>=3.2 (statt asyncpg — 3fls-Parität)"
    - "boto3>=1.42.69 (Minio via S3-API)"
    - "python-multipart>=0.0.20 (FastAPI UploadFile)"
    - "osim-engine als editable-install via [tool.uv.sources]"
  patterns:
    - "pytest-Marker + Auto-Skip-Hook für Engine-Verfügbarkeit (vereinfachte Variante des tbx_stzrim-Patterns)"
    - "Tempfile-Roundtrip-Helper mit explizitem Latin-1-Encoding (Pitfall #3-Defense)"
    - "Coverage-Skript mit `<!-- COVERAGE-MATRIX:BEGIN/END -->`-Markern: maschinen-überschriebene Tabellensektion + editorhoheite Konsequenz-Sektion in derselben Datei"

key-files:
  created:
    - "tests/backend/__init__.py — Package-Marker"
    - "tests/backend/fixtures/__init__.py — Package-Marker"
    - "tests/backend/fixtures/otx_models.py — DUMMY_OTX / FERTIGUNGSSTRUKTUR1_OTX / BOSCH2_WECHSELN_OTX + require_otx + engine_available"
    - "tests/backend/conftest.py — pytest_collection_modifyitems-Hook + drei OTX-Path-Fixtures"
    - "tests/backend/test_otx_roundtrip.py — 5 Tests (3× Roundtrip, 1× coverage_ratio, 1× Latin-1-Umlaut)"
    - "scripts/otx_coverage_report.py — Coverage-Skript mit Markdown-Tabellen-Generator"
    - "docs/engine-coverage.md — initiales Template + erste Messung 2026-05-21"
  modified:
    - "pyproject.toml — asyncpg → psycopg3, +boto3, +python-multipart, +osim-engine via uv-source, +5 pytest-Marker, +strict-markers/filterwarnings"

key-decisions:
  - "Welle-0-Reframe bestätigt: Writer existiert bereits (1125 LoC in osim_engine.io.otx_writer), Plan implementiert NICHT, sondern misst Coverage. CONTEXT.md D-02 ist in dieser Form obsolet — RESEARCH.md §Summary war die richtige Quelle der Wahrheit."
  - "Alle drei kanonischen Modelle haben coverage_ratio=1.0 + byte-stabilen Roundtrip → KEIN xfail-Marker auf F1/Bosch2-Tests nötig. Plan-Vorlage hatte 'darf xfail haben wenn Bericht eine Lücke dokumentiert' als bedingten Marker vorgesehen — die Bedingung ist nicht erfüllt."
  - "E_OTX_COVERAGE_INCOMPLETE bleibt als defensiver Vertrag in Plan 04 (Save-back-Endpoint) für zukünftige nicht-kanonische Modelle, ist aber kein Pflichtpfad für die drei verifizierten Test-Modelle."

patterns-established:
  - "Coverage-Bericht-Pattern: maschinen-überschriebene Tabellen-Sektion zwischen `<!-- COVERAGE-MATRIX:BEGIN/END -->`-Markern + manuell gepflegte Konsequenz-Sektion in derselben Markdown-Datei. Re-Lauf ist idempotent für Tabelle, lässt Konsequenz-Sektion unberührt."
  - "Latin-1-Roundtrip-Test-Pattern: Engine-PSimulator laden, String-Attribut auf Umlaut-haltigen Latin-1-Wert setzen (KEINE CP1252-only-Zeichen wie em-dash), dump → tempfile mit `.encode('latin-1')` → re-parse → byte-Gleichheit asserten."
  - "Sys-path-Defense in CLI-Skripten unter PYTHONPATH-Konflikten: REPO_ROOT immer unbedingt an sys.path[0] prependen (NICHT bedingt), plus sys.modules-Pop für konkurrierende Package-Namen. Erforderlich wenn PYTHONPATH ein konkurrierendes `tests`-Package shadowt."

requirements-completed: [SC-3, SC-8]

# Metrics
duration: 17min
completed: 2026-05-21
---

# Phase 1 Plan 01: Engine-Roundtrip-Verify Summary

**Verifiziert: osim-engine OTX-Writer leistet byte-stabilen Roundtrip mit coverage_ratio=1.0 für alle drei kanonischen Test-Modelle — Phase-1-Save-back-Versprechen (SC-8) ist fachlich abgesichert.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-05-21T06:06:49Z
- **Completed:** 2026-05-21T06:23:52Z
- **Tasks:** 3 / 3
- **Files created:** 7
- **Files modified:** 1

## Accomplishments

- **Coverage-Vertrag empirisch bestätigt:** Dummy.otx (1290 OIDs), Fertigungsstruktur1_mit_AslFj.otx (1290 OIDs) und Bosch2_wechseln.otx (92 256 OIDs, 18 MB) → alle drei `coverage_ratio = 1.0` und `OID-Diff = 0` nach Loader → Writer → Tempfile(Latin-1) → Re-Parser.
- **Pitfall #3 (Latin-1-Encoding) abgesichert:** `test_latin1_umlaut_roundtrip` setzt `m_name="Maschine Größer 5 äöüß ÄÖÜ"` auf den ASimulator, schreibt-und-liest byte-stabil zurück.
- **Engine als editable-install verankert:** `[tool.uv.sources] osim-engine = { path = "../osim-engine/engine", editable = true }` plus `osim-engine` als reguläre Dependency — Backend kann ab jetzt jederzeit ohne Re-Install gegen lokale Engine-Branches testen.
- **Test-Marker-Infrastruktur etabliert:** 5 pytest-Marker (`requires_postgres`, `requires_firebase_emulator`, `requires_minio`, `requires_engine`, `integration`) sind in `pyproject.toml` registriert; `--strict-markers` und `filterwarnings = ["error::PytestUnknownMarkWarning"]` machen ungeklärte Marker zu harten Fehlern. Auto-Skip-Hook für `requires_engine` funktioniert.
- **docs/engine-coverage.md** ist die designierte Wahrheits-Quelle für alle Folge-Pläne, die OTX-Modelle annehmen müssen — Plan 04 (Models-API/Save-back), Plan 05 (Integration-Tests), Plan 11 (Save-Strategy).

## Task Commits

Jeder Task wurde atomic committed:

1. **Task 1: pyproject.toml — Engine als editable-install + Test-Marker** — `7e2c120` (chore)
2. **Task 2: Fixtures-Modul + conftest mit requires_engine-Marker-Logik** — `6890a7a` (test)
3. **Task 3: Roundtrip-Suite + Coverage-Skript + Coverage-Bericht** — `7d70f2a` (test)

**Plan-Metadaten-Commit:** folgt nach diesem SUMMARY-Write (separate Commit für SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md).

## Coverage-Matrix-Snapshot (aus docs/engine-coverage.md, Stand 2026-05-21)

| Datei                              | Größe    | coverage_ratio | geladen | skipped | unsupp. | Roundtrip | OID-Diff | Phase-1-Status |
| ---------------------------------- | -------- | -------------: | ------: | ------: | ------: | :-------: | -------: | :------------- |
| Dummy.otx                          | 227.6 KB |         1.0000 |     517 |     773 |       0 |    OK     |        0 | editable       |
| Fertigungsstruktur1_mit_AslFj.otx  | 227.6 KB |         1.0000 |     517 |     773 |       0 |    OK     |        0 | editable       |
| Bosch2_wechseln.otx                | 17.3 MB  |         1.0000 |   30089 |   62167 |       0 |    OK     |        0 | editable       |

## Phase-1-Status pro Modell

- **Dummy.otx — editable.** Volle Editier-Unterstützung in Phase 1.
- **Fertigungsstruktur1_mit_AslFj.otx — editable.** Volle Editier-Unterstützung in Phase 1. Hinweis: das File in `Vorstellung04/` hat identische Größe und OID-Struktur wie Dummy.otx (beide 1290 OIDs, 233 KB) — die Inhalte differieren aber.
- **Bosch2_wechseln.otx — editable.** Volle Editier-Unterstützung trotz Größe. Performance-Empfehlung für Plan 04: Integration-Test für Save-back mit > 50 000 OIDs einplanen (Loader + Writer + Re-Parser zusammen ~1-3 s, akzeptabel).

## Konsequenz für Plan 04 (Models-API / Save-back)

- **E_OTX_COVERAGE_INCOMPLETE bleibt als defensiver Vertrag** im Save-back-Endpoint, ist aber für die drei verifizierten kanonischen Modelle nicht aktiv. Voraussetzung im Code: vor jedem Save-back `loaded.coverage_ratio == 1.0` prüfen, bei `< 1.0` `409` mit `code=E_OTX_COVERAGE_INCOMPLETE` zurückgeben.
- **Keine read-only-Sonderpfade** für die drei Modelle nötig — Plan 04 kann linear durchgebaut werden.
- **Performance-Test für Save-back mit 92k-OID-Modellen** soll im Integration-Suite (Plan 05) liegen, nicht im Roundtrip-Unit-Test.

## Konsequenz für osim-engine-Repo

**Kein Handlungsbedarf** für die drei kanonischen Modelle. Falls in späteren Phasen weitere Modelle aus `Vorstellung04/` (z.B. `AZ-Tool.otx`, `Embb-AslFj.otx`) Loader-Lücken zeigen, sollten Handler im osim-engine-Repo (NICHT hier in osim-ui) ergänzt werden — der Coverage-Bericht (`scripts/otx_coverage_report.py`) ist die wiederholbare Mess-Vorrichtung dafür.

## Files Created/Modified

- `pyproject.toml` (modifiziert) — `asyncpg` → `psycopg[binary]`; `boto3` + `python-multipart` ergänzt; `google-cloud-*` / `websockets` entfernt (kommen in Phasen 4/5 zurück); `[tool.uv.sources]` für editable osim-engine; 5 pytest-Marker + strict-markers/filterwarnings registriert. D-18-Header-Kommentar dokumentiert die Begründung.
- `tests/__init__.py` / `tests/backend/__init__.py` / `tests/backend/fixtures/__init__.py` — Package-Marker (`tests/__init__.py` existierte bereits leer).
- `tests/backend/fixtures/otx_models.py` — `DUMMY_OTX`, `FERTIGUNGSSTRUKTUR1_OTX`, `BOSCH2_WECHSELN_OTX` als absolute Path-Konstanten, `ALL_TEST_OTX`-Liste, `require_otx()`-Skip-Helper, `engine_available()`-Importlib-Probe. Modul-Docstring dokumentiert die Rule-3-Pfad-Korrektur (OSim2004/Vorstellung04/, kein OSimV01(Fj)-Zwischen-Ordner).
- `tests/backend/conftest.py` — `pytest_collection_modifyitems`-Hook für Auto-Skip von `@requires_engine` wenn Engine fehlt, drei OTX-Path-Fixtures (`dummy_otx_path`, `fertigungsstruktur1_otx_path`, `bosch2_otx_path`).
- `tests/backend/test_otx_roundtrip.py` — 5 Tests mit `@requires_engine` + `@integration`; `_roundtrip_via_tempfile`-Helper ist die einzige Roundtrip-Logik (DRY).
- `scripts/otx_coverage_report.py` — `measure(path)` + `_render_matrix()` + `_update_doc()`; sys.path-Defense gegen PYTHONPATH-Konflikt mit 3fls-`tests`-Package; ASCII-safe Stdout (cp1252-Defense); idempotenter Re-Lauf via `<!-- COVERAGE-MATRIX:BEGIN/END -->`-Marker.
- `docs/engine-coverage.md` — initialer Bericht inkl. Konsequenz-Sektion.

## Decisions Made

- **Welle-0-Reframe bestätigt** (RESEARCH.md §Summary): der OTX-Writer existiert bereits in `osim_engine.io.otx_writer` (1125 LoC). Plan 01 implementiert NICHT, sondern MISST. CONTEXT.md D-02 ist obsolet. Diese Plan-SUMMARY ist der Audit-Trail.
- **KEIN xfail auf Fertigungsstruktur1- und Bosch2-Tests** — die Plan-Vorlage hatte `@pytest.mark.xfail(strict=False, reason=...)` als bedingten Marker vorgesehen ("nur wenn der Coverage-Bericht zeigt, dass sie nicht durchgehen"). Coverage-Bericht zeigt: alle drei laufen grün → keine xfail-Marker hinzugefügt.
- **Latin-1-Test-String:** ausschließlich „echte" Latin-1-Codepoints (`ä ö ü ß Ä Ö Ü`), keine CP1252-only-Erweiterungen (em-dash `—` U+2014, smart-quotes etc.). Letztere würden mit `UnicodeEncodeError` failen — was Pitfall #3 demonstrieren, aber nicht *lösen* würde.
- **Test-Marker-Subset für Welle 0:** nur `requires_engine`-Auto-Skip ist scharf geschaltet; `requires_postgres` / `requires_firebase_emulator` / `requires_minio` sind nur registriert, ihre Probe-Logik kommt in Plan 05 (Compose-Stack-Integration). 3fls-Pattern in dieser Welle bewusst reduziert.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Pfad-Korrektur für OSim2004-Test-OTX-Verzeichnis**
- **Found during:** Task 2 (Fixtures-Modul)
- **Issue:** Plan-Vorlage referenzierte `C:\Users\JörgWFischer\PycharmProjects\OSim2004\OSimV01(Fj)\Vorstellung04\` als Verzeichnis für die drei Test-OTX-Files. Glob-Verifikation 2026-05-21 zeigt: das tatsächliche Verzeichnis ist `C:\Users\JörgWFischer\PycharmProjects\OSim2004\Vorstellung04\` (kein `OSimV01(Fj)`-Zwischen-Ordner). Mit dem falschen Pfad würden alle Fixtures via `require_otx` skippen statt Tests laufen zu lassen.
- **Fix:** `OSIM2004_VORSTELLUNG04`-Konstante in `tests/backend/fixtures/otx_models.py` auf den verifizierten Pfad gesetzt; Modul-Docstring dokumentiert die Korrektur.
- **Files modified:** tests/backend/fixtures/otx_models.py
- **Verification:** `DUMMY_OTX.exists() = True`, `FERTIGUNGSSTRUKTUR1_OTX.exists() = True`, `BOSCH2_WECHSELN_OTX.exists() = True`.
- **Committed in:** `6890a7a` (Task 2 commit)

**2. [Rule 3 — Blocking] sys.path-Race im Coverage-Skript bei gesetztem PYTHONPATH**
- **Found during:** Task 3 (Skript-Execution)
- **Issue:** `uv run python scripts/otx_coverage_report.py` failt mit `ModuleNotFoundError: No module named 'tests.backend'` weil `PYTHONPATH=...\3fls\backend` ein konkurrierendes `tests`-Package an sys.path[1] platziert. REPO_ROOT ist via uv-editable bereits bei sys.path[9] — das ursprüngliche `if str(REPO_ROOT) not in sys.path: sys.path.insert(0, ...)` ist ein No-op, weil REPO_ROOT bereits irgendwo in sys.path steht.
- **Fix:** REPO_ROOT überall aus sys.path entfernen und unbedingt an Position 0 prependen; zusätzlich `sys.modules.pop("tests*")` für etwaige bereits konkurrierend gecachte Module.
- **Files modified:** scripts/otx_coverage_report.py
- **Verification:** Skript läuft mit `exit 0` bei aktivem `PYTHONPATH=...\3fls\backend`.
- **Committed in:** `7d70f2a` (Task 3 commit)

**3. [Rule 1 — Bug] UnicodeEncodeError beim Stdout-Print auf cp1252-Konsole**
- **Found during:** Task 3 (Skript-Smoke-Test)
- **Issue:** Die ursprüngliche Tabellen-Render-Funktion benutzte `✓` (U+2713) / `✗` (U+2717) als Roundtrip-Marker. Diese sind nicht in cp1252 und Windows-Stdout failt mit `UnicodeEncodeError` — Skript läuft inhaltlich durch (Datei wird UTF-8 geschrieben), aber Exit-Code ≠ 0.
- **Fix:** Marker auf ASCII-safe `OK` / `FAIL` umgestellt; zusätzlich Stdout-Print in try/except mit ASCII-Fallback umschlossen.
- **Files modified:** scripts/otx_coverage_report.py
- **Verification:** Skript exit 0; Markdown-Datei ist UTF-8 mit Umlauten korrekt.
- **Committed in:** `7d70f2a` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug).
**Impact on plan:** Alle drei waren nötig, um die `<verify>`- und `<done>`-Kriterien des Plans zu erfüllen. Kein Scope-Creep, kein Rule-4-Architekturentscheid.

## Authentication Gates

Keine.

## Issues Encountered

- Externer `PYTHONPATH=...\3fls\backend` env-var auf Dev-Maschine — überschattet `tests`-Package. In `osim-ui/.env.example` (zukünftiges Plan 02) sollte ein expliziter Hinweis stehen, dass PYTHONPATH NICHT gesetzt sein muss.
- `pyproject.toml` enthielt `[tool.mypy] strict = true` und `[tool.ruff.lint] select = ["ASYNC"]` — beide kompatibel mit dem neuen psycopg3-Sync-Pfad (kein Konflikt), aber zukünftige Plan-Wellen sollten prüfen, ob die `ASYNC`-Regel bei sync-DB-Code Flase-Positives erzeugt.

## Next Plan Readiness

- **Plan 01-02 (Backend-Foundation):** Engine-Editable-Install + Test-Marker stehen; FastAPI-Skelett kann ohne Engine-Wiring-Sorgen aufgesetzt werden.
- **Plan 01-04 (Storage/Models/Locks-API):** Save-back-Pfad ist fachlich gerechtfertigt; docs/engine-coverage.md ist die Audit-Quelle.
- **Plan 01-05 (Integration-Tests):** Pattern für `requires_*`-Marker-Auto-Skip ist etabliert und kann um `requires_postgres` / `requires_firebase_emulator` / `requires_minio` erweitert werden, ohne die Hook-Struktur zu ändern.

## Self-Check

- [x] `tests/backend/__init__.py` exists
- [x] `tests/backend/fixtures/__init__.py` exists
- [x] `tests/backend/fixtures/otx_models.py` exists
- [x] `tests/backend/conftest.py` exists
- [x] `tests/backend/test_otx_roundtrip.py` exists, 5 tests, all 5 pass
- [x] `scripts/otx_coverage_report.py` exists, runs with exit 0
- [x] `docs/engine-coverage.md` exists, contains `## Coverage Matrix` + `## Konsequenz pro Modell für Phase 1`
- [x] Commit 7e2c120 (Task 1) exists in git log
- [x] Commit 6890a7a (Task 2) exists in git log
- [x] Commit 7d70f2a (Task 3) exists in git log
- [x] `uv run pytest tests/backend/test_otx_roundtrip.py -m requires_engine` → 5 passed
- [x] `uv run pytest --strict-markers --collect-only` → 6 tests collected, keine UnknownMarkWarning

## Self-Check: PASSED

---

*Phase: 01-vertical-slice*
*Plan: 01 engine-roundtrip-verify*
*Completed: 2026-05-21*
