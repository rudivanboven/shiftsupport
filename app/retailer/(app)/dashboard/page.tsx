import type { Metadata } from "next";
import { displayNameFor, requireRetailer } from "@/lib/auth/session";
import {
  countApplicationsByShift,
  getStoreApplications,
  getStoreShifts,
  isShiftPostingExpired,
  summariseShifts,
} from "@/lib/data/retailer";
import { getShiftReviewStates, getStoreRating } from "@/lib/data/reviews";
import { getSeriesForShifts } from "@/lib/data/series";
import {
  Badge,
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
import { RetailerShiftManagementActions } from "@/app/retailer/(app)/shifts/ShiftActions";
import { buttonClass } from "@/components/ui/buttonClass";
import { RETAILER_HOURLY_RATE } from "@/lib/pricing";
import {
  IconCalendar,
  IconCheck,
  IconPlus,
  IconSpark,
  IconStore,
  IconTrend,
  IconUsers,
} from "@/components/dashboard/Icons";
import { firstNameOf, formatRelative, initialsOf, isPast } from "@/lib/format";
import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard | ShiftSupport for retailers" };

export default async function RetailerDashboardPage() {
  const { user, profile, store } = await requireRetailer();

  const [{ shifts, error: shiftsError }, { applications, error: appsError }] =
    await Promise.all([getStoreShifts(store.id), getStoreApplications(store.id)]);

  const stats = summariseShifts(shifts, applications);
  const counts = countApplicationsByShift(applications);
  const recentShifts = shifts.slice(0, 4);
  const recentApplications = applications.slice(0, 5);
  const loadError = shiftsError ?? appsError;

  // Store rating, plus how many finished shifts still need the retailer.
  const finished = shifts.filter((s) => s.accepted_by && isPast(s.end_time));
  const [rating, reviewStates, seriesByShift] = await Promise.all([
    getStoreRating(store.id),
    getShiftReviewStates(finished.map((s) => s.id)),
    getSeriesForShifts(recentShifts.map((s) => s.id)),
  ]);
  const reviewsToLeave = [...reviewStates.values()].filter((s) => s.can_review).length;
  const awaitingCompletion = finished.filter((s) => s.status !== "completed").length;

  return (
    <>
      <DashboardUserStrip
        name={displayNameFor({ profile, user })}
        role="Retailer"
        dashboardHref="/retailer/dashboard"
      />

      <WelcomeBanner
        badge={store.name}
        title={`Welcome back, ${firstNameOf(profile.full_name)}`}
        text={
          stats.pendingApplications > 0
            ? `You have ${stats.pendingApplications} application${
                stats.pendingApplications === 1 ? "" : "s"
              } waiting for a decision. Review them and get your shifts covered.`
            : "Everything is up to date. Post a shift whenever you need an extra pair of hands."
        }
        actions={[
          { href: "/retailer/shifts/new", label: "Post a shift", primary: true },
          { href: "/retailer/applicants", label: "View applicants" },
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
              label="Active shifts"
              value={stats.activeShifts}
              hint="Upcoming and in progress"
              icon={<IconCalendar width={17} height={17} />}
            />
            <StatCard
              label="Open shifts"
              value={stats.openShifts}
              hint="Still taking applications"
              icon={<IconSpark width={17} height={17} />}
              tone="lime"
            />
            <StatCard
              label="Applications"
              value={stats.pendingApplications}
              hint="Awaiting your decision"
              icon={<IconUsers width={17} height={17} />}
              tone="peach"
            />
            <StatCard
              label="Filled shifts"
              value={stats.filledShifts}
              hint="A worker has been hired"
              icon={<IconCheck width={17} height={17} />}
              tone="neutral"
            />
          </StatGrid>

          <div style={{ marginBottom: 18 }}>
            <Panel
              title="Your store rating"
              description="What workers said after the shifts they completed for you."
              action={{ href: "/retailer/store", label: "See all reviews" }}
            >
              <RatingBadge
                rating={rating}
                noun="worker review"
                emptyLabel="New store — no worker reviews yet"
              />
              {awaitingCompletion > 0 || reviewsToLeave > 0 ? (
                <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)" }}>
                  {awaitingCompletion > 0
                    ? `${awaitingCompletion} finished shift${awaitingCompletion === 1 ? "" : "s"} still need confirming.`
                    : `You can review ${reviewsToLeave} completed shift${reviewsToLeave === 1 ? "" : "s"}.`}{" "}
                  <a href="/retailer/shifts?filter=past">Open past shifts</a>
                </p>
              ) : null}
            </Panel>
          </div>

          <Columns>
            <Stack>
              <Panel
                title="Recent shifts"
                description="The last shifts you posted."
                action={{ href: "/retailer/shifts", label: "All shifts" }}
                flush={recentShifts.length === 0}
              >
                {recentShifts.length === 0 ? (
                  <EmptyState
                    icon={<IconCalendar width={22} height={22} />}
                    title="No shifts posted yet"
                    text="Post your first shift and workers nearby will be able to apply straight away."
                    action={
                      <a className={buttonClass("primary")} href="/retailer/shifts/new">
                        <IconPlus width={16} height={16} />
                        Post a shift
                      </a>
                    }
                  />
                ) : (
                  <ShiftGrid>
                    {recentShifts.map((shift) => {
                      const expired = isShiftPostingExpired(shift);
                      const hidden = Boolean(shift.is_hidden);
                      const hired = Boolean(shift.accepted_by);
                      const cancelled = shift.status === "cancelled";
                      const renewed = Number(shift.renewal_count ?? 0) > 0;
                      const badge =
                        shift.status === "draft"
                          ? { tone: "neutral" as const, label: "Draft" }
                          : cancelled
                            ? { tone: "cancelled" as const, label: "Deleted / Archived" }
                            : shift.status === "completed"
                              ? { tone: "approved" as const, label: "Completed" }
                              : hidden
                                ? { tone: "pending" as const, label: "Hidden" }
                                : expired && !hired
                                  ? { tone: "pending" as const, label: "Expired" }
                                  : hired
                                    ? { tone: "filled" as const, label: "Filled" }
                                    : renewed
                                      ? { tone: "open" as const, label: "Active · Renewed" }
                                      : { tone: "open" as const, label: "Active" };

                      return (
                        <ShiftCard
                          key={shift.id}
                          shift={shift}
                          storeAddress={store.address}
                          applicantCount={counts.get(shift.id) ?? { pending: 0, total: 0 }}
                          series={seriesByShift.get(shift.id)}
                          accent={
                            cancelled || hidden || (expired && !hired)
                              ? "muted"
                              : hired
                                ? "peach"
                                : "green"
                          }
                          badge={badge}
                          footer={
                            <div style={{ padding: "0 20px 18px" }}>
                              <RetailerShiftManagementActions
                                shift={{
                                  id: shift.id,
                                  storeName: store.name,
                                  taskType: shift.task_type,
                                  description: shift.description,
                                  shiftLocation: shift.shift_location ?? store.address ?? "",
                                  startTime: shift.start_time,
                                  endTime: shift.end_time,
                                  duration: shift.duration,
                                  hourlyRate: shift.hourly_rate ?? RETAILER_HOURLY_RATE,
                                  status: shift.status,
                                  isHidden: hidden,
                                  postingExpiresAt: shift.posting_expires_at ?? null,
                                  renewedAt: shift.renewed_at ?? null,
                                  renewalCount: Number(shift.renewal_count ?? 0),
                                  isExpired: expired,
                                  hasHiredWorker: hired,
                                  isPaid: shift.payment_status === "paid",
                                }}
                              />
                            </div>
                          }
                          actions={
                            <a
                              className={buttonClass("ghost", { small: true })}
                              href={`/retailer/applicants?shift=${shift.id}`}
                            >
                              View applicants
                            </a>
                          }
                        />
                      );
                    })}
                  </ShiftGrid>
                )}
              </Panel>
            </Stack>

            <Stack>
              <Panel
                title="Quick actions"
                description="The things you'll do most often."
              >
                <div className={styles.quickActions}>
                  <a className={styles.quickAction} href="/retailer/shifts/new">
                    <span className={styles.quickIcon}>
                      <IconPlus width={17} height={17} />
                    </span>
                    <span>
                      <span className={styles.quickTitle}>Post a shift</span>
                      <span className={styles.quickText}>
                        Takes about a minute
                      </span>
                    </span>
                  </a>

                  <a className={styles.quickAction} href="/retailer/applicants">
                    <span className={styles.quickIcon}>
                      <IconUsers width={17} height={17} />
                    </span>
                    <span>
                      <span className={styles.quickTitle}>View applicants</span>
                      <span className={styles.quickText}>
                        {stats.pendingApplications > 0
                          ? `${stats.pendingApplications} waiting for a decision`
                          : "Nothing waiting right now"}
                      </span>
                    </span>
                  </a>

                  <a className={styles.quickAction} href="/retailer/store">
                    <span className={styles.quickIcon}>
                      <IconStore width={17} height={17} />
                    </span>
                    <span>
                      <span className={styles.quickTitle}>Manage store</span>
                      <span className={styles.quickText}>
                        Address and contact details
                      </span>
                    </span>
                  </a>
                </div>
              </Panel>

              <Panel
                title="Recent applications"
                description="Who applied most recently."
                action={{ href: "/retailer/applicants", label: "See all" }}
                flush
              >
                {recentApplications.length === 0 ? (
                  <EmptyState
                    icon={<IconUsers width={22} height={22} />}
                    title="No applicants yet"
                    text="As soon as a worker applies to one of your shifts, they'll show up here."
                  />
                ) : (
                  <ul className={styles.appList}>
                    {recentApplications.map((application) => (
                      <li key={application.id} className={styles.appRow}>
                        <span className={styles.appAvatar}>
                          {initialsOf(application.workers?.full_name)}
                        </span>
                        <span className={styles.appBody}>
                          <span className={styles.appName}>
                            {application.workers?.full_name ?? "Worker"}
                          </span>
                          <span className={styles.appMeta}>
                            {application.shifts?.task_type ?? "Shift"} ·{" "}
                            {formatRelative(application.applied_at)}
                          </span>
                        </span>
                        <Badge
                          tone={
                            application.status === "approved"
                              ? "approved"
                              : application.status === "rejected"
                                ? "rejected"
                                : "pending"
                          }
                        >
                          {application.status === "approved"
                            ? "Hired"
                            : application.status === "rejected"
                              ? "Declined"
                              : "Pending"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Your store" description="How workers see you.">
                <div className={styles.storeCard}>
                  <span className={styles.storeIcon}>
                    <IconStore width={19} height={19} />
                  </span>
                  <div>
                    <p className={styles.storeName}>{store.name}</p>
                    <p className={styles.storeAddress}>
                      {store.address ?? "No address added yet"}
                    </p>
                  </div>
                </div>
                <p className={styles.storeNote}>
                  <IconTrend
                    width={14}
                    height={14}
                    style={{ verticalAlign: "-2px", marginRight: 6 }}
                  />
                  Your contact phone stays private until you hire someone.
                </p>
              </Panel>
            </Stack>
          </Columns>
        </>
      )}
    </>
  );
}
