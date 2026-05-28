import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * shadcn-style Combobox — Phase-1-Subset.
 *
 * Composite aus Popover + cmdk-Command (https://ui.shadcn.com/docs/components/combobox).
 * shadcn liefert kein dediziertes Combobox-Primitive; Standard-Pattern ist ein
 * Eigenbau aus den beiden Bauteilen.
 *
 * Konsumenten:
 * - OCtrlLink (Objekt-Auswahl gefiltert nach link_target_klass)
 *
 * API ist absichtlich schlank gehalten — keine async-Suche, kein virtualisiertes
 * Listing. Bei OSim-Modellen mit <500 Refs pro Combobox ist das ausreichend;
 * Phase 4 erweitert wenn nötig.
 */
export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  /** id auf dem internen Trigger-Button — Pflicht, damit `<label htmlFor>` greift. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  "data-octrl-id"?: string;
}

const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      id,
      value,
      onChange,
      options,
      placeholder = "Auswählen…",
      emptyText = "Keine Treffer.",
      disabled,
      className,
      ...rest
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const selected = options.find((o) => o.value === value);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            data-octrl-id={rest["data-octrl-id"]}
            className={cn("w-full justify-between", className)}
            type="button"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <CommandPrimitive className="flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground">
            <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
              <SearchIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <CommandPrimitive.Input
                placeholder="Suchen…"
                className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <CommandPrimitive.List className="max-h-72 overflow-y-auto overflow-x-hidden p-1">
              <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </CommandPrimitive.Empty>
              {options.map((opt) => (
                <CommandPrimitive.Item
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opt.label}
                </CommandPrimitive.Item>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>
    );
  },
);
Combobox.displayName = "Combobox";

export { Combobox };
