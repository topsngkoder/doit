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
        "rounded-md border border-slate-800 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}

