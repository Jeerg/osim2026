import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

/**
 * shadcn-style Sonner-Toaster — Phase-1-Subset.
 *
 * 3fls's sonner.tsx nutzt next-themes für Dark-Mode-Switching. Phase 1 ist
 * Light-only, daher hier vereinfacht. CSS-Variablen kommen aus globals.css.
 *
 * Konsumenten:
 *     import { toast } from "sonner";
 *     toast.error(apiErrorMessage(err, "Modell laden"));
 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius)",
      } as React.CSSProperties
    }
    {...props}
  />
);

export { Toaster };
