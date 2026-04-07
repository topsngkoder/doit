"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readBrowserNotificationPermission,
  type BrowserNotificationPermissionStatus
} from "./browser-notification-permission";

export type UseBrowserNotificationPermissionResult = {
  status: BrowserNotificationPermissionStatus | null;
  /** Перечитать `Notification.permission` (после `requestPermission`, смены настроек сайта и т.п.). */
  refresh: () => void;
};

/**
 * Состояние разрешения на нативные уведомления без обращения к БД.
 * До монтирования в браузере — status: null; после — ready или unsupported.
 */
export function useBrowserNotificationPermission(): UseBrowserNotificationPermissionResult {
  const [status, setStatus] = useState<BrowserNotificationPermissionStatus | null>(null);

  const refresh = useCallback(() => {
    setStatus(readBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    refresh();
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  return { status, refresh };
}
