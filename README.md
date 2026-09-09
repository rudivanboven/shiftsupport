# ShiftSupport

Short-shift staffing for local retailers. Next.js App Router + Supabase
(Postgres, Auth, RLS), deployed on Vercel.

## Getting started

```bash
npm install
npm run dev
```

`.env.local` needs:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # server-only, never NEXT_PUBLIC_
NEXT_PUBLIC_SITE_URL=...           # optional; used for auth email links
```

**Before the app will work, run the two SQL migrations** — see
[`supabase/README.md`](supabase/README.md).

## Layout

```
app/
  page.tsx, about/, contact/, …    marketing site (unchanged)
  worker/(auth)/…                  /worker/login, /worker/signup
  worker/(app)/…                   /worker/dashboard, available-shifts,
                                   my-shifts, notifications, profile
  retailer/(auth)/…                /retailer/login, /retailer/signup
  retailer/(app)/…                 /retailer/dashboard, shifts, shifts/new,
                                   applicants, store, profile
  forgot-password/, reset-password/
  auth/callback/                   Supabase email-link handler
  actions/                         server actions (auth, shifts,
                                   applications, profile, notifications)
lib/
  supabase/client.ts               browser client (anon key)
  supabase/server.ts               request-scoped server client (anon key, RLS)
  supabase/admin.ts                service-role client, `server-only`
  auth/session.ts                  getUser / requireWorker / requireRetailer
  data/                            queries per role
components/
  auth/, dashboard/, shifts/, ui/, account/
middleware.ts                      session refresh + role-based redirects
supabase/migrations/               the SQL to run
```

## How auth works

Signup creates the Supabase Auth user, then provisions the database records
(`profiles` + `workers`, or `profiles` + `stores` + `store_users`) server-side
with the service-role key — this has to happen before the user has a session of
their own, since email confirmation may be enabled.

Every `/worker/*` and `/retailer/*` dashboard route is gated three times over:

1. `middleware.ts` redirects on the role in the signed JWT (fast, no DB hit).
2. `requireWorker()` / `requireRetailer()` re-check the role against the
   `profiles` table before the page renders.
3. Row Level Security enforces it in the database, so a crafted request gets
   nothing regardless of what the UI does.

Sensitive writes (hire, reject) go through transaction-safe Postgres functions
rather than client-issued updates.

## Not built yet

Stripe, subscriptions and billing are deliberately out of scope. The dashboards
are structured so a billing area can be added without rebuilding them.
