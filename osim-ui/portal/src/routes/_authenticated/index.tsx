import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * Dashboard-Index — Welcome-Page mit Link zur Modell-Bibliothek (Plan 01-07).
 *
 * Vorher (Plan 03 + 04): Placeholder-Text.
 * Jetzt (Plan 07): substantielle Welcome-Page + Navigations-Link.
 * Spätere Erweiterung (Phase 2+): Quick-Stats, zuletzt geöffnete Modelle.
 */
export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-semibold text-foreground">Willkommen</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        osim-ui ist ein webbasiertes Modellierungswerkzeug für OSim-Modelle.
        Laden Sie eine bestehende OTX-Datei hoch, bearbeiten Sie Knoten,
        Ressourcen und Schichten im Browser und speichern Sie das Ergebnis
        versioniert zurück.
      </p>

      <div className="mt-6">
        <Link
          to="/models"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          data-testid="link-to-library"
        >
          Zur Modell-Bibliothek →
        </Link>
      </div>
    </div>
  );
}
