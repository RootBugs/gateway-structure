// ============================================================================
// Routing Engine Types
// ============================================================================

export interface RoutingWeights {
  health: number;
  quota: number;
  latency: number;
  priority: number;
}

export interface RoutingCandidate {
  providerId: string;
  providerName: string;
  score: number;
  healthScore: number;
  quotaScore: number;
  latencyScore: number;
  priorityScore: number;
  familyMatch: boolean;
  capabilityMatch: boolean;
  circuitOpen: boolean;
  quotaExhausted: boolean;
  rejectionReason?: string;
}

export interface RoutingDecision {
  requestId: string;
  alias: string;
  sessionId?: string;
  tier: number;
  familyRequested: string;
  familyUsed: string;
  selectedProvider: string;
  selectedModel: string;
  score: number;
  reason: string;
  candidates: RoutingCandidate[];
  latencyMs: number;
  createdAt: Date;
}

export interface RoutingExplanation {
  alias: string;
  sessionId?: string;
  stickyProvider?: string;
  tier: number;
  familyRequested: string;
  candidates: Array<{
    providerId: string;
    providerName: string;
    status: string;
    circuitState: string;
    healthScore: number;
    quotaRemaining: number;
    latencyMs: number;
    priorityWeight: number;
    finalScore: number;
    familyMatch: boolean;
    capabilityMatch: boolean;
    rejectionReason?: string;
  }>;
  selectedProvider: string;
  selectionReason: string;
  explanation: string;
}

export interface SessionLockStatus {
  locked: boolean;
  providerId?: string;
  modelFamily?: string;
  switchCount: number;
  unlockReason?: string;
}

export interface QuotaState {
  providerId: string;
  remainingRequests: number;
  remainingTokens: number;
  resetAt: Date;
  updatedAt: Date;
}
