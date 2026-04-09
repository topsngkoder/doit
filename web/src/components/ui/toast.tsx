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
  info: "toast-variant-info",
  success: "toast-variant-success",
  error: "toast-variant-error"
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
        "w-full max-w-sm px-3 py-2 text-sm",
        variantClasses[variant],
        className
      )}
    >
      {title && <div className="mb-0.5 text-xs font-semibold">{title}</div>}
      <div className="text-xs leading-snug">{message}</div>
    </div>
  );
}

