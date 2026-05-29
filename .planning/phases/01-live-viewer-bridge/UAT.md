# UAT — Live-Viewer-Bridge (Phase 01-07)

Manuell ausführbares Verifikations-Skript für die End-to-End-Demo der
Live-Viewer-Bridge. Deckt die Human-Verify-Akzeptanzkriterien **AC-3, AC-5,
AC-6, AC-7 und AC-9** ab, die nicht automatisiert verifizierbar sind.

**Tester:** ______________________  **Datum:** ______________________

---

## 0 — Voraussetzungen (einmalig pro Sitzung)

Den Dev-Stack ausschließlich mit dem kanonischen Skript hochfahren — NICHT mit
einem bloßen `docker compose up`. Das Skript fährt alle Services hoch
(`up -d --wait`), wartet bis healthy und seedet den Firebase-Auth-Emulator mit
dem Default-Test-User.

```bash
cd osim-ui
bash scripts/dev-up.sh
# nach Code-Änderung an api/portal: bash scripts/dev-up.sh --build
```

Erwartetes Ergebnis: `STACK OBEN`, alle Container healthy.

| Ressource | Adresse |
|-----------|---------|
| Portal (Live-Sicht) | **http://localhost:3002/live** |
| API | http://localhost:8000 (Health: `/health`) |
| Login | **jwfischer69@gmail.com / 123456** |

- [ ] Stack oben, alle Services healthy
- [ ] Login mit **jwfischer69@gmail.com / 123456** erfolgreich

> **Hinweis (Engine-Host-Env):** Der Host-`uv`-Env wird für den Stack NICHT
> verwendet (die Stack-Seed läuft im api-Container). Der Demo-Lauf (Schritt 1)
> läuft hingegen als separater OS-Prozess über die Engine im `engine/`-Verzeichnis
> — das ist der Reproduzierbarkeitsvertrag (Sim-Läufe nur in eigenen Prozessen).
> Der `VIRTUAL_ENV=...tbx_stzrim...`-Warnhinweis von `uv` ist harmlos.

---

## 1 — Demo-Run starten (AC-6)

Den reproduzierbaren 1000-Event-Demo-Lauf in einem **separaten OS-Prozess**
starten (Reproduzierbarkeitsvertrag, osim-ui/CLAUDE.md). Das Script gibt als
letzte Zeile `RUN_DIR=<pfad>` aus — diesen Pfad notieren.

```bash
cd engine
uv run python scripts/demo_stream_run.py --validate
```

Erwartetes Ergebnis (autonom vorab verifiziert):
- ≥ 1000 Frames in `stream.jsonl` (Referenzlauf: **2017 Frames**)
- `gantt_durchlauf`- UND `kpi_auswertung`-Frames vorhanden
- `Schema-Validierung: 0 Fehler`
- `meta.json` trägt `schema_version=1.0` + `streams`-Status-Block

**run-dir:** ______________________________________

- [ ] `RUN_DIR`-Zeile ausgegeben, Pfad notiert
- [ ] `--validate` meldet 0 Schema-Fehler

> **Grafik-Viewer-Pflicht:** Wird für die UAT zusätzlich ein interaktiver
> Sim-Lauf über die UI/Remote-Sim gestartet, ist die **„Simulator-Grafik"
> (Grafik-Viewer)** zu wählen — NICHT der Standard-Viewer. Der Standard-Viewer
> produziert Fehler; ein Remote-Sim-Start ohne Simulator-Grafik wirft eine
> Exception.

### Live-Sicht öffnen und vollständige Darstellung bestätigen

1. **http://localhost:3002/live** öffnen.
2. Tab **Durchlauf** (`gantt_durchlauf`): die Gantt-Balken-Spuren der Aufträge
   sind gefüllt (eine Spur pro Auftrag, `data-testid="gantt-panel"` /
   `gantt-row-<auftrag>`).
3. Tab **Auswertung** (`kpi_auswertung`): das KPI-Kachel-Grid
   (`data-testid="kpi-grid"`) ist gefüllt; je kind eine Kachel mit Leitzahl +
   N/N-1-Trend.
4. Tab **Records** (`reporting_record`): die `record-table` zeigt Detail-Zeilen.

- [ ] Durchlauf-Tab: Gantt-Balken sichtbar und gefüllt
- [ ] Auswertung-Tab: KPI-Kacheln gefüllt
- [ ] Lauf wird vollständig dargestellt (kein abgeschnittenes Bild)

---

## 2 — Latenz < 1s (AC-3 / O-4)

Während die Engine schreibt (Demo-Lauf erneut starten oder einen länger
laufenden Sim wählen), die Live-Sicht beobachten: neue Gantt-Balken / KPI-Werte
müssen **innerhalb < 1 Sekunde** nach dem Engine-Schreiben sichtbar werden
(Polling-Tick 200ms + 30Hz-Coalescing).

- [ ] Neue Daten erscheinen sichtbar **< 1s** nach dem Engine-Schreiben
- [ ] Kein spürbares Ruckeln / keine Sammel-Updates im Sekundenbereich

Beobachtete Latenz (grobe Schätzung): __________ ms

---

## 3 — Crash-Robustheit / Offset-Restart (AC-5)

Verifiziert die Entkopplung Engine-Schreibprozess ↔ UI-Leseprozess
(Trust-Boundary T-01-15): ein UI-Crash darf den Engine-Schreibpfad nicht
beeinflussen, und die neu geladene UI setzt vom **gespeicherten Byte-Offset**
fort, **ohne Frames zu doppeln**.

1. Demo-Lauf (oder einen länger laufenden Sim) starten, sodass die Engine
   kontinuierlich in `stream.jsonl` schreibt.
2. **http://localhost:3002/live** öffnen, Durchlauf-Tab, einige Balken abwarten.
3. **UI-Crash simulieren:** Browser-Tab schließen ODER `F5`/Reload, während die
   Engine **weiterschreibt**.
4. Bestätigen: die Engine schreibt **ununterbrochen** weiter (Dateigröße von
   `stream.jsonl` wächst; z.B. `ls -l <run-dir>/stream.jsonl` mehrfach).
5. Die neu geladene UI setzt vom gespeicherten Offset fort: **keine doppelten**
   Gantt-Balken und **keine doppelten** KPI-Werte; der Stream läuft nahtlos
   weiter (keine Lücke-Warnung `live-gap-banner`, sofern keine echte seq-Lücke).

- [ ] Engine schreibt während/nach UI-Reload ununterbrochen weiter (Dateigröße wächst)
- [ ] Nach Reload: **keine doppelten** Gantt-Balken
- [ ] Nach Reload: **keine doppelten** KPI-Kacheln/-Werte
- [ ] Stream wird nahtlos ab dem Offset fortgesetzt (kein Neu-Aufnehmen ab Zeile 0)

---

## 4 — Schema-Mismatch-Banner (AC-7)

Verifiziert den best-effort-Schema-Major-Check (D-OP-4): eine unbekannte
Major-Version führt zu einem **gelben Warn-Banner**, **NICHT** zu einem Crash.

1. Den Demo-Lauf aus Schritt 1 verwenden; die `meta.json` im run-dir öffnen.
2. `schema_version` künstlich auf eine höhere Major-Version setzen, z.B.
   `"1.0"` → `"2.0"`, speichern.
3. **http://localhost:3002/live** neu laden (mit gespiegelter meta.json).
4. Bestätigen: über den Panels erscheint das **gelbe Warn-Banner**
   (`data-testid="schema-mismatch-banner"`, Symbol ⚠ + Text); die UI rendert
   weiter und **crasht nicht**.

- [ ] Gelbes Schema-Mismatch-Banner sichtbar
- [ ] KEIN Crash — die Stream-Panels rendern weiter
- [ ] meta.json nach dem Test auf `"1.0"` zurücksetzen

---

## 5 — C++/Python-KPI-Parity-Spot-Check (AC-9, D-OP-6)

Manueller Spot-Check (M1; Automatisierung ist M3-Forschungsphase). Vergleicht
für **einen** Demo-Sim die in der UI gezeigten KPI-Werte gegen eine Referenz.

> **Ehrliche Note zur Referenzquelle (C++-Tree):** Der OSim2004-C++-Tree ist im
> aktuellen Arbeits-Workspace dieser Phase **nicht garantiert verfügbar**. Es
> gibt zwei zulässige Referenz-Pfade:
>
> - **(A) C++-Lauf — bevorzugt, falls verfügbar:** Wenn der OSim2004-C++-Tree
>   bereitgestellt wird, denselben Demo-Sim als OSim2004-Lauf fahren und dessen
>   `ISimulatorViewerAusw*`-Auswertung als C++-Spalte eintragen.
> - **(B) SPEC-Referenz — Fallback:** Ohne C++-Tree gegen die in **SPEC §6.3**
>   bzw. die in `tests/integration/test_streaming_kpi.py` handgerechneten
>   KPI-Werte vergleichen (deterministische Arithmetik: `avg=sum/count`,
>   `pct=teil/period*100`). Diese Werte sind in der Engine-Suite gepinnt.
>
> Den gewählten Pfad unten markieren. Bei Pfad (B) ist die Δ-Spalte gegen die
> SPEC-/Test-Referenz zu führen, nicht gegen einen echten C++-Lauf — das ist
> explizit zu protokollieren, damit der Spot-Check nicht als C++-Parität
> fehlinterpretiert wird.

Referenzquelle:  ☐ (A) OSim2004-C++-Lauf   ☐ (B) SPEC §6.3 / Test-Referenz

**Toleranz:** Abweichung **≤ ±1** je Wert (AC-9).

Verglichene KPI je `kind` (Beispiele: `count_abgeschlossen`,
`durchlaufzeit_avg`, `auslastung_pct`):

| kind | KPI-Feld | Python (UI) | Referenz (C++/SPEC) | Δ | ≤ ±1? |
|------|----------|-------------|---------------------|----|-------|
| prod_auftrag | count_abgeschlossen |  |  |  | ☐ |
| prod_auftrag | durchlaufzeit_avg |  |  |  | ☐ |
| betr | auslastung_pct |  |  |  | ☐ |
| gesamt | count_auftraege_gesamt |  |  |  | ☐ |
|  |  |  |  |  | ☐ |

- [ ] Alle verglichenen Werte liegen innerhalb ±1
- [ ] Referenzquelle (A/B) oben markiert und im Ergebnis dokumentiert
- [ ] Bei Pfad (B): explizit als SPEC-Referenz (kein echter C++-Lauf) vermerkt

---

## Abnahme

- [ ] **AC-3** Latenz < 1s bestätigt
- [ ] **AC-5** Crash-Robustheit + Offset-Restart ohne Doppelung bestätigt
- [ ] **AC-6** 1000-Event-Demo: vollständiger Gantt + KPI in der UI bestätigt
- [ ] **AC-7** Schema-Mismatch-Banner statt Crash bestätigt
- [ ] **AC-9** KPI-Parity-Spot-Check (Δ ≤ ±1) bestätigt — Referenzquelle dokumentiert

**Gesamt-Resultat:**  ☐ approved   ☐ Abweichungen (siehe Notizen)

**Notizen / Abweichungen (insb. Parity-Δ > 1 oder Latenz > 1s):**

```
______________________________________________________________________

______________________________________________________________________
```

---

### Hinweis: automatisierter E2E-Anteil

Die automatisierbaren Anteile von AC-3 / AC-4 / AC-5 sind als Playwright-Spec in
`osim-ui/portal/tests/live-stream.spec.ts` geschrieben. Diese Spec ist aktuell
`test.fixme`-markiert (ehrlich pending), weil sie einen **Backend-Stream-Read-
Endpoint** voraussetzt (die injizierbare ReadFn der `/live`-Route, M1-Stub aus
01-02; HTTP/WS-Transport ist laut SPEC §4 erst M2). Sobald dieser Endpoint
existiert: `test.fixme()` entfernen, den Run-Setup an den realen Flow anschließen
und ausführen:

```bash
cd osim-ui/portal
npx playwright install chromium      # einmalig
npx playwright test tests/live-stream.spec.ts
```
