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
  /** Backward-compatible классы для panel. */
  className?: string;
  /** Доп. классы для overlay-контейнера. */
  overlayClassName?: string;
  /** Доп. классы для panel-контейнера (дополнительно к className). */
  panelClassName?: string;
  /** Доп. классы для области контента (под скролл/раскладку, например двухколоночный модал). */
  bodyClassName?: string;
  /** Доп. классы для body-обертки (алиас для более явной настройки). */
  bodyWrapperClassName?: string;
  /** Управление вертикальным выравниванием overlay-контейнера. */
  verticalAlign?: "center" | "custom";
  /** Доп. классы для строки заголовка (title + кнопка закрытия), вне области `children`. */
  headerClassName?: string;
};

export function Modal({
  open,
  title,
  onClose,
  children,
  className,
  overlayClassName,
  panelClassName,
  bodyClassName,
  bodyWrapperClassName,
  verticalAlign = "center",
  headerClassName
}: ModalProps) {
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
      className={cn(
        "fixed inset-0 z-40 flex justify-center bg-black/60 px-4 py-8",
        verticalAlign === "center" ? "items-center" : "items-start",
        overlayClassName
      )}
      onClick={() => onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-950/95 shadow-xl",
          className,
          panelClassName
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn(
            "flex w-full shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5",
            headerClassName
          )}
        >
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
            bodyClassName,
            bodyWrapperClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

