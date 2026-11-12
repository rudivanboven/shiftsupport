# Stripe payments

Two payment flows, both hosted by Stripe Checkout:

| Who | What | Mode | Amount |
| --- | --- | --- | --- |
| Worker | One-time signup fee | `payment` | `STRIPE_WORKER_MEMBERSHIP_PRICE_ID` (a one-time $1 price) |
| Retailer | One shift | `payment` | duration × $28/hour, recomputed server-side |

Nothing in the app marks anything as paid. Membership activation and shift
publication happen only from Stripe-verified state — the signed webhook, or a
server-side re-read of the Checkout session. A redirect back to a success URL
proves nothing and is never treated as proof.

> **Current mode: temporary free worker access.** Set `WORKER_SIGNUP_MODE=free`
> (the default) to allow all workers to browse and apply without a membership
> payment. This is a computed access override: it does not change membership,
> Stripe, subscription, or payment-history records. To restore the one-time
> signup payment flow, set `WORKER_SIGNUP_MODE=paid` and
> `WORKER_SIGNUP_CHECKOUT_ENABLED=true`; existing Stripe Checkout and webhook
> code remains in place.

## 1. Environment

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...              # server only, never NEXT_PUBLIC_
STRIPE_WORKER_MEMBERSHIP_PRICE_ID=price_...  # a ONE-TIME $1 price (not recurring)
STRIPE_WEBHOOK_SECRET=whsec_...            # from the endpoint or `stripe listen`
WORKER_SIGNUP_CHECKOUT_ENABLED=true        # kill-switch; anything but exactly "true" = off
WORKER_SIGNUP_MODE=free                    # free (default) or paid; server-only
```

Free mode overrides worker marketplace access without writing membership
columns. New accounts keep the database's inactive default; inactive and
expired workers receive access only while free mode is selected. Switching
back to paid mode restores access from the existing membership data. A worker
who signed up during free mode therefore follows the normal $1 Checkout flow
when paid mode is restored, unless they already have valid membership data.

The price must be a **one-time** price. Checkout runs in `payment` mode, and
Stripe rejects a recurring price there, so a stale recurring id fails loudly
instead of quietly starting a subscription.

`WORKER_SIGNUP_CHECKOUT_ENABLED` is read only on the server
(`lib/signup-checkout.ts`). It is off when missing or set to anything other
than the exact string `true`. It also fails closed when `STRIPE_SECRET_KEY` is
a live key (`sk_live_`) anywhere other than Vercel production (`VERCEL_ENV`
= `production`): a local or preview build with a live key keeps the worker
Checkout button off and logs why. Retailer shift checkout is not gated by it.

Use **test-mode** values for QA. A live secret key outside production logs a
warning on the first Stripe call from the retailer flow; only the worker
signup flow is hard-blocked by it.

## 2. Database

Run, in order, in the Supabase dashboard → SQL Editor:

1. `supabase/migrations/0007_stripe_payments.sql` — membership columns,
   `shift_payments`, the `stripe_events` idempotency ledger. Until it is run,
   membership state cannot be read (the app fails closed) and the webhook
   returns 500.
2. `supabase/migrations/0008_grandfather_existing_workers.sql` — keeps the
   workers who joined before memberships existed: `active` with no expiry.
3. `supabase/migrations/0013_worker_signup_payments.sql` — the
   `worker_signup_payments` ledger for the one-time fee. Additive only.
   Until it is run, a paid signup still **activates** the worker (the
   membership columns are written first), but the payment is not recorded,
   the Super Admin shows that worker as "Complimentary" rather than paid, and
   the server log says so (`migration 0013 has not been applied`).
4. `supabase/migrations/0014_protect_worker_membership_columns.sql` — makes
   the membership and Stripe columns on `workers` writable only by the
   service role (see the note under §4). Then run
   `supabase/verification/0014_verify_membership_protection.sql`, which
   ends in `ROLLBACK` and prints PASS lines.
5. `supabase/migrations/0015_apply_for_shift_free_mode.sql` — adds the
   service-role-only, atomic application path used while worker access is
   free. Existing paid-mode application RLS remains unchanged.

### How a one-time payer is stored

`workers.membership_status = 'active'` with `membership_expires_at = NULL` and
no `stripe_subscription_id` — the same shape migration 0008 uses, so the
`membership_grants_access()` function and the RLS policies that call it are
unchanged. There is no period end and nothing to renew. The payment itself is
one `worker_signup_payments` row keyed by the Checkout session.

### Legacy $18/year subscribers

Untouched. Their `stripe_subscription_id`, period end and cancel flag stay on
the row and keep following `customer.subscription.*` / `invoice.*` events
exactly as before. Nothing cancels or modifies those subscriptions; they renew
or lapse in Stripe as they would have. If one of them later pays the one-time
fee (after cancelling, say), fulfillment sees the paid ledger row and no longer
lets that subscription's state downgrade their access.

## 3. Stripe Dashboard configuration

1. **Webhook endpoint** → `https://<your-domain>/api/stripe/webhook`, with:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.created` *(legacy subscribers)*
   - `customer.subscription.updated` *(legacy subscribers)*
   - `customer.subscription.deleted` *(legacy subscribers)*
   - `invoice.payment_failed` *(legacy subscribers)*
   - `invoice.payment_succeeded` *(legacy subscribers)*
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
   No new event types are needed for the one-time fee: the four
   `checkout.session.*` events already cover it.
2. **Signup price** — a one-time $1 USD price; put its id in
   `STRIPE_WORKER_MEMBERSHIP_PRICE_ID`.
3. **Customer portal** (Settings → Billing → Customer portal) — must be
   activated for "Manage membership" to work. Until it is, the button returns a
   friendly error and nothing else breaks.

## 4. How the one-time flow behaves

| Event | What happens |
| --- | --- |
| Worker clicks **Activate membership** | `startMembershipCheckout`: refuses if the kill-switch is off, if the worker already has access, or if a legacy yearly subscription is still live in Stripe (they are sent to the portal instead). Reuses the worker's still-open session if one exists, so two tabs cannot become two charges. Verifies once per process that the configured price is an active one-time USD $1 price and refuses otherwise. Then opens a `payment`-mode session (30-minute expiry) with the worker/auth ids in metadata and records a `pending` ledger row. |
| `checkout.session.completed`, `payment_status = paid` (or `no_payment_required` on a complete session — a 100% promotion code) | `applySignupCheckout`: sets `active` / no expiry on the worker, then upserts the ledger row as `paid`. Idempotent — a replay rewrites the same values and keeps the original `paid_at`. |
| `checkout.session.completed`, `payment_status = unpaid` | Delayed payment method. Nothing is activated; `async_payment_succeeded` comes back through the same code with `paid`. |
| `checkout.session.expired` / `async_payment_failed` | Ledger row marked `canceled` / `failed`. Membership untouched (it was never activated). |
| Duplicate delivery of any event | `stripe_events` claims the id first; a duplicate answers `200 {duplicate: true}` without doing the work again. A handler failure releases the claim so Stripe's retry gets another go. |
| Success URL `?checkout=success&session_id=…` | `syncMembership` re-reads that session from Stripe and runs the same `applySignupCheckout`, so a slow webhook does not leave the worker on "confirming…". The session's `worker_id` must match the signed-in worker. |
| Amount differs from `WORKER_SIGNUP_FEE` | Honoured (the worker really was charged) and logged as a warning — a promotion code can lower it legitimately. |
| Refund issued in the Stripe Dashboard | **Not handled** — access is not revoked automatically. Revoke by hand if needed. |

**Membership columns are server-owned (migration 0014).** Before 0014,
`workers` granted table-wide `update` to `authenticated` (migration 0001) and
nothing pinned the `membership_*` columns, so a worker with their own JWT
could have set `membership_status = 'active'` through PostgREST without
paying. 0014 restricts the API's UPDATE grant to the profile columns and adds
a trigger that pins the membership and Stripe columns for API roles. Run it
before enabling the checkout button, then run
`supabase/verification/0014_verify_membership_protection.sql`.

## 5. Remaining steps before enabling the button

1. Apply `0013_worker_signup_payments.sql` in Supabase (production).
2. In **test mode**, point `STRIPE_WORKER_MEMBERSHIP_PRICE_ID` at a one-time
   $1 test price, use an `sk_test_` secret key, set
   `WORKER_SIGNUP_CHECKOUT_ENABLED=true` and `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
   in `.env.local`, and run the QA list in §6.
3. Confirm the live `STRIPE_WORKER_MEMBERSHIP_PRICE_ID` in Vercel is the
   one-time price (not the old recurring one).
4. Add `WORKER_SIGNUP_CHECKOUT_ENABLED=true` to the Vercel **Production**
   environment and redeploy. No code change is needed to enable it; removing
   the variable (or setting it to anything else) turns the button off again
   on the next deploy.

## 6. Local QA

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook   # prints whsec_…
npm run dev
```

Test card `4242 4242 4242 4242`, any future expiry and CVC.

Worker:
1. Sign in as a worker with no membership → Dashboard and Available shifts show
   the locked state; Apply is not offered.
2. Pricing & Payments → **Activate membership** → Checkout shows a one-time
   $1.00 (no "per year").
3. Cancel → back on Pricing & Payments, still inactive, nothing charged.
4. Pay → "confirming…" → active; "Access until: No expiry"; Billing shows
   "$1 one-time signup fee · paid …". Available shifts and Apply now work.
5. Reload Pricing & Payments: no "Activate" button is offered any more.
6. Re-send the `checkout.session.completed` event from the Stripe dashboard:
   the response says `duplicate: true` and nothing changes.
7. Super Admin → Workers: the worker is "Paid · active", "No expiry", and the
   detail page shows the signup fee and date.

Legacy subscriber (one that already exists): `stripe trigger
customer.subscription.updated` / `invoice.payment_failed` /
`customer.subscription.deleted` and watch their membership state still follow
Stripe.

Retailer (unchanged):
1. Post a shift → shift is created as a **draft** and checkout opens.
2. Cancel → shift stays in *Awaiting payment*, invisible to workers.
3. Pay → webhook publishes it → a worker with an active membership sees it.
4. `/retailer/shifts/<id>/payment` shows the receipt with the amounts Stripe
   confirmed and the Stripe session / payment intent ids.
