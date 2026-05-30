# OSim-Treue-Audit — neue Engine vs. OSim2004 (Stand 2026-05-30)

Ziel (Nutzer-Direktive, doppelt betont): die neue Engine muss sich **exakt** wie
das alte OSim verhalten; Ergebnisse müssen 1:1 übereinstimmen.

## Verifikations-Grundlage (wichtig)

`engine/osim2004-trace/` validiert die Reproduzierbarkeits-Basis **bit-exakt**
(PAWLICEK-LCG, Verteilungen, Event-Pool-Sortierung — als C extrahiert + verglichen).
→ Die **Simulations-Trajektorie** (Zufallszahlen + Ereignisreihenfolge) ist
garantiert identisch zum Original. **Folge:** Ist jede Kennzahl-Berechnung ein
1:1-Port der C++-Formel, sind die Zahlen zwangsläufig exakt gleich — ohne das alte
OSim laufen zu lassen. Der Audit prüft also die **Read-Side-Treue** (Listener/
Insights lesen den Sim-Zustand wie das C++-FillList).

## Status je wertlieferndem Stream

| Stream / Kennzahl | Verdikt | Aktion |
|---|---|---|
| DLZ je Durchlaufplan/Auslöser | ✅ **bit-exakt** (beide ø-Modi) | erledigt (commit 0e930fc, 551c532) |
| Anzahl Auslösungen | ✅ exakt | erledigt |
| Belegung `gantt_einsatz` (on/off) | ✅ **exakt** (1:1 m_oProzCurrent, empirisch sauber) | — |
| Auslastung (Näherung) | ⚠️ Näherung, **ehrlich etikettiert** | exakt erst mit P5-D/M-Schichtmodell |
| `gesamt` Durchsatz-Counter | ✅ **gefixt** (war −28955) → 5864/5740/124 aus Auslöser-Σ | erledigt (commit adfeba1) |
| 8 gated Auswertungen (Kosten/Bestände/Personal/Schicht) | ✅ ehrlich gated (null+missing_slice) | exakt erst nach Slice-Portierung |

## Offene Treue-Fehler (priorisiert)

### HIGH — erfundene Zahl (verletzt „NIE erfundene Zahlen")
- **`wschlange.restmenge` = immer 0.** `m_iRestMenge` existiert auf keinem
  Python-Prozess. C++ druckt `oProz->m_rest_meng` (FEMOS-Mengen-Modell).
  → **Fix = gaten** (null + missing_slice „Mengen-/FEMOS-Slice"); exakt erst nach
  Portierung des Mengen-/Kundenauftrags-Modells. Schema+Golden+UI+Test-Cascade nötig.

### MITTEL — Read-Side weicht von C++-FillList ab
- **`gantt_wartequeue`** zählt vermutlich nur *blockiert-wartende* Prozesse;
  C++ `GetZstWartProzesse` zählt *alle am Knoten anhängenden* (warten + in
  Bearbeitung). Hook hängt an der zentralen WS statt an `PDlplKnoten.add/remove_prozess`.
  `partial.py` deklariert „full/1:1" — verdeckt die Abweichung. **Vor Fix tiefer
  validieren** (mittlere Konfidenz). Quellen: beleg.py:198-266, prozess_dll.py:45-88,
  knoten/base.py:104-111; C++ PRessBeleg.cpp:185-201,1807-1809, PDlplKnoten.cpp:828-849.
- **`wschlange.teil`** = Auslöser-Name statt `m_auftr->m_fauftr->m_durch->m_name`
  (FEMOS-Kette, gated). Bester Proxy im headless-Port = Durchlaufplan-Name
  (`ausl.m_lDlpl.m_sName`, konsistent zu DLZ).
- **`nbearbeit`-Filter** = `m_iAbgeCounter<m_iTrigCounter` statt C++
  `m_status==fsEinlast` (ISimulatorViewerAuswNBearbeit.cpp:61-80). Treffermenge weicht ab.
- **`prod_auftrag`** `teil`/`beschreibung` aus Auslöser-/Plan-Name statt
  `m_durch->m_name` bzw. Leaf-Lager-`m_beschr`; `menge` faktisch immer 1
  (m_lEntitaet ist Einzelobjekt, kein List). Quelle: auswertung.py:155-179.

### Struktureller Befund
Mehrere als „now-buildable" (01-11) klassifizierte Record-Felder hängen real am
**un-portierten FEMOS-/Mengen-/Sales-Modell** → sie sind NICHT exakt machbar,
sondern müssen **gegatet** werden, bis das Modell portiert ist. Das ist kein
Listener-Bug, sondern eine zu optimistische Slice-Klassifikation.

## Vorgehen
1. Gate die HIGH-Fabrikation (`wschlange.restmenge`).
2. Read-Side-Fixes mit echtem Proxy (`wschlange.teil`, `nbearbeit`-Filter,
   `prod_auftrag`-Quellen) — je 1:1 gegen die C++-FillList, atomare Commits.
3. `gantt_wartequeue`-Semantik tiefer validieren, dann Hook auf
   `PDlplKnoten.add/remove_prozess` umstellen (= C++ „alle Knoten-Prozesse").
4. Exakte Kosten/Bestände/Schicht/Auslastung: eigene Phasen (P5-D/P5-M + Kosten-/
   FEMOS-Slice portieren) — siehe IDEAS-BACKLOG.
