import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const baseClasses =
  "inline-flex items-center justify-center text-sm font-medium transition-colors rounded-[length:var(--radius-control)] focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] disabled:pointer-events-none disabled:opacity-60";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent-bg)] text-[var(--text-on-accent)] shadow-sm hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] disabled:bg-[var(--accent-btn-disabled-bg)]",
  secondary:
    "border border-[var(--button-secondary-border)] bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] hover:border-[var(--button-secondary-border-hover)] hover:bg-[var(--btn-secondary-hover-bg)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)]",
  destructive:
    "bg-[var(--danger-strong)] text-[var(--text-on-accent)] hover:bg-[var(--danger-hover)]"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4"
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          baseClasses,
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

