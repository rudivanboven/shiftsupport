import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Dashboard areas that require a signed-in user. */
const WORKER_AREA = /^\/worker\/(dashboard|available-shifts|my-shifts|notifications|profile)/;
const RETAILER_AREA = /^\/retailer\/(dashboard|shifts|applicants|store|profile)/;

const isProtected = (path: string) => WORKER_AREA.test(path) || RETAILER_AREA.test(path);

/**
 * Statuses that mean "this token really is not valid" as opposed to
 * "we could not reach the auth server right now".
 */
const isDefinitelySignedOut = (status: number | undefined) =>
  status === 400 || status === 401 || status === 403;

/**
 * Refreshes the Supabase session cookie on every request, and keeps
 * signed-out visitors out of the dashboards.
 *
 * Deliberately does NOT decide anything about roles. Role routing lives in
 * one place — `getCurrentUserWithRole`, which reads the `profiles` table —
 * because two sources of truth (a JWT claim here, the database there) can
 * disagree and bounce a user between the two dashboards forever.
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
          // Update the incoming request first so that the page rendered
          // downstream reads the *refreshed* tokens, not the expired ones.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          // ...and write them back to the browser so the refresh sticks.
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const path = request.nextUrl.pathname;

  // Does the browser even claim to have a session? Used to tell a genuine
  // anonymous visitor apart from a signed-in user whose token lookup failed.
  const hasAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("auth-token"));

  let user = null;
  // Assume the best when the auth server cannot answer: a rate-limited or
  // briefly unreachable Auth API must not log everybody out. The page's own
  // guard (and RLS) still refuse to serve data without a valid session.
  let signedOut = !hasAuthCookie;

  try {
    // This call is what refreshes an expired access token and, through
    // `setAll` above, writes the new cookies. Do not remove it.
    const { data, error } = await supabase.auth.getUser();
    user = data.user;
    if (!user) signedOut = isDefinitelySignedOut(error?.status);
  } catch (error) {
    console.error(
      "[proxy] Supabase session refresh failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  if (!user && signedOut && isProtected(path)) {
    const url = request.nextUrl.clone();
    url.pathname = WORKER_AREA.test(path) ? "/worker/login" : "/retailer/login";
    url.search = `?next=${encodeURIComponent(path)}`;

    const redirect = NextResponse.redirect(url);
    // If the session was cleared while getting here, keep those cookie
    // instructions so the browser does not hold on to a dead token.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return response;
}
