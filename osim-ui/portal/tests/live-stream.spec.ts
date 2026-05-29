/**
 * E2E-Spec: Live-Stream-Viewer (Phase 01-07, AC-3 / AC-4 / AC-5).
 *
 * Verifiziert die drei automatisierbaren Akzeptanz-Kriterien der
 * Live-Viewer-Bridge gegen die `/live`-Route am laufenden Dev-Stack:
 *
 *   AC-3 (Tail-Pickup < 1s) — nach dem Anhängen neuer JSONL-Zeilen an die
 *        stream.jsonl des aktiven Runs rendert `/live` die zugehörigen
 *        Gantt-/KPI-Elemente innerhalb < 1s (Polling-Tick 200ms + 30Hz-
 *        Coalescing, D-4.4). Assertion mit Timeout < 1000ms auf das neue
 *        Element.
 *   AC-4 (Stream-Filter) — Tab-Wechsel isoliert genau einen Stream; die
 *        Panels der anderen Tags sind NICHT im DOM (StreamRouter-Isolation).
 *   AC-5 (Offset-Restart, automatisierbarer Teil) — nach einem Browser-Reload
 *        nimmt der Tail-Reader den Stream ab dem gespeicherten Byte-Offset
 *        wieder auf, ohne Frames zu doppeln (keine doppelten Gantt-Balken /
 *        KPI-Kacheln).
 *
 * ── Voraussetzung & aktueller Lauf-Status ───────────────────────────────
 *
 * Diese Spec setzt zweierlei voraus:
 *
 *   1. Den laufenden Dev-Stack: `bash scripts/dev-up.sh` (Container + Firebase-
 *      Seed; siehe UAT.md). Login über den Firebase-Emulator-Seed-User.
 *   2. Ein Backend-Endpoint, der die `stream.jsonl` eines Runs als Byte-Range
 *      an die `/live`-Route liefert (die injizierbare ReadFn aus 01-02). Diese
 *      Backend-Verdrahtung ist der ausdrücklich dokumentierte M1-Stub aus
 *      01-02-SUMMARY („read = noopRead Default … wird in einer Folge-Welle ans
 *      Backend gewired") und 01-05-SUMMARY (Known Stub: Route→StreamRouter).
 *      Die Route→StreamRouter-Verdrahtung ist mit 01-07 erfolgt; die
 *      Backend-ReadFn (HTTP/WS-Stream-Transport) ist laut SPEC §4 erst M2
 *      (Phase 07 „HTTP/WS-Transport") — sie existiert in M1 noch NICHT.
 *
 * Solange (2) fehlt, liefert der Tail-Reader auf der Produktiv-Route leere
 * Steps (noopRead) — die Tail-Pickup-Assertion KANN heute nicht grün sein.
 * Diese Spec ist daher mit `test.fixme()` markiert: sie ist vollständig
 * geschrieben und type-checkt, wird aber NICHT als bestanden gezählt, bis der
 * Stream-Read-Endpoint vorhanden ist. Das ist eine bewusste, ehrliche
 * Pending-Markierung (kein gefälschter Pass) — siehe 01-07-SUMMARY.
 *
 * Sobald der Backend-Stream-Endpoint existiert: `test.fixme()` entfernen, den
 * Run-Setup-Block (`prepareDemoRun`) an den realen Upload-/Run-Start-Flow
 * anschließen und `npx playwright test tests/live-stream.spec.ts` ausführen.
 */

import { expect, test } from "@playwright/test";

import { loginAs } from "../e2e/fixtures/auth";
import { ADMIN } from "../e2e/fixtures/test-users";

/** Tail-Pickup-Budget (AC-3 / O-4): neue Frames < 1s sichtbar. */
const TAIL_PICKUP_BUDGET_MS = 1000;

/**
 * Bereitet einen aktiven Run vor, dessen `stream.jsonl` von der `/live`-Route
 * tail-gelesen werden kann, und gibt eine `append`-Funktion zurück, die neue
 * JSONL-Frames an den Stream anhängt (simuliert die weiterschreibende Engine).
 *
 * PLATZHALTER bis zum Stream-Read-Endpoint: sobald die Backend-ReadFn existiert,
 * wird hier der reale Flow angeschlossen — entweder
 *   (a) der Demo-Lauf `engine/scripts/demo_stream_run.py` schreibt in ein vom
 *       Backend exponiertes runs/-Verzeichnis, oder
 *   (b) ein API-Call startet einen Run und liefert dessen run-id.
 * Die `append`-Funktion hängt dann über einen Test-Hook neue Zeilen an
 * (z.B. via API-Endpoint oder direktem Dateischreiben im Container-Volume).
 */
async function prepareDemoRun(): Promise<{
  runId: string;
  append: (lines: string[]) => Promise<void>;
}> {
  throw new Error(
    "prepareDemoRun: Stream-Read-Endpoint (Backend-ReadFn) noch nicht " +
      "verdrahtet — siehe Datei-Header. Diese Spec ist test.fixme bis dahin.",
  );
}

/** Baut eine gültige gantt_durchlauf-JSONL-Zeile (SPEC §6.3). */
function ganttFrame(
  seq: number,
  auftragId: string,
  kind: "start" | "ende",
  t: number,
): string {
  const v =
    kind === "start"
      ? {
          kind,
          auftrag_id: auftragId,
          prozess_id: "P1.OP10",
          start_time: t,
          betriebsmittel_id: "BM-01",
          dauer_geplant: 500,
        }
      : {
          kind,
          auftrag_id: auftragId,
          prozess_id: "P1.OP10",
          start_time: t - 500,
          end_time: t,
          dauer_ist: 500,
          status: "abgeschlossen",
        };
  return JSON.stringify({ t, stream: "gantt_durchlauf", seq, v });
}

test.describe("Live-Stream-Viewer (AC-3 / AC-4 / AC-5)", () => {
  // PENDING: bis der Backend-Stream-Read-Endpoint existiert (Datei-Header).
  // Bewusste ehrliche Markierung — KEIN gefälschter Pass.
  test.fixme();

  test("AC-3: angehängte Frames erscheinen in /live innerhalb < 1s", async ({
    page,
  }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    const { append } = await prepareDemoRun();

    await page.goto("/live");
    // Default-Tab ist gantt_durchlauf — der StreamRouter rendert das gantt-panel.
    await page.getByTestId("live-tab-gantt_durchlauf").click();

    // Eine neue Auftrags-Spur anhängen, während die Seite pollt.
    const auftrag = "FA-LIVE-001";
    await append([
      ganttFrame(10_001, auftrag, "start", 3600),
      ganttFrame(10_002, auftrag, "ende", 4100),
    ]);

    // AC-3: die zugehörige GanttRow muss innerhalb < 1s sichtbar werden.
    await expect(
      page.getByTestId(`gantt-row-${auftrag}`),
    ).toBeVisible({ timeout: TAIL_PICKUP_BUDGET_MS });
  });

  test("AC-4: Tab-Wechsel isoliert genau einen Stream", async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    const { append } = await prepareDemoRun();

    await page.goto("/live");

    // gantt_durchlauf-Tab: gantt-panel sichtbar, kpi-grid NICHT im DOM.
    await page.getByTestId("live-tab-gantt_durchlauf").click();
    await append([ganttFrame(20_001, "FA-FILTER", "start", 3600)]);
    await expect(page.getByTestId("stream-router-gantt_durchlauf")).toBeVisible();
    await expect(page.getByTestId("kpi-grid")).toHaveCount(0);

    // Auf kpi_auswertung wechseln: kpi-Stream-Router sichtbar, gantt-panel weg.
    await page.getByTestId("live-tab-kpi_auswertung").click();
    await expect(page.getByTestId("stream-router-kpi_auswertung")).toBeVisible();
    await expect(page.getByTestId("gantt-panel")).toHaveCount(0);
  });

  test("AC-5: Reload setzt vom Offset fort, ohne Frames zu doppeln", async ({
    page,
  }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    const { append } = await prepareDemoRun();

    await page.goto("/live");
    await page.getByTestId("live-tab-gantt_durchlauf").click();

    const auftrag = "FA-RESTART-001";
    await append([
      ganttFrame(30_001, auftrag, "start", 3600),
      ganttFrame(30_002, auftrag, "ende", 4100),
    ]);
    await expect(page.getByTestId(`gantt-row-${auftrag}`)).toBeVisible({
      timeout: TAIL_PICKUP_BUDGET_MS,
    });

    // Browser-Reload (simuliert UI-Crash + Neustart). Die Engine schreibt
    // unterdessen weiter — wir hängen nach dem Reload eine weitere Zeile an.
    await page.reload();
    await page.getByTestId("live-tab-gantt_durchlauf").click();
    await append([ganttFrame(30_003, auftrag, "ende", 4200)]);

    // Genau EINE GanttRow für den Auftrag — kein doppeltes Aufnehmen der vor
    // dem Reload bereits gelesenen Frames (Offset-Restart, AC-5).
    await expect(page.getByTestId(`gantt-row-${auftrag}`)).toHaveCount(1, {
      timeout: TAIL_PICKUP_BUDGET_MS,
    });
  });
});
