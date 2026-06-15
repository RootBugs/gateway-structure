import { prisma } from "@/lib/db/prisma";
import { createProviderAdapter } from "@/lib/providers/factory";
import { getAllProviderIds, getProviderConfig } from "@/lib/providers/config";
import logger from "@/lib/logger";

// DB column lastError is VarChar(1000). Truncate error messages.
const MAX_ERROR_LENGTH = 990;

function truncateError(error?: string): string {
  if (!error) return "Unknown error";
  if (error.length <= MAX_ERROR_LENGTH) return error;
  return error.substring(0, MAX_ERROR_LENGTH) + "...";
}

// ============================================================================
// Health Monitor
// ============================================================================
// No setInterval in serverless.
// Health checks triggered by:
//   - API requests (lightweight)
//   - Dashboard action
//   - Vercel Cron Jobs (if configured)
//   - Provider failure (immediate)
// ============================================================================

// ============================================================================
// Check Single Provider Health
// ============================================================================

export async function checkProviderHealth(providerId: string): Promise<{
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  latencyMs: number;
  modelsAvailable: number;
  error?: string;
}> {
  const config = getProviderConfig(providerId);
  if (!config) {
    return { status: "unknown", latencyMs: 0, modelsAvailable: 0, error: "Provider not configured" };
  }

  // Check if API key available (with plural/singular fallback)
  const apiKey = config.apiKeyEnvVar
    ? (process.env[config.apiKeyEnvVar] || process.env[config.apiKeyEnvVar.replace("_KEYS", "_KEY")] || "")
    : "";
  if (config.apiKeyEnvVar && apiKey.length === 0) {
    return { status: "unknown", latencyMs: 0, modelsAvailable: 0, error: "API key not configured" };
  }

  const startTime = Date.now();

  try {
    const adapter = createProviderAdapter(providerId);
    const health = await adapter.healthCheck();
    const latencyMs = Date.now() - startTime;      // Update database
    await prisma.providerHealth.upsert({
      where: { providerId },
      update: {
        status: health.status,
        latencyMs: health.latencyMs,
        lastCheckedAt: new Date(),
        ...(health.error ? {
          lastError: truncateError(health.error),
          lastErrorAt: new Date(),
        } : {}),
      },
      create: {
        providerId,
        status: health.status,
        latencyMs: health.latencyMs,
        lastCheckedAt: new Date(),
        ...(health.error ? {
          lastError: truncateError(health.error),
          lastErrorAt: new Date(),
        } : {}),
      },
    });

    // Update provider quota state if needed
    await updateQuotaState(providerId);

    return {
      status: health.status,
      latencyMs: health.latencyMs,
      modelsAvailable: health.modelsAvailable,
      error: health.error,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = (error as Error).message;

    await prisma.providerHealth.upsert({
      where: { providerId },
      update: {
        status: "unhealthy",
        latencyMs,
        lastCheckedAt: new Date(),
        lastError: truncateError(errorMessage),
        lastErrorAt: new Date(),
      },
      create: {
        providerId,
        status: "unhealthy",
        latencyMs,
        lastCheckedAt: new Date(),
        lastError: truncateError(errorMessage),
        lastErrorAt: new Date(),
      },
    });

    return {
      status: "unhealthy",
      latencyMs,
      modelsAvailable: 0,
      error: errorMessage,
    };
  }
}

// ============================================================================
// Check All Providers
// ============================================================================

export async function checkAllProviders(): Promise<Array<{
  providerId: string;
  status: string;
  latencyMs: number;
  error?: string;
}>> {
  const providerIds = getAllProviderIds();

  // Check all providers in parallel instead of sequentially
  const results = await Promise.all(
    providerIds.map(async (providerId) => {
      const result = await checkProviderHealth(providerId);
      return {
        providerId,
        status: result.status,
        latencyMs: result.latencyMs,
        error: result.error,
      };
    })
  );

  logger.info({ checked: results.length }, "Health check completed for all providers");
  return results;
}

// ============================================================================
// Update Quota State
// ============================================================================

async function updateQuotaState(providerId: string): Promise<void> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
  });

  if (!provider) return;

  const quotaState = await prisma.providerQuotaState.findUnique({
    where: { providerId },
  });

  const now = new Date();

  // Check if quota needs reset
  if (quotaState && quotaState.resetAt < now) {
    // Reset quota
    await prisma.providerQuotaState.update({
      where: { providerId },
      data: {
        remainingRequests: provider.quotaLimitDaily,
        remainingTokens: provider.quotaLimitDaily * 1000, // Estimate
        resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Next day
        updatedAt: now,
      },
    });
    logger.info({ providerId }, "Quota state reset");
  } else if (!quotaState) {
    // Initialize quota state
    await prisma.providerQuotaState.create({
      data: {
        providerId,
        remainingRequests: provider.quotaLimitDaily,
        remainingTokens: provider.quotaLimitDaily * 1000,
        resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        updatedAt: now,
      },
    });
    logger.info({ providerId }, "Quota state initialized");
  }
}

// ============================================================================
// Decrement Quota After Request
// ============================================================================

export async function decrementQuota(
  providerId: string,
  tokensIn: number,
  tokensOut: number
): Promise<void> {
  // NOTE: This read-then-write is not atomic. Under extreme concurrent load,
  // two requests could both read the same value and both write the same decrement,
  // causing one decrement to be lost. Acceptable for quota tracking (soft limit).
  // For hard limits, consider using a database-level advisory lock or queue.
  const current = await prisma.providerQuotaState.findUnique({ where: { providerId } });
  const newRemainingRequests = Math.max(0, (current?.remainingRequests ?? 1) - 1);
  const newRemainingTokens = Math.max(0, (current?.remainingTokens ?? (tokensIn + tokensOut)) - (tokensIn + tokensOut));

  await prisma.providerQuotaState.update({
    where: { providerId },
    data: {
      remainingRequests: newRemainingRequests,
      remainingTokens: newRemainingTokens,
      updatedAt: new Date(),
    },
  });

  // Also update provider_usage for analytics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.providerUsage.upsert({
    where: {
      providerId_date: {
        providerId,
        date: today,
      },
    },
    update: {
      requestsCount: { increment: 1 },
      tokensIn: { increment: tokensIn },
      tokensOut: { increment: tokensOut },
    },
    create: {
      providerId,
      date: today,
      requestsCount: 1,
      tokensIn,
      tokensOut,
    },
  });
}

// ============================================================================
// Get Health Summary
// ============================================================================

export async function getHealthSummary(): Promise<Array<{
  providerId: string;
  providerName: string;
  status: string;
  circuitState: string;
  latencyMs: number;
  consecutiveFailures: number;
  lastCheckedAt: Date | null;
  lastError: string | null;
}>> {
  const health = await prisma.providerHealth.findMany({
    include: {
      provider: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: {
      lastCheckedAt: "desc",
    },
  });

  return health.map(h => ({
    providerId: h.providerId,
    providerName: h.provider.displayName,
    status: h.status,
    circuitState: h.circuitState,
    latencyMs: h.latencyMs,
    consecutiveFailures: h.consecutiveFailures,
    lastCheckedAt: h.lastCheckedAt,
    lastError: h.lastError,
  }));
}
