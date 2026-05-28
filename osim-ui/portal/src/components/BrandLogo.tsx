/**
 * BrandLogo — kompaktes Marken-Element für den Header.
 *
 * Nutzt das OsimLogoIcon aus @/assets/symbols (handgemachte SVG-Reinterpretation
 * der OSim2004-Original-Marke). Brand-Akzent über brand-600/brand-500-Tokens
 * statt hartkodierter Gradient.
 */

import { OsimLogoIcon } from "@/assets/symbols";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm">
        <OsimLogoIcon size={22} />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-base font-semibold tracking-tight text-foreground">
          OSim
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-brand-600">
          Studio
        </span>
      </div>
    </div>
  );
}
