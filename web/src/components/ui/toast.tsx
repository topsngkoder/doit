import * as React from "react";
import { cn } from "@/lib/utils";

export type ToastVariant = "info" | "success" | "error";

export type ToastProps = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  className?: string;
};

const variantClasses: Record<ToastVariant, string> = {
  info: "border-sky-500/60 bg-sky-500/10 text-sky-100",
  success: "border-emerald-500/60 bg-emerald-500/10 text-emerald-100",
  error: "border-rose-500/70 bg-rose-500/10 text-rose-100"
};

export function Toast({
  title,
  message,
  variant = "info",
  className
}: ToastProps) {
  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-md border px-3 py-2 text-sm shadow-lg",
        variantClasses[variant],
        className
      )}
    >
      {title && <div className="mb-0.5 text-xs font-semibold">{title}</div>}
      <div className="text-xs leading-snug">{message}</div>
    </div>
  );
}

