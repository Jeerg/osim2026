// Plan 01-04 Task 1: AuthProvider.
//
// Abweichung von 3fls: osim-ui-Backend liefert tenant_id+role NICHT aus den
// Firebase-Custom-Claims (die werden erst nach dem ersten POST /auth/me-Call
// gesetzt — Lazy-Bootstrap aus Plan 01-02), sondern direkt aus der
// AuthMeResponse. Deshalb fragen wir IMMER /auth/me ab und nehmen die Werte
// von dort als Quelle der Wahrheit. Claims sind dann ab dem zweiten Token-
// Refresh vorhanden, was aber fuer uns transparent ist.
import { createContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tenantId: string | null;
  role: string | null;
  email: string | null;
  /** True wenn der letzte /auth/me-Call den Tenant gerade angelegt hat. */
  bootstrapped: boolean;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  tenantId: null,
  role: null,
  email: null,
  bootstrapped: false,
};

export const AuthContext = createContext<AuthState | null>(null);

interface AuthMeResponse {
  tenant_id: string;
  user_uid: string;
  email: string;
  role: string;
  bootstrapped: boolean;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/**
 * Firebase Auth provider.
 * Subscribes to onAuthStateChanged, ruft beim Login POST /api/v1/auth/me
 * (Lazy-Bootstrap), und legt tenant_id/role im AuthState ab.
 *
 * Falls /auth/me fehlschlaegt (Backend down), bleibt der User
 * eingeloggt aber ohne tenant_id — Route-Guards muessen das beruecksichtigen.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ ...initialState, isLoading: false });
        return;
      }

      try {
        const token = await user.getIdToken(false);
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          // Backend lehnt ab — als nicht-authentifiziert markieren.
          // (User kann erneut versuchen, sobald Backend wieder verfuegbar.)
          setState({
            user,
            isAuthenticated: true,
            isLoading: false,
            tenantId: null,
            role: null,
            email: user.email,
            bootstrapped: false,
          });
          return;
        }

        const data = (await res.json()) as AuthMeResponse;
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          tenantId: data.tenant_id,
          role: data.role,
          email: data.email,
          bootstrapped: data.bootstrapped,
        });
      } catch {
        // Netzwerkfehler oder Token-Probleme — als unauthenticated behandeln.
        setState({ ...initialState, isLoading: false });
      }
    });

    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
