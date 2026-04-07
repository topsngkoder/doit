"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  type NotificationChannel,
  type NotificationEventType
} from "@/lib/notifications/constants";

function isNotificationChannel(v: string): v is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(v);
}

function isNotificationEventType(v: string): v is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(v);
}

export async function updateNotificationTimezoneAction(formData: FormData) {
  const raw = formData.get("timezone");
  const timezone = typeof raw === "string" ? raw.trim() : "";
  if (!timezone) {
    return { ok: false as const, message: "Укажите временную зону." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, message: "Требуется вход в аккаунт." };
  }

  const { error } = await supabase.from("notification_user_settings").upsert(
    {
      user_id: user.id,
      timezone
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/notifications/settings");
  return { ok: true as const };
}

export async function setNotificationPreferenceEnabledAction(formData: FormData) {
  const rawChannel = formData.get("channel");
  const rawEventType = formData.get("event_type");
  const rawEnabled = formData.get("enabled");

  const channel = typeof rawChannel === "string" ? rawChannel.trim() : "";
  const eventType = typeof rawEventType === "string" ? rawEventType.trim() : "";
  const enabled = rawEnabled === "1" || rawEnabled === "true" || rawEnabled === "on";

  if (!isNotificationChannel(channel) || !isNotificationEventType(eventType)) {
    return { ok: false as const, message: "Некорректные параметры настройки." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false as const, message: "Требуется вход в аккаунт." };
  }

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      channel,
      event_type: eventType,
      enabled
    },
    { onConflict: "user_id,channel,event_type" }
  );

  if (error) {
    return { ok: false as const, message: error.message };
  }

  revalidatePath("/notifications/settings");
  return { ok: true as const };
}

