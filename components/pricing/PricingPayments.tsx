import type { ReactNode } from "react";

import { Badge, PageHeader, Panel } from "@/components/ui/Kit";
import { ConfirmingPoller, MembershipActions } from "./MembershipActions";
import type { Membership } from "@/lib/membership";
import {
  IconArrow,
  IconCalendar,
  IconCash,
  IconCheck,
  IconSearch,
  IconStore,
  IconUser,
} from "@/components/dashboard/Icons";
import { formatDate, formatMoney } from "@/lib/format";
import {
  RETAILER_HOURLY_RATE,
  WORKER_HOURLY_RATE,
  WORKER_SIGNUP_CHECKOUT_UNAVAILABLE,
  WORKER_SIGNUP_FEE,
  priceShift,
} from "@/lib/pricing";
import { isWorkerSignupCheckoutEnabled, isWorkerSignupFreeMode } from "@/lib/signup-checkout";
import styles from "./PricingPayments.module.css";

/**
 * The signed-in pricing and payment overview for workers and retailers.
 *
 * Every amount on this page comes from `lib/pricing` — the same module the
 * post-shift form and the server action price a real shift with — so the
 * explanation here can never drift away from what is actually charged or earned.
 *
 * Public marketing pages deliberately carry none of these numbers; this
 * component is only ever rendered behind `requireWorker` / `requireRetailer`.
 */

/** The worked example both roles see, priced with the real calculation. */
const EXAMPLE_HOURS = 5;
const example = priceShift(EXAMPLE_HOURS);

const workerFlow = (freeMode: boolean) => [
  ["Join", freeMode
    ? "Create your worker account and access eligible shift opportunities without a membership payment while free access is enabled."
    : `Pay a one-time ${formatMoney(WORKER_SIGNUP_FEE)} signup fee to activate membership and open shift access.`],
  ["Access shifts", "Browse the shifts you are eligible for from Available Shifts."],
  ["Apply", "Apply to the shifts that fit your schedule."],
  ["Get hired", "The retailer reviews applicants and confirms who they want."],
  ["Complete the shift", "Work the shift and confirm it once it is done."],
  ["Shift record", "Your completed shift keeps a record of the hours and gross pay."],
  ] as const;

const RETAILER_FLOW = [
  ["Create a shift", "Set the date, hours, location and tasks in Post a Shift."],
  ["See the estimate", "The estimated cost updates from the shift duration as you fill it in."],
  ["Complete checkout", "Payment is completed before the shift is published."],
  ["Shift published", "Eligible local workers can see and apply for the shift."],
  ["Hire and complete", "Pick your worker, and the shift is confirmed once it is worked."],
  ["Shift record", "The completed shift keeps a summary of the shift and payment."],
] as const;

function FlowSteps({ steps }: { steps: readonly (readonly [string, string])[] }) {
  return (
    <ol className={styles.flow}>
      {steps.map(([title, text], index) => (
        <li key={title}>
          <span className={styles.flowNumber}>{String(index + 1).padStart(2, "0")}</span>
          <span>
            <strong>{title}</strong>
            <small>{text}</small>
          </span>
          {index < steps.length - 1 ? (
            <span className={styles.flowArrow} aria-hidden="true">
              <IconArrow width={15} height={15} />
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function PriceCard({
  eyebrow,
  amount,
  unit,
  title,
  points,
  tone = "light",
  icon,
}: {
  eyebrow: string;
  amount: string;
  unit?: string;
  title: string;
  points: string[];
  tone?: "light" | "dark";
  icon: ReactNode;
}) {
  return (
    <article className={`${styles.priceCard} ${tone === "dark" ? styles.priceCardDark : ""}`}>
      <div className={styles.priceTop}>
        <span className={styles.priceIcon}>{icon}</span>
        <span className={styles.priceEyebrow}>{eyebrow}</span>
      </div>
      <p className={styles.priceAmount}>
        {amount}
        {unit ? <span>{unit}</span> : null}
      </p>
      <h3 className={styles.priceTitle}>{title}</h3>
      <ul className={styles.priceList}>
        {points.map((point) => (
          <li key={point}>
            <IconCheck width={15} height={15} />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function BreakdownRow({
  label,
  detail,
  value,
  strong = false,
}: {
  label: string;
  detail?: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`${styles.breakdownRow} ${strong ? styles.breakdownRowTotal : ""}`}>
      <span>
        {label}
        {detail ? <small>{detail}</small> : null}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

/** The membership panel: what Stripe says, and what to do about it. */
function MembershipPanel({
  membership,
  checkout,
  freeMode,
}: {
  membership: Membership;
  checkout?: "success" | "canceled" | null;
  freeMode: boolean;
}) {
  // A just-returned checkout that the database has not confirmed yet. The URL
  // is only a hint that something may have happened — never a confirmation.
  const confirming = !freeMode && checkout === "success" && !membership.active;

  const tone = freeMode
    ? "approved"
    : membership.active
    ? membership.status === "past_due"
      ? "pending"
      : "approved"
    : confirming
      ? "pending"
      : "neutral";

  const label = freeMode
    ? "Free access"
    : confirming
    ? "Confirming…"
    : membership.active
      ? membership.status === "past_due"
        ? "Payment due"
        : "Active"
      : membership.status === "canceled"
        ? "Ended"
        : "Not active";

  // Neutral wording on purpose: a membership started under the old recurring
  // plan still has a Stripe period end, a complimentary one has none, and the
  // new one-time signup fee has no renewal — so the date is only ever "access
  // until", never "renews on".
  const expiryLabel = "Access until";

  const paidSignup = membership.signupPaidAt
    ? `${freeMode ? "Previously paid " : ""}${formatMoney((membership.signupFeeCents ?? WORKER_SIGNUP_FEE * 100) / 100)} one-time signup fee · paid ${formatDate(membership.signupPaidAt)}`
    : null;

  // A membership started under the old yearly plan, still on its Stripe
  // subscription: `expiresAt` is that subscription's period end.
  const legacySubscription = !paidSignup && Boolean(membership.expiresAt);

  const billingLabel = paidSignup
    ? paidSignup
    : freeMode
      ? legacySubscription
        ? membership.status === "past_due"
          ? "Existing yearly subscription needs attention; free access remains enabled temporarily"
          : membership.cancelAtPeriodEnd
            ? "Existing yearly subscription remains scheduled to cancel; free access is temporary"
            : "Existing yearly subscription remains managed in Stripe; free access is temporary"
        : "No membership payment required while free access is enabled"
      : membership.cancelAtPeriodEnd
        ? "Cancels at period end"
        : membership.status === "past_due"
          ? "Payment due — update your card below"
          : membership.active
            ? legacySubscription
              ? "Existing yearly membership — renews automatically unless cancelled below"
              : "Complimentary · no charge"
            : legacySubscription
              ? "Existing yearly membership — manage it below"
              : `${formatMoney(WORKER_SIGNUP_FEE)} one-time signup fee`;

  // The one-time Checkout is only for a worker with no access and no yearly
  // subscription still in play. A past-due or lapsed legacy subscriber goes
  // to the billing portal instead: paying the fee on top of a subscription
  // Stripe is still trying to collect would bill them twice. The server
  // action enforces the same rule.
  const offerCheckout =
    !membership.active && membership.status !== "past_due" && !legacySubscription;

  return (
    <Panel
      title="Your membership"
      description={freeMode
        ? "Worker access is temporarily free. Existing membership and payment records are preserved."
        : "Membership state comes from Stripe — it updates here as soon as a payment is confirmed."}
    >
      <div className={styles.membership}>
        <div className={styles.membershipState}>
          <Badge tone={tone}>{label}</Badge>

          {confirming ? (
            <>
              <p className={styles.membershipNote}>
                Payment received — we&apos;re confirming it with Stripe. This page updates
                itself; it usually takes a few seconds.
              </p>
              <ConfirmingPoller />
            </>
          ) : checkout === "canceled" && !freeMode ? (
            <p className={styles.membershipNote}>
              Checkout was cancelled, so no membership was started and nothing was
              charged. You can start it again whenever you are ready.
            </p>
          ) : membership.active ? (
            <p className={styles.membershipNote}>
              {freeMode
                ? "Worker access is temporarily free. Any existing subscription remains available to manage below."
                : membership.status === "past_due"
                ? "Stripe could not take your latest payment. Update your card to keep your access."
                : "Your membership is active, so eligible shift opportunities are open to you."}
            </p>
          ) : (
            <p className={styles.membershipNote}>
              {freeMode
                ? "Worker access is temporarily free. You can browse available shifts and apply without paying a membership fee."
                : `Activate your membership to access eligible shift opportunities and apply for local shifts. It is a one-time ${formatMoney(WORKER_SIGNUP_FEE)} signup fee — there is no yearly membership fee.`}
            </p>
          )}
        </div>

        <dl className={styles.membershipFacts}>
          <div>
            <dt>Started</dt>
            <dd>{membership.startedAt ? formatDate(membership.startedAt) : "—"}</dd>
          </div>
          <div>
            <dt>{expiryLabel}</dt>
            <dd>
              {freeMode
                ? "While free access is enabled"
                : membership.expiresAt
                ? formatDate(membership.expiresAt)
                : membership.active
                  ? "No expiry"
                  : "—"}
            </dd>
          </div>
          <div>
            <dt>Billing</dt>
            <dd>{billingLabel}</dd>
          </div>
        </dl>

        <div className={styles.membershipActions}>
          <MembershipActions
            hasMembership={membership.status !== "inactive"}
            // An active membership has nothing left to buy: the signup fee is
            // paid once, so the Checkout button is only for workers without
            // access — and without a yearly subscription still in play.
            showStart={offerCheckout}
            startLabel={
              membership.status === "canceled" ? "Reactivate membership" : "Activate membership"
            }
            // Decided on the server and handed to the client button as a
            // boolean; the environment it reads never leaves the server.
            checkoutAvailable={isWorkerSignupCheckoutEnabled()}
            unavailableMessage={WORKER_SIGNUP_CHECKOUT_UNAVAILABLE}
          />
        </div>
      </div>
    </Panel>
  );
}

export default function PricingPayments({
  role,
  membership,
  checkout,
}: {
  role: "worker" | "retailer";
  /** Worker only — the signed-in worker's membership state. */
  membership?: Membership | null;
  /** Worker only — where the browser has just come back from. */
  checkout?: "success" | "canceled" | null;
}) {
  const isWorker = role === "worker";
  const freeMode = isWorker && isWorkerSignupFreeMode();

  return (
    <>
      <PageHeader
        eyebrow="Pricing & payments"
        title={isWorker ? "Your membership and pay" : "Your shift costs, explained"}
        description={
          isWorker
            ? freeMode
              ? "Worker membership access is temporarily free. Review your shift pay and any historical payment records here."
              : "Everything a ShiftSupport worker pays for, and everything a completed shift pays out. These details are only shown to signed-in members."
            : "What a ShiftSupport shift costs and how that cost is calculated. These details are only shown to signed-in retailers."
        }
      />

      <div className={styles.stack}>
        {isWorker ? (
          <>
            {membership ? (
              <MembershipPanel membership={membership} checkout={checkout} freeMode={freeMode} />
            ) : null}

            <section className={styles.cardGrid}>
              <PriceCard
                tone="dark"
                icon={<IconUser width={18} height={18} />}
                eyebrow={freeMode ? "Worker access" : "Worker signup fee"}
                amount={freeMode ? "Free" : formatMoney(WORKER_SIGNUP_FEE)}
                unit={freeMode ? "temporarily" : "one-time"}
                title={freeMode ? "Free access to ShiftSupport" : "Pay once to join ShiftSupport"}
                points={freeMode
                  ? [
                      "No membership payment is required while free access is enabled.",
                      "Browse eligible shifts and apply for local work.",
                      "Existing membership and payment records are preserved.",
                    ]
                  : [
                      `A ${formatMoney(WORKER_SIGNUP_FEE)} one-time signup fee — no recurring signup fee.`,
                      "An active membership provides access to eligible shift opportunities.",
                      "There is no yearly membership fee to renew.",
                    ]}
              />
              <PriceCard
                icon={<IconCash width={18} height={18} />}
                eyebrow="Worker gross rate"
                amount={formatMoney(WORKER_HOURLY_RATE)}
                unit="/ hour"
                title="Your gross hourly amount for completed work"
                points={[
                  `${formatMoney(WORKER_HOURLY_RATE)} per hour is the worker gross hourly amount for completed work.`,
                  "Gross pay for a shift is the shift duration multiplied by this rate.",
                ]}
              />
            </section>

            <Panel
              title="How it works, start to finish"
              description="From an active membership through to the record of a completed shift."
            >
              <FlowSteps steps={workerFlow(freeMode)} />
            </Panel>
          </>
        ) : (
          <>
            <section className={styles.cardGrid}>
              <PriceCard
                icon={<IconStore width={18} height={18} />}
                eyebrow="Retailer account"
                amount="Free"
                unit="to create"
                title="No membership, no subscription"
                points={[
                  "Creating a ShiftSupport retailer account is free.",
                  "Add your store and prepare shifts at no cost.",
                  "You only pay for the shifts you publish.",
                ]}
              />
              <PriceCard
                tone="dark"
                icon={<IconCash width={18} height={18} />}
                eyebrow="Shift rate"
                amount={formatMoney(RETAILER_HOURLY_RATE)}
                unit="/ hour"
                title="One fixed rate for every shift"
                points={[
                  `The fixed retailer rate is ${formatMoney(RETAILER_HOURLY_RATE)}/hour.`,
                  "Shift cost is calculated from the shift duration.",
                  "Payment is required before the shift is published.",
                ]}
              />
            </section>

            <Panel
              title={`Example: a ${EXAMPLE_HOURS}-hour shift`}
              description="The same calculation Post a Shift uses for your estimated cost."
            >
              <div className={styles.exampleGrid}>
                <div className={styles.breakdown}>
                  <BreakdownRow label="Shift duration" value={`${EXAMPLE_HOURS} hours`} />
                  <BreakdownRow
                    label="Retailer rate"
                    value={`${formatMoney(RETAILER_HOURLY_RATE)}/hour`}
                  />
                  <BreakdownRow
                    label="Total retailer amount"
                    detail={`${EXAMPLE_HOURS} × ${formatMoney(RETAILER_HOURLY_RATE)}`}
                    value={formatMoney(example.retailerTotal)}
                    strong
                  />
                </div>
              </div>
            </Panel>

            <Panel
              title="How a shift is paid for"
              description="From creating the shift through to the completed-shift record."
            >
              <FlowSteps steps={RETAILER_FLOW} />
            </Panel>
          </>
        )}

        <Panel
          title="Completed shift summary"
          description="What the record of a completed shift shows."
        >
          <div className={styles.summaryGrid}>
            <article className={styles.receipt}>
              <div className={styles.receiptHead}>
                <span className={styles.receiptLabel}>Shift summary</span>
                <span className={styles.receiptBadge}>
                  <IconCheck width={13} height={13} /> Completed
                </span>
              </div>
              <dl className={styles.receiptList}>
                <div>
                  <dt>Shift duration</dt>
                  <dd>{EXAMPLE_HOURS} hours</dd>
                </div>
                {isWorker ? (
                  <div>
                    <dt>Worker gross rate</dt>
                    <dd>{formatMoney(WORKER_HOURLY_RATE)}/hour</dd>
                  </div>
                ) : (
                  <>
                    <div>
                      <dt>Retailer rate</dt>
                      <dd>{formatMoney(RETAILER_HOURLY_RATE)}/hour</dd>
                    </div>
                    <div className={styles.receiptTotal}>
                      <dt>Total retailer amount</dt>
                      <dd>{formatMoney(example.retailerTotal)}</dd>
                    </div>
                  </>
                )}
              </dl>
              <p className={styles.receiptNote}>
                Illustrative example based on a {EXAMPLE_HOURS}-hour shift — not a real
                transaction.
              </p>
            </article>

            <div className={styles.summaryCopy}>
              <p>
                {isWorker
                  ? "A completed shift records how long the shift ran, your gross rate and your gross earnings."
                  : "A completed shift records how long the shift ran, your retailer rate and the total amount paid."}
              </p>
              <ul className={styles.summaryPoints}>
                <li>
                  <IconCalendar width={15} height={15} />
                  <span>Every shift is priced from its own duration.</span>
                </li>
                <li>
                  <IconSearch width={15} height={15} />
                  <span>
                    {isWorker
                      ? "Shift details show the hours before you apply."
                      : "Your estimated cost is shown while you build the shift."}
                  </span>
                </li>
                <li>
                  <IconCheck width={15} height={15} />
                  <span>Completed shifts keep the record for both sides.</span>
                </li>
              </ul>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
