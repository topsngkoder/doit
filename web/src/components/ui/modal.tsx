/* eslint-disable react-dom/no-unknown-property */
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type ModalProps = {
  open: boolean;
  title?: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  /** Доп. классы для области контента (под скролл/раскладку, например двухколоночный модал). */
  bodyClassName?: string;
};

export function Modal({ open, title, onClose, children, className, bodyClassName }: ModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!open) return null;
  if (!mounted) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-8"
      onClick={() => onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950/95 shadow-xl",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
          {typeof title === "string" ?
            <h2 className="text-base font-semibold text-slate-50">{title}</h2>
          : title ?
            <div className="min-w-0 flex-1">{title}</div>
          : <span className="text-sm font-medium text-slate-200">Диалог</span>}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Закрыть"
              onClick={onClose}
              className="px-2 text-xs"
            >
              ✕
            </Button>
          )}
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-5 pb-5 text-sm text-slate-200",
            bodyClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

