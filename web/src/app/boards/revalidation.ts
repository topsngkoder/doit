"use server";

import { revalidatePath } from "next/cache";

export async function revalidateBoardsData() {
  revalidatePath("/boards");
}
