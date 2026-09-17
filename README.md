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

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_SECRET_KEY=...              # server-only, never NEXT_PUBLIC_
STRIPE_WORKER_MEMBERSHIP_PRICE_ID=...
STRIPE_WEBHOOK_SECRET=...
```

Payments (worker membership + retailer shift checkout) are documented in
[`STRIPE.md`](STRIPE.md). The internal Super Admin area is documented in
[`SUPER_ADMIN.md`](SUPER_ADMIN.md).

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
  super-admin/login               operations sign-in
  super-admin/(console)/…         internal Operations Control Center
  forgot-password/, reset-password/
  auth/callback/                   Supabase email-link handler
  actions/                         server actions (auth, shifts,
                                   applications, profile, notifications)
lib/
  admin/                           super-admin auth, snapshot, metrics
  email/, payroll/                 provider boundaries (no provider wired yet)
  supabase/client.ts               browser client (anon key)
  supabase/server.ts               request-scoped server client (anon key, RLS)
  supabase/admin.ts                service-role client, `server-only`
  auth/session.ts                  getUser / requireWorker / requireRetailer
  data/                            queries per role
components/
  auth/, dashboard/, shifts/, ui/, account/, super-admin/
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

## Operations Control Center

`/super-admin` is an internal console for workers, retailers, shifts,
applications, payments, worked hours and payroll. Access lives in its own
`super_admins` table, is checked server-side on every request and again inside
the database, and is granted only by the primary Super Admin — see
[`SUPER_ADMIN.md`](SUPER_ADMIN.md).

## Not built yet

An ADP payroll integration: the payroll area is ADP-ready behind a provider
boundary, but the ADP product, credentials and employee mapping are still to be
confirmed, so only a labelled CSV export exists. Server-side transactional email
is likewise a boundary with no provider wired up.
