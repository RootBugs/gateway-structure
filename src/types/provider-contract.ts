// ============================================================================
// Provider Contract Types - Normalized Internal Format
// ============================================================================
// These types are the ONLY structures the factory and routing engine see.
// No provider-specific fields leak through.
// ============================================================================

// --------------------------------------------------------------------------
// Chat Completions
// --------------------------------------------------------------------------

export interface NormalizedChatRequest {
  model: string;              // Provider's native model ID
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    toolCalls?: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }>;
    toolCallId?: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  stream?: boolean;
  responseFormat?: { type: "text" | "json_object" | "json_schema"; schema?: Record<string, unknown> };
  // Gateway metadata (not sent to provider)
  gatewayRequestId: string;
  sessionId?: string;
  modelAlias?: string;
  modelFamily?: string;
}

export interface NormalizedChatResponse {
  id: string;                 // Provider's response ID
  gatewayRequestId: string;   // Gateway's request ID (for tracing)
  model: string;              // Actual model used
  modelFamily: string;        // Preserved family
  provider: string;           // Provider ID
  choices: Array<{
    index: number;
    message: {
      role: "assistant" | "tool";
      content: string;
      toolCalls?: Array<{
        id: string;
        type: "function";
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  createdAt: number;          // Unix timestamp
}

export interface NormalizedStreamChunk {
  id: string;
  gatewayRequestId: string;
  model: string;
  modelFamily: string;
  provider: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      toolCalls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  createdAt: number;
  // Internal flag for final chunk
  isFinal: boolean;
}

// --------------------------------------------------------------------------
// Embeddings
// --------------------------------------------------------------------------

export interface NormalizedEmbeddingRequest {
  model: string;
  input: string | string[];
  encodingFormat?: "float" | "base64";
  dimensions?: number;
  gatewayRequestId: string;
}

export interface NormalizedEmbeddingResponse {
  id: string;
  gatewayRequestId: string;
  model: string;
  provider: string;
  data: Array<{
    index: number;
    embedding: number[];
    object: "embedding";
  }>;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

// --------------------------------------------------------------------------
// Health & Discovery
// --------------------------------------------------------------------------

export interface NormalizedModelInfo {
  id: string;               // Provider's model ID
  name: string;             // Display name
  provider: string;         // Provider ID
  family: string;           // Model family (llama, qwen, gemini, etc.)
  contextWindow: number;    // Max context length
  maxTokens: number;        // Max output tokens
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsEmbeddings: boolean;
  supportsVision: boolean;
  costPer1kPromptTokens: number;    // USD
  costPer1kCompletionTokens: number; // USD
  isAvailable: boolean;     // Currently available
}

export interface NormalizedHealthStatus {
  provider: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  latencyMs: number;
  lastCheckedAt: Date;
  error?: string;
  modelsAvailable: number;
}

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export interface NormalizedError {
  code: string;             // Standard error code
  message: string;          // Human-readable message
  provider: string;         // Which provider failed
  gatewayRequestId: string; // For tracing
  retryable: boolean;       // Can retry?
  retryAfterMs?: number;    // Suggested wait time
  statusCode?: number;      // HTTP status if applicable
  rawError?: unknown;       // Original error (for debugging only)
}

// --------------------------------------------------------------------------
// Features
// --------------------------------------------------------------------------

export interface FeatureSupport {
  feature: string;          // Feature name
  supported: boolean;
  limitations?: string[]; // Known limitations
  notes?: string;         // Additional info
}

// --------------------------------------------------------------------------
// Cost
// --------------------------------------------------------------------------

export interface CostEstimate {
  provider: string;
  model: string;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostUsd: number;
  currency: "USD";
}

// --------------------------------------------------------------------------
// Standard Error Codes
// --------------------------------------------------------------------------
export const ErrorCodes = {
  // Authentication
  AUTH_INVALID_KEY: "auth_invalid_key",
  AUTH_EXPIRED: "auth_expired",

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
  RATE_LIMIT_PROVIDER: "rate_limit_provider",

  // Provider Errors
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  PROVIDER_TIMEOUT: "provider_timeout",
  PROVIDER_ERROR: "provider_error",
  PROVIDER_INVALID_REQUEST: "provider_invalid_request",

  // Model Errors
  MODEL_NOT_FOUND: "model_not_found",
  MODEL_OVERLOADED: "model_overloaded",

  // Content Errors
  CONTENT_FILTERED: "content_filtered",
  CONTEXT_LENGTH_EXCEEDED: "context_length_exceeded",

  // Gateway Errors
  GATEWAY_ERROR: "gateway_error",
  ROUTING_FAILED: "routing_failed",
  CIRCUIT_OPEN: "circuit_open",

  // Unknown
  UNKNOWN_ERROR: "unknown_error",
} as const;

// --------------------------------------------------------------------------
// Standard Feature Names
// --------------------------------------------------------------------------
export const FeatureNames = {
  STREAMING: "streaming",
  TOOL_CALLING: "tool_calling",
  EMBEDDINGS: "embeddings",
  VISION: "vision",
  JSON_MODE: "json_mode",
  FUNCTION_CALLING: "function_calling",
  SYSTEM_PROMPT: "system_prompt",
} as const;
