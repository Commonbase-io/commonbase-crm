import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/server/log";
import { runScheduledJobs } from "@/server/jobs/run";

// Scheduled entry point for background jobs (Vercel Cron, or any scheduler
// that sends `Authorization: Bearer $CRON_SECRET`). Runs every tenant's jobs,
// each strictly within its own tenant. Not callable from the browser: there
// is no user session here, only the shared secret.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function handle(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runScheduledJobs({ budgetMs: 45_000 });
    log.info("scheduled jobs ran", summary);
    return NextResponse.json(summary);
  } catch (error) {
    log.error("scheduled jobs failed", { error });
    return NextResponse.json({ error: "Job run failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
