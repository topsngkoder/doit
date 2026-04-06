import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type ModalProps = {
  open: boolean;
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
};

export function Modal({ open, title, onClose, children, className }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div
        className={cn(
          "w-full max-w-lg rounded-lg border border-slate-800 bg-slate-950/95 p-5 shadow-xl",
          className
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          {title ? (
            <h2 className="text-base font-semibold text-slate-50">{title}</h2>
          ) : (
            <span className="text-sm font-medium text-slate-200">Диалог</span>
          )}
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
        <div className="text-sm text-slate-200">{children}</div>
      </div>
    </div>
  );
}

