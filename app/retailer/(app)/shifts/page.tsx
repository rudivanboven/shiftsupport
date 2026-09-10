import type { Metadata } from "next";
import { requireRetailer } from "@/lib/auth/session";
import {
  countApplicationsByShift,
  getHiredWorkerContacts,
  getStoreApplications,
  getStoreShifts,
} from "@/lib/data/retailer";
import { getShiftReviewStates } from "@/lib/data/reviews";
import { EmptyState, ErrorState, PageHeader, Panel } from "@/components/ui/Kit";
import ShiftCard, { ShiftGrid } from "@/components/shifts/ShiftCard";
import Tabs, { type TabItem } from "@/components/dashboard/Tabs";
import { buttonClass } from "@/components/ui/buttonClass";
import { IconCalendar, IconPlus } from "@/components/dashboard/Icons";
import { isPast } from "@/lib/format";
import type { Shift } from "@/lib/supabase/types";
import ShiftReviewBlock from "@/components/reviews/ShiftReviewBlock";
import CancelShiftButton from "./ShiftActions";

export const metadata: Metadata = { title: "My shifts | ShiftSupport" };

type Filter = "all" | "open" | "filled" | "past";

const matches = (shift: Shift, filter: Filter) => {
  const past = isPast(shift.end_time);
  switch (filter) {
    case "open":
      return shift.status === "open" && !shift.accepted_by && !past;
    case "filled":
      return Boolean(shift.accepted_by) && !past;
    case "past":
      return past || shift.status === "cancelled";
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
  const filter: Filter = (["all", "open", "filled", "past"] as const).includes(
    params.filter as Filter,
  )
    ? (params.filter as Filter)
    : "all";

  const [{ shifts, error }, { applications }] = await Promise.all([
    getStoreShifts(store.id),
    getStoreApplications(store.id),
  ]);

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
      ["open", "Open"],
      ["filled", "Filled"],
      ["past", "Past & cancelled"],
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
            const cancelled = shift.status === "cancelled";

            const hired = Boolean(shift.accepted_by);
            const workerName =
              workerContacts.get(shift.id)?.worker_name ?? "this worker";

            return (
              <ShiftCard
                key={shift.id}
                shift={shift}
                storeAddress={store.address}
                applicantCount={counts.get(shift.id) ?? { pending: 0, total: 0 }}
                accent={cancelled || past ? "muted" : shift.accepted_by ? "peach" : "green"}
                badge={
                  cancelled
                    ? { tone: "cancelled", label: "Cancelled" }
                    : shift.status === "completed"
                      ? { tone: "neutral", label: "Completed" }
                      : past
                        ? { tone: "neutral", label: "Finished" }
                        : shift.accepted_by
                          ? { tone: "filled", label: "Filled" }
                          : { tone: "open", label: "Open" }
                }
                footer={
                  hired && past && !cancelled ? (
                    <ShiftReviewBlock
                      shiftId={shift.id}
                      state={reviewStates.get(shift.id)}
                      subjectName={workerName}
                      canComplete={shift.status !== "completed"}
                    />
                  ) : null
                }
                actions={
                  <>
                    <a
                      className={buttonClass("ghost", { small: true })}
                      href={`/retailer/applicants?shift=${shift.id}`}
                    >
                      Applicants
                    </a>
                    {!cancelled && !past ? (
                      <CancelShiftButton shiftId={shift.id} />
                    ) : null}
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
