import type { Metadata } from "next";
import { displayNameFor, requireWorker } from "@/lib/auth/session";
import {
  getAvailableShifts,
  getContactsForShifts,
  getWorkerApplications,
  summariseWorker,
} from "@/lib/data/worker";
import { getShiftReviewStates, getWorkerRating } from "@/lib/data/reviews";
import {
  Columns,
  EmptyState,
  ErrorState,
  Panel,
  Stack,
  StatCard,
  StatGrid,
  WelcomeBanner,
} from "@/components/ui/Kit";
import DashboardUserStrip from "@/components/dashboard/DashboardUserStrip";
import { RatingBadge } from "@/components/reviews/Stars";
import ShiftCard, { ShiftGrid } from "@/components/shifts/ShiftCard";
import { buttonClass } from "@/components/ui/buttonClass";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconSearch,
  IconSpark,
} from "@/components/dashboard/Icons";
import { firstNameOf, formatRelative, isPast } from "@/lib/format";
import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard | ShiftSupport for workers" };

export default async function WorkerDashboardPage() {
  const { user, profile, worker } = await requireWorker();

  const [{ shifts, error: shiftsError }, { applications, error: appsError }] =
    await Promise.all([getAvailableShifts(), getWorkerApplications(worker.id)]);

  const stats = summariseWorker(shifts, applications);
  const loadError = shiftsError ?? appsError;

  const upcomingHired = applications
    .filter((a) => a.status === "approved" && a.shifts && !isPast(a.shifts.end_time))
    .sort((a, b) =>
      (a.shifts?.start_time ?? "").localeCompare(b.shifts?.start_time ?? ""),
    );

  const contacts = await getContactsForShifts(
    upcomingHired.slice(0, 2).map((a) => a.shift_id),
  );

  const appliedShiftIds = new Set(applications.map((a) => a.shift_id));
  const suggestions = shifts
    .filter((shift) => !appliedShiftIds.has(shift.id))
    .slice(0, 4);

  const recentActivity = applications.slice(0, 5);

  // Their own rating, plus how many completed shifts are waiting on a review.
  const finishedShiftIds = applications
    .filter((a) => a.status === "approved" && a.shifts && isPast(a.shifts.end_time))
    .map((a) => a.shift_id);
  const [rating, reviewStates] = await Promise.all([
    getWorkerRating(worker.id),
    getShiftReviewStates(finishedShiftIds),
  ]);
  const reviewsToLeave = [...reviewStates.values()].filter((s) => s.can_review).length;

  return (
    <>
      <DashboardUserStrip
        name={displayNameFor({ profile, user })}
        role="Worker"
        dashboardHref="/worker/dashboard"
      />

      <WelcomeBanner
        badge="Worker dashboard"
        title={`Welcome back, ${firstNameOf(profile.full_name ?? worker.full_name)}`}
        text={
          upcomingHired.length > 0
            ? `You're hired for ${upcomingHired.length} upcoming shift${
                upcomingHired.length === 1 ? "" : "s"
              }. Everything you need is below.`
            : stats.available > 0
              ? `There ${stats.available === 1 ? "is" : "are"} ${stats.available} shift${
                  stats.available === 1 ? "" : "s"
                } open near you right now. Apply to the ones that fit your week.`
              : "No shifts are open right now, but retailers post new ones most days."
        }
        actions={[
          { href: "/worker/available-shifts", label: "Browse shifts", primary: true },
          { href: "/worker/my-shifts", label: "My applications" },
        ]}
      />

      {loadError ? (
        <Panel>
          <ErrorState text={`We couldn't load your shift data. ${loadError}`} />
        </Panel>
      ) : (
        <>
          <StatGrid>
            <StatCard
              label="Available shifts"
              value={stats.available}
              hint="Open near you right now"
              icon={<IconSearch width={17} height={17} />}
            />
            <StatCard
              label="Pending applications"
              value={stats.pending}
              hint="Waiting on a decision"
              icon={<IconClock width={17} height={17} />}
              tone="peach"
            />
            <StatCard
              label="Hired shifts"
              value={stats.hired}
              hint="Coming up"
              icon={<IconCheck width={17} height={17} />}
              tone="lime"
            />
            <StatCard
              label="Completed"
              value={stats.completed}
              hint="Shifts you've worked"
              icon={<IconCalendar width={17} height={17} />}
              tone="neutral"
            />
          </StatGrid>

          <div style={{ marginBottom: 18 }}>
            <Panel
              title="Your rating"
              description="What retailers said after the shifts you completed."
              action={{ href: "/worker/profile", label: "See all reviews" }}
            >
              <RatingBadge rating={rating} emptyLabel="New worker — no reviews yet" />
              {reviewsToLeave > 0 ? (
                <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
                  You have {reviewsToLeave} completed shift
                  {reviewsToLeave === 1 ? "" : "s"} you can review.{" "}
                  <a href="/worker/my-shifts?filter=completed">Rate the store</a>
                </p>
              ) : null}
            </Panel>
          </div>

          {upcomingHired.length > 0 ? (
            <div style={{ marginBottom: 18 }}>
              <Panel
                title="You're hired"
                description="Your next confirmed shifts, with the store's contact details."
                action={{ href: "/worker/my-shifts?filter=hired", label: "All hired shifts" }}
              >
                <ShiftGrid>
                  {upcomingHired.slice(0, 2).map((application) => (
                    <ShiftCard
                      key={application.id}
                      shift={application.shifts!}
                      storeName={application.shifts?.stores?.name ?? "A local store"}
                      storeAddress={application.shifts?.stores?.address}
                      badge={{ tone: "approved", label: "You're hired" }}
                      contact={contacts.get(application.shift_id) ?? null}
                    />
                  ))}
                </ShiftGrid>
              </Panel>
            </div>
          ) : null}

          <Columns>
            <Panel
              title="Shifts you might like"
              description="Open shifts you haven't applied for yet."
              action={{ href: "/worker/available-shifts", label: "See all" }}
              flush={suggestions.length === 0}
            >
              {suggestions.length === 0 ? (
                <EmptyState
                  icon={<IconSearch width={22} height={22} />}
                  title="No available shifts right now"
                  text="You've applied to everything that's open. New shifts get posted most days — we'll notify you when something changes."
                  action={
                    <a className={buttonClass("ghost")} href="/worker/my-shifts">
                      View my applications
                    </a>
                  }
                />
              ) : (
                <ShiftGrid>
                  {suggestions.map((shift) => (
                    <ShiftCard
                      key={shift.id}
                      shift={shift}
                      storeName={shift.stores?.name ?? "A local store"}
                      storeAddress={shift.stores?.address}
                      badge={{ tone: "open", label: "Open" }}
                      actions={
                        <a
                          className={buttonClass("primary", { small: true })}
                          href="/worker/available-shifts"
                        >
                          Apply
                        </a>
                      }
                    />
                  ))}
                </ShiftGrid>
              )}
            </Panel>

            <Stack>
              <Panel title="Quick actions" description="Get to the useful bits fast.">
                <div className={styles.quickActions}>
                  <a className={styles.quickAction} href="/worker/available-shifts">
                    <span className={styles.quickIcon}>
                      <IconSearch width={17} height={17} />
                    </span>
                    <span>
                      <span className={styles.quickTitle}>Browse available shifts</span>
                      <span className={styles.quickText}>
                        {stats.available} open right now
                      </span>
                    </span>
                  </a>

                  <a className={styles.quickAction} href="/worker/my-shifts?filter=pending">
                    <span className={styles.quickIcon}>
                      <IconClock width={17} height={17} />
                    </span>
                    <span>
                      <span className={styles.quickTitle}>Track applications</span>
                      <span className={styles.quickText}>
                        {stats.pending > 0
                          ? `${stats.pending} awaiting a decision`
                          : "Nothing pending"}
                      </span>
                    </span>
                  </a>

                  <a className={styles.quickAction} href="/worker/profile">
                    <span className={styles.quickIcon}>
                      <IconSpark width={17} height={17} />
                    </span>
                    <span>
                      <span className={styles.quickTitle}>Update your profile</span>
                      <span className={styles.quickText}>
                        Retailers see this when they hire you
                      </span>
                    </span>
                  </a>
                </div>
              </Panel>

              <Panel
                title="Recent activity"
                description="Your latest applications."
                action={{ href: "/worker/my-shifts", label: "See all" }}
                flush
              >
                {recentActivity.length === 0 ? (
                  <EmptyState
                    icon={<IconCalendar width={22} height={22} />}
                    title="You haven't applied for any shifts yet"
                    text="Once you apply, you'll be able to follow every application from here."
                  />
                ) : (
                  <ul className={styles.activityList}>
                    {recentActivity.map((application) => {
                      const hired = application.status === "approved";
                      const declined = application.status === "rejected";
                      return (
                        <li key={application.id} className={styles.activityRow}>
                          <span
                            className={`${styles.activityDot} ${
                              hired
                                ? styles.dotHired
                                : declined
                                  ? styles.dotDeclined
                                  : styles.dotPending
                            }`}
                          />
                          <span className={styles.activityBody}>
                            <span className={styles.activityTitle}>
                              {application.shifts?.task_type ?? "Shift"}
                            </span>
                            <span className={styles.activityMeta}>
                              {application.shifts?.stores?.name ?? "A local store"} ·{" "}
                              {hired
                                ? "You're hired"
                                : declined
                                  ? "Not selected"
                                  : "Pending"}{" "}
                              · {formatRelative(application.applied_at)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </Stack>
          </Columns>
        </>
      )}
    </>
  );
}
