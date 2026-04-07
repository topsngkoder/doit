export type StandardBrowserNotificationPermission = "default" | "granted" | "denied";

export type BrowserNotificationPermissionStatus =
  | { kind: "unsupported" }
  | { kind: "ready"; permission: StandardBrowserNotificationPermission };

/**
 * Читает Notification.permission в браузере. Без window / без API — unsupported.
 */
export function readBrowserNotificationPermission(): BrowserNotificationPermissionStatus {
  if (typeof window === "undefined") {
    return { kind: "unsupported" };
  }
  if (typeof Notification === "undefined") {
    return { kind: "unsupported" };
  }
  const permission = Notification.permission;
  if (permission === "default" || permission === "granted" || permission === "denied") {
    return { kind: "ready", permission };
  }
  return { kind: "unsupported" };
}
