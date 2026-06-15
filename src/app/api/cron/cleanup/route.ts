import { NextRequest, NextResponse } from "next/server";
import { runCleanup } from "@/lib/cleanup";
import { verifyAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import logger from "@/lib/logger";

export const runtime = "nodejs";

/**
 * GET /api/cron/cleanup
 *
 * Vercel Cron endpoint for data retention cleanup.
 * Secured via CRON_SECRET (Vercel sends this header for cron jobs).
 *
 * Can also be triggered manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/cleanup
 *
 * Schedule: Daily at 3:00 AM UTC (configured in vercel.json)
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this header for scheduled jobs)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // If no CRON_SECRET is set, only allow in development
    if (process.env.NODE_ENV === "production") {
      logger.warn("CRON_SECRET not configured — rejecting cleanup request in production");
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
    }
  } else {
    // Validate the bearer token in production
    const token = authHeader?.replace("Bearer ", "");
    if (token !== cronSecret) {
      logger.warn({ ip: req.headers.get("x-forwarded-for") }, "Unauthorized cleanup request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const report = await runCleanup();

    return NextResponse.json({
      success: report.errors.length === 0,
      durationMs: report.completedAt.getTime() - report.startedAt.getTime(),
      totalDeleted: report.totalDeleted,
      results: report.results,
      errors: report.errors.length > 0 ? report.errors : undefined,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Cleanup cron job failed");
    return NextResponse.json(
      { error: "Cleanup failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/cleanup
 *
 * Manual trigger for cleanup (same as GET, but for dashboard/admin use).
 * Requires session auth (dashboard user).
 */
export async function POST(req: NextRequest) {
  // Allow both cron auth and session auth
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const token = authHeader?.replace("Bearer ", "");

  if (cronSecret && token === cronSecret) {
    // Cron auth — proceed
  } else {
    // Session auth — verify dashboard user
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    if (!fullUser || (fullUser.role !== "admin" && fullUser.role !== "owner")) {
      return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
    }
  }

  try {
    const report = await runCleanup();

    return NextResponse.json({
      success: report.errors.length === 0,
      durationMs: report.completedAt.getTime() - report.startedAt.getTime(),
      totalDeleted: report.totalDeleted,
      results: report.results,
      errors: report.errors.length > 0 ? report.errors : undefined,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Manual cleanup failed");
    return NextResponse.json(
      { error: "Cleanup failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
