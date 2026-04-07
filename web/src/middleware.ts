import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function middleware(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
        // В middleware мы выбираем тип ответа (next/redirect) позже,
        // поэтому сначала накапливаем cookies, а применяем их в самом конце.
        cookies.forEach((c) => pendingCookies.push(c));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthLanding = pathname === "/" || pathname === "/login";
  const isProtected =
    pathname === "/boards" ||
    pathname.startsWith("/boards/") ||
    pathname === "/notifications" ||
    pathname.startsWith("/notifications/");

  let response: NextResponse;
  if (user && isAuthLanding) {
    response = NextResponse.redirect(new URL("/boards", request.url));
  } else if (!user && isProtected) {
    response = NextResponse.redirect(new URL("/login", request.url));
  } else {
    response = NextResponse.next({ request });
  }

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
