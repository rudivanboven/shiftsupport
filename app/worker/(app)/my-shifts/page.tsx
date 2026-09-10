import type { Metadata } from "next";
import { requireWorker } from "@/lib/auth/session";
import {
  getContactsForShifts,
  getWorkerApplications,
  type ApplicationWithShift,
} from "@/lib/data/worker";
import { getShiftReviewStates } from "@/lib/data/reviews";
import { EmptyState, ErrorState, PageHeader, Panel } from "@/components/ui/Kit";
import ShiftCard, { ShiftGrid } from "@/components/shifts/ShiftCard";
import Tabs, { type TabItem } from "@/components/dashboard/Tabs";
import { buttonClass } from "@/components/ui/buttonClass";
import { IconCalendar, IconSearch } from "@/components/dashboard/Icons";
import { formatRelative, isPast } from "@/lib/format";
import ShiftReviewBlock from "@/components/reviews/ShiftReviewBlock";
import WithdrawButton from "./WithdrawButton";

export const metadata: Metadata = { title: "My shifts | ShiftSupport" };

type Filter = "all" | "pending" | "hired" | "rejected" | "completed";

const matches = (application: ApplicationWithShift, filter: Filter) => {
  const finished = isPast(application.shifts?.end_time);
  switch (filter) {
    case "pending":
      return application.status === "pending";
    case "hired":
      return application.status === "approved" && !finished;
    case "rejected":
      return application.status === "rejected";
    case "completed":
      return application.status === "approved" && finished;
    default:
      return true;
  }
};

export default async function WorkerMyShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { worker } = await requireWorker();
  const params = await searchParams;
  const filter: Filter = (
    ["all", "pending", "hired", "rejected", "completed"] as const
  ).includes(params.filter as Filter)
    ? (params.filter as Filter)
    : "all";

  const { applications, error } = await getWorkerApplications(worker.id);

  // Store contact details are only fetched — and only returned by the
  // database — for shifts this worker was actually hired for.
  const hiredShiftIds = applications
    .filter((a) => a.status === "approved" && a.shifts)
    .map((a) => a.shift_id);
  const contacts = await getContactsForShifts(hiredShiftIds);

  // Review state for finished shifts they actually worked. Whether the
  // window is open is the database's call, not this page's.
  const finishedShiftIds = applications
    .filter((a) => a.status === "approved" && a.shifts && isPast(a.shifts.end_time))
    .map((a) => a.shift_id);
  const reviewStates = await getShiftReviewStates(finishedShiftIds);

  const visible = applications.filter((a) => matches(a, filter));

  const tabs: TabItem[] = (
    [
      ["all", "All"],
      ["pending", "Pending"],
      ["hired", "Hired"],
      ["rejected", "Not selected"],
      ["completed", "Completed"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    href: key === "all" ? "/worker/my-shifts" : `/worker/my-shifts?filter=${key}`,
    count: applications.filter((a) => matches(a, key)).length,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Your applications"
        title="My shifts"
        description="Every shift you've applied for and where each application stands."
        actions={
          <a className={buttonClass("primary")} href="/worker/available-shifts">
            <IconSearch width={16} height={16} />
            Browse open shifts
          </a>
        }
      />

      <Tabs items={tabs} active={filter} label="Filter applications" />

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
                ? "You haven't applied for any shifts yet"
                : "Nothing in this list"
            }
            text={
              filter === "all"
                ? "Browse the shifts open near you and apply to the ones that suit your schedule."
                : "Try another filter, or browse the shifts that are open right now."
            }
            action={
              <a className={buttonClass("primary")} href="/worker/available-shifts">
                <IconSearch width={16} height={16} />
                Browse available shifts
              </a>
            }
          />
        </Panel>
      ) : (
        <ShiftGrid>
          {visible.map((application) => {
            const shift = application.shifts;
            if (!shift) return null;

            const finished = isPast(shift.end_time);
            const hired = application.status === "approved";
            const declined = application.status === "rejected";

            const badge = hired
              ? shift.status === "completed"
                ? { tone: "neutral" as const, label: "Completed" }
                : finished
                  ? { tone: "neutral" as const, label: "Finished" }
                  : { tone: "approved" as const, label: "You're hired" }
              : declined
                ? { tone: "rejected" as const, label: "Not selected" }
                : { tone: "pending" as const, label: "Application pending" };

            const note = hired
              ? finished
                ? {
                    text: "This shift is done. Thanks for covering it.",
                    hired: true,
                  }
                : undefined
              : declined
                ? {
                    tone: "warning" as const,
                    text: application.rejection_reason
                      ? `The retailer didn't pick you this time. Reason given: ${application.rejection_reason}`
                      : "The retailer went with someone else this time. Plenty of other shifts are open.",
                  }
                : {
                    text: `Applied ${formatRelative(application.applied_at)}. The retailer hasn't made a decision yet — we'll notify you as soon as they do.`,
                  };

            return (
              <ShiftCard
                key={application.id}
                shift={shift}
                storeName={shift.stores?.name ?? "A local store"}
                storeAddress={shift.stores?.address}
                badge={badge}
                note={note}
                contact={hired ? (contacts.get(shift.id) ?? null) : null}
                accent={hired ? "green" : declined || finished ? "muted" : "peach"}
                footer={
                  hired && finished ? (
                    <ShiftReviewBlock
                      shiftId={shift.id}
                      state={reviewStates.get(shift.id)}
                      subjectName={shift.stores?.name ?? "this store"}
                    />
                  ) : null
                }
                actions={
                  application.status === "pending" ? (
                    <WithdrawButton applicationId={application.id} />
                  ) : null
                }
              />
            );
          })}
        </ShiftGrid>
      )}
    </>
  );
}
