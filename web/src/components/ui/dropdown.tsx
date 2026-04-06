import * as React from "react";
import { cn } from "@/lib/utils";

export type DropdownItem = {
  id: string;
  label: string;
};

export type DropdownProps = {
  items: DropdownItem[];
  onSelect?: (id: string) => void;
  className?: string;
};

export function Dropdown({ items, onSelect, className }: DropdownProps) {
  return (
    <div
      className={cn(
        "min-w-[160px] rounded-md border border-slate-800 bg-slate-950/95 py-1 text-sm text-slate-100 shadow-lg",
        className
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="flex w-full items-center px-3 py-1.5 text-left hover:bg-slate-800/90"
          onClick={() => onSelect?.(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

