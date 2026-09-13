import { EmptyState, Panel } from "@/components/ui/Kit";
import { buttonClass } from "@/components/ui/buttonClass";
import { IconCash } from "@/components/dashboard/Icons";
import { membershipNotice, type Membership } from "@/lib/membership";

/**
 * The locked state a worker without an active membership sees instead of the
 * marketplace. A clear explanation and a way forward — never a blank page.
 *
 * This is presentation only. The access rule itself is enforced server-side in
 * the page that renders this, in `applyForShift`, and in the database policy
 * on `shift_applications` (migration 0007).
 */
export default function MembershipLock({
  membership,
  title,
}: {
  membership: Membership;
  title?: string;
}) {
  const notice = membershipNotice(membership);

  return (
    <Panel>
      <EmptyState
        icon={<IconCash width={22} height={22} />}
        title={title ?? notice.title}
        text={notice.text}
        action={
          <a className={buttonClass("primary")} href="/worker/pricing">
            {notice.cta}
          </a>
        }
      />
    </Panel>
  );
}
