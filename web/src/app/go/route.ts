import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  const isSessionMissing = error?.message === "Auth session missing!";
  const isAuthenticated = !!user && !(error && !isSessionMissing);

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_board_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.redirect(new URL("/boards", request.url));
  }

  const defaultBoardId = profile?.default_board_id ?? null;

  if (defaultBoardId) {
    const { data: board, error: boardError } = await supabase
      .from("boards")
      .select("id")
      .eq("id", defaultBoardId)
      .maybeSingle();

    if (!boardError && board) {
      return NextResponse.redirect(new URL(`/boards/${defaultBoardId}`, request.url));
    }
  }

  return NextResponse.redirect(new URL("/boards", request.url));
}
