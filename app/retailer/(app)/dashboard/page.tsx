import type { Metadata } from "next";
import { requireRetailer } from "@/lib/auth/session";
import {
  countApplicationsByShift,
  getStoreApplications,
  getStoreShifts,
  summariseShifts,
} from "@/lib/data/retailer";
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
import ShiftCard, { ShiftGrid } from "@/components/shifts/ShiftCard";
import { buttonClass } from "@/components/ui/buttonClass";
import {
  IconCalendar,
  IconCheck,
  IconPlus,
  IconSpark,
  IconStore,
  IconTrend,
  IconUsers,
} from "@/components/dashboard/Icons";
import { firstNameOf, formatRelative, initialsOf } from "@/lib/format";
import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard | ShiftSupport for retailers" };

export default async function RetailerDashboardPage() {
  const { profile, store } = await requireRetailer();

  const [{ shifts, error: shiftsError }, { applications, error: appsError }] =
    await Promise.all([getStoreShifts(store.id), getStoreApplications(store.id)]);

  const stats = summariseShifts(shifts, applications);
  const counts = countApplicationsByShift(applications);
  const recentShifts = shifts.slice(0, 4);
  const recentApplications = applications.slice(0, 5);
  const loadError = shiftsError ?? appsError;

  return (
    <>
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
                    {recentShifts.map((shift) => (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        storeAddress={store.address}
                        applicantCount={counts.get(shift.id) ?? { pending: 0, total: 0 }}
                        accent={shift.status === "open" ? "green" : "muted"}
                        actions={
                          <a
                            className={buttonClass("ghost", { small: true })}
                            href={`/retailer/applicants?shift=${shift.id}`}
                          >
                            View applicants
                          </a>
                        }
                      />
                    ))}
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
