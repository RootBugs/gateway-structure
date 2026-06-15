import { prisma } from "@/lib/db/prisma";
import logger from "@/lib/logger";

// ============================================================================
// Constants
// ============================================================================
// DB column lastError is VarChar(1000). Truncate all error messages
// to prevent P2000 PrismaClientKnownRequestError (column value too long).
const MAX_ERROR_LENGTH = 990;

// ============================================================================
// Circuit Breaker States
// ============================================================================
// closed    - Normal operation, requests allowed
// open      - Provider blocked, immediate fallback
// half-open - One test request allowed
// ============================================================================

export type CircuitState = "closed" | "open" | "half-open";

const CIRCUIT_OPEN_DURATION_MS = 60000; // 60 seconds
const CONSECUTIVE_FAILURES_THRESHOLD = 5;

// ============================================================================
// Check Circuit State
// ============================================================================

export async function checkCircuitState(providerId: string): Promise<{
  allowed: boolean;
  state: CircuitState;
  reason?: string;
}> {
  const health = await prisma.providerHealth.findUnique({
    where: { providerId },
  });

  if (!health) {
    // No health record - assume closed (new provider)
    return { allowed: true, state: "closed" };
  }

  const state = health.circuitState as CircuitState;

  switch (state) {
    case "closed":
      return { allowed: true, state: "closed" };

    case "open": {
      // Check if enough time passed to try half-open
      if (health.circuitOpenedAt) {
        const elapsed = Date.now() - health.circuitOpenedAt.getTime();
        if (elapsed >= CIRCUIT_OPEN_DURATION_MS) {
          // Transition to half-open
          await transitionToHalfOpen(providerId);
          return { allowed: true, state: "half-open", reason: "Circuit entering half-open state" };
        }
      }
      return { allowed: false, state: "open", reason: "Circuit breaker is open" };
    }

    case "half-open":
      return { allowed: true, state: "half-open", reason: "Circuit is half-open (testing)" };

    default:
      return { allowed: true, state: "closed" };
  }
}

// ============================================================================
// Record Success
// ============================================================================

export async function recordSuccess(providerId: string): Promise<void> {
  const health = await prisma.providerHealth.findUnique({
    where: { providerId },
  });

  if (!health) return;

  const state = health.circuitState as CircuitState;

  if (state === "half-open") {
    // Success in half-open → close circuit
    await prisma.providerHealth.update({
      where: { providerId },
      data: {
        circuitState: "closed",
        consecutiveFailures: 0,
        circuitOpenedAt: null,
        status: "healthy",
      },
    });
    logger.info({ providerId }, "Circuit closed after successful test request");
  } else if (state === "closed") {
    // Reset consecutive failures on success
    if (health.consecutiveFailures > 0) {
      await prisma.providerHealth.update({
        where: { providerId },
        data: {
          consecutiveFailures: 0,
        },
      });
    }
  }
}

// ============================================================================
// Record Failure
// ============================================================================

function truncateError(error?: string): string {
  if (!error) return "Unknown error";
  if (error.length <= MAX_ERROR_LENGTH) return error;
  return error.substring(0, MAX_ERROR_LENGTH) + "...";
}

export async function recordFailure(providerId: string, error?: string): Promise<void> {
  // Always truncate error to fit VarChar(1000) column
  const safeError = truncateError(error);

  try {
    const health = await prisma.providerHealth.findUnique({
      where: { providerId },
    });

    if (!health) {
      // Create initial health record with first failure
      await prisma.providerHealth.create({
        data: {
          providerId,
          status: "degraded",
          consecutiveFailures: 1,
          circuitState: "closed",
          lastErrorAt: new Date(),
          lastError: safeError,
        },
      });
      return;
    }

    const state = health.circuitState as CircuitState;
    const newConsecutiveFailures = health.consecutiveFailures + 1;

    if (state === "half-open") {
      // Failure in half-open → back to open, reset timer
      await prisma.providerHealth.update({
        where: { providerId },
        data: {
          circuitState: "open",
          circuitOpenedAt: new Date(),
          consecutiveFailures: newConsecutiveFailures,
          lastErrorAt: new Date(),
          lastError: safeError,
          status: "unhealthy",
        },
      });
      logger.warn({ providerId }, "Circuit re-opened after failed test request");
    } else if (state === "closed") {
      if (newConsecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD) {
        // Too many failures → open circuit
        await prisma.providerHealth.update({
          where: { providerId },
          data: {
            circuitState: "open",
            circuitOpenedAt: new Date(),
            consecutiveFailures: newConsecutiveFailures,
            lastErrorAt: new Date(),
            lastError: safeError,
            status: "unhealthy",
          },
        });
        logger.error({ providerId, failures: newConsecutiveFailures }, "Circuit opened due to consecutive failures");
      } else {
        // Increment failure count but keep closed
        await prisma.providerHealth.update({
          where: { providerId },
          data: {
            consecutiveFailures: newConsecutiveFailures,
            lastErrorAt: new Date(),
            lastError: safeError,
            status: newConsecutiveFailures >= 3 ? "degraded" : "healthy",
          },
        });
      }
    }
  } catch (dbError) {
    // CRITICAL: Never let DB errors prevent circuit breaker from functioning.
    // If we can't record the failure, at least log it and continue.
    // The provider will still fail on the next request.
    logger.error(
      { providerId, dbError: (dbError as Error).message },
      "Failed to record provider failure in DB (circuit breaker continues)"
    );
  }
}

// ============================================================================
// Transition to Half-Open
// ============================================================================

async function transitionToHalfOpen(providerId: string): Promise<void> {
  try {
    await prisma.providerHealth.update({
      where: { providerId },
      data: {
        circuitState: "half-open",
        status: "degraded",
      },
    });
    logger.info({ providerId }, "Circuit transitioned to half-open");
  } catch (dbError) {
    logger.error(
      { providerId, dbError: (dbError as Error).message },
      "Failed to transition circuit to half-open"
    );
  }
}

// ============================================================================
// Force Open Circuit (manual override)
// ============================================================================

export async function forceOpenCircuit(providerId: string, reason: string): Promise<void> {
  const safeReason = truncateError(reason);
  await prisma.providerHealth.upsert({
    where: { providerId },
    update: {
      circuitState: "open",
      circuitOpenedAt: new Date(),
      status: "unhealthy",
      lastError: safeReason,
      lastErrorAt: new Date(),
    },
    create: {
      providerId,
      circuitState: "open",
      circuitOpenedAt: new Date(),
      status: "unhealthy",
      lastError: safeReason,
      lastErrorAt: new Date(),
      latencyMs: 0,
    },
  });
  logger.info({ providerId, reason: safeReason }, "Circuit manually opened");
}

// ============================================================================
// Force Close Circuit (manual override)
// ============================================================================

export async function forceCloseCircuit(providerId: string): Promise<void> {
  await prisma.providerHealth.update({
    where: { providerId },
    data: {
      circuitState: "closed",
      circuitOpenedAt: null,
      consecutiveFailures: 0,
      status: "healthy",
    },
  });
  logger.info({ providerId }, "Circuit manually closed");
}
