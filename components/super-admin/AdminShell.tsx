"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { initialsOf } from "@/lib/format";
import {
  IconCalendar,
  IconCash,
  IconClock,
  IconClose,
  IconHome,
  IconInbox,
  IconLogout,
  IconMenu,
  IconStore,
  IconTrend,
  IconUserCheck,
  IconUsers,
} from "@/components/dashboard/Icons";
import shell from "@/components/dashboard/DashboardShell.module.css";
import styles from "./Admin.module.css";

const IconShield = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M10 2.8 4 5v4.6c0 3.6 2.6 6.4 6 7.6 3.4-1.2 6-4 6-7.6V5Z" />
    <path d="m7.4 10 1.8 1.8 3.5-3.6" />
  </svg>
);

const IconList = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true" {...p}>
    <path d="M7.4 5.6h9M7.4 10h9M7.4 14.4h9M3.6 5.6h.01M3.6 10h.01M3.6 14.4h.01" />
  </svg>
);

const SECTIONS = [
  {
    label: "Overview",
    items: [
      { href: "/super-admin", label: "Dashboard", Icon: IconHome, exact: true },
      { href: "/super-admin/analytics", label: "Analytics", Icon: IconTrend },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/super-admin/workers", label: "Workers", Icon: IconUsers },
      { href: "/super-admin/retailers", label: "Retailers", Icon: IconStore },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/super-admin/shifts", label: "Shifts", Icon: IconCalendar },
      { href: "/super-admin/applications", label: "Applications / Hires", Icon: IconUserCheck },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/super-admin/finance", label: "Payments", Icon: IconCash },
      { href: "/super-admin/payroll", label: "Payroll / ADP", Icon: IconClock },
    ],
  },
  {
    label: "Communication",
    items: [{ href: "/super-admin/communications", label: "Communications", Icon: IconInbox }],
  },
  {
    label: "Administration",
    items: [
      { href: "/super-admin/admins", label: "Admin Access", Icon: IconShield },
      { href: "/super-admin/audit", label: "Audit Log", Icon: IconList },
    ],
  },
];

export default function AdminShell({
  adminName,
  adminEmail,
  isPrimary,
  children,
}: {
  adminName: string;
  adminEmail: string;
  isPrimary: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = SECTIONS.flatMap((s) => s.items);
  const active = items
    .filter((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className={shell.shell}>
      <div className={`${shell.overlay} ${open ? shell.overlayOpen : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <aside className={`${shell.sidebar} ${open ? shell.sidebarOpen : ""}`} aria-label="Operations navigation">
        <button type="button" className={shell.drawerClose} onClick={() => setOpen(false)} aria-label="Close navigation">
          <IconClose />
        </button>

        <Link href="/super-admin" className={shell.brand} aria-label="Operations Control Center">
          <img src="/images/whitelogo.png" alt="ShiftSupport" />
        </Link>

        <span className={`${shell.roleTag} ${styles.opsTag}`}>Super Admin</span>

        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className={shell.navGroupLabel}>{section.label}</p>
            <nav className={shell.nav}>
              {section.items.map(({ href, label, Icon }) => {
                const isActive = active?.href === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`${shell.navLink} ${isActive ? shell.navLinkActive : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}

        <div className={shell.sidebarFoot}>
          <form action={signOutAction} className={shell.logoutForm}>
            <input type="hidden" name="redirectTo" value="/super-admin/login" />
            <button type="submit" className={shell.logoutButton}>
              <IconLogout />
              <span>Log out</span>
            </button>
          </form>
        </div>
      </aside>

      <div className={shell.body}>
        <header className={shell.topbar}>
          <button type="button" className={shell.iconButton} onClick={() => setOpen(true)} aria-label="Open navigation">
            <IconMenu />
          </button>

          <div className={shell.pageTitle}>
            <h1>{active?.label ?? "Operations Control Center"}</h1>
            <p>Operations Control Center · internal</p>
          </div>

          <div className={shell.topbarRight}>
            <span className={`${shell.userChip} ${styles.chipStatic}`} title={adminEmail}>
              <span className={shell.avatar}>{initialsOf(adminName)}</span>
              <span className={shell.userMeta}>
                <span className={shell.userName}>{adminName}</span>
                <span className={shell.userRole}>{isPrimary ? "Primary Super Admin" : "Super Admin"}</span>
              </span>
            </span>
          </div>
        </header>

        {/* `styles.page` owns the Super Admin spacing scale (the --ops-* custom
            properties), so every page inherits one rhythm. */}
        <main className={`${shell.content} ${styles.page}`} style={{ maxWidth: 1400 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
