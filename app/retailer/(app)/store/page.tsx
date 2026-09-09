import type { Metadata } from "next";
import { requireRetailer } from "@/lib/auth/session";
import { getStoreShifts } from "@/lib/data/retailer";
import {
  Columns,
  MetaList,
  MetaRow,
  PageHeader,
  Panel,
  Stack,
  StatCard,
  StatGrid,
} from "@/components/ui/Kit";
import {
  IconCalendar,
  IconCheck,
  IconPhone,
  IconPin,
  IconStore,
} from "@/components/dashboard/Icons";
import { formatDate } from "@/lib/format";
import StoreForm from "./StoreForm";

export const metadata: Metadata = { title: "My store | ShiftSupport" };

export default async function StorePage() {
  const { store } = await requireRetailer();
  const { shifts } = await getStoreShifts(store.id);

  return (
    <>
      <PageHeader
        eyebrow="Store settings"
        title="My store"
        description="This is how your store appears to workers browsing shifts. Keep it accurate so the right people apply."
      />

      <StatGrid>
        <StatCard
          label="Shifts posted"
          value={shifts.length}
          hint="All time"
          icon={<IconCalendar width={17} height={17} />}
        />
        <StatCard
          label="Shifts filled"
          value={shifts.filter((s) => s.accepted_by).length}
          hint="A worker was hired"
          icon={<IconCheck width={17} height={17} />}
          tone="lime"
        />
        <StatCard
          label="Store since"
          value={store.created_at ? formatDate(store.created_at) : "—"}
          icon={<IconStore width={17} height={17} />}
          tone="neutral"
        />
      </StatGrid>

      <Columns>
        <Panel
          title="Store details"
          description="Changes take effect straight away on every shift you've posted."
        >
          <StoreForm store={store} />
        </Panel>

        <Stack>
          <Panel title="How workers see you" description="A preview of your store card.">
            <MetaList>
              <MetaRow
                icon={<IconStore width={16} height={16} />}
                label="Store name"
                value={store.name}
              />
              <MetaRow
                icon={<IconPin width={16} height={16} />}
                label="Address"
                value={store.address ?? "Not set"}
              />
              <MetaRow
                icon={<IconPhone width={16} height={16} />}
                label="Contact phone"
                value={
                  store.contact_phone ? (
                    <>
                      {store.contact_phone}
                      <span
                        style={{
                          display: "block",
                          marginTop: 3,
                          fontSize: 12,
                          fontWeight: 400,
                          fontFamily: "var(--font-body)",
                          color: "var(--muted)",
                        }}
                      >
                        Hidden until you hire someone
                      </span>
                    </>
                  ) : (
                    "Not set"
                  )
                }
              />
            </MetaList>
          </Panel>

          <Panel title="Privacy" description="Who can see what.">
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.7,
                color: "var(--muted)",
              }}
            >
              Your store name and address are visible to any worker browsing open shifts,
              so they can decide whether the shift is a fit. Your contact phone number is
              held back by the database itself — it is only released to the one worker you
              hire for a given shift.
            </p>
          </Panel>
        </Stack>
      </Columns>
    </>
  );
}
