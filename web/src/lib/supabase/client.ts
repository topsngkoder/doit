import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // В рантайме это всплывёт в консоль браузера, чтобы было легче заметить.
  // Для production ожидается, что переменные окружения будут заданы.
  console.warn(
    "Supabase env переменные не заданы: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export function createSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase env переменные не заданы. Проверьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

