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
  MEMBERSHIP_MONTHS,
  PLATFORM_HOURLY_PORTION,
  RETAILER_HOURLY_RATE,
  WORKER_ANNUAL_MEMBERSHIP,
  WORKER_HOURLY_RATE,
  priceShift,
} from "@/lib/pricing";
import styles from "./PricingPayments.module.css";

/**
 * The one place a signed-in user can read the whole fee and payment picture.
 *
 * Every amount on this page comes from `lib/pricing` — the same module the
 * post-shift form and the server action price a real shift with — so the
 * explanation here can never drift away from what is actually charged.
 *
 * Public marketing pages deliberately carry none of these numbers; this
 * component is only ever rendered behind `requireWorker` / `requireRetailer`.
 */

/** The worked example both roles see, priced with the real calculation. */
const EXAMPLE_HOURS = 5;
const example = priceShift(EXAMPLE_HOURS);

const WORKER_FLOW = [
  ["Membership", "An active membership is what opens up shift opportunities."],
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
  ["Shift record", "The completed shift keeps a full summary of the amounts involved."],
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

/** The platform portion is described as what it supports — never as a tax. */
const PLATFORM_PORTION_COPY =
  "The ShiftSupport platform portion supports applicable employment-related administration, insurance, compliance, payroll-related operations and platform services.";

/** The membership panel: what Stripe says, and what to do about it. */
function MembershipPanel({
  membership,
  checkout,
}: {
  membership: Membership;
  checkout?: "success" | "canceled" | null;
}) {
  // A just-returned checkout that the database has not confirmed yet. The URL
  // is only a hint that something may have happened — never a confirmation.
  const confirming = checkout === "success" && !membership.active;

  const tone = membership.active
    ? membership.status === "past_due"
      ? "pending"
      : "approved"
    : confirming
      ? "pending"
      : "neutral";

  const label = confirming
    ? "Confirming…"
    : membership.active
      ? membership.status === "past_due"
        ? "Payment due"
        : "Active"
      : membership.status === "canceled"
        ? "Ended"
        : "Not active";

  const expiryLabel =
    membership.cancelAtPeriodEnd || membership.status === "canceled"
      ? "Access until"
      : "Renews on";

  return (
    <Panel
      title="Your membership"
      description="Membership state comes from Stripe — it updates here as soon as a payment is confirmed."
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
          ) : checkout === "canceled" ? (
            <p className={styles.membershipNote}>
              Checkout was cancelled, so no membership was started and nothing was
              charged. You can start it again whenever you are ready.
            </p>
          ) : membership.active ? (
            <p className={styles.membershipNote}>
              {membership.status === "past_due"
                ? "Stripe could not take your latest payment. Update your card to keep your access."
                : "Your membership is active, so eligible shift opportunities are open to you."}
            </p>
          ) : (
            <p className={styles.membershipNote}>
              Activate your membership to access eligible shift opportunities and apply
              for local shifts.
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
            <dd>{membership.expiresAt ? formatDate(membership.expiresAt) : "—"}</dd>
          </div>
          <div>
            <dt>Renewal</dt>
            <dd>
              {membership.cancelAtPeriodEnd
                ? "Cancels at period end"
                : membership.active
                  ? "Renews yearly"
                  : "—"}
            </dd>
          </div>
        </dl>

        <div className={styles.membershipActions}>
          <MembershipActions
            hasMembership={membership.status !== "inactive"}
            startLabel={
              membership.active
                ? "Update membership"
                : membership.status === "canceled"
                  ? "Renew membership"
                  : "Activate membership"
            }
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

  return (
    <>
      <PageHeader
        eyebrow="Pricing & payments"
        title={isWorker ? "Your membership and pay" : "Your shift costs, explained"}
        description={
          isWorker
            ? "Everything a ShiftSupport worker pays for, and everything a completed shift pays out. These details are only shown to signed-in members."
            : "What a ShiftSupport shift costs, how that cost is calculated, and where it goes. These details are only shown to signed-in retailers."
        }
      />

      <div className={styles.stack}>
        {isWorker ? (
          <>
            {membership ? (
              <MembershipPanel membership={membership} checkout={checkout} />
            ) : null}

            <section className={styles.cardGrid}>
              <PriceCard
                tone="dark"
                icon={<IconUser width={18} height={18} />}
                eyebrow="Worker membership"
                amount={formatMoney(WORKER_ANNUAL_MEMBERSHIP)}
                unit="/ year"
                title="One membership, twelve months of access"
                points={[
                  `Worker membership is valid for ${MEMBERSHIP_MONTHS} months.`,
                  "An active membership provides access to eligible shift opportunities.",
                  "Membership renewal is required once the membership period expires.",
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
                  "Applicable payroll deductions are handled through the ShiftSupport employment model.",
                ]}
              />
            </section>

            <Panel
              title="How it works, start to finish"
              description="From an active membership through to the record of a completed shift."
            >
              <FlowSteps steps={WORKER_FLOW} />
            </Panel>

            <Panel
              title="A worked example"
              description={`What a ${EXAMPLE_HOURS}-hour shift looks like for you.`}
            >
              <div className={styles.exampleGrid}>
                <div className={styles.breakdown}>
                  <BreakdownRow label="Shift duration" value={`${EXAMPLE_HOURS} hours`} />
                  <BreakdownRow
                    label="Worker gross rate"
                    value={`${formatMoney(WORKER_HOURLY_RATE)}/hour`}
                  />
                  <BreakdownRow
                    label="Worker gross"
                    detail={`${EXAMPLE_HOURS} × ${formatMoney(WORKER_HOURLY_RATE)}`}
                    value={formatMoney(example.workerGross)}
                    strong
                  />
                </div>
                <p className={styles.exampleNote}>
                  Gross pay is always the hours you worked multiplied by the worker gross
                  rate. The shift you are hired for shows its own duration, so you can see
                  what a shift is worth before you apply.
                </p>
              </div>
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

                <div className={styles.splitGrid}>
                  <article className={styles.splitCard}>
                    <span>Worker gross</span>
                    <small>
                      {EXAMPLE_HOURS} × {formatMoney(WORKER_HOURLY_RATE)}
                    </small>
                    <strong>{formatMoney(example.workerGross)}</strong>
                    <p>The worker&apos;s gross hourly amount for the completed shift.</p>
                  </article>
                  <article className={styles.splitCard}>
                    <span>ShiftSupport platform portion</span>
                    <small>
                      {EXAMPLE_HOURS} × {formatMoney(PLATFORM_HOURLY_PORTION)}
                    </small>
                    <strong>{formatMoney(example.platformPortion)}</strong>
                    <p>{PLATFORM_PORTION_COPY}</p>
                  </article>
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
                <div>
                  <dt>Retailer rate</dt>
                  <dd>{formatMoney(RETAILER_HOURLY_RATE)}/hour</dd>
                </div>
                <div className={styles.receiptTotal}>
                  <dt>Total retailer amount</dt>
                  <dd>{formatMoney(example.retailerTotal)}</dd>
                </div>
                <div>
                  <dt>Worker gross</dt>
                  <dd>{formatMoney(example.workerGross)}</dd>
                </div>
                <div>
                  <dt>ShiftSupport platform portion</dt>
                  <dd>{formatMoney(example.platformPortion)}</dd>
                </div>
              </dl>
              <p className={styles.receiptNote}>
                Illustrative example based on a {EXAMPLE_HOURS}-hour shift — not a real
                transaction.
              </p>
            </article>

            <div className={styles.summaryCopy}>
              <p>
                A completed shift can provide a clear summary of the shift and the payment
                information that goes with it: how long the shift ran, the rate it was
                priced at, the total retailer amount, the worker gross amount and the
                ShiftSupport platform portion.
              </p>
              <p>{PLATFORM_PORTION_COPY}</p>
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
