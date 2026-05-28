import type { ReactNode } from "react";
import { LogOutIcon } from "lucide-react";
import { useAuth } from "@/auth/use-auth";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Layout-Wrapper für alle authentisierten Routes.
 *
 * Topbar nach 3FLS-EAM-Style-Guide §2.1 (rev. 2026-05-26):
 *  - Höhe `--header-height` (80px), diagonaler Blau-Gradient (`.topbar-brand`).
 *  - Weiße Schrift; Wordmark/Page-Title links auf dem dunklen Verlauf-Bereich.
 *  - 3fls-EAM-Logo rechts, direkt auf dem aufgehellten Verlauf-Ende — KEIN
 *    Backdrop/Kästchen (§1.3, Logo unverändert).
 */
export function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { email, signOut } = useAuth();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen flex-col bg-background">
        <header
          className="topbar-brand sticky top-0 z-40 flex shrink-0 items-center justify-between px-6 text-white"
          style={{ height: "var(--header-height)" }}
        >
          {/* LINKS: Wordmark auf dem dunklen Verlauf-Bereich (hoher Kontrast) */}
          <div className="flex flex-col leading-none">
            <span className="text-xl font-bold tracking-tight">OSim</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/75">
              Simulation Studio
            </span>
          </div>

          {/* RECHTS: User-Pill + Logout + 3fls-Logo (ohne Backdrop) */}
          <div className="flex items-center gap-4">
            {email && (
              <div
                className="hidden items-center gap-2 rounded-full bg-white/15 py-1 pl-1.5 pr-3 text-sm backdrop-blur-sm sm:flex"
                data-testid="auth-user-email"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-[11px] font-semibold uppercase text-white">
                  {email.slice(0, 2)}
                </span>
                <span className="text-white/90">{email}</span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void signOut()}
                  data-testid="auth-sign-out"
                  className="text-white hover:bg-white/15 hover:text-white"
                >
                  <LogOutIcon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Abmelden</TooltipContent>
            </Tooltip>
            <img
              src="/logo-3fls-eam.png"
              alt="3fls — feedback loops"
              className="h-12 w-auto select-none"
              draggable={false}
            />
          </div>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </TooltipProvider>
  );
}
