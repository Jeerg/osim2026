import { useEffect, useState, type FormEvent } from "react";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { LockIcon, MailIcon } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/auth/firebase";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect:
      typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

/**
 * Login-Seite — Email + Passwort gegen den Firebase-Emulator (Dev) bzw. den
 * Production-Firebase-Tenant. Nach erfolgreichem Sign-In navigiert zu der via
 * `?redirect=…` mitgegebenen URL oder zu `/` als Fallback.
 *
 * Wenn der User schon authentisiert ist (z.B. nach Manual-Navigation auf
 * /login bei aktiver Session), redirected ein useEffect zur Ziel-Route, damit
 * die Login-Form nicht versehentlich angezeigt wird.
 */
function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const { isAuthenticated, isLoading } = Route.useRouteContext({
    select: (ctx) => ({
      isAuthenticated: ctx.auth.isAuthenticated,
      isLoading: ctx.auth.isLoading,
    }),
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-Redirect wenn bereits eingeloggt (z.B. direkter Hit auf /login).
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const redirectTo = search.redirect ?? "/";
      void navigate({ to: redirectTo });
    }
  }, [isLoading, isAuthenticated, navigate, search.redirect]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const redirectTo = search.redirect ?? "/";
      await navigate({ to: redirectTo });
    } catch (err) {
      // Firebase wirft `FirebaseError` mit `code` + `message` — die deutsche
      // Übersetzung kommt in Plan 04 (apiErrorMessage erweitern). Für jetzt
      // zeigen wir die Firebase-Message direkt im Toast.
      const message =
        err instanceof Error
          ? err.message
          : "Anmeldung fehlgeschlagen.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-surface-50 via-brand-50/40 to-surface-100">
      {/* dezente Blob-Akzente im Hintergrund */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-brand-100/40 blur-3xl" />

      <div className="relative w-full max-w-md px-6">
        <div className="mb-8 flex flex-col items-center gap-3">
          <BrandLogo />
          <p className="text-center text-sm text-surface-600">
            Anmelden, um Ihre OSim-Modelle zu bearbeiten.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7 shadow-xl shadow-brand-900/5">
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            data-testid="login-form"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-xs font-medium uppercase tracking-wider text-surface-500"
              >
                E-Mail
              </label>
              <div className="relative">
                <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@firma.de"
                  required
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-10 pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-medium uppercase tracking-wider text-surface-500"
              >
                Passwort
              </label>
              <div className="relative">
                <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="h-10 pl-10"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="h-10 w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Anmelden…" : "Anmelden"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-surface-400">
          Dev-Mode · Firebase-Emulator unter <code>localhost:19099</code>
        </p>
      </div>
    </div>
  );
}
