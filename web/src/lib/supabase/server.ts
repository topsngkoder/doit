import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // В рантайме это всплыёт в лог сервера Next.js.
  console.warn(
    "Supabase env переменные не заданы: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

export type SupabaseServerClientInstrumentation = {
  onFetch?: (url: string) => void;
};

export async function createSupabaseServerClient(options?: {
  instrumentation?: SupabaseServerClientInstrumentation;
}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase env переменные не заданы. Проверьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const cookieStore = await cookies();

  const baseFetch = globalThis.fetch.bind(globalThis);
  const instrumentedFetch: typeof fetch = async (input, init) => {
    try {
      if (options?.instrumentation?.onFetch) {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        options.instrumentation.onFetch(url);
      }
    } catch {
      // Инструментация не должна ломать реальный запрос.
    }
    return baseFetch(input as never, init as never);
  };

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* Server Component: куки только для чтения; refresh — в middleware */
        }
      }
    },
    global: {
      fetch: options?.instrumentation?.onFetch ? instrumentedFetch : baseFetch
    }
  });
}
