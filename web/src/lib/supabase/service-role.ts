import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Клиент с `service_role` для фоновых задач (RLS обходится). Не использовать в пользовательских запросах.
 */
export function getSupabaseServiceRoleClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Для service client нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return cached;
}
