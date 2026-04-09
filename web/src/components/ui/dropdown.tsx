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
        "popup-panel min-w-[160px] py-1 text-sm text-app-primary shadow-[var(--shadow-card)]",
        className
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="focus-ring-app flex w-full items-center px-3 py-1.5 text-left hover:bg-app-surface-muted"
          onClick={() => onSelect?.(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

