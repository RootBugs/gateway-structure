import {
  ProviderConfig,
  getModelAlias,
  getSystemPrompt,
  getModelFamily,
  getProviderConfig,
  getActiveProviderIds,
  getProvidersByFamily,
} from "@/lib/providers/config";
import { createProviderAdapter } from "@/lib/providers/factory";
import { NormalizedChatRequest, NormalizedEmbeddingRequest } from "@/types/provider-contract";
import { prisma } from "@/lib/db/prisma";
import { calculateAllProviderScores, invalidateProviderCache, fetchAllProviderData } from "./scoring";
import { getSessionLock, createSession, switchProvider } from "./session";
import { checkCircuitState, recordSuccess, recordFailure } from "./circuit-breaker";
import { checkProviderHealth, decrementQuota } from "./health-monitor";
import { logRoutingDecision, buildRoutingDecision } from "./audit";
import { RoutingDecision, RoutingCandidate, RoutingExplanation } from "./types";
import logger from "@/lib/logger";

// ============================================================================
// Main Routing Engine
// ============================================================================

export interface RouteChatOptions {
  alias: string;
  messages: NormalizedChatRequest["messages"];
  sessionId?: string;
  userId: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: NormalizedChatRequest["tools"];
  toolChoice?: NormalizedChatRequest["toolChoice"];
  responseFormat?: NormalizedChatRequest["responseFormat"];
  gatewayRequestId: string;
  // Estimated total tokens in the request (for provider capacity filtering)
  estimatedTokens?: number;
  // Providers to exclude from routing (e.g., after failover)
  excludeProviders?: string[];
}

export interface RouteEmbeddingOptions {
  alias: string;
  input: string | string[];
  gatewayRequestId: string;
}

// ============================================================================
// Route Chat Request
// ============================================================================

export async function routeChat(options: RouteChatOptions): Promise<{
  providerId: string;
  modelId: string;
  modelFamily: string;
  adapter: any; // ProviderContract instance
  decision: RoutingDecision;
}> {
  const startTime = Date.now();
  const { alias, sessionId, userId, stream, gatewayRequestId } = options;

  // Get alias configuration
  const aliasConfig = getModelAlias(alias);
  if (!aliasConfig) {
    throw new Error(`Unknown model alias: ${alias}`);
  }

  // Determine requested family
  const requestedFamily = getModelFamily(
    aliasConfig.preferredProviders[0] || ""
  );

  // Check session stickiness
  let lockedProvider: string | undefined;
  let lockedFamily: string | undefined;

  if (sessionId) {
    const lock = await getSessionLock(sessionId, userId, alias, requestedFamily);
    if (lock.locked && lock.providerId) {
      lockedProvider = lock.providerId;
      lockedFamily = lock.modelFamily;
      logger.info({ sessionId, providerId: lockedProvider }, "Session locked to provider");
    } else if (lock.unlockReason) {
      logger.info({ sessionId, reason: lock.unlockReason }, "Session provider unlocked");
    }
  }

  // Get all active providers
  const activeProviders = getActiveProviderIds();
  if (activeProviders.length === 0) {
    throw new Error("No providers available");
  }

  // Calculate scores for all providers
  const candidates = await calculateAllProviderScores(
    activeProviders,
    lockedFamily || requestedFamily,
    stream || false,
    !!options.tools
  );

  // Filter out excluded providers (e.g., after failover)
  const excludeSet = new Set(options.excludeProviders || []);
  if (excludeSet.size > 0) {
    candidates.forEach(c => {
      if (excludeSet.has(c.providerId)) {
        c.rejectionReason = `Excluded: provider failed in previous attempt`;
        logger.info({
          requestId: gatewayRequestId,
          providerId: c.providerId,
        }, "Provider excluded: failed in previous attempt");
      }
    });
  }

  // Filter out providers that can't handle the request size
  // estimatedTokens already includes a 1.2x safety margin from the route handler
  const estimatedTokens = options.estimatedTokens || 0;
  if (estimatedTokens > 0) {
    const beforeCount = candidates.length;
    candidates.forEach(c => {
      if (c.rejectionReason) return; // Already excluded
      const providerConfig = getProviderConfig(c.providerId);
      if (providerConfig?.maxTokensPerRequest && estimatedTokens > providerConfig.maxTokensPerRequest) {
        c.rejectionReason = `Request too large (~${estimatedTokens} tokens > ${providerConfig.maxTokensPerRequest} limit)`;
        logger.info({
          requestId: gatewayRequestId,
          providerId: c.providerId,
          estimatedTokens,
          providerLimit: providerConfig.maxTokensPerRequest,
        }, "Provider excluded: request exceeds token limit");
      }
    });
    logger.info({ requestId: gatewayRequestId, estimatedTokens, candidateCount: beforeCount }, "Providers filtered by request token size");
  }

  // Tier 1: Same family (preferred)
  let tier = 1;
  let eligibleCandidates = candidates.filter(c => {
    if (c.circuitOpen) return false;
    if (c.quotaExhausted) return false;
    if (c.rejectionReason) return false;
    return c.familyMatch;
  });

  // Tier 2: Same capability (allowed)
  if (eligibleCandidates.length === 0) {
    tier = 2;
    eligibleCandidates = candidates.filter(c => {
      if (c.circuitOpen) return false;
      if (c.quotaExhausted) return false;
      if (c.rejectionReason) return false;
      return c.capabilityMatch;
    });
  }

  // Tier 3: Any healthy provider (emergency)
  if (eligibleCandidates.length === 0) {
    tier = 3;
    eligibleCandidates = candidates.filter(c => {
      if (c.circuitOpen) return false;
      if (c.quotaExhausted) return false;
      return !c.rejectionReason;
    });
  }

  // If still no candidates, include all (last resort)
  if (eligibleCandidates.length === 0) {
    tier = 3;
    eligibleCandidates = candidates.filter(c => !c.rejectionReason);
  }

  // If locked provider is eligible, prefer it
  if (lockedProvider) {
    const lockedCandidate = eligibleCandidates.find(c => c.providerId === lockedProvider);
    if (lockedCandidate) {
      // Re-sort to put locked provider first
      eligibleCandidates = [
        lockedCandidate,
        ...eligibleCandidates.filter(c => c.providerId !== lockedProvider),
      ];
    }
  }

  // Sort by score descending
  eligibleCandidates.sort((a, b) => b.score - a.score);

  // Select best candidate
  const selected = eligibleCandidates[0];
  if (!selected) {
    throw new Error("No eligible provider found for request");
  }

  // Get provider config and adapter
  const providerConfig = getProviderConfig(selected.providerId);
  if (!providerConfig) {
    throw new Error(`Provider config not found: ${selected.providerId}`);
  }

  const adapter = createProviderAdapter(selected.providerId);
  const modelId = providerConfig.modelMapping[alias] || alias;
  const actualFamily = getModelFamily(modelId);

  // Update session
  if (sessionId) {
    if (lockedProvider && lockedProvider !== selected.providerId) {
      // Provider switched
      await switchProvider(
        sessionId,
        selected.providerId,
        modelId,
        `Family preservation: ${lockedFamily} → ${actualFamily} (tier ${tier})`
      );
    } else if (!lockedProvider) {
      // New session
      await createSession(sessionId, userId, selected.providerId, alias, modelId);
    }
  }

  // Build and log routing decision
  const decision = buildRoutingDecision(
    gatewayRequestId,
    alias,
    sessionId,
    tier,
    requestedFamily,
    actualFamily,
    selected.providerId,
    modelId,
    selected.score,
    lockedProvider && lockedProvider === selected.providerId
      ? "sticky"
      : tier === 1
      ? "family_match"
      : tier === 2
      ? "capability_match"
      : "emergency",
    candidates,
    startTime
  );

  await logRoutingDecision(decision);

  logger.info({
    requestId: gatewayRequestId,
    alias,
    selectedProvider: selected.providerId,
    selectedModel: modelId,
    tier,
    family: actualFamily,
    score: selected.score,
    reason: decision.reason,
    latencyMs: decision.latencyMs,
  }, "Routing decision made");

  return {
    providerId: selected.providerId,
    modelId,
    modelFamily: actualFamily,
    adapter,
    decision,
  };
}

// ============================================================================
// Route Embedding Request
// ============================================================================

export async function routeEmbedding(options: RouteEmbeddingOptions): Promise<{
  providerId: string;
  modelId: string;
  adapter: any;
  decision: RoutingDecision;
}> {
  const startTime = Date.now();
  const { alias, gatewayRequestId } = options;

  // For embeddings, use first available provider that supports embeddings
  const activeProviders = getActiveProviderIds();

  // Score all providers
  const candidates = await calculateAllProviderScores(
    activeProviders,
    "embedding", // No family for embeddings
    false,
    false
  );

  // Filter for providers that support embeddings
  const eligibleCandidates = candidates.filter(c => {
    if (c.circuitOpen) return false;
    if (c.quotaExhausted) return false;
    return !c.rejectionReason;
  });

  eligibleCandidates.sort((a, b) => b.score - a.score);

  const selected = eligibleCandidates[0];
  if (!selected) {
    throw new Error("No provider available for embeddings");
  }

  const providerConfig = getProviderConfig(selected.providerId);
  if (!providerConfig) {
    throw new Error(`Provider config not found: ${selected.providerId}`);
  }

  const adapter = createProviderAdapter(selected.providerId);
  const modelId = providerConfig.modelMapping[alias] || alias;

  const decision = buildRoutingDecision(
    gatewayRequestId,
    alias,
    undefined,
    1,
    "embedding",
    "embedding",
    selected.providerId,
    modelId,
    selected.score,
    "embedding_request",
    candidates,
    startTime
  );

  await logRoutingDecision(decision);

  return {
    providerId: selected.providerId,
    modelId,
    adapter,
    decision,
  };
}

// ============================================================================
// Dry Run Mode: Explain Routing Decision
// ============================================================================

export async function explainRoutingDecision(
  alias: string,
  sessionId?: string,
  userId?: string
): Promise<RoutingExplanation> {
  const aliasConfig = getModelAlias(alias);
  if (!aliasConfig) {
    throw new Error(`Unknown model alias: ${alias}`);
  }

  const requestedFamily = getModelFamily(
    aliasConfig.preferredProviders[0] || ""
  );

  // Check session lock
  let stickyProvider: string | undefined;
  let lockedFamily: string | undefined;

  if (sessionId && userId) {
    const lock = await getSessionLock(sessionId, userId, alias, requestedFamily);
    if (lock.locked && lock.providerId) {
      stickyProvider = lock.providerId;
      lockedFamily = lock.modelFamily;
    }
  }

  // Get all active providers
  const activeProviders = getActiveProviderIds();

  // Calculate scores
  const candidates = await calculateAllProviderScores(
    activeProviders,
    lockedFamily || requestedFamily,
    true,
    false
  );

  // Determine tier
  let tier = 1;
  let eligibleCandidates = candidates.filter(c => {
    if (c.circuitOpen) return false;
    if (c.quotaExhausted) return false;
    if (c.rejectionReason) return false;
    return c.familyMatch;
  });

  if (eligibleCandidates.length === 0) {
    tier = 2;
    eligibleCandidates = candidates.filter(c => {
      if (c.circuitOpen) return false;
      if (c.quotaExhausted) return false;
      if (c.rejectionReason) return false;
      return c.capabilityMatch;
    });
  }

  if (eligibleCandidates.length === 0) {
    tier = 3;
    eligibleCandidates = candidates.filter(c => {
      if (c.circuitOpen) return false;
      if (c.quotaExhausted) return false;
      return !c.rejectionReason;
    });
  }

  // Sort
  eligibleCandidates.sort((a, b) => b.score - a.score);

  const selected = eligibleCandidates[0];

  // Get health details using batch cache (same as scoring) instead of N individual queries
  const allProviderIds = candidates.map(c => c.providerId);
  const cachedData = await fetchAllProviderData(allProviderIds);

  const healthDetails = candidates.map((c) => {
    const health = cachedData.health.get(c.providerId) || null;
    const provider = cachedData.providers.get(c.providerId) || null;
    const quota = cachedData.quota.get(c.providerId) || null;

    return {
      providerId: c.providerId,
      providerName: c.providerName,
      status: health?.status || "unknown",
      circuitState: health?.circuitState || "unknown",
      healthScore: c.healthScore,
      quotaRemaining: quota?.remainingRequests || 0,
      latencyMs: health?.latencyMs || 0,
      priorityWeight: provider?.priorityWeight || 100,
      finalScore: c.score,
      familyMatch: c.familyMatch,
      capabilityMatch: c.capabilityMatch,
      rejectionReason: c.rejectionReason,
    };
  });

  const explanation = selected
    ? `Selected ${selected.providerId} (score: ${selected.score.toFixed(2)}) via tier ${tier} routing. ` +
      `Family requested: ${lockedFamily || requestedFamily}, ` +
      `actual family: ${getModelFamily(selected.providerId)}. ` +
      `${stickyProvider ? `Session sticky to ${stickyProvider}. ` : ""}` +
      `Candidates evaluated: ${candidates.length}, eligible: ${eligibleCandidates.length}.`
    : `No eligible provider found for alias '${alias}'. All ${candidates.length} candidates rejected.`;

  return {
    alias,
    sessionId,
    stickyProvider,
    tier,
    familyRequested: lockedFamily || requestedFamily,
    candidates: healthDetails,
    selectedProvider: selected?.providerId || "none",
    selectionReason: selected
      ? stickyProvider && stickyProvider === selected.providerId
        ? "sticky"
        : tier === 1
        ? "family_match"
        : tier === 2
        ? "capability_match"
        : "emergency"
      : "no_candidates",
    explanation,
  };
}

// ============================================================================
// Record Provider Result (Success/Failure)
// ============================================================================

export async function recordProviderResult(
  providerId: string,
  success: boolean,
  latencyMs: number,
  tokensIn: number,
  tokensOut: number,
  error?: string
): Promise<void> {
  try {
    if (success) {
      await recordSuccess(providerId);
      await decrementQuota(providerId, tokensIn, tokensOut);
    } else {
      await recordFailure(providerId, error);
    }

    // Update provider health latency
    await prisma.providerHealth.update({
      where: { providerId },
      data: {
        latencyMs,
        lastCheckedAt: new Date(),
      },
    });
  } catch (dbError) {
    // CRITICAL: Never let DB errors in health recording crash the request.
    // The request has already succeeded/failed — just log and continue.
    logger.error(
      { providerId, dbError: (dbError as Error).message },
      "Failed to record provider result in DB"
    );
  }

  // Only invalidate cache on failure (success doesn't change routing decisions)
  // Let 30s TTL handle staleness for normal operation
  if (!success) {
    invalidateProviderCache();
  }
}
