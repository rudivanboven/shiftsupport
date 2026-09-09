"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/actions/notifications";
import { formatRelative } from "@/lib/format";
import type { Notification } from "@/lib/supabase/types";
import { IconBell, IconCheck, IconInbox } from "./Icons";
import styles from "./NotificationBell.module.css";

export default function NotificationBell({
  notifications,
  unreadCount,
  allHref,
}: {
  notifications: Notification[];
  unreadCount: number;
  allHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = () => {
    startTransition(async () => {
      await markNotificationsRead();
      router.refresh();
    });
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
      >
        <IconBell />
        {unreadCount > 0 ? (
          <span className={styles.dot}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Notifications</h2>
            {unreadCount > 0 ? (
              <button
                type="button"
                className={styles.markRead}
                onClick={markAll}
                disabled={pending}
              >
                {pending ? "Marking…" : "Mark all read"}
              </button>
            ) : null}
          </div>

          {notifications.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <IconInbox width={20} height={20} />
              </span>
              <p className={styles.emptyTitle}>You&apos;re all caught up</p>
              <p className={styles.emptyText}>
                We&apos;ll let you know as soon as something happens with your shifts.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.list}>
                {notifications.map((item) => {
                  const hired = item.type === "hired";
                  return (
                    <div
                      key={item.id}
                      className={`${styles.item} ${item.read_at ? "" : styles.unread}`}
                    >
                      <span
                        className={`${styles.itemIcon} ${hired ? "" : styles.itemIconMuted}`}
                      >
                        {hired ? (
                          <IconCheck width={17} height={17} />
                        ) : (
                          <IconBell width={17} height={17} />
                        )}
                      </span>
                      <div className={styles.itemBody}>
                        <p className={styles.itemTitle}>{item.title}</p>
                        {item.body ? <p className={styles.itemText}>{item.body}</p> : null}
                        <span className={styles.itemTime}>
                          {formatRelative(item.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {allHref ? (
                <div className={styles.panelFoot}>
                  <a href={allHref} onClick={() => setOpen(false)}>
                    View all notifications
                  </a>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
