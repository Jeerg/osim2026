// Plan 01-04 Task 1: useAuth-Hook. 1:1 aus tbx_stzrim.
import { useContext } from "react";
import { AuthContext, type AuthState } from "./auth-provider";

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export type { AuthState };
