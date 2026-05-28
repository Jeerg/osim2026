import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// 1:1-shadcn-Default. Wird von allen ui/*-Komponenten für className-Komposition
// verwendet (twMerge dedupliziert kollidierende Tailwind-Utility-Klassen).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
