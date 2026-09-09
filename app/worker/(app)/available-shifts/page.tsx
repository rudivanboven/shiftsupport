import type { Metadata } from "next";
import { requireWorker } from "@/lib/auth/session";
import { getAvailableShifts, getWorkerApplications } from "@/lib/data/worker";
import { EmptyState, ErrorState, PageHeader, Panel } from "@/components/ui/Kit";
import ShiftCard, { ShiftGrid } from "@/components/shifts/ShiftCard";
import Tabs, { type TabItem } from "@/components/dashboard/Tabs";
import { IconSearch } from "@/components/dashboard/Icons";
import { buttonClass } from "@/components/ui/buttonClass";
import ApplyButton from "./ApplyButton";
import ShiftDetails from "./ShiftDetails";

export const metadata: Metadata = { title: "Available shifts | ShiftSupport" };

type Sort = "soonest" | "pay" | "newest";

export default async function AvailableShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { worker } = await requireWorker();
  const params = await searchParams;
  const sort: Sort = (["soonest", "pay", "newest"] as const).includes(params.sort as Sort)
    ? (params.sort as Sort)
    : "soonest";

  const [{ shifts, error }, { applications }] = await Promise.all([
    getAvailableShifts(),
    getWorkerApplications(worker.id),
  ]);

  const appliedShiftIds = new Set(applications.map((a) => a.shift_id));

  const sorted = [...shifts].sort((a, b) => {
    if (sort === "pay") return (b.hourly_rate ?? 0) - (a.hourly_rate ?? 0);
    if (sort === "newest") return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    return a.start_time.localeCompare(b.start_time);
  });

  const tabs: TabItem[] = (
    [
      ["soonest", "Starting soonest"],
      ["pay", "Best paid"],
      ["newest", "Recently posted"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    href: key === "soonest" ? "/worker/available-shifts" : `/worker/available-shifts?sort=${key}`,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Open shifts"
        title="Available shifts"
        description="Shifts posted by local retailers that nobody has been hired for yet. Apply to as many as you like."
      />

      <Tabs items={tabs} active={sort} label="Sort shifts" />

      {error ? (
        <Panel>
          <ErrorState text={`We couldn't load the available shifts. ${error}`} />
        </Panel>
      ) : sorted.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<IconSearch width={22} height={22} />}
            title="No available shifts right now"
            text="Retailers post new shifts most days. Check back soon — or keep an eye on your notifications."
            action={
              <a className={buttonClass("ghost")} href="/worker/dashboard">
                Back to dashboard
              </a>
            }
          />
        </Panel>
      ) : (
        <ShiftGrid>
          {sorted.map((shift) => (
            <ShiftCard
              key={shift.id}
              shift={shift}
              storeName={shift.stores?.name ?? "A local store"}
              storeAddress={shift.stores?.address}
              badge={{ tone: "open", label: "Open" }}
              actions={
                <>
                  <ShiftDetails
                    shift={shift}
                    storeName={shift.stores?.name ?? "A local store"}
                    storeAddress={shift.stores?.address ?? null}
                  />
                  <ApplyButton
                    shiftId={shift.id}
                    alreadyApplied={appliedShiftIds.has(shift.id)}
                  />
                </>
              }
            />
          ))}
        </ShiftGrid>
      )}
    </>
  );
}
