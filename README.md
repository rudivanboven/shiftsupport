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
NEXT_PUBLIC_SITE_URL=...           # production origin used for auth email links
EMAIL_PROVIDER=resend
EMAIL_FROM=ShiftSupport <noreply@shiftsupport.net>
RESEND_API_KEY=...                 # server-only, never NEXT_PUBLIC_
CRON_SECRET=...                    # server-only Vercel Cron bearer secret
RETAILER_REMINDERS_ENABLED=false   # sending requires the exact value "true"

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_SECRET_KEY=...              # server-only, never NEXT_PUBLIC_
STRIPE_WORKER_MEMBERSHIP_PRICE_ID=...
STRIPE_WEBHOOK_SECRET=...
```

Payments (worker membership + retailer shift checkout) are documented in
[`STRIPE.md`](STRIPE.md). The internal Super Admin area is documented in
[`SUPER_ADMIN.md`](SUPER_ADMIN.md).

**Before the app will work, run the SQL migrations** — see
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
  email/                            server-side Resend transactional email
  payroll/                          payroll provider boundary
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

### Auth email configuration

Password reset and signup confirmation messages are sent by Supabase Auth. The
app does not send these through the transactional Resend adapter. Configure
SMTP under Supabase Dashboard → Authentication → SMTP Settings, and configure
the sender there. The default Supabase email sender is rate limited and is not
intended for production delivery. Worker and Retailer Welcome emails are
separate application emails sent by Resend after profile provisioning.

Set `EMAIL_PROVIDER=resend`, `EMAIL_FROM=ShiftSupport <noreply@shiftsupport.net>`,
and `RESEND_API_KEY` in Vercel. The key is server-only; never prefix it with
`NEXT_PUBLIC_`. These variables do not change Supabase Auth SMTP settings.
Welcome delivery deduplication and retailer reminder scheduling use the single
ledger and reminder infrastructure in
[`supabase/migrations/0016_automated_email_workflows.sql`](supabase/migrations/0016_automated_email_workflows.sql).
Apply it after migrations 0013–0015. The Vercel Cron job calls
`/api/cron/retailer-reminders` daily at 09:00 UTC; the job sends only reminders
whose 14-day due time has arrived and stops stores with a posted shift. Set
`CRON_SECRET` in Vercel to protect the route. Reminder sending remains disabled
unless `RETAILER_REMINDERS_ENABLED=true`; welcome emails are unaffected.

In Supabase Dashboard → Authentication → URL Configuration, set the production
Site URL to the public ShiftSupport origin and allow the exact production
callback/reset URLs, including `/auth/callback` and `/reset-password`. Set
`NEXT_PUBLIC_SITE_URL` to that same origin in Vercel Production (and the
appropriate origin in Preview). The branded reset template in
`supabase/email-templates/reset-password.html` uses `{{ .SiteURL }}` and a
`token_hash` link, which the reset page verifies when the password is submitted.
Copy that template into Supabase Dashboard → Authentication → Email Templates
if it is intended to be active in the hosted project.

The `lib/email/` registry sends Worker and Retailer Welcome emails and retailer
first-shift reminders through Resend. Welcome emails are attempted only after
successful account provisioning; email delivery failures are logged without
failing signup. Supabase Auth password reset and confirmation mail remain on
Supabase Custom SMTP.

## Operations Control Center

`/super-admin` is an internal console for workers, retailers, shifts,
applications, payments, worked hours and payroll. Access lives in its own
`super_admins` table, is checked server-side on every request and again inside
the database, and is granted only by the primary Super Admin — see
[`SUPER_ADMIN.md`](SUPER_ADMIN.md).

## Not built yet

An ADP payroll integration: the payroll area is ADP-ready behind a provider
boundary, but the ADP product, credentials and employee mapping are still to be
confirmed, so only a labelled CSV export exists.
