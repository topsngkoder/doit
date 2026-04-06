"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createBoardWithDefaultsAction(formData: FormData) {
  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) {
    redirect(
      "/boards?boardError=" + encodeURIComponent("Укажите название доски")
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_board_with_defaults", {
    p_name: name
  });

  if (error) {
    redirect("/boards?boardError=" + encodeURIComponent(error.message));
  }

  revalidatePath("/boards");
  redirect("/boards");
}
