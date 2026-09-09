import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Dashboard areas that require a signed-in user of the matching role. */
const WORKER_AREA = /^\/worker\/(dashboard|available-shifts|my-shifts|notifications|profile)/;
const RETAILER_AREA = /^\/retailer\/(dashboard|shifts|applicants|store|profile)/;

/** Auth screens a signed-in user should be bounced away from. */
const AUTH_PAGES = new Set([
  "/worker/login",
  "/worker/signup",
  "/retailer/login",
  "/retailer/signup",
]);

/**
 * Refreshes the Supabase session cookie on every request, then applies a
 * first line of role-based routing.
 *
 * The role here comes from `app_metadata`, which is signed into the JWT and
 * can only be written with the service-role key — a user cannot edit it.
 * It is still only a redirect hint: each page re-checks the role against the
 * `profiles` table, and the database enforces access through RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const role = (user?.app_metadata?.role as string | undefined) ?? null;
  const homeFor = (r: string | null) =>
    r === "retailer" ? "/retailer/dashboard" : "/worker/dashboard";

  const go = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    return NextResponse.redirect(url);
  };

  if (!user) {
    if (WORKER_AREA.test(path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/worker/login";
      url.search = `?next=${encodeURIComponent(path)}`;
      return NextResponse.redirect(url);
    }
    if (RETAILER_AREA.test(path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/retailer/login";
      url.search = `?next=${encodeURIComponent(path)}`;
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (WORKER_AREA.test(path) && role === "retailer") return go("/retailer/dashboard");
  if (RETAILER_AREA.test(path) && role === "worker") return go("/worker/dashboard");
  if (AUTH_PAGES.has(path)) return go(homeFor(role));

  return response;
}
