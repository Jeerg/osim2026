---
phase: 01-live-viewer-bridge
plan: 16
status: in_progress
kind: osim-treue-offensive-handoff
updated: "2026-05-30"
---

# Resume-Handoff — Phase 01 / 01-16 (OSim-Treue-Offensive: DLZ + 2D + Audit + Fixes)

Stand für `/clear` → `/gsd resume`. Diese Session hat (a) die DLZ exakt aus den
OSim-Akkumulatoren neu aufgebaut + Charts auf 2D umgestellt, (b) einen
umfassenden Treue-Audit ALLER wertliefernden Streams gegen das C++-Original
gefahren, (c) die gefundenen Fehler 1:1 gefixt bzw. ehrlich gegatet.
**OFFEN: Browser-UAT durch den Nutzer ÜBER DEN GRAFIK-VIEWER.**

## Leitprinzip dieser Session (wichtig für Resume)

`engine/osim2004-trace/` validiert die Reproduzierbarkeits-Basis **bit-exakt**
(PAWLICEK-LCG + Verteilungen + Event-Pool-Sortierung). → Die Sim-Trajektorie ist
garantiert identisch zum Original. **Folge: 1:1-Formel-Port ⟹ exakte Zahlen,
zwangsläufig** — das alte OSim muss NICHT laufen. Der Audit prüft also nur die
**Read-Side-Treue** (Listener/Insights lesen den Sim-Zustand wie das C++-FillList).

## Was diese Session committet hat (alles auf main gepusht, api-Image neu)

Commits (neueste zuerst):
- `122261e` fix: gantt_wartequeue zählt 1:1 (alle Knoten-Prozesse, waiting + in Bearbeitung)
- `abd4348` docs: wartequeue ehrlich als partial (Zwischenschritt, in 122261e zurück auf full)
- `aa04c46` fix: Auswertungs-Records 1:1 — Teil=Durchlaufplan-Name, restmenge gated
- `74f2837` docs: OSim-Treue-Audit-Report
- `adfeba1` fix: gesamt-Durchsatz exakt aus Auslöser-Akkumulatoren (−28955 → 5864/5740/124)
- `551c532` feat: ø-Balken exakt (count==0-Auslöser + NoZeroInEval-Schalter)
- `0e930fc` feat: OSim-treue DLZ aus Auslöser-Akkumulatoren + 2D-Kennzahl-Charts

## Exakt/korrekt gemacht (verifiziert)

| Kennzahl | Stand |
|---|---|
| DLZ je Durchlaufplan/Auslöser + beide ø-Modi | bit-exakt (PAusloeser GetKnzMittlDlfz) |
| Anzahl Auslösungen | exakt (m_iPtkAusloesungCount) |
| Belegung gantt_einsatz (on/off) | exakt (m_oProzCurrent, 46563 saubere Paare) |
| Gesamt-Durchsatz | gefixt: 5864/5740/124 (war −28955) |
| Teil-Spalte (prod_auftrag/nbearbeit/wschlange) | = Durchlaufplan-Name (m_durch->m_name) |
| gantt_wartequeue | 1:1: zählt wartend + in Bearbeitung (96→110), Trajektorie identisch |

## Ehrlich gegatet (Modell nicht portiert → „exakt" erst nach Portierung)

- wschlange.restmenge → null (UI „—"); prod_auftrag.beschreibung → leer
  (FEMOS-Mengen-/Lager-Modell nicht portiert).
- Auslastung = Näherung (belegte Zeit / Periode statt abgearbBedarf/Einsatzzeit;
  braucht P5-D/P5-M-Schichtmodell), ehrlich im Chart-Titel etikettiert.
- 8 Auswertungen (Personal/Betriebsmittel/Kauf/Eigen/Kalkulation/Gesamt-Kosten/
  Schicht/Bestellauftrag) = null + missing_slice, KEINE erfundenen Zahlen.

## NÄCHSTER SCHRITT — Browser-UAT ÜBER DEN GRAFIK-VIEWER (Nutzer-Hartregel!)

**Memory [[feedback-sim-grafik-viewer-immer]]: Sim-Verifikation IMMER über den
Grafik-Viewer, NICHT den Standard-Viewer. Wirft der Lauf trotzdem eine Exception
→ das MODELL anpassen (nicht anders messen).**

http://localhost:3002/live — Login jwfischer69@gmail.com / 123456 — Strg+Shift+R:
1. Links „Simulation → Belegung" (= Grafik-Viewer) wählen, Lauf aus der
   Steuerleiste über dem Grafikfenster starten (Knopf liegt IM Grafik-Viewer).
2. Durchlaufen lassen, dann prüfen:
   - „Simulation → Warteschlangen" — Werte jetzt höher (inkl. in Bearbeitung).
   - „Kennzahlen (Diagramme)" — DLZ (2D, ø-Schalter), Anzahl.
   - „Auswertung → Gesamt" — offene Aufträge positiv; Warteschlange-Restmenge „—".
3. Exception beim Start im Grafik-Viewer → Fehlermeldung an Claude, dann Modell anpassen.

## DANACH (geplante Reihenfolge)

1. Restliche exakt-Machung = **Modell-Portierung** (P5-D/P5-M + FEMOS-/Kosten-/
   Mengen-Slice) → eigene Phasen. Erst dann sind Auslastung/Restmenge/Kosten exakt.
2. **ERP-nahes Instanz-Modell** (Materialnummer an Durchlaufplan + instanziieren)
   — eigene Phase, siehe `.planning/IDEAS-BACKLOG.md`. Löst auch die 5740-Auslöser-
   Kardinalität (heute Top-N-Behelf).
3. Optional aufräumen: die zwei vorbestehenden obsoleten/roten Tests (siehe unten).

## Vorbestehende rote Tests (NICHT aus dieser Session — nicht meine Regression)

- 4× `test_streaming_partial.py` (gantt_einsatz full/partial-Mismatch aus 01-14).
- `test_ress_einsatz_p5e.py::test_bosch2_eabelegen_knoten_count` — stale 01-13-
  Wächter: behauptet ress_belegen feuere 0×, ist seit dem 01-14-Belegungs-Wiring
  überholt (feuert 46563× = treibt den Belegungs-Stream). Meine Änderung entfernte
  nur eine Zeile INNERHALB ress_belegen → kann die Aufrufzahl nicht ändern.
- `tests/unit/core/test_day_of_sim_parity.py` — Collection-Error (fehlende tzdata
  „Europe/Berlin" auf Windows-Python). Blockiert `-k`-Läufe → mit explizitem
  Datei-Pfad oder `-p no:cacheprovider` umgehen.

## Referenz-Artefakte (committet)

- `.planning/AUDIT-OSIM-TREUE.md` — vollständiger priorisierter Treue-Audit.
- `.planning/IDEAS-BACKLOG.md` — ERP-Instanz-Modell-Phase.

## Wichtige Fakten / Gotchas

- **Verifikation:** UI/Sim IMMER über Grafik-Viewer (Memory). Engine-Pytest +
  headless run_otx sind viewer-unabhängig (Memory nimmt sie explizit aus).
- **Headless-Lauf:** `engine/.venv/Scripts/python.exe -m osim_engine.streaming.run_otx
  --otx engine/experiments/.work/Bosch2_wechseln-azeitsim.otx --run-dir .work/<dir> --periods 1`.
- **Konsole cp1252:** bei Python-prints mit Sonderzeichen `PYTHONIOENCODING=utf-8`;
  Live-JSONL hat Leerzeichen nach Doppelpunkt (`"stream": "x"`), Golden ist kompakt.
- **api nach Engine-Änderung neu bauen:** `docker compose -f osim-ui/docker-compose.yml
  build api` + `up -d --no-deps api`. Portal = Bind-Mount + HMR.
- **skip-worktree-Falle:** vor Commit `git ls-files -v <pfade> | grep -vE "^H "`.
  Diese Session: alle geänderten Dateien waren `H` (normal), keine Falle.
- **OSim2004-C++:** `../OSim2004/OSimV01(Fj)/` (Pfad mit ö+Klammern quoten). Für
  Treue-Formeln IMMER dort nachschlagen. Kern-Klassen: PAusloeser.cpp (DLZ/Anzahl),
  PRessBeleg.cpp (Belegung/Auslastung/Warteschlange), OSimulator.cpp (PtkIntervall*),
  PAssozRessource.cpp (PtkUpDateProcessQueue), ISimulatorViewerAusw*.cpp (FillLists).
- **uncommitted vor Session:** `.planning/.../01-09-PLAN.md` + `01-10-PLAN.md`
  (nicht meine; bei Bedarf separat prüfen). `engine/.work/` = Scratch (ignorierbar).
