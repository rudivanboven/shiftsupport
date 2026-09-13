# Stripe payments

Two payment flows, both hosted by Stripe Checkout:

| Who | What | Mode | Amount |
| --- | --- | --- | --- |
| Worker | Annual membership | `subscription` | `STRIPE_WORKER_MEMBERSHIP_PRICE_ID` ($18/year) |
| Retailer | One shift | `payment` | duration × $28/hour, recomputed server-side |

Nothing in the app marks anything as paid. Membership activation and shift
publication happen only from Stripe-verified state — the signed webhook, or a
server-side re-read of the Checkout session. A redirect back to a success URL
proves nothing and is never treated as proof.

## 1. Environment

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...              # server only, never NEXT_PUBLIC_
STRIPE_WORKER_MEMBERSHIP_PRICE_ID=price_...  # a recurring yearly price, $18
STRIPE_WEBHOOK_SECRET=whsec_...            # from the endpoint or `stripe listen`
```

Use **test-mode** values for QA. A live secret key outside production logs a
warning on the first Stripe call; it is not blocked, because which mode to run
in is an operational decision.

## 2. Database

Run `supabase/migrations/0007_stripe_payments.sql` (Supabase dashboard → SQL
Editor). Until it is run, membership state cannot be read — the app fails
closed, so every worker sees the locked marketplace state — and the webhook
returns 500 because the `stripe_events` ledger does not exist.

Then run `supabase/migrations/0008_grandfather_existing_workers.sql`, which
keeps the workers who joined before memberships existed: they become `active`
with no expiry, while anyone who signs up from 2026-09-12 onwards subscribes
normally.

## 3. Stripe Dashboard configuration

1. **Webhook endpoint** → `https://<your-domain>/api/stripe/webhook`, with:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
2. **Membership price** — a recurring yearly $18 USD price; put its id in
   `STRIPE_WORKER_MEMBERSHIP_PRICE_ID`.
3. **Customer portal** (Settings → Billing → Customer portal) — must be
   activated for "Manage membership" to work. Until it is, the button returns a
   friendly error and nothing else breaks.

## 4. Local QA

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook   # prints whsec_…
npm run dev
```

Test card `4242 4242 4242 4242`, any future expiry and CVC.

Worker:
1. Sign in as a worker with no membership → Dashboard and Available shifts show
   the locked state; Apply is not offered.
2. Pricing & Payments → **Activate membership** → Checkout.
3. Cancel → back on Pricing & Payments, still inactive, nothing charged.
4. Pay → "confirming…" → active; Available shifts and Apply now work.
5. `stripe trigger customer.subscription.updated` /
   `invoice.payment_failed` / `customer.subscription.deleted` and watch the
   membership state follow Stripe.
6. Re-send any event from the Stripe dashboard: the response says
   `duplicate: true` and nothing changes.

Retailer:
1. Post a shift → shift is created as a **draft** and checkout opens.
2. Cancel → shift stays in *Awaiting payment*, invisible to workers.
3. Pay → webhook publishes it → a worker with an active membership sees it.
4. `/retailer/shifts/<id>/payment` shows the receipt with the amounts Stripe
   confirmed and the Stripe session / payment intent ids.
