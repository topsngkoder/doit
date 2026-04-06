import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-50 placeholder:text-slate-500 shadow-sm outline-none transition focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500/40",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

