"use client";

import { type ReactNode, useRef } from "react";

type NotificationsScrollShellProps = {
  children: ReactNode;
};

export function NotificationsScrollShell({ children }: NotificationsScrollShellProps) {
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showScrollbarWhileScrolling = (element: HTMLElement) => {
    element.classList.add("notifications-scroll-active");

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = setTimeout(() => {
      element.classList.remove("notifications-scroll-active");
      hideTimerRef.current = null;
    }, 700);
  };

  return (
    <main
      className="notifications-scroll-transparent mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto py-2"
      onScroll={(event) => showScrollbarWhileScrolling(event.currentTarget)}
      onWheel={(event) => showScrollbarWhileScrolling(event.currentTarget)}
      onTouchMove={(event) => showScrollbarWhileScrolling(event.currentTarget)}
    >
      {children}
    </main>
  );
}
