import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { AuthenticatedContext } from "../auth/api-key-middleware";
import logger from "@/lib/logger";

// ============================================================================
// Request Logging Middleware
// ============================================================================
// Creates request_logs records for every request (success and failure).
// Called by API routes after routing decision and after provider response.
// ============================================================================

export interface LogRequestData {
  requestId: string;
  apiKeyId?: string;
  providerId: string;
  modelAlias: string;
  modelUsed: string;
  modelFamily: string;
  status: "success" | "error" | "timeout" | "rate_limited" | "circuit_open";
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  errorMessage?: string;
  sessionId?: string;
  streaming: boolean;
  ipAddress?: string;
  providerAttempt: number;
  gatewayRequestId: string;
}

export async function logRequest(data: LogRequestData): Promise<void> {
  try {
    // Use attempt-suffixed ID to avoid unique constraint violations on failover
    const logRequestId = `${data.requestId}_p${data.providerAttempt}`;
    await prisma.requestLog.upsert({
      where: { requestId: logRequestId },
      update: {
        status: data.status,
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
        latencyMs: data.latencyMs,
        errorMessage: data.errorMessage,
      },
      create: {
        requestId: logRequestId,
        apiKeyId: data.apiKeyId,
        providerId: data.providerId,
        modelAlias: data.modelAlias,
        modelUsed: data.modelUsed,
        modelFamily: data.modelFamily,
        status: data.status,
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
        latencyMs: data.latencyMs,
        errorMessage: data.errorMessage,
        sessionId: data.sessionId,
        streaming: data.streaming,
        ipAddress: data.ipAddress,
        providerAttempt: data.providerAttempt,
        createdAt: new Date(),
      },
    });

    logger.debug({
      requestId: data.requestId,
      provider: data.providerId,
      status: data.status,
      latencyMs: data.latencyMs,
    }, "Request logged");
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      requestId: data.requestId,
    }, "Failed to log request");
    // Don't throw - logging failure shouldn't break the request
  }
}

// ============================================================================
// Log Routing Decision
// ============================================================================

export async function logRoutingDecision(
  gatewayRequestId: string,
  decision: any,
  context?: AuthenticatedContext
): Promise<void> {
  logger.info({
    gatewayRequestId,
    alias: decision.alias,
    selectedProvider: decision.selectedProvider,
    selectedModel: decision.selectedModel,
    tier: decision.tier,
    family: decision.familyUsed,
    score: decision.score,
    reason: decision.reason,
    userId: context?.userId,
    apiKeyId: context?.apiKeyId,
    candidateCount: decision.candidates?.length,
    routingLatencyMs: decision.latencyMs,
  }, "Routing decision");
}

// ============================================================================
// Generate Request ID
// ============================================================================

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================================================
// Extract Client IP
// ============================================================================

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}
