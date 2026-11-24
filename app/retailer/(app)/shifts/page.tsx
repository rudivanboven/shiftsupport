import type { Metadata } from "next";
import { requireRetailer } from "@/lib/auth/session";
import {
  countApplicationsByShift,
  getHiredWorkerContacts,
  getStoreApplications,
  getStoreShifts,
  isShiftPostingExpired,
} from "@/lib/data/retailer";
import { getShiftReviewStates } from "@/lib/data/reviews";
import { getSeriesForShifts, getStoreSeries } from "@/lib/data/series";
import { EmptyState, ErrorState, PageHeader, Panel } from "@/components/ui/Kit";
import ShiftCard, { ShiftGrid } from "@/components/shifts/ShiftCard";
import Tabs, { type TabItem } from "@/components/dashboard/Tabs";
import { buttonClass } from "@/components/ui/buttonClass";
import { IconCalendar, IconPlus } from "@/components/dashboard/Icons";
import { isPast } from "@/lib/format";
import { RETAILER_HOURLY_RATE } from "@/lib/pricing";
import type { Shift } from "@/lib/supabase/types";
import ShiftReviewBlock from "@/components/reviews/ShiftReviewBlock";
import { RetailerShiftManagementActions } from "./ShiftActions";
import SeriesOverview from "./series/SeriesOverview";

export const metadata: Metadata = { title: "My shifts | ShiftSupport" };

type Filter = "all" | "open" | "filled" | "expired" | "hidden" | "past";

const matches = (shift: Shift, filter: Filter) => {
  const past = isPast(shift.end_time);
  const expired = isShiftPostingExpired(shift);
  const hidden = Boolean(shift.is_hidden);
  switch (filter) {
    case "open":
      return shift.status === "open" && !shift.accepted_by && !hidden && !expired && !past;
    case "filled":
      return Boolean(shift.accepted_by) && !past && shift.status !== "cancelled";
    case "expired":
      return expired && !shift.accepted_by && shift.status !== "cancelled";
    case "hidden":
      return hidden && shift.status !== "cancelled";
    case "past":
      return past || expired || shift.status === "cancelled" || shift.status === "completed";
    default:
      return true;
  }
};

export default async function RetailerShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { store } = await requireRetailer();
  const params = await searchParams;
  const filter: Filter = (
    ["all", "open", "filled", "expired", "hidden", "past"] as const
  ).includes(params.filter as Filter)
    ? (params.filter as Filter)
    : "all";

  const [{ shifts, error }, { applications }, storeSeries] = await Promise.all([
    getStoreShifts(store.id),
    getStoreApplications(store.id),
    getStoreSeries(store.id),
  ]);
  const seriesByShift = await getSeriesForShifts(shifts.map((s) => s.id));

  const counts = countApplicationsByShift(applications);
  const visible = shifts.filter((shift) => matches(shift, filter));

  // Review state for every finished shift that had somebody hired. The
  // database decides what the retailer may do with each one.
  const reviewable = shifts.filter((s) => s.accepted_by && isPast(s.end_time));
  const [reviewStates, workerContacts] = await Promise.all([
    getShiftReviewStates(reviewable.map((s) => s.id)),
    getHiredWorkerContacts(reviewable.map((s) => s.id)),
  ]);

  const tabs: TabItem[] = (
    [
      ["all", "All shifts"],
      ["open", "Active & Open"],
      ["filled", "Filled"],
      ["expired", "Expired"],
      ["hidden", "Hidden"],
      ["past", "Past & Deleted"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    href: key === "all" ? "/retailer/shifts" : `/retailer/shifts?filter=${key}`,
    count: shifts.filter((shift) => matches(shift, key)).length,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Your shifts"
        title="My shifts"
        description="Every shift you've posted, with how many people have applied to each one."
        actions={
          <a className={buttonClass("primary")} href="/retailer/shifts/new">
            <IconPlus width={16} height={16} />
            Post a shift
          </a>
        }
      />

      {storeSeries.length > 0 ? <SeriesOverview series={storeSeries} /> : null}

      <Tabs items={tabs} active={filter} label="Filter shifts" />

      {error ? (
        <Panel>
          <ErrorState text={`We couldn't load your shifts. ${error}`} />
        </Panel>
      ) : visible.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<IconCalendar width={22} height={22} />}
            title={
              filter === "all"
                ? "No shifts posted yet"
                : `No ${filter === "past" ? "past or cancelled" : filter} shifts`
            }
            text={
              filter === "all"
                ? "Post your first shift and workers nearby will be able to apply straight away."
                : "Try another filter, or post a new shift to get more applicants."
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
        <ShiftGrid>
          {visible.map((shift) => {
            const past = isPast(shift.end_time);
            const expired = isShiftPostingExpired(shift);
            const hidden = Boolean(shift.is_hidden);
            const cancelled = shift.status === "cancelled";
            const renewed = Number(shift.renewal_count ?? 0) > 0;

            const hired = Boolean(shift.accepted_by);
            const workerName =
              workerContacts.get(shift.id)?.worker_name ?? "this worker";
            const series = seriesByShift.get(shift.id);
            const seriesLink = series ? (
              <a
                className={buttonClass("ghost", { small: true })}
                href={`/retailer/shifts/series/${series.id}`}
              >
                View series
              </a>
            ) : null;

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
                        : past && hired
                          ? { tone: "neutral" as const, label: "Finished" }
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
                series={series}
                accent={
                  cancelled || hidden || (expired && !hired)
                    ? "muted"
                    : shift.accepted_by
                      ? "peach"
                      : "green"
                }
                badge={badge}
                note={
                  hidden
                    ? {
                        text: "Hidden from workers. Click Show Shift below whenever you are ready to make this posting visible again.",
                        tone: "warning",
                      }
                    : expired && !hired && !cancelled
                      ? {
                          text: "This shift posting has expired. You can Renew Shift, Extend Date / Time, Edit Shift details, or Hide / Delete it below.",
                          tone: "warning",
                        }
                      : undefined
                }
                footer={
                  <>
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
                    {hired && past && !cancelled ? (
                      <ShiftReviewBlock
                        shiftId={shift.id}
                        state={reviewStates.get(shift.id)}
                        subjectName={workerName}
                        canComplete={shift.status !== "completed"}
                      />
                    ) : null}
                  </>
                }
                actions={
                  <>
                    <a
                      className={buttonClass("ghost", { small: true })}
                      href={`/retailer/applicants?shift=${shift.id}`}
                    >
                      Applicants
                    </a>
                    <a
                      className={buttonClass("ghost", { small: true })}
                      href={`/retailer/shifts/${shift.id}/payment`}
                    >
                      {shift.payment_status === "paid" ? "Receipt" : "Shift summary"}
                    </a>
                    {seriesLink}
                  </>
                }
              />
            );
          })}
        </ShiftGrid>
      )}
    </>
  );
}
