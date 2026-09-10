import type { Metadata } from "next";
import { requireWorker } from "@/lib/auth/session";
import { syncProfileEmail, updateWorkerProfile } from "@/app/actions/profile";
import { getWorkerApplications } from "@/lib/data/worker";
import { getWorkerRating, getWorkerReviews } from "@/lib/data/reviews";
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
import { IconCheck, IconClock, IconUser } from "@/components/dashboard/Icons";
import { RatingBadge } from "@/components/reviews/Stars";
import ReviewList from "@/components/reviews/ReviewList";
import { formatDate, isPast } from "@/lib/format";

export const metadata: Metadata = { title: "My profile | ShiftSupport" };

export default async function WorkerProfilePage() {
  const { user, profile, worker } = await requireWorker();
  await syncProfileEmail();

  const { applications } = await getWorkerApplications(worker.id);
  const approved = applications.filter((a) => a.status === "approved");

  // Both come from real retailer -> worker reviews only.
  const [rating, reviews] = await Promise.all([
    getWorkerRating(worker.id),
    getWorkerReviews(worker.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Keep this up to date — it's what a retailer sees when they hire you for a shift."
      />

      <Columns>
        <Stack>
          <Panel
            title="Your details"
            description="Shared with a retailer only after they hire you."
          >
            <PersonalDetailsForm
              action={updateWorkerProfile}
              fullName={profile.full_name ?? worker.full_name ?? ""}
              phone={profile.phone ?? ""}
            />
          </Panel>

          <Panel title="Email address" description="The address you sign in with.">
            <EmailForm currentEmail={user.email ?? ""} />
          </Panel>

          <Panel title="Password" description="Choose a new password for your account.">
            <PasswordForm />
          </Panel>
        </Stack>

        <Stack>
          <Panel
            title="Your rating"
            description="Based on reviews retailers left after your completed shifts."
          >
            <RatingBadge rating={rating} emptyLabel="New worker — no reviews yet" />
          </Panel>

          <Panel title="Your record" description="A summary of your ShiftSupport activity.">
            <MetaList>
              <MetaRow
                icon={<IconUser width={16} height={16} />}
                label="Account type"
                value="Worker"
              />
              <MetaRow
                icon={<IconClock width={16} height={16} />}
                label="Applications sent"
                value={String(applications.length)}
              />
              <MetaRow
                icon={<IconCheck width={16} height={16} />}
                label="Shifts worked"
                value={String(
                  approved.filter((a) => isPast(a.shifts?.end_time)).length,
                )}
              />
              <MetaRow
                icon={<IconCheck width={16} height={16} />}
                label="Member since"
                value={
                  profile.created_at ?? worker.created_at
                    ? formatDate(profile.created_at ?? worker.created_at)
                    : "—"
                }
              />
            </MetaList>
          </Panel>

          <Panel
            title="Job reviews"
            description="What retailers said about each shift you completed."
          >
            <ReviewList
              reviews={reviews}
              emptyText="No reviews yet. Once a retailer confirms a shift you worked, their review will show up here."
            />
          </Panel>

          <Panel title="Privacy" description="What retailers can see.">
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.7,
                color: "var(--muted)",
              }}
            >
              While your application is pending, a retailer sees your name and when you
              applied. Your phone number and email are only revealed once they hire you
              for a shift.
            </p>
          </Panel>
        </Stack>
      </Columns>
    </>
  );
}
