import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runRetailerReminderJob } from "@/lib/email/server";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function verifyCronAuthorization(request: NextRequest): {
  authorized: boolean;
  status: number;
  error?: string;
} {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[cron] CRON_SECRET is not configured.");
    return {
      authorized: false,
      status: 500,
      error: "CRON_SECRET is not configured on the server.",
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const headerToken = (request.headers.get("x-cron-secret") ?? "").trim();
  const candidate = bearerToken || headerToken;

  if (!candidate || !secretsMatch(candidate, secret)) {
    return {
      authorized: false,
      status: 401,
      error: "Unauthorized.",
    };
  }

  return { authorized: true, status: 200 };
}

async function handleCron(request: NextRequest) {
  const auth = verifyCronAuthorization(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const siteUrl = await getSiteUrl();
    const summary = await runRetailerReminderJob({ siteUrl });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron] Retailer reminder job failed:", message);
    return NextResponse.json(
      { ok: false, error: "Failed to run retailer reminder schedule." },
      { status: 500 },
    );
  }
}

/**
 * Vercel Cron invokes scheduled routes with `GET` and `Authorization: Bearer <CRON_SECRET>`.
 * `POST` is also supported for webhook / Supabase pg_cron invocations.
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
