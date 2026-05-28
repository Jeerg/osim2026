# Phase 6 — Reports & Export

**Milestone:** v0.1.0
**Stand:** 2026-05-20 (Entwurf, umgenummert auf Phase 6 nach Roadmap-Resync 2026-05-21)
**Aufwand-Schätzung:** 2 Wochen (1 Dev)
**Voraussetzungen:** Phase 5 (für skaliertes Report-Worker-Pattern)

---

## 1. Ziel der Phase

User exportiert Sim-Ergebnisse in **drei nutzungstypischen Formen**:
1. **PDF-Reports** (druckbar, präsentations-fertig) — für Beratung und Klausur-Material
2. **CSV/Excel** — für Weiterverarbeitung, akademische Aufgaben
3. **JSON-Bundles** — für Sharing/Reproduzierbarkeit zwischen Usern

Inhaltlich orientiert an den Original-Reports aus OSim2004 (Auswertung-Menü) — siehe `.planning/research/osim2004-ui-analysis.md` § 5.

---

## 2. Akzeptanzkriterien

1. ✅ User klickt "Report exportieren" auf einer abgeschlossenen Run-Seite → PDF generiert in < 10 s
2. ✅ PDF enthält: Modell-Übersicht, Sim-Parameter, alle Original-KPIs (siehe § 4), graphische Charts, Generierungs-Timestamp
3. ✅ Klausur-Datenblatt-Template (HKA-spezifisch, Kopfzeile mit HKA-Logo): 1-Klick-Generierung
4. ✅ Multi-Run-Report aggregiert über alle Sub-Runs mit Mean/Median/Konfidenz-Intervallen
5. ✅ CSV-Export mit allen KPIs als 1 Datei + 1 Datei pro Auswertungs-Dimension
6. ✅ Excel-Export als `.xlsx` mit Tab pro Auswertungs-Dimension, formatierte Header
7. ✅ JSON-Bundle: vollständig (Modell + Config + Trace + Summary) als ZIP zum Download
8. ✅ Report-Generation in eigenem Worker (nicht blockierend) bei > 5 s Dauer
9. ✅ Templates sind versioniert, austauschbar pro Tenant (HKA-Branding vs. Steinbeis-Branding)

---

## 3. KPIs aus dem Original (aus `osim2004-ui-analysis.md` § 5)

Diese werden in den Reports angeboten:

**Durchlaufplan-Level:**
- Anzahl fertiggestellter Auslösungen (Durchsatz)
- Mittlere Durchlaufzeit
- Minimale Durchlaufzeit
- Zielerreichungsgrad Durchlaufzeit (vs. Zielzeit)
- Prozesskosten (gesamt & pro Stück)

**Knoten-Level:**
- Obige KPIs für einzelne Knoten

**Ressourcen-Level (Belegung):**
- Theoretischer Kapazitätsbestand
- Abgearbeiteter Kapazitätsbedarf
- Auslastung (%)
- Einsatzzeit (Stunden)
- Perioden-Kosten (simuliert)
- Kostensatz (€/h)
- Zeitstressgrad
- Zielerreichungsgrad Ermüdungsgrad

**Mengenressourcen:** (Bestände, Verbrauch)
**Multi-Run-Statistik:** Mean/Median/Min/Max/CI über N Seeds

---

## 4. Task-Wellen

### Welle 1 — KPI-Berechnung serverseitig (3 Tage)
| ID | Task | Deps |
|---|---|---|
| 1.1 | `app/services/kpi_service.py`: aus Trace-JSONL alle KPIs berechnen. Wo möglich aus `osim_engine.kpi` benutzen | — |
| 1.2 | KPI-Result-Schema in Pydantic (jeder KPI mit Wert, Unit, Beschreibung) | 1.1 |
| 1.3 | `GET /api/v1/runs/{id}/kpis` Endpoint | 1.2 |
| 1.4 | Caching: KPIs werden 1-mal berechnet, in Postgres `run_kpis`-Tabelle persistiert | 1.3 |
| 1.5 | Multi-Run-Aggregator: `GET /api/v1/multi-runs/{id}/kpis` mit Mean/Median/CI | 1.3, Phase 5 |

### Welle 2 — PDF-Templating (4 Tage)
| ID | Task | Deps |
|---|---|---|
| 2.1 | Renderer-Wahl: WeasyPrint (HTML→PDF, Python-nativ) vs. Playwright (Chrome-based) — Entscheidung in Discuss | — |
| 2.2 | HTML-Templates mit Jinja2: `report-standard.html`, `klausur-hka.html`, `beratung-steinbeis.html` | 2.1 |
| 2.3 | Tailwind-CSS für Templates (Print-Layout `@media print`) | 2.2 |
| 2.4 | Chart-Generation: serverseitig SVG via matplotlib oder vega-lite, eingebettet in HTML | 2.2 |
| 2.5 | `app/services/report_service.py`: `generate_pdf(run_id, template_id) -> bytes` | 2.1, 2.4 |
| 2.6 | Async-Job für lange Reports: Cloud Run Job oder einfacher BG-Task | 2.5 |
| 2.7 | `POST /api/v1/runs/{id}/reports` triggert Generierung, `GET /api/v1/reports/{report_id}` liefert PDF (Signed URL) | 2.5 |

### Welle 3 — CSV/Excel-Export (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 3.1 | `app/services/export_service.py`: CSV-Generator pro Dimension | 1.1 |
| 3.2 | XLSX-Generator mit `openpyxl` (mehrere Tabs, formatierte Header) | 1.1 |
| 3.3 | Endpoint `GET /api/v1/runs/{id}/export?format=csv|xlsx` | 3.1, 3.2 |
| 3.4 | Frontend: Download-Buttons pro Format auf Run-Seite | 3.3 |

### Welle 4 — JSON-Bundle (1 Tag)
| ID | Task | Deps |
|---|---|---|
| 4.1 | Bundle-Generator: Modell + Config + Trace + KPIs als ZIP | 1.1 |
| 4.2 | Import-Endpoint: User kann fremdes Bundle hochladen → Replay-Run | 4.1 |

### Welle 5 — Template-Verwaltung (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 5.1 | Postgres-Tabelle `report_templates`: id, tenant_id (NULL=global), name, jinja_template, css | 2.2 |
| 5.2 | Tenant-Admin-UI: Templates auflisten + Default setzen | 5.1 |
| 5.3 | HKA-Default-Template (Klausur-Datenblatt) + Steinbeis-Default-Template (Beratungs-Brief) eingebaut | 5.1 |

### Welle 6 — Verifikation (2 Tage)
| ID | Task | Deps |
|---|---|---|
| 6.1 | Playwright-E2E: Run → PDF generieren → Download → öffnen | alle |
| 6.2 | Visual-Regression-Tests für PDFs (Playwright + Pixel-Diff) | 6.1 |
| 6.3 | Stress-Test: 10 Reports parallel generieren | alle |
| 6.4 | Doku in `docs/PHASE-5-REPORTS.md` + Template-Autoren-Guide | alle |

---

## 5. Reuse aus Phase 4 (GraphObject-Foundation)

Reports können (optional) den **Durchlaufplan-Graphen als Bild** enthalten. Dafür nutzen wir die GraphObject-Foundation aus Phase 4:
- Headless-Render eines `OGraphView` in SVG (Server-Side via JSDOM oder bei Bedarf Client-Side mit Puppeteer-Screenshot)
- Konsistente Darstellung Live-View ↔ PDF-Report (keine Doppel-Implementierung)

Ebenfalls: Phase-5-Charts (Auslastung über Zeit, Auftragsstatus-Heatmap) können als spätere Phase-3-GraphObject-Viewer-Subklassen entstehen (`PAuslastungsChartViewer` etc.).

---

## 6. Risiken & Unknowns

| Risiko | Mitigation |
|---|---|
| WeasyPrint hat Tailwind-CSS-Probleme (Modern-Layout-Funktionen) | Alternative Playwright/Chrome; entscheide in Welle 2 nach Prototyp |
| Chart-Rendering in PDF unterscheidet sich von Live-View | Gleiche SVG-Pipeline für beides (siehe Reuse-Sektion) |
| Klausur-Template hat Schul-spezifische Formatanforderungen, die ich nicht kenne | Mit Jörg vor Welle 2 abgleichen; Beispiel-Klausur als Referenz |
| KPI-Definition unklar bei Edge-Cases (z.B. "Zielerreichungsgrad" wenn keine Zielzeit gesetzt) | Engine-Code in `osim_engine.kpi` als Source-of-Truth |
| Multi-Run-Reports werden groß (Histogramme über 100 Sub-Runs) | Sampling + Bin-Bucketing |
| PDFs mit eingebetteten SVGs sind groß | Komprimierung; alternativ Raster-Versionen für Print |

---

## 7. Was Phase 6 NICHT liefert

- WYSIWYG-Editor für Report-Templates (→ Backlog)
- E-Mail-Versand fertiger Reports (→ Backlog)
- Scheduled-Reports ("jeden Montag generieren") — Backlog
- Vergleichs-Report über mehrere Modelle (→ Backlog, mögliche Phase 6.5)
- Interaktive HTML-Reports (statt PDF) — Backlog

---

## 8. Definition-of-Done

1. Alle 9 Akzeptanzkriterien grün
2. Visual-Regression-Tests grün
3. HKA-Template + Steinbeis-Template eingebaut und manuell freigegeben
4. Stress-Test: 10 parallele Reports ohne API-Ausfall
5. `docs/PHASE-5-REPORTS.md` enthält Template-Autoren-Guide

---

## 9. Diskuss-Punkte für `/gsd-discuss-phase`

1. **WeasyPrint vs. Playwright** für PDF-Generation? Tradeoff: WeasyPrint einfacher zu deployen (keine Browser-Dependencies), Playwright fidelity-besser bei modernen CSS-Features.
2. **HKA-Template-Vorlage:** gibt es eine bestehende Klausur-Vorlage, die ich als Referenz nehmen kann?
3. **Multi-Tenant-Templates:** Tenants editieren eigene Templates oder nur Admin (= Jörg) editiert global?
4. **Welche KPIs sind MUST-HAVE in der ersten PDF?** Vollständige Liste aus OSim2004 ist groß; Priorisierung sinnvoll.
5. **Sprache der Reports:** Deutsch fest oder konfigurierbar?
6. **Datenschutz:** Klausur-Reports enthalten möglicherweise studentische Daten — DSGVO-Anonymisierung erforderlich?
