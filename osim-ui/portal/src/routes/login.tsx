// Plan 01-04 Task 1: Login-Seite mit Email/Password + Self-Service-Signup.
//
// Phase 1 ist Self-Service: jeder neue User kann sich registrieren, der
// Backend-Bootstrap legt automatisch einen Tenant an (Plan 02 D-17).
import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/auth/firebase";

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

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      const redirectTo = search.redirect ?? "/";
      await navigate({ to: redirectTo });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Anmeldung fehlgeschlagen";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">osim-ui</h1>
          <p className="text-sm text-gray-500">
            {mode === "login" ? "Anmelden" : "Konto anlegen"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          data-testid="login-form"
        >
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isSubmitting}
              className="block w-full rounded border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-sm font-medium text-gray-700"
            >
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              disabled={isSubmitting}
              className="block w-full rounded border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p
              className="text-sm text-red-700"
              data-testid="login-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {isSubmitting
              ? "..."
              : mode === "login"
                ? "Anmelden"
                : "Konto anlegen"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="block w-full text-center text-xs text-gray-500 hover:text-gray-700"
        >
          {mode === "login"
            ? "Noch kein Konto? Jetzt registrieren."
            : "Bereits registriert? Anmelden."}
        </button>
      </div>
    </div>
  );
}
