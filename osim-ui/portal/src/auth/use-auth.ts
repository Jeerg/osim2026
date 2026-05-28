import { useContext } from "react";
import { AuthContext, type AuthState } from "./auth-provider";

/**
 * Hook für den Zugriff auf den AuthContext.
 *
 * Wirft, wenn außerhalb von <AuthProvider> aufgerufen — fängt einen häufigen
 * Test-/Storybook-Bug ab (Component ohne Provider gemountet → silent null).
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export type { AuthState };
