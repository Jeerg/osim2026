import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

/**
 * Auth-Zustand, der via Context an die App propagiert wird.
 *
 * `isLoading` ist die zentrale Race-Guard (Pitfall #8 aus PATTERNS.md §Frontend-
 * Foundation): solange `onAuthStateChanged` nicht das erste Mal gefeuert hat
 * (oder das Backend-/auth/me-Roundtrip noch läuft), darf der Auth-Guard in
 * `_authenticated.tsx` NICHT navigieren — sonst landet ein gerade eingeloggter
 * User auf /login.
 *
 * KEIN zusätzlicher `isReady`-Flag — RESEARCH.md Z.952 hat das vorgeschlagen,
 * aber `isLoading` als Single-Source-of-Truth (3fls-Pattern) reicht.
 */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  tenantId: string | null;
  role: string;
  email: string | null;
  tenantStatus: string;
  signOut: () => Promise<void>;
}

const initialState: Omit<AuthState, "signOut"> = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  tenantId: null,
  role: "user",
  email: null,
  tenantStatus: "",
};

export const AuthContext = createContext<AuthState | null>(null);

interface AuthMeResponse {
  tenant_id?: string;
  role?: string;
  tenant_status?: string;
  email?: string;
}

/**
 * Firebase-Auth-Provider für osim-ui.
 *
 * Lifecycle:
 *  1. Initial-Render: `isLoading=true`, `user=null`.
 *  2. `onAuthStateChanged` feuert für jeden Sign-In/Sign-Out + initial.
 *     - fbUser != null:
 *         - `getIdTokenResult` → custom-Claims (`tenant_id`, `role`) lesen.
 *         - `GET /api/v1/auth/me` (Bearer Token) → `tenantStatus`-String laden.
 *         - setState(isLoading=false, isAuthenticated=true, …).
 *     - fbUser == null:
 *         - setState(isLoading=false, isAuthenticated=false, …) (reset).
 *  3. `signOut()` ruft Firebase signOut auf; der Listener triggert Step 2b.
 *
 * Bemerkung Backend-Roundtrip: wir nutzen hier `fetch` direkt statt apiFetch
 * (zirkuläre Import-Vermeidung — apiFetch importiert `auth` aus firebase.ts).
 * Die Logik ist trotzdem 1:1 zu apiFetch: Authorization: Bearer <token>.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, "signOut">>(initialState);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const tokenResult = await fbUser.getIdTokenResult();
          const claims = tokenResult.claims;

          // Backend-Roundtrip — tenantStatus aus /api/v1/auth/me.
          let tenantStatus = "active";
          try {
            const token = await fbUser.getIdToken(false);
            const baseUrl =
              import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
            const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = (await res.json()) as AuthMeResponse;
              tenantStatus = data.tenant_status ?? "active";
            }
          } catch {
            // Backend nicht erreichbar — Dev-Default "active" damit das UI
            // ohne laufendes Backend weiter rendert (zeigt isAuthenticated).
            tenantStatus = "active";
          }

          setState({
            user: fbUser,
            isAuthenticated: true,
            isLoading: false,
            tenantId: (claims.tenant_id as string) ?? null,
            role: (claims.role as string) ?? "user",
            email: fbUser.email,
            tenantStatus,
          });
        } catch {
          // Token-Extraktion gescheitert → wie nicht authentisiert behandeln.
          setState({ ...initialState, isLoading: false });
        }
      } else {
        setState({ ...initialState, isLoading: false });
      }
    });

    return unsubscribe;
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ ...state, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
