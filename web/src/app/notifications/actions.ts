"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function markInternalNotificationReadAction(formData: FormData) {
  const raw = formData.get("id");
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id || !isUuidLike(id)) {
    redirect("/notifications?error=" + encodeURIComponent("Некорректный id уведомления."));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("internal_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    redirect("/notifications?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/notifications");
  redirect("/notifications");
}

export async function markAllInternalNotificationsReadAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("internal_notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    redirect("/notifications?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/notifications");
  redirect("/notifications");
}

