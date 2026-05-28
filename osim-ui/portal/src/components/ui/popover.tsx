import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

/**
 * shadcn-style Popover — Phase-1-Subset.
 *
 * Wrap um @radix-ui/react-popover (https://ui.shadcn.com/docs/components/popover).
 * Wird vom Combobox-Composite (siehe combobox.tsx) als Floating-Container für
 * cmdk-Command genutzt; perspektivisch auch von späteren Tooltip-/Info-Bubbles.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      data-slot="popover-content"
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
