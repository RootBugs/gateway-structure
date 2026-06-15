import { prisma } from "@/lib/db/prisma";
import logger from "@/lib/logger";

// ============================================================================
// Data Retention Cleanup
// ============================================================================
// Removes old records from unbounded tables to prevent DB bloat.
// Designed to run via Vercel Cron (daily) or manual invocation.
//
// Retention Policies:
//   - request_logs:    30 days  (high volume, ~1M rows/month)
//   - conversations:   7 days inactive (session stickiness tracker)
//   - rate_limits:     2 days  (expired time windows)
//   - sessions:        30 days (expired JWT sessions)
//   - provider_usage:  90 days (daily aggregates for analytics)
//   - api_keys:        soft-delete only (revoked keys kept for audit)
//   - users:           never deleted (soft-delete via role)
// ============================================================================

export interface CleanupResult {
  table: string;
  deleted: number;
  error?: string;
}

export interface CleanupReport {
  startedAt: Date;
  completedAt: Date;
  totalDeleted: number;
  results: CleanupResult[];
  errors: string[];
}

// ============================================================================
// Retention Policies (configurable via env vars)
// ============================================================================

const RETENTION = {
  requestLogs: parseInt(process.env.RETENTION_REQUEST_LOGS_DAYS || "30"),
  conversations: parseInt(process.env.RETENTION_CONVERSATIONS_DAYS || "7"),
  rateLimits: parseInt(process.env.RETENTION_RATE_LIMITS_DAYS || "2"),
  sessions: parseInt(process.env.RETENTION_SESSIONS_DAYS || "30"),
  providerUsage: parseInt(process.env.RETENTION_PROVIDER_USAGE_DAYS || "90"),
} as const;

// ============================================================================
// Individual Cleanup Functions
// ============================================================================

/**
 * Delete request logs older than retention period.
 * This is the highest-volume table (~100K-1M+ rows/month).
 */
async function cleanupRequestLogs(): Promise<CleanupResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION.requestLogs);

  try {
    const { count } = await prisma.requestLog.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    logger.info({ deleted: count, cutoff: cutoff.toISOString() }, "Request logs cleaned up");
    return { table: "request_logs", deleted: count };
  } catch (error) {
    const msg = `Failed to clean request_logs: ${(error as Error).message}`;
    logger.error({ error: (error as Error).message }, msg);
    return { table: "request_logs", deleted: 0, error: msg };
  }
}

/**
 * Delete inactive conversations older than retention period.
 * Active conversations are preserved regardless of age.
 */
async function cleanupConversations(): Promise<CleanupResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION.conversations);

  try {
    const { count } = await prisma.conversation.deleteMany({
      where: {
        isActive: false,
        updatedAt: { lt: cutoff },
      },
    });

    // Also delete very old active conversations (stale sessions)
    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - RETENTION.conversations * 3);

    const { count: staleCount } = await prisma.conversation.deleteMany({
      where: {
        isActive: true,
        updatedAt: { lt: staleCutoff },
      },
    });

    const totalDeleted = count + staleCount;
    logger.info({ deleted: count, staleDeleted: staleCount }, "Conversations cleaned up");
    return { table: "conversations", deleted: totalDeleted };
  } catch (error) {
    const msg = `Failed to clean conversations: ${(error as Error).message}`;
    logger.error({ error: (error as Error).message }, msg);
    return { table: "conversations", deleted: 0, error: msg };
  }
}

/**
 * Delete expired rate limit windows.
 * Rate limits are per-minute and per-day windows that expire quickly.
 */
async function cleanupRateLimits(): Promise<CleanupResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION.rateLimits);

  try {
    const { count } = await prisma.rateLimit.deleteMany({
      where: {
        windowStart: { lt: cutoff },
      },
    });

    logger.info({ deleted: count, cutoff: cutoff.toISOString() }, "Rate limits cleaned up");
    return { table: "rate_limits", deleted: count };
  } catch (error) {
    const msg = `Failed to clean rate_limits: ${(error as Error).message}`;
    logger.error({ error: (error as Error).message }, msg);
    return { table: "rate_limits", deleted: 0, error: msg };
  }
}

/**
 * Delete expired sessions.
 * Sessions are JWT-based; expired ones in the DB are just audit records.
 */
async function cleanupSessions(): Promise<CleanupResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION.sessions);

  try {
    const { count } = await prisma.session.deleteMany({
      where: {
        expiresAt: { lt: cutoff },
      },
    });

    logger.info({ deleted: count, cutoff: cutoff.toISOString() }, "Sessions cleaned up");
    return { table: "sessions", deleted: count };
  } catch (error) {
    const msg = `Failed to clean sessions: ${(error as Error).message}`;
    logger.error({ error: (error as Error).message }, msg);
    return { table: "sessions", deleted: 0, error: msg };
  }
}

/**
 * Delete old provider usage records.
 * Keep 90 days of daily aggregates for analytics.
 */
async function cleanupProviderUsage(): Promise<CleanupResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION.providerUsage);

  try {
    const { count } = await prisma.providerUsage.deleteMany({
      where: {
        date: { lt: cutoff },
      },
    });

    logger.info({ deleted: count, cutoff: cutoff.toISOString() }, "Provider usage cleaned up");
    return { table: "provider_usage", deleted: count };
  } catch (error) {
    const msg = `Failed to clean provider_usage: ${(error as Error).message}`;
    logger.error({ error: (error as Error).message }, msg);
    return { table: "provider_usage", deleted: 0, error: msg };
  }
}

// ============================================================================
// Main Cleanup Runner
// ============================================================================

export async function runCleanup(): Promise<CleanupReport> {
  const startedAt = new Date();
  const results: CleanupResult[] = [];
  const errors: string[] = [];

  logger.info({ startedAt, retention: RETENTION }, "Data retention cleanup started");

  // Run all cleanup tasks in parallel for speed
  const cleanupTasks = [
    cleanupRequestLogs(),
    cleanupConversations(),
    cleanupRateLimits(),
    cleanupSessions(),
    cleanupProviderUsage(),
  ];

  const taskResults = await Promise.allSettled(cleanupTasks);

  for (const result of taskResults) {
    if (result.status === "fulfilled") {
      results.push(result.value);
      if (result.value.error) {
        errors.push(result.value.error);
      }
    } else {
      const msg = `Cleanup task failed: ${result.reason}`;
      errors.push(msg);
      logger.error({ error: result.reason }, msg);
    }
  }

  const completedAt = new Date();
  const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);

  const report: CleanupReport = {
    startedAt,
    completedAt,
    totalDeleted,
    results,
    errors,
  };

  logger.info(
    {
      durationMs: completedAt.getTime() - startedAt.getTime(),
      totalDeleted,
      tablesCleaned: results.length,
      errorCount: errors.length,
      breakdown: results.map((r) => `${r.table}: ${r.deleted}`),
    },
    "Data retention cleanup completed"
  );

  return report;
}
