import type { Metadata } from "next";
import { requireWorker } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader, Panel } from "@/components/ui/Kit";
import { IconBell, IconCheck } from "@/components/dashboard/Icons";
import { buttonClass } from "@/components/ui/buttonClass";
import { formatRelative } from "@/lib/format";
import type { Notification } from "@/lib/supabase/types";
import MarkAllRead from "./MarkAllRead";
import styles from "./notifications.module.css";

export const metadata: Metadata = { title: "Notifications | ShiftSupport" };

export default async function NotificationsPage() {
  await requireWorker();

  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const notifications = (data ?? []) as Notification[];
  const unread = notifications.filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        eyebrow="Updates"
        title="Notifications"
        description="Every update about your applications — including the moment a retailer hires you."
        actions={unread > 0 ? <MarkAllRead /> : undefined}
      />

      <Panel flush>
        {notifications.length === 0 ? (
          <EmptyState
            icon={<IconBell width={22} height={22} />}
            title="Nothing here yet"
            text="When a retailer reviews one of your applications, you'll hear about it here first."
            action={
              <a className={buttonClass("primary")} href="/worker/available-shifts">
                Browse available shifts
              </a>
            }
          />
        ) : (
          <ul className={styles.list}>
            {notifications.map((notification) => {
              const hired = notification.type === "hired";
              return (
                <li
                  key={notification.id}
                  className={`${styles.row} ${notification.read_at ? "" : styles.unread}`}
                >
                  <span className={`${styles.icon} ${hired ? styles.iconHired : ""}`}>
                    {hired ? (
                      <IconCheck width={19} height={19} />
                    ) : (
                      <IconBell width={19} height={19} />
                    )}
                  </span>

                  <div className={styles.body}>
                    <p className={styles.title}>
                      {notification.title}
                      {notification.read_at ? null : (
                        <span className={styles.newTag}>New</span>
                      )}
                    </p>
                    {notification.body ? (
                      <p className={styles.text}>{notification.body}</p>
                    ) : null}
                    {notification.shift_id ? (
                      <a
                        className={styles.link}
                        href={`/worker/my-shifts?filter=${hired ? "hired" : "rejected"}`}
                      >
                        {hired ? "View shift and store contact →" : "View application →"}
                      </a>
                    ) : null}
                    <span className={styles.time}>
                      {formatRelative(notification.created_at)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
