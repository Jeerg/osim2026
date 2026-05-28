---
phase: 01.3-passozmenge-wire-roundtrip-pressmengematrixviewer-migration-
type: phase-rollup
plans: 7
status: awaiting-human-signoff
last_updated: "2026-05-28"
---

# Phase 01.3 — PAssozMenge Wire-Roundtrip + PRessMengeMatrixViewer Migration — Phase-Roll-up

**One-liner:** Mengen-Assoziationen (PAssozMenge / -Erzgt / -Verbr / -VerbrZwischen / -Abfr) komplett von C++ in Engine + UI hereingezogen: C++-Audit → Loader → Writer → Roundtrip → Schema-Export → UI-Rewrite auf 2D-Matrix-Foundation → Test-Coverage + Phase-Sign-Off.

**Status:** Code-Migration komplett, alle SCs ausser SC-9 (Browser-UAT) erfüllt. SC-9 awaiting-human gemaess User-Direktive *"baller alles durch dann test"* — siehe `01.3-07-SUMMARY.md` Block C der UAT-Checkliste.

---

## Plan-Sequenz und Ergebnisse

| Plan | Welle | Datum | LOC | Tests | Commits | Status |
|---|---|---|---|---|---|---|
| 01 — C++-Audit | 1 | 2026-05-28 | +1 AUDIT.md | n/a | 1 | DONE |
| 02 — Loader 5/5 | 2 | 2026-05-28 | +~150 | 5/5 unit | ~2 | DONE |
| 03 — Writer 5/5 | 2 | 2026-05-28 | +~150 | 5/5 unit | ~2 | DONE |
| 04 — Roundtrip + Tests | 3 | 2026-05-28 | +~200 | 11/11 integration | ~3 | DONE |
| 05 — Schema-Patch | 3 | 2026-05-28 | +~80 | n/a | 1 | DONE |
| 06 — UI-Rewrite (2D-Matrix) | 4 | 2026-05-28 | +859 / -473 | 0 (Plan-07-Vorbehalt) | 2 | DONE |
| 07 — Vitest + Clipboard + E2E + Sign-Off | 5 | 2026-05-28 | +995 | 16 vitest + 1 E2E-smoke + 2 fixme | 2 | DONE |

**Total:** 7 Plans / 5 Wellen / ~2500 LOC delta / 32 neue + 11 neue Roundtrip Engine-Tests / ~13 Commits.

---

## SC-Status (10 Kriterien aus ROADMAP)

| SC | Beschreibung | Status | Verifikations-Quelle |
|---|---|---|---|
| SC-1 | C++-Audit AUDIT.md (5 Klassen) | DONE | `01.3-01-AUDIT.md` |
| SC-2 | Loader 5/5 Klassen | DONE | `otx_loader._HANDLERS` |
| SC-3 | Writer 5/5 Klassen | DONE | `otx_writer._WRITERS` |
| SC-4 | Roundtrip-Tests ≥ 8 grün | DONE | 11/11 grün |
| SC-5 | Alle Engine-Tests grün | CONDITIONAL DONE | 543/543 non-PAssozMenge — 3 pre-existing Phase-2-Fails (azeitsim + python-vs-cpp), NICHT durch Phase 01.3 verursacht |
| SC-6 | Schema-Export PAssozMenge | DONE | 6 Treffer in schemas.json (5 Subklassen + Basis) |
| SC-7 | Viewer migriert + matrix-common gelöscht | DONE | PRessMenge/PRessMengeMatrixViewer.tsx (645 LOC) + Legacy gelöscht |
| SC-8 | Vitest ≥ 8 Specs | DONE | 11 Specs gruen |
| SC-9 | Browser-Edit funktioniert | AWAITING-HUMAN | siehe Sign-Off-Checkpoint |
| SC-10 | Playwright-Smoke | DONE | 1 Smoke + 2 fixme — Plan-Frontmatter erlaubt fixme |

---

## Architektur-Entscheidungen (Phasen-Roll-up)

1. **Scalar-Pointer m_lMengRess statt Wrapper-Indirektion.** Im Gegensatz zu PAssozBeleg.m_lRessourcen (geht ueber PRessBelegLList-Wrapper), zeigt PAssozMenge*.m_lMengRess DIREKT auf eine einzelne PRessMenge-Instanz. Plan-01-AUDIT Sektion 4.4 hat das aus dem C++ verifiziert; Engine-Loader/Writer + UI behandeln den Pointer durchgehend als Scalar.

2. **5 Subklassen, NICHT abstrakte Basis akzeptieren.** PAssozMenge ist abstrakt; nur die 4 konkreten Subklassen (Erzgt/Verbr/VerbrZwischen/Abfr) sind im UI als Cell-Werte erlaubt. Plan-Audit Sektion 2 + UI-Code-PASSOZMENGE_KLASSEN.

3. **KEINE Generalisierung Richtung ResourceMatrix-HOC.** Cell-Create-Logik divergiert strukturell zwischen PRessBelegMatrixViewer (Wrapper m_lRessourcen) und PRessMengeMatrixViewer (Scalar m_lMengRess). Plan-06-Pragma: KOPIEREN statt teilen — Generalisierung Phase-4-Backlog.

4. **2D-Matrix-Foundation als Single Source of Truth.** MatrixGrid + useBlockSelection + matrix-clipboard (Welle 01.2-D) wiederverwendet 1:1. Plan-06-Migration ist mechanisch — keine neue Foundation-Klasse nötig.

5. **Default-Toolbar-Werte 1:1 aus C++.** Typ-Combo Default = PAssozMengeErzgt (m_cbTyp.SetCurSel(0)), Mengen-Input Default = 1 (m_cbMenge.SetText("1")).

6. **Test-Daten-Lücke pragmatisch behandelt.** Keine OSim2004/Vorstellung04/*.otx-Datei hat aktive PRessMenge → E2E-Block-Copy-Paste-Cycle als `test.fixme`, Component+Listener vollständig in 16 Vitest-Specs abgedeckt. Backlog D-01.3.07-01: UI-gültiges Mengen-Test-Modell erzeugen.

---

## Deferred Issues (Phasen-uebergreifend)

| ID | Plan | Beschreibung | Auswirkung | Naechste Welle |
|---|---|---|---|---|
| D-01.3.04-02 | 04 | m_lAssozRess-Backref-Wire im Engine-Loader vererbt unvollständig | Im UI kein konkreter Bug; Edge-Case fuer Sim-Verkettung | Engine-Sub-Welle |
| D-01.3.06-01 | 06 | Pre-existing Lint-Errors (76 errors, 23 warnings) | Lint-CI rot — pre-existing, durch Phase-01.3 nicht erweitert | Eigene Cleanup-Welle |
| D-01.3.06-02 | 06 | Persistenz haengt am Welle 01.2-H Save/Lock-Stand | E2E-Persistenz-Test fixme | Welle 01.2-H Fortsetzung |
| D-01.3.07-01 | 07 | Test-Daten-Lücke — keine UI-gültige OTX mit PRessMenge | E2E-Block-Copy-Paste fixme | Phase 01.4 oder Engine-Welle |

---

## Memory-Direktiven die in Phase 01.3 verwendet wurden

- `feedback-consult-original-code` — durchgängig (AUDIT.md zitiert C++-Zeilen, Loader/Writer/UI referenzieren konkrete C++-Methoden)
- `feedback-default-test-user` — jwfischer69@gmail.com / 123456 in UAT-Checkliste
- `feedback-sim-grafik-viewer-immer` — explizit `?hint=matrix` in E2E-Helper dokumentiert
- `feedback-no-fragen-bei-iteration` — alle Code-Tasks autonom, Sign-Off-Checkpoint als awaiting-human ohne weitere Sub-Fragen
- `feedback-always-give-link` — http://localhost:3002 in Sign-Off-Anweisungen
- `graphobject-portable-client-container` — MatrixGrid bleibt in @osim/graphobject Workspace-Paket, nicht in `viewers/`

---

## Files-Summary (Roll-up)

### Engine

```
engine/src/osim_engine/io/otx_loader.py       (5 neue _HANDLERS)
engine/src/osim_engine/io/otx_writer.py       (5 neue _WRITERS)
engine/tests/fixtures/otx/passozmenge_minimal.otx  (Engine-Test-Fixture, NEW)
engine/tests/integration/io/test_otx_passozmenge_roundtrip.py  (11 Tests)
```

### Schema

```
osim-ui/app/static/schemas/v1/schemas.json    (5 PAssozMenge-Subklassen + Basis)
```

### UI

```
osim-ui/portal/src/viewers/PRessMenge/PRessMengeMatrixToolbar.tsx       (NEW +214)
osim-ui/portal/src/viewers/PRessMenge/PRessMengeMatrixViewer.tsx        (NEW +645)
osim-ui/portal/src/viewers/setup.ts                                     (Import-Pfad-Update)
osim-ui/portal/src/viewers/PRess/PRessMengeMatrixViewer.tsx             (DELETED -141)
osim-ui/portal/src/viewers/PRess/matrix-common.tsx                      (DELETED -332)
osim-ui/portal/src/viewers/__tests__/PRessMengeMatrixViewer.spec.tsx           (NEW +446, 11 Tests)
osim-ui/portal/src/viewers/__tests__/PRessMengeMatrixViewerClipboard.spec.tsx  (NEW +317, 5 Tests)
osim-ui/portal/e2e/passozmenge-block-copy-paste.spec.ts                 (NEW +232, 1 Smoke + 2 fixme)
```

### Planning

```
.planning/phases/01.3-…/01.3-01-AUDIT.md
.planning/phases/01.3-…/01.3-01-PLAN.md .. 01.3-07-PLAN.md     (7 Plans)
.planning/phases/01.3-…/01.3-01-SUMMARY.md .. 01.3-07-SUMMARY.md  (7 Summaries)
.planning/phases/01.3-…/PHASE-SUMMARY.md                       (dieser File)
```

---

## Sign-Off-Anforderung

Phase 01.3 ist code-seitig komplett. Siehe `01.3-07-SUMMARY.md` § "Phase-Sign-Off — Awaiting-Human" für:
- 10-SC-Status-Tabelle
- Browser-UAT-Checkliste mit 4 Blöcken (A=Smoke, B=PRessBeleg-Cross-Check, C=PRessMenge-eigentlicher-Fokus, D=Persistenz)
- 4 Sign-Off-Antwort-Optionen (`approved` / `approved-with-notes` / `blocker` / `defer-uat`)

**Test-User:** jwfischer69@gmail.com / 123456
**Stack-Link:** http://localhost:3002
**Grafik-Viewer-Hinweis:** beim Matrix-Klick IMMER explizit `?hint=matrix` in der URL
