import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
