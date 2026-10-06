import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import PublicPageMotion from "@/components/motion/PublicPageMotion";
import "./globals.css";

/* Headings + UI text — Montserrat (variable font).
   Body copy uses Arial, a system font, so it needs no loading. */
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ShiftSupport | Short-shift staffing for local retailers",
  description:
    "ShiftSupport helps local retailers handle busy moments with trained workers for short retail shifts.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

/* GA4 — only rendered when the Measurement ID is set (see .env.local / Vercel).
   SPA page views are picked up by GA4 Enhanced Measurement's
   "page changes based on browser history events". */
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body><PublicPageMotion>{children}</PublicPageMotion></body>
      {gaMeasurementId && <GoogleAnalytics gaId={gaMeasurementId} />}
    </html>
  );
}
