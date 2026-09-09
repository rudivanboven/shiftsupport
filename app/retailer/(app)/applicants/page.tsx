import type { Metadata } from "next";
import { requireRetailer } from "@/lib/auth/session";
import {
  getHiredWorkerContacts,
  getStoreApplications,
  type ApplicationWithContext,
} from "@/lib/data/retailer";
import { Badge, EmptyState, ErrorState, PageHeader, Panel } from "@/components/ui/Kit";
import Tabs, { type TabItem } from "@/components/dashboard/Tabs";
import { buttonClass } from "@/components/ui/buttonClass";
import { IconClose, IconPlus, IconUsers } from "@/components/dashboard/Icons";
import {
  formatDate,
  formatDuration,
  formatRate,
  formatRelative,
  formatTime,
  initialsOf,
} from "@/lib/format";
import ApplicantActions from "./ApplicantActions";
import styles from "./applicants.module.css";

export const metadata: Metadata = { title: "Applicants | ShiftSupport" };

type Filter = "pending" | "approved" | "rejected" | "all";

export default async function ApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<{ shift?: string; filter?: string }>;
}) {
  const { store } = await requireRetailer();
  const params = await searchParams;

  const filter: Filter = (["pending", "approved", "rejected", "all"] as const).includes(
    params.filter as Filter,
  )
    ? (params.filter as Filter)
    : "pending";

  const { applications, error } = await getStoreApplications(store.id);

  // Contact details are fetched only for shifts that actually have a hire, and
  // the database only returns them to this store's own staff.
  const hiredContacts = await getHiredWorkerContacts(
    [
      ...new Set(
        applications
          .filter((a) => a.status === "approved" && a.shifts?.accepted_by)
          .map((a) => a.shift_id),
      ),
    ],
  );

  const scoped = params.shift
    ? applications.filter((a) => a.shift_id === params.shift)
    : applications;

  const visible =
    filter === "all" ? scoped : scoped.filter((a) => a.status === filter);

  // Group by shift, keeping the soonest shift first.
  const groups = new Map<string, ApplicationWithContext[]>();
  for (const application of visible) {
    const list = groups.get(application.shift_id) ?? [];
    list.push(application);
    groups.set(application.shift_id, list);
  }

  const ordered = [...groups.entries()].sort(([, a], [, b]) => {
    const aTime = a[0].shifts?.start_time ?? "";
    const bTime = b[0].shifts?.start_time ?? "";
    return bTime.localeCompare(aTime);
  });

  const tabs: TabItem[] = (
    [
      ["pending", "Pending"],
      ["approved", "Hired"],
      ["rejected", "Declined"],
      ["all", "All"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    href: `/retailer/applicants?${new URLSearchParams({
      ...(params.shift ? { shift: params.shift } : {}),
      filter: key,
    })}`,
    count: key === "all" ? scoped.length : scoped.filter((a) => a.status === key).length,
  }));

  const filteredShiftName = params.shift
    ? (applications.find((a) => a.shift_id === params.shift)?.shifts?.task_type ??
      "this shift")
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Applications"
        title="Applicants"
        description="Everyone who applied to your shifts. Hire the person you want — the rest are told automatically."
        actions={
          <a className={buttonClass("ghost")} href="/retailer/shifts/new">
            <IconPlus width={16} height={16} />
            Post a shift
          </a>
        }
      />

      <div className={styles.filterBar}>
        <Tabs items={tabs} active={filter} label="Filter applications" />
      </div>

      {params.shift ? (
        <div className={styles.filterBar}>
          <a className={styles.clearFilter} href={`/retailer/applicants?filter=${filter}`}>
            <IconClose width={14} height={14} />
            Showing only &ldquo;{filteredShiftName}&rdquo; — show all shifts
          </a>
        </div>
      ) : null}

      {error ? (
        <Panel>
          <ErrorState text={`We couldn't load your applicants. ${error}`} />
        </Panel>
      ) : ordered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<IconUsers width={22} height={22} />}
            title="No applicants yet"
            text={
              filter === "pending"
                ? "Nothing is waiting for a decision right now. New applications will land here as soon as workers apply."
                : "There's nothing in this list yet. Try another filter."
            }
            action={
              <a className={buttonClass("primary")} href="/retailer/shifts/new">
                <IconPlus width={16} height={16} />
                Post a shift
              </a>
            }
          />
        </Panel>
      ) : (
        ordered.map(([shiftId, list]) => {
          const shift = list[0].shifts;
          const filled = Boolean(shift?.accepted_by);

          return (
            <div className={styles.shiftBlock} key={shiftId}>
              <Panel flush>
                <div className={styles.shiftHead}>
                  <div className={styles.shiftHeadText}>
                    <h3 className={styles.shiftTitle}>{shift?.task_type ?? "Shift"}</h3>
                    <p className={styles.shiftMeta}>
                      {formatDate(shift?.start_time)} · {formatTime(shift?.start_time)} –{" "}
                      {formatTime(shift?.end_time)} · {formatDuration(shift?.duration)} ·{" "}
                      {formatRate(shift?.hourly_rate ?? null)}
                    </p>
                  </div>
                  <Badge tone={filled ? "filled" : "open"}>
                    {filled ? "Filled" : "Open"}
                  </Badge>
                </div>

                <ul className={styles.list}>
                  {list.map((application) => {
                    const hired = application.status === "approved";
                    const declined = application.status === "rejected";
                    const contact = hired ? hiredContacts.get(application.shift_id) : null;
                    const name =
                      contact?.worker_name ?? application.workers?.full_name ?? "Worker";

                    return (
                      <li
                        key={application.id}
                        className={`${styles.row} ${hired ? styles.rowHired : ""} ${
                          declined ? styles.rowMuted : ""
                        }`}
                      >
                        <span
                          className={`${styles.avatar} ${hired ? styles.avatarHired : ""}`}
                        >
                          {initialsOf(name)}
                        </span>

                        <div className={styles.who}>
                          <p className={styles.name}>{name}</p>
                          <p className={styles.detail}>
                            <span>Applied {formatRelative(application.applied_at)}</span>
                            {contact?.phone ? (
                              <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>
                                {contact.phone}
                              </a>
                            ) : null}
                            {contact?.email ? (
                              <a href={`mailto:${contact.email}`}>{contact.email}</a>
                            ) : null}
                            {!hired ? (
                              <span>Contact details shown once you hire</span>
                            ) : null}
                          </p>
                        </div>

                        <div className={styles.rowSide}>
                          <Badge
                            tone={hired ? "approved" : declined ? "rejected" : "pending"}
                          >
                            {hired ? "Hired" : declined ? "Declined" : "Pending"}
                          </Badge>

                          {application.status === "pending" ? (
                            <ApplicantActions
                              applicationId={application.id}
                              workerName={name}
                              shiftFilled={filled}
                            />
                          ) : null}
                        </div>

                        {declined && application.rejection_reason ? (
                          <p className={styles.reason}>
                            Reason given: {application.rejection_reason}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
          );
        })
      )}
    </>
  );
}
