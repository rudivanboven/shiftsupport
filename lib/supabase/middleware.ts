import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Dashboard areas that require a signed-in user of the matching role. */
const WORKER_AREA = /^\/worker\/(dashboard|available-shifts|my-shifts|notifications|profile)/;
const RETAILER_AREA = /^\/retailer\/(dashboard|shifts|applicants|store|profile)/;

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Keep a deployment configuration mistake from taking down every public
  // route. Protected pages still enforce authentication server-side.
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[proxy] Public Supabase environment variables are missing.");
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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

  const path = request.nextUrl.pathname;
  let user = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    // A temporary Auth/network failure must not crash every route matched by
    // Proxy. Page layouts remain the authoritative dashboard access guards.
    console.error(
      "[proxy] Supabase session refresh failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  const role = (user?.app_metadata?.role as string | undefined) ?? null;
  const homeFor = (r: string | null) =>
    r === "retailer" ? "/retailer/dashboard" : "/worker/dashboard";

  const go = (to: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    const redirect = NextResponse.redirect(url);

    // If getUser refreshed the session, retain those cookies on redirects.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }

    return redirect;
  };

  if (!user) {
    if (WORKER_AREA.test(path)) return go("/worker/login", path);
    if (RETAILER_AREA.test(path)) return go("/retailer/login", path);
    return response;
  }

  if (WORKER_AREA.test(path) && role === "retailer") return go("/retailer/dashboard");
  if (RETAILER_AREA.test(path) && role === "worker") return go("/worker/dashboard");
  return response;
}
