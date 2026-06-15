import { prisma } from "@/lib/db/prisma";
import { checkCircuitState } from "./circuit-breaker";
import { SessionLockStatus } from "./types";
import { getModelFamily } from "@/lib/providers/config";
import logger from "@/lib/logger";

// ============================================================================
// Session Stickiness
// ============================================================================
// Provider lock stored in database (conversations table).
// Lock persists unless: provider unhealthy, circuit open, quota exhausted,
// manual override, or max switches exceeded.
// ============================================================================

const MAX_SWITCHES = 3;

// ============================================================================
// Get Session Lock Status
// ============================================================================

export async function getSessionLock(
  sessionId: string,
  userId: string,
  alias: string,
  requestedFamily: string
): Promise<SessionLockStatus> {
  const conversation = await prisma.conversation.findUnique({
    where: { sessionId },
  });

  if (!conversation) {
    return { locked: false, switchCount: 0 };
  }

  // Check if conversation belongs to this user
  if (conversation.userId !== userId) {
    return { locked: false, switchCount: 0 };
  }

  // Check if conversation is active
  if (!conversation.isActive) {
    return { locked: false, switchCount: 0 };
  }

  // Check max switches
  if (conversation.switchCount >= MAX_SWITCHES) {
    return {
      locked: false,
      providerId: conversation.providerId,
      modelFamily: conversation.modelFamily,
      switchCount: conversation.switchCount,
      unlockReason: `Max switches exceeded (${MAX_SWITCHES})`,
    };
  }

  // Check circuit breaker
  const circuit = await checkCircuitState(conversation.providerId);
  if (!circuit.allowed) {
    return {
      locked: false,
      providerId: conversation.providerId,
      modelFamily: conversation.modelFamily,
      switchCount: conversation.switchCount,
      unlockReason: `Circuit breaker ${circuit.state}: ${circuit.reason}`,
    };
  }

  // Check provider health
  const health = await prisma.providerHealth.findUnique({
    where: { providerId: conversation.providerId },
  });

  if (health?.status === "unhealthy") {
    return {
      locked: false,
      providerId: conversation.providerId,
      modelFamily: conversation.modelFamily,
      switchCount: conversation.switchCount,
      unlockReason: "Provider unhealthy",
    };
  }

  // Check quota
  const quota = await prisma.providerQuotaState.findUnique({
    where: { providerId: conversation.providerId },
  });

  if (quota) {
    if (quota.remainingRequests <= 0 || quota.remainingTokens <= 0) {
      return {
        locked: false,
        providerId: conversation.providerId,
        modelFamily: conversation.modelFamily,
        switchCount: conversation.switchCount,
        unlockReason: "Provider quota exhausted",
      };
    }
  }

  // Session is locked to this provider
  return {
    locked: true,
    providerId: conversation.providerId,
    modelFamily: conversation.modelFamily,
    switchCount: conversation.switchCount,
  };
}

// ============================================================================
// Create or Update Session
// ============================================================================

export async function createSession(
  sessionId: string,
  userId: string,
  providerId: string,
  alias: string,
  modelId: string
): Promise<void> {
  const family = getModelFamily(modelId);

  await prisma.conversation.upsert({
    where: { sessionId },
    update: {
      providerId,
      modelAlias: alias,
      modelFamily: family,
      lastModelUsed: modelId,
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      sessionId,
      userId,
      providerId,
      modelAlias: alias,
      modelFamily: family,
      lastModelUsed: modelId,
      isActive: true,
      switchCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info({ sessionId, providerId, alias, family }, "Session created/updated");
}

// ============================================================================
// Switch Provider in Session
// ============================================================================

export async function switchProvider(
  sessionId: string,
  newProviderId: string,
  newModelId: string,
  reason: string
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { sessionId },
  });

  if (!conversation) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const newFamily = getModelFamily(newModelId);
  const oldProvider = conversation.providerId;

  await prisma.conversation.update({
    where: { sessionId },
    data: {
      providerId: newProviderId,
      lastModelUsed: newModelId,
      modelFamily: newFamily,
      switchCount: { increment: 1 },
      lastSwitchedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  logger.info({
    sessionId,
    oldProvider,
    newProvider: newProviderId,
    oldFamily: conversation.modelFamily,
    newFamily: newFamily,
    reason,
    switchCount: conversation.switchCount + 1,
  }, "Provider switched in session");
}

// ============================================================================
// Close Session
// ============================================================================

export async function closeSession(sessionId: string): Promise<void> {
  await prisma.conversation.update({
    where: { sessionId },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  });

  logger.info({ sessionId }, "Session closed");
}

// ============================================================================
// Get Session Info
// ============================================================================

export async function getSessionInfo(sessionId: string) {
  return prisma.conversation.findUnique({
    where: { sessionId },
    include: {
      user: {
        select: { email: true, name: true },
      },
    },
  });
}
