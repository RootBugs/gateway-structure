import { prisma } from "@/lib/db/prisma";
import { RoutingDecision, RoutingCandidate } from "./types";
import logger from "@/lib/logger";

// ============================================================================
// Routing Audit Logging
// ============================================================================
// Every routing decision is logged for debugging and analytics.
// Stored in request_logs table (routing fields added).
// ============================================================================

export async function logRoutingDecision(decision: RoutingDecision): Promise<void> {
  try {
    // Store as JSON in the request log for traceability
    // The actual request log is created separately in the API route
    logger.info({
      requestId: decision.requestId,
      alias: decision.alias,
      selectedProvider: decision.selectedProvider,
      selectedModel: decision.selectedModel,
      tier: decision.tier,
      familyRequested: decision.familyRequested,
      familyUsed: decision.familyUsed,
      score: decision.score,
      reason: decision.reason,
      candidateCount: decision.candidates.length,
      routingLatencyMs: decision.latencyMs,
      candidates: decision.candidates.map(c => ({
        providerId: c.providerId,
        score: c.score,
        familyMatch: c.familyMatch,
        capabilityMatch: c.capabilityMatch,
        circuitOpen: c.circuitOpen,
        quotaExhausted: c.quotaExhausted,
        rejectionReason: c.rejectionReason,
      })),
    }, "Routing decision logged");
  } catch (error) {
    logger.error({ error, requestId: decision.requestId }, "Failed to log routing decision");
  }
}

// ============================================================================
// Get Routing History
// ============================================================================

export async function getRoutingHistory(
  requestId?: string,
  limit: number = 100
): Promise<RoutingDecision[]> {
  // In a full implementation, this would query a dedicated routing_audit_logs table
  // For now, we return from request_logs where routing data is embedded
  const logs = await prisma.requestLog.findMany({
    where: requestId ? { requestId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      requestId: true,
      providerId: true,
      modelAlias: true,
      modelUsed: true,
      modelFamily: true,
      status: true,
      latencyMs: true,
      createdAt: true,
    },
  });

  return logs.map(log => ({
    requestId: log.requestId || log.id,
    alias: log.modelAlias,
    selectedProvider: log.providerId || "unknown",
    selectedModel: log.modelUsed,
    familyRequested: log.modelFamily || "unknown",
    familyUsed: log.modelFamily || "unknown",
    score: 0,
    reason: log.status === "success" ? "success" : "error",
    tier: 1,
    candidates: [],
    latencyMs: log.latencyMs,
    createdAt: log.createdAt,
  }));
}

// ============================================================================
// Build Routing Decision Object
// ============================================================================

export function buildRoutingDecision(
  requestId: string,
  alias: string,
  sessionId: string | undefined,
  tier: number,
  familyRequested: string,
  familyUsed: string,
  selectedProvider: string,
  selectedModel: string,
  score: number,
  reason: string,
  candidates: RoutingCandidate[],
  startTime: number
): RoutingDecision {
  return {
    requestId,
    alias,
    sessionId,
    tier,
    familyRequested,
    familyUsed,
    selectedProvider,
    selectedModel,
    score,
    reason,
    candidates,
    latencyMs: Date.now() - startTime,
    createdAt: new Date(),
  };
}
