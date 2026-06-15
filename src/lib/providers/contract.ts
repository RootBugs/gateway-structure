// ============================================================================
// Provider Contract Interface
// ============================================================================
// Every provider adapter MUST implement this interface.
// Factory and routing engine must NEVER know provider-specific response structures.
// All adapters return normalized internal formats only.
// ============================================================================



export interface ProviderContract {
  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Initialize the provider adapter.
   * Validates API key, tests connectivity, loads model list.
   * Must be called before any other method.
   * @returns Promise resolving when ready, rejecting with NormalizedError on failure.
   */
  initialize(): Promise<void>;

  // --------------------------------------------------------------------------
  // Chat Completions
  // --------------------------------------------------------------------------

  /**
   * Send a chat completion request (non-streaming).
   * @param request Normalized chat request
   * @returns Promise resolving to normalized response
   */
  chat(request: NormalizedChatRequest): Promise<NormalizedChatResponse>;

  /**
   * Send a chat completion request (streaming).
   * @param request Normalized chat request
   * @returns AsyncGenerator yielding normalized stream chunks
   */
  stream(request: NormalizedChatRequest): AsyncGenerator<NormalizedStreamChunk>;

  // --------------------------------------------------------------------------
  // Embeddings
  // --------------------------------------------------------------------------

  /**
   * Send an embeddings request.
   * @param request Normalized embedding request
   * @returns Promise resolving to normalized embedding response
   */
  embeddings(request: NormalizedEmbeddingRequest): Promise<NormalizedEmbeddingResponse>;

  // --------------------------------------------------------------------------
  // Health & Discovery
  // --------------------------------------------------------------------------

  /**
   * Check provider health by sending a minimal test request.
   * @returns Promise resolving to normalized health status
   */
  healthCheck(): Promise<NormalizedHealthStatus>;

  /**
   * Get list of available models from this provider.
   * @returns Promise resolving to array of normalized model info
   */
  getModels(): Promise<NormalizedModelInfo[]>;

  // --------------------------------------------------------------------------
  // Capabilities
  // --------------------------------------------------------------------------

  /**
   * Check if provider supports a specific feature.
   * @param feature Feature to check
   * @returns Feature support details
   */
  supportsFeature(feature: string): FeatureSupport;

  // --------------------------------------------------------------------------
  // Cost Estimation
  // --------------------------------------------------------------------------

  /**
   * Estimate cost for a request before sending.
   * @param request Normalized request (chat or embedding)
   * @returns Cost estimate in USD
   */
  estimateCost(request: NormalizedChatRequest | NormalizedEmbeddingRequest): CostEstimate;

  // --------------------------------------------------------------------------
  // Error Normalization
  // --------------------------------------------------------------------------

  /**
   * Convert any provider-specific error into normalized error.
   * @param error Raw error from provider (Error object, HTTP response, JSON)
   * @returns Normalized error with standard code and retryable flag
   */
  normalizeError(error: unknown): NormalizedError;
}

// ============================================================================
// Normalized Types (Internal Format)
// ============================================================================
// These types are the ONLY structures the factory and routing engine see.
// No provider-specific fields leak through.
// ============================================================================

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

export interface FeatureSupport {
  feature: string;          // "streaming", "tool_calling", "embeddings", "vision", "json_mode"
  supported: boolean;
  limitations?: string[]; // Known limitations
  notes?: string;         // Additional info
}

export interface CostEstimate {
  provider: string;
  model: string;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostUsd: number;
  currency: "USD";
}

// ============================================================================
// Standard Error Codes
// ============================================================================
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

// ============================================================================
// Standard Feature Names
// ============================================================================
export const FeatureNames = {
  STREAMING: "streaming",
  TOOL_CALLING: "tool_calling",
  EMBEDDINGS: "embeddings",
  VISION: "vision",
  JSON_MODE: "json_mode",
  FUNCTION_CALLING: "function_calling",
  SYSTEM_PROMPT: "system_prompt",
} as const;
