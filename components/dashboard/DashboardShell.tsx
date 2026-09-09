"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { initialsOf } from "@/lib/format";
import type { Notification } from "@/lib/supabase/types";
import NotificationBell from "./NotificationBell";
import {
  IconBell,
  IconCalendar,
  IconClose,
  IconHome,
  IconLogout,
  IconMenu,
  IconPlus,
  IconSearch,
  IconStore,
  IconUser,
  IconUsers,
} from "./Icons";
import styles from "./DashboardShell.module.css";

export type NavIcon =
  | "home"
  | "calendar"
  | "plus"
  | "users"
  | "store"
  | "user"
  | "search"
  | "bell";

const ICONS: Record<NavIcon, typeof IconHome> = {
  home: IconHome,
  calendar: IconCalendar,
  plus: IconPlus,
  users: IconUsers,
  store: IconStore,
  user: IconUser,
  search: IconSearch,
  bell: IconBell,
};

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  count?: number;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

interface DashboardShellProps {
  role: "worker" | "retailer";
  roleLabel: string;
  sections: NavSection[];
  userName: string;
  userSubtitle: string;
  notifications: Notification[];
  unreadCount: number;
  notificationsHref?: string;
  promo?: { title: string; text: string };
  children: ReactNode;
}

export default function DashboardShell({
  role,
  roleLabel,
  sections,
  userName,
  userSubtitle,
  notifications,
  unreadCount,
  notificationsHref,
  promo,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll behind the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const allItems = sections.flatMap((section) => section.items);
  const active = allItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const profileHref = `/${role}/profile`;

  return (
    <div className={styles.shell}>
      <div
        className={`${styles.overlay} ${drawerOpen ? styles.overlayOpen : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ""}`}
        aria-label="Dashboard navigation"
      >
        <button
          type="button"
          className={styles.drawerClose}
          onClick={() => setDrawerOpen(false)}
          aria-label="Close navigation"
        >
          <IconClose />
        </button>

        <Link href="/" className={styles.brand} aria-label="ShiftSupport — home">
          <img src="/images/whitelogo.png" alt="ShiftSupport" />
        </Link>

        <span className={styles.roleTag}>{roleLabel}</span>

        {sections.map((section, index) => (
          <div key={section.label ?? index}>
            {section.label ? (
              <p className={styles.navGroupLabel}>{section.label}</p>
            ) : null}
            <nav className={styles.nav}>
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const isActive = active?.href === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon />
                    <span>{item.label}</span>
                    {item.count ? (
                      <span className={styles.navCount}>
                        {item.count > 99 ? "99+" : item.count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div className={styles.sidebarFoot}>
          {promo ? (
            <div className={styles.promo}>
              <p className={styles.promoTitle}>{promo.title}</p>
              <p className={styles.promoText}>{promo.text}</p>
            </div>
          ) : null}

          <form action={signOutAction} className={styles.logoutForm}>
            <button type="submit" className={styles.logoutButton}>
              <IconLogout />
              <span>Log out</span>
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.body}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <IconMenu />
          </button>

          <div className={styles.pageTitle}>
            <h1>{active?.label ?? "Dashboard"}</h1>
            <p>{userSubtitle}</p>
          </div>

          <div className={styles.topbarRight}>
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              allHref={notificationsHref}
            />

            <Link href={profileHref} className={styles.userChip}>
              <span className={styles.avatar}>{initialsOf(userName)}</span>
              <span className={styles.userMeta}>
                <span className={styles.userName}>{userName}</span>
                <span className={styles.userRole}>{roleLabel}</span>
              </span>
            </Link>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
