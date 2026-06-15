import { prisma } from "@/lib/db/prisma";
import { ProviderConfig, getProviderConfig, getModelFamily } from "@/lib/providers/config";
import { RoutingWeights, RoutingCandidate } from "./types";
import logger from "@/lib/logger";

// ============================================================================
// Default Weights (configurable via environment)
// ============================================================================

const DEFAULT_WEIGHTS: RoutingWeights = {
  health: parseFloat(process.env.ROUTING_WEIGHT_HEALTH || "0.35"),
  quota: parseFloat(process.env.ROUTING_WEIGHT_QUOTA || "0.25"),
  latency: parseFloat(process.env.ROUTING_WEIGHT_LATENCY || "0.20"),
  priority: parseFloat(process.env.ROUTING_WEIGHT_PRIORITY || "0.20"),
};

function getWeights(): RoutingWeights {
  return {
    health: parseFloat(process.env.ROUTING_WEIGHT_HEALTH || String(DEFAULT_WEIGHTS.health)),
    quota: parseFloat(process.env.ROUTING_WEIGHT_QUOTA || String(DEFAULT_WEIGHTS.quota)),
    latency: parseFloat(process.env.ROUTING_WEIGHT_LATENCY || String(DEFAULT_WEIGHTS.latency)),
    priority: parseFloat(process.env.ROUTING_WEIGHT_PRIORITY || String(DEFAULT_WEIGHTS.priority)),
  };
}

// ============================================================================
// In-Memory Cache for Provider Data
// ============================================================================
// Caches the results of batch DB queries to avoid hitting Supabase on every request.
// TTL: 30 seconds — balances freshness vs latency reduction.

export interface CachedProviderData {
  health: Map<string, any>;
  quota: Map<string, any>;
  providers: Map<string, any>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
let providerCache: CachedProviderData | null = null;

function getCache(): CachedProviderData | null {
  if (!providerCache) return null;
  if (Date.now() - providerCache.fetchedAt > CACHE_TTL_MS) {
    providerCache = null;
    return null;
  }
  return providerCache;
}

function setCache(data: CachedProviderData): void {
  providerCache = data;
}

/** Invalidate cache (e.g. after provider failure/success) */
export function invalidateProviderCache(): void {
  providerCache = null;
}

// ============================================================================
// Batch Fetch All Provider Data (3 queries instead of 36+)
// ============================================================================

export async function fetchAllProviderData(providerIds: string[]): Promise<CachedProviderData> {
  const cached = getCache();
  if (cached) return cached;

  const startTime = Date.now();

  // 3 batch queries instead of 3 × N individual queries
  const [healthRows, quotaRows, providerRows] = await Promise.all([
    prisma.providerHealth.findMany(),
    prisma.providerQuotaState.findMany(),
    prisma.provider.findMany(),
  ]);

  const health = new Map<string, any>();
  for (const row of healthRows) {
    health.set(row.providerId, row);
  }

  const quota = new Map<string, any>();
  for (const row of quotaRows) {
    quota.set(row.providerId, row);
  }

  const providers = new Map<string, any>();
  for (const row of providerRows) {
    providers.set(row.id, row);
  }

  const data: CachedProviderData = {
    health,
    quota,
    providers,
    fetchedAt: Date.now(),
  };

  setCache(data);

  logger.debug(
    { providerCount: providerIds.length, fetchMs: Date.now() - startTime },
    "Batch provider data fetched"
  );

  return data;
}

// ============================================================================
// Score Calculation (uses cached batch data)
// ============================================================================

export async function calculateProviderScore(
  providerId: string,
  requestedFamily: string,
  requiresStreaming: boolean,
  requiresTools: boolean,
  cachedData: CachedProviderData
): Promise<RoutingCandidate | null> {
  const config = getProviderConfig(providerId);
  if (!config) return null;

  const weights = getWeights();

  // Use cached data instead of individual DB queries
  const health = cachedData.health.get(providerId) || null;
  const quotaState = cachedData.quota.get(providerId) || null;
  const provider = cachedData.providers.get(providerId) || null;

  if (!provider || !provider.isEnabled) {
    return null;
  }

  // Check circuit breaker
  if (health?.circuitState === "open") {
    // Check if should transition to half-open
    if (health.circuitOpenedAt && Date.now() - health.circuitOpenedAt.getTime() > 60000) {
      // Allow through - will be checked on request
    } else {
      return createRejectedCandidate(providerId, provider.displayName, "Circuit breaker open");
    }
  }

  // Calculate health score (0-100)
  const healthScore = calculateHealthScore(health);

  // Calculate quota score (0-100)
  const quotaScore = calculateQuotaScore(quotaState, provider.quotaLimitDaily);

  // Calculate latency score (0-100)
  const latencyScore = calculateLatencyScore(health?.latencyMs || 0);

  // Priority score (0-100)
  const priorityScore = provider.priorityWeight;

  // Calculate final score
  const score =
    healthScore * weights.health +
    quotaScore * weights.quota +
    latencyScore * weights.latency +
    priorityScore * weights.priority;

  // Check family match
  const providerFamily = getModelFamily(Object.values(config.modelMapping)[0] || "");
  const familyMatch = providerFamily === requestedFamily;

  // Check capability match
  const capabilityMatch =
    (!requiresStreaming || config.supportsStreaming) &&
    (!requiresTools || true);

  // Check quota exhaustion
  const quotaExhausted =
    (quotaState?.remainingRequests || 0) <= 0 ||
    (quotaState?.remainingTokens || 0) <= 0;

  return {
    providerId,
    providerName: provider.displayName,
    score,
    healthScore,
    quotaScore,
    latencyScore,
    priorityScore,
    familyMatch,
    capabilityMatch,
    circuitOpen: health?.circuitState === "open",
    quotaExhausted,
  };
}

// ============================================================================
// Health Score Calculation
// ============================================================================

function calculateHealthScore(health: any): number {
  if (!health) return 50; // Unknown = middle score

  let score = 0;
  switch (health.status) {
    case "healthy":
      score = health.circuitState === "half-open" ? 75 : 100;
      break;
    case "degraded":
      score = 50;
      break;
    case "unhealthy":
      score = 0;
      break;
    default:
      score = 50;
  }

  // Penalize providers with recent consecutive failures
  // Even if circuit isn't open yet, recent failures indicate instability
  if (health.consecutiveFailures > 0 && score > 10) {
    const penalty = Math.min(40, health.consecutiveFailures * 10);
    score = Math.max(10, score - penalty);
  }

  // Penalize providers with recent errors using smooth linear decay
  // This avoids routing oscillation at arbitrary time boundaries
  if (health.lastErrorAt) {
    const errorAge = Date.now() - new Date(health.lastErrorAt).getTime();
    let penalty = 0;
    if (errorAge < 60_000) {
      penalty = 30 * (1 - errorAge / 60_000); // 30 → 0 over 60s
    } else if (errorAge < 120_000) {
      penalty = 15 * (1 - (errorAge - 60_000) / 60_000); // 15 → 0 over next 60s
    }
    if (penalty > 0) {
      score = Math.max(10, score - penalty);
    }
  }

  return score;
}

// ============================================================================
// Quota Score Calculation
// ============================================================================

function calculateQuotaScore(quotaState: any, quotaLimitDaily: number): number {
  if (quotaLimitDaily === 0) {
    return 100; // Unlimited
  }

  if (!quotaState) {
    return 100; // No quota state yet - assume full quota
  }

  if (quotaState.resetAt < new Date()) {
    return 100; // Quota reset
  }

  const remainingRequests = quotaState.remainingRequests || 0;
  const remainingTokens = quotaState.remainingTokens || 0;

  if (remainingRequests <= 0 || remainingTokens <= 0) {
    return 0; // Exhausted
  }

  const requestRatio = remainingRequests / quotaLimitDaily;
  return Math.min(100, Math.max(0, requestRatio * 100));
}

// ============================================================================
// Latency Score Calculation
// ============================================================================

function calculateLatencyScore(latencyMs: number): number {
  const score = 100 - (latencyMs / 1000) * 10;
  return Math.min(100, Math.max(0, score));
}

// ============================================================================
// Rejected Candidate Helper
// ============================================================================

function createRejectedCandidate(
  providerId: string,
  providerName: string,
  rejectionReason: string
): RoutingCandidate {
  return {
    providerId,
    providerName,
    score: 0,
    healthScore: 0,
    quotaScore: 0,
    latencyScore: 0,
    priorityScore: 0,
    familyMatch: false,
    capabilityMatch: false,
    circuitOpen: true,
    quotaExhausted: false,
    rejectionReason,
  };
}

// ============================================================================
// Batch Score Calculation (single batch fetch, then score in-memory)
// ============================================================================

export async function calculateAllProviderScores(
  providerIds: string[],
  requestedFamily: string,
  requiresStreaming: boolean,
  requiresTools: boolean
): Promise<RoutingCandidate[]> {
  // Single batch fetch: 3 DB queries total (health, quota, providers)
  const cachedData = await fetchAllProviderData(providerIds);

  // Score each provider using cached data (no DB queries)
  const candidates = await Promise.all(
    providerIds.map(id =>
      calculateProviderScore(id, requestedFamily, requiresStreaming, requiresTools, cachedData)
    )
  );

  return candidates.filter((c): c is RoutingCandidate => c !== null);
}
