import type { Metadata } from "next";
import { requireRetailer } from "@/lib/auth/session";
import { syncProfileEmail, updateRetailerProfile } from "@/app/actions/profile";
import {
  Columns,
  MetaList,
  MetaRow,
  PageHeader,
  Panel,
  Stack,
} from "@/components/ui/Kit";
import {
  EmailForm,
  PasswordForm,
  PersonalDetailsForm,
} from "@/components/account/AccountForms";
import { IconCheck, IconStore, IconUser } from "@/components/dashboard/Icons";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Profile & settings | ShiftSupport" };

export default async function RetailerProfilePage() {
  const { user, profile, store } = await requireRetailer();
  await syncProfileEmail();

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile & settings"
        description="Your personal details, sign-in email and password. Store details live on the My Store page."
      />

      <Columns>
        <Stack>
          <Panel
            title="Personal details"
            description="Used to address you around the dashboard."
          >
            <PersonalDetailsForm
              action={updateRetailerProfile}
              fullName={profile.full_name ?? ""}
              phone={profile.phone ?? ""}
            />
          </Panel>

          <Panel
            title="Email address"
            description="The address you sign in with."
          >
            <EmailForm currentEmail={user.email ?? ""} />
          </Panel>

          <Panel title="Password" description="Choose a new password for your account.">
            <PasswordForm />
          </Panel>
        </Stack>

        <Stack>
          <Panel title="Account" description="A summary of your ShiftSupport account.">
            <MetaList>
              <MetaRow
                icon={<IconUser width={16} height={16} />}
                label="Account type"
                value="Retailer"
              />
              <MetaRow
                icon={<IconStore width={16} height={16} />}
                label="Store"
                value={store.name}
              />
              <MetaRow
                icon={<IconCheck width={16} height={16} />}
                label="Member since"
                value={profile.created_at ? formatDate(profile.created_at) : "—"}
              />
            </MetaList>
          </Panel>

          <Panel title="Store details" description="Managed separately.">
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 13.5,
                lineHeight: 1.7,
                color: "var(--muted)",
              }}
            >
              Your store name, address and contact phone are edited on the My Store page,
              because they&apos;re shown to workers rather than being part of your login.
            </p>
            <a
              href="/retailer/store"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--brand-green)",
              }}
            >
              Go to My Store →
            </a>
          </Panel>
        </Stack>
      </Columns>
    </>
  );
}
