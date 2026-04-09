import * as React from "react";
import { cn } from "@/lib/utils";

export type PopoverProps = {
  children: React.ReactNode;
  className?: string;
};

export function Popover({ children, className }: PopoverProps) {
  return (
    <div
      className={cn(
        "popup-panel px-3 py-2 text-xs text-app-primary shadow-[var(--shadow-card)]",
        className
      )}
    >
      {children}
    </div>
  );
}

