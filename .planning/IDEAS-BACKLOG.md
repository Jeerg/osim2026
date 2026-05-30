# Ideen-Backlog (künftige Phasen)

Forward-looking Seeds für eigene Phasen. Werden erst angefasst, wenn die
aktuelle Basis läuft und die Ergebnisse verifiziert sind.

---

## ERP-nahes Instanz-Modell (Auslöser/Durchlaufplan auf Karten-Ebene)

**Status:** Idee / eigene Phase — NICHT jetzt. Erst wenn die Basis (Live-Viewer +
Kennzahlen) läuft und die Ergebnisse als korrekt verifiziert sind. (Nutzer-Direktive
2026-05-30, doppelte Betonung.)

**Kontext / Befund:** Beim DLZ-Einbau zeigte sich, dass das Modell
`Bosch2_wechseln` jeden Auftrag als eigenen PAusloeser lädt (5.971 Auslöser,
5.740 mit Abschluss). Das ist KEIN Bug, sondern die natürliche Konsequenz der
Zielrichtung: Modelle werden künftig **direkt aus ERP-Systemen** aufgebaut.

**Zielbild:**
- Modellaufbau direkt aus ERP → wir landen auf **Root-Card- / Sub-Root-Card-Ebene**.
- Damit sind wir bereits auf der **Instanzenebene**: ein Auslöser, der die
  Abarbeitung auslöst, ein zugehöriger Durchlaufplan. Keine wiederkehrenden
  Generatoren mehr, sondern konkrete Auftragsinstanzen.
- Konkret nötig:
  1. **Materialnummer an den Durchlaufplan** bringen (Bezug Durchlaufplan ↔
     Material/Teil herstellen).
  2. Durchlaufplan dann **instanziieren** (je Auftrag/Card eine Instanz).
  3. Das gesamte OSim-Modell **näher an die Real-Modelle im ERP** rücken
     (Mapping-Schicht OTX/Loader ↔ ERP-Strukturen).

**Auswirkung auf Kennzahlen:** Sobald Auslöser=Instanz und Durchlaufplan eine
Materialnummer trägt, werden die Kennzahl-Gruppierungen (DLZ je Durchlaufplan /
je Material) natürlich und kompakt — die heutige Top-N-Behelfslösung für die
Auslöser-Sicht entfällt. Siehe Memory `model-ausloeser-cardinality-faul`.

**Vorbedingung (Gate):** Aktuelle Basis-Phase abgeschlossen + Ergebnisse
verifiziert (DLZ je Durchlaufplan/Auslöser korrekt, Auslastung korrekt,
2D-Charts plausibel).
