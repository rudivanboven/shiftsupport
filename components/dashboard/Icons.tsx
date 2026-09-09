import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const IconHome = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.2 8.4 10 3l6.8 5.4V16a1 1 0 0 1-1 1h-3.4v-4.6H7.6V17H4.2a1 1 0 0 1-1-1Z" />
  </svg>
);

export const IconCalendar = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4.6" width="14" height="12.4" rx="2.2" />
    <path d="M3 8.4h14M7 2.8v3M13 2.8v3" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 4.4v11.2M4.4 10h11.2" />
  </svg>
);

export const IconUsers = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="8" cy="7.4" r="2.9" />
    <path d="M2.9 16.4c0-2.6 2.3-4.2 5.1-4.2s5.1 1.6 5.1 4.2" />
    <path d="M13.6 5.1a2.6 2.6 0 0 1 0 5M15.2 12.5c1.4.5 2.3 1.6 2.3 3.2" />
  </svg>
);

export const IconStore = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.4 8.2V16a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1V8.2" />
    <path d="M2.6 8.2 4 3.4h12l1.4 4.8a2.4 2.4 0 0 1-4.7.6 2.4 2.4 0 0 1-4.7 0 2.4 2.4 0 0 1-4.7-.6Z" />
    <path d="M8.2 17v-4.3h3.6V17" />
  </svg>
);

export const IconUser = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="10" cy="6.8" r="3.1" />
    <path d="M4 16.6c0-2.8 2.7-4.5 6-4.5s6 1.7 6 4.5" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="9" r="5.4" />
    <path d="m13.2 13.2 3.2 3.2" />
  </svg>
);

export const IconBell = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 3.1a4.7 4.7 0 0 0-4.7 4.7c0 3.4-1.2 4.4-1.2 4.4h11.8s-1.2-1-1.2-4.4A4.7 4.7 0 0 0 10 3.1Z" />
    <path d="M8.6 14.7a1.6 1.6 0 0 0 2.8 0" />
  </svg>
);

export const IconLogout = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12.4 14.2V16a1 1 0 0 1-1 1H4.6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6.8a1 1 0 0 1 1 1v1.8" />
    <path d="M8.4 10h8.2M14 7.3 16.7 10 14 12.7" />
  </svg>
);

export const IconMenu = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.4 5.8h13.2M3.4 10h13.2M3.4 14.2h13.2" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m5.4 5.4 9.2 9.2M14.6 5.4l-9.2 9.2" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 5.8V10l2.8 1.7" />
  </svg>
);

export const IconPin = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 17s5.2-4.4 5.2-8.2a5.2 5.2 0 0 0-10.4 0C4.8 12.6 10 17 10 17Z" />
    <circle cx="10" cy="8.6" r="1.9" />
  </svg>
);

export const IconCash = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2.6" y="5" width="14.8" height="10" rx="2" />
    <circle cx="10" cy="10" r="2.2" />
    <path d="M5.4 10h.01M14.6 10h.01" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4.6 10.4 3.4 3.3 7.4-7.4" />
  </svg>
);

export const IconPhone = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.2 3.4 8 3.9l1 3-1.7 1.3a9.4 9.4 0 0 0 4.5 4.5l1.3-1.7 3 1 .5 1.8a1.5 1.5 0 0 1-1.5 1.9A13.3 13.3 0 0 1 4.3 4.9a1.5 1.5 0 0 1 1.9-1.5Z" />
  </svg>
);

export const IconInbox = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 11.6 5 4.4A1.4 1.4 0 0 1 6.3 3.4h7.4A1.4 1.4 0 0 1 15 4.4l2 7.2v3.4a1.4 1.4 0 0 1-1.4 1.4H4.4A1.4 1.4 0 0 1 3 15Z" />
    <path d="M3 11.6h3.6l1 2h4.8l1-2H17" />
  </svg>
);

export const IconTrend = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 13.6 7.6 9l3 3 6-6" />
    <path d="M12.6 6h4v4" />
  </svg>
);

export const IconArrow = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.4 10h11.2M11.6 6l4 4-4 4" />
  </svg>
);

export const IconSpark = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 2.8 11.7 8 17 9.7 11.7 11.4 10 16.7 8.3 11.4 3 9.7 8.3 8Z" />
  </svg>
);
