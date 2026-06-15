import {
  ProviderContract,
  NormalizedChatRequest,
  NormalizedChatResponse,
  NormalizedStreamChunk,
  NormalizedEmbeddingRequest,
  NormalizedEmbeddingResponse,
  NormalizedModelInfo,
  NormalizedHealthStatus,
  NormalizedError,
  FeatureSupport,
  CostEstimate,
  ErrorCodes,
  FeatureNames,
} from "./contract";
import { ProviderConfig } from "./config";
import logger from "@/lib/logger";

export abstract class BaseAdapter implements ProviderContract {
  protected config: ProviderConfig;
  protected apiKey: string;
  protected providerId: string;

  constructor(providerId: string, config: ProviderConfig) {
    this.providerId = providerId;
    this.config = config;
    // Try plural first (GEMINI_API_KEYS), then singular (GEMINI_API_KEY)
    // Matches the pattern in key-rotation.ts and factory.ts
    this.apiKey = config.apiKeyEnvVar
      ? (process.env[config.apiKeyEnvVar] || process.env[config.apiKeyEnvVar.replace("_KEYS", "_KEY")] || "")
      : "";
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (!this.apiKey && this.config.apiKeyEnvVar) {
      throw new Error(`API key not configured for ${this.providerId}`);
    }
    // Test connectivity via health check
    await this.healthCheck();
    logger.info({ provider: this.providerId }, "Provider adapter initialized");
  }

  // --------------------------------------------------------------------------
  // Abstract Methods (must be implemented by subclasses)
  // --------------------------------------------------------------------------

  abstract chat(request: NormalizedChatRequest): Promise<NormalizedChatResponse>;
  abstract stream(request: NormalizedChatRequest): AsyncGenerator<NormalizedStreamChunk>;
  abstract embeddings(request: NormalizedEmbeddingRequest): Promise<NormalizedEmbeddingResponse>;
  abstract healthCheck(): Promise<NormalizedHealthStatus>;
  abstract getModels(): Promise<NormalizedModelInfo[]>;

  // --------------------------------------------------------------------------
  // Feature Support (default implementation, override if needed)
  // --------------------------------------------------------------------------

  supportsFeature(feature: string): FeatureSupport {
    const features: Record<string, boolean> = {
      [FeatureNames.STREAMING]: this.config.supportsStreaming,
      [FeatureNames.TOOL_CALLING]: true,  // Most providers support this now
      [FeatureNames.EMBEDDINGS]: true,    // Most providers support this
      [FeatureNames.VISION]: false,        // Override per provider
      [FeatureNames.JSON_MODE]: true,
      [FeatureNames.SYSTEM_PROMPT]: true,
    };

    return {
      feature,
      supported: features[feature] ?? false,
      limitations: feature === FeatureNames.EMBEDDINGS && this.providerId === "groq" 
        ? ["Groq does not support embeddings API"]
        : undefined,
      notes: feature === FeatureNames.STREAMING && !this.config.supportsStreaming
        ? "Streaming not supported by this provider"
        : undefined,
    };
  }

  // --------------------------------------------------------------------------
  // Cost Estimation (default implementation)
  // --------------------------------------------------------------------------

  estimateCost(request: NormalizedChatRequest | NormalizedEmbeddingRequest): CostEstimate {
    let estimatedPromptTokens = 0;
    let estimatedCompletionTokens = 0;

    if ('messages' in request) {
      // Chat request
      const promptText = request.messages.map(m => m.content).join(" ");
      estimatedPromptTokens = Math.ceil(promptText.length / 4);
      estimatedCompletionTokens = request.maxTokens || 1024;
    } else {
      // Embedding request
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      const totalText = inputs.join(" ");
      estimatedPromptTokens = Math.ceil(totalText.length / 4);
      estimatedCompletionTokens = 0;
    }

    // Default cost: $0.001 per 1K tokens (rough estimate)
    const costPer1k = 0.001;
    const estimatedCostUsd = ((estimatedPromptTokens + estimatedCompletionTokens) / 1000) * costPer1k;

    return {
      provider: this.providerId,
      model: request.model,
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedCostUsd,
      currency: "USD",
    };
  }

  // --------------------------------------------------------------------------
  // Error Normalization
  // --------------------------------------------------------------------------

  normalizeError(error: unknown): NormalizedError {
    const gatewayRequestId = this.extractRequestId(error) || "unknown";

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network errors
      if (message.includes("fetch") || message.includes("network") || message.includes("connection")) {
        return {
          code: ErrorCodes.PROVIDER_UNAVAILABLE,
          message: `Provider ${this.providerId} is unreachable`,
          provider: this.providerId,
          gatewayRequestId,
          retryable: true,
          retryAfterMs: 1000,
          rawError: error,
        };
      }

      // Timeout
      if (message.includes("timeout") || message.includes("abort")) {
        return {
          code: ErrorCodes.PROVIDER_TIMEOUT,
          message: `Provider ${this.providerId} request timed out`,
          provider: this.providerId,
          gatewayRequestId,
          retryable: true,
          retryAfterMs: 2000,
          rawError: error,
        };
      }
    }

    // HTTP response errors
    if (typeof error === "object" && error !== null && "status" in error) {
      const statusError = error as { status: number; message?: string; code?: string };
      const status = statusError.status;

      switch (status) {
        case 400:
          return {
            code: ErrorCodes.PROVIDER_INVALID_REQUEST,
            message: statusError.message || "Invalid request to provider",
            provider: this.providerId,
            gatewayRequestId,
            retryable: false,
            statusCode: status,
            rawError: error,
          };
        case 401:
          return {
            code: ErrorCodes.AUTH_INVALID_KEY,
            message: "Invalid API key for provider",
            provider: this.providerId,
            gatewayRequestId,
            retryable: false,
            statusCode: status,
            rawError: error,
          };
        case 429:
          return {
            code: ErrorCodes.RATE_LIMIT_PROVIDER,
            message: "Provider rate limit exceeded",
            provider: this.providerId,
            gatewayRequestId,
            retryable: true,
            retryAfterMs: 5000,
            statusCode: status,
            rawError: error,
          };
        case 500:
        case 502:
        case 503:
          return {
            code: ErrorCodes.PROVIDER_ERROR,
            message: `Provider ${this.providerId} internal error`,
            provider: this.providerId,
            gatewayRequestId,
            retryable: true,
            retryAfterMs: 2000,
            statusCode: status,
            rawError: error,
          };
        default:
          return {
            code: ErrorCodes.PROVIDER_ERROR,
            message: statusError.message || `Provider error: ${status}`,
            provider: this.providerId,
            gatewayRequestId,
            retryable: status >= 500,
            statusCode: status,
            rawError: error,
          };
      }
    }

    // Default unknown error
    return {
      code: ErrorCodes.UNKNOWN_ERROR,
      message: error instanceof Error ? error.message : "Unknown error",
      provider: this.providerId,
      gatewayRequestId,
      retryable: false,
      rawError: error,
    };
  }

  // --------------------------------------------------------------------------
  // HTTP Utilities
  // --------------------------------------------------------------------------

  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.config.headers,
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    // Merge extra headers if defined
    if (this.config.extraHeaders) {
      Object.assign(headers, this.config.extraHeaders);
    }

    return headers;
  }

  protected mapModel(alias: string): string {
    return this.config.modelMapping[alias] || alias;
  }

  protected async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = this.config.maxRetries
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let i = 0; i <= retries; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        logger.warn({
          provider: this.providerId,
          attempt: i + 1,
          error: lastError.message,
        }, "Request failed, retrying");

        if (i < retries) {
          const delay = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  // --------------------------------------------------------------------------
  // Normalized Response Builders
  // --------------------------------------------------------------------------

  protected buildChatResponse(
    providerResponse: any,
    request: NormalizedChatRequest,
    latencyMs: number
  ): NormalizedChatResponse {
    return {
      id: providerResponse.id || `resp-${Date.now()}`,
      gatewayRequestId: request.gatewayRequestId,
      model: providerResponse.model || request.model,
      modelFamily: request.modelFamily || "unknown",
      provider: this.providerId,
      choices: providerResponse.choices?.map((choice: any, index: number) => ({
        index,
        message: {
          role: "assistant",
          content: choice.message?.content || "",
          toolCalls: choice.message?.tool_calls?.map((tc: any) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.function?.name || "",
              arguments: tc.function?.arguments || "",
            },
          })),
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
      })) || [{
        index: 0,
        message: { role: "assistant", content: "" },
        finishReason: "stop",
      }],
      usage: {
        promptTokens: providerResponse.usage?.prompt_tokens || 0,
        completionTokens: providerResponse.usage?.completion_tokens || 0,
        totalTokens: providerResponse.usage?.total_tokens || 0,
      },
      latencyMs,
      createdAt: providerResponse.created || Math.floor(Date.now() / 1000),
    };
  }

  protected buildStreamChunk(
    providerChunk: any,
    request: NormalizedChatRequest,
    isFinal: boolean = false
  ): NormalizedStreamChunk {
    return {
      id: providerChunk.id || `chunk-${Date.now()}`,
      gatewayRequestId: request.gatewayRequestId,
      model: providerChunk.model || request.model,
      modelFamily: request.modelFamily || "unknown",
      provider: this.providerId,
      choices: providerChunk.choices?.map((choice: any, index: number) => ({
        index,
        delta: {
          role: choice.delta?.role,
          content: choice.delta?.content,
          toolCalls: choice.delta?.tool_calls?.map((tc: any) => ({
            index: tc.index,
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function?.name,
              arguments: tc.function?.arguments,
            },
          })),
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
      })) || [{
        index: 0,
        delta: {},
        finishReason: null,
      }],
      usage: providerChunk.usage ? {
        promptTokens: providerChunk.usage.prompt_tokens,
        completionTokens: providerChunk.usage.completion_tokens,
        totalTokens: providerChunk.usage.total_tokens,
      } : undefined,
      createdAt: providerChunk.created || Math.floor(Date.now() / 1000),
      isFinal,
    };
  }

  protected buildEmbeddingResponse(
    providerResponse: any,
    request: NormalizedEmbeddingRequest,
    latencyMs: number
  ): NormalizedEmbeddingResponse {
    return {
      id: providerResponse.id || `emb-${Date.now()}`,
      gatewayRequestId: request.gatewayRequestId,
      model: providerResponse.model || request.model,
      provider: this.providerId,
      data: providerResponse.data?.map((item: any, index: number) => ({
        index,
        embedding: item.embedding,
        object: "embedding" as const,
      })) || [],
      usage: {
        promptTokens: providerResponse.usage?.prompt_tokens || 0,
        totalTokens: providerResponse.usage?.total_tokens || 0,
      },
      latencyMs,
    };
  }

  protected buildHealthStatus(
    status: "healthy" | "degraded" | "unhealthy" | "unknown",
    latencyMs: number,
    modelsAvailable: number = 0,
    error?: string
  ): NormalizedHealthStatus {
    return {
      provider: this.providerId,
      status,
      latencyMs,
      lastCheckedAt: new Date(),
      error,
      modelsAvailable,
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private mapFinishReason(reason: string | null): "stop" | "length" | "tool_calls" | "content_filter" | null {
    if (!reason) return null;
    if (reason === "stop" || reason === "COMPLETE") return "stop";
    if (reason === "length" || reason === "MAX_TOKENS") return "length";
    if (reason === "tool_calls" || reason === "tool_call") return "tool_calls";
    if (reason === "content_filter") return "content_filter";
    return null;
  }

  private extractRequestId(error: unknown): string | undefined {
    if (typeof error === "object" && error !== null) {
      const e = error as any;
      return e.gatewayRequestId || e.requestId;
    }
    return undefined;
  }

  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
