import { BaseAdapter } from "../adapter";
import {
  NormalizedChatRequest,
  NormalizedChatResponse,
  NormalizedStreamChunk,
  NormalizedEmbeddingRequest,
  NormalizedEmbeddingResponse,
  NormalizedModelInfo,
  NormalizedHealthStatus,
  NormalizedError,
  ErrorCodes,
} from "../contract";
import { ProviderConfig } from "../config";
import rotationManager from "../key-rotation";
import logger from "@/lib/logger";

/**
 * OpenAICompatibleAdapter
 * Handles ALL providers that expose an OpenAI-compatible API:
 * Gemini, Groq, OpenRouter, Cerebras, SambaNova, Cohere,
 * HuggingFace (router), Together, Fireworks, Ollama, vLLM
 *
 * Request transformation: NONE (pass-through with provider-specific headers/filters)
 * Response transformation: NONE (pass-through)
 * Streaming: Standard SSE format
 * Error handling: Standard OpenAI error format
 */
export class OpenAICompatibleAdapter extends BaseAdapter {
  constructor(providerId: string, config: ProviderConfig) {
    super(providerId, config);
  }

  private currentApiKey: string | null = null;

  // Override getHeaders to use rotating keys
  protected override getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.config.headers,
      "Content-Type": "application/json",
    };

    // Use rotating key if available, fallback to first static key
    // Note: this.apiKey may be comma-separated if env has multiple keys,
    // so always prefer currentApiKey from rotation manager.
    const keyToUse = this.currentApiKey || this.apiKey.split(",")[0]?.trim() || "";
    if (keyToUse) {
      headers["Authorization"] = `Bearer ${keyToUse}`;

      // Add key tracking header for OpenRouter — includes the actual key index
      // from the rotation manager so logs show exactly which key was used
      if (this.providerId === "openrouter" && this.currentApiKey) {
        const keyIdx = rotationManager.getKeyIndex(this.providerId, this.currentApiKey);
        headers["X-Request-ID"] = `gw-or-k${keyIdx + 1}-${Date.now()}`;
      }
    }

    // Merge extra headers if defined
    if (this.config.extraHeaders) {
      Object.assign(headers, this.config.extraHeaders);
    }

    return headers;
  }

  // Get next rotating key (call before each request)
  // Sets currentApiKey to null when all keys exhausted so fetchWithKeyRotation can detect this.
  private refreshApiKey(): void {
    const nextKey = rotationManager.getNextKey(this.providerId);
    if (nextKey) {
      this.currentApiKey = nextKey;
      logger.debug(
        { provider: this.providerId, keyPrefix: nextKey.substring(0, 12) + "..." },
        "Rotated to next API key"
      );
    } else {
      // No keys available from rotation manager — set to null so callers can detect exhaustion
      this.currentApiKey = null;
      logger.warn(
        { provider: this.providerId },
        "No API keys available from rotation manager"
      );
    }
  }

  // Report success for key rotation
  private reportKeySuccess(): void {
    if (this.currentApiKey) {
      rotationManager.reportSuccess(this.providerId, this.currentApiKey);
    }
  }

  // ============================================================================
  // Chat Completions (Non-Streaming)
  // ============================================================================

  async chat(request: NormalizedChatRequest): Promise<NormalizedChatResponse> {
    const startTime = Date.now();
    const model = this.mapModel(request.model);
    const url = `${this.config.baseUrl}/chat/completions`;

    // Build request body
    const body = this.buildRequestBody(request, model);

    // Apply provider-specific request transformation if defined
    const finalBody = this.config.requestTransform
      ? this.config.requestTransform(body)
      : body;

    logger.debug({
      provider: this.providerId,
      model,
      gatewayRequestId: request.gatewayRequestId,
    }, "Sending chat request");

    try {
      const response = await this.fetchWithKeyRotation(url, {
        method: "POST",
        body: JSON.stringify(finalBody),
      });

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      this.reportKeySuccess();

      // Apply provider-specific response transformation if defined
      const finalData = this.config.responseTransform
        ? this.config.responseTransform(data)
        : data;

      logger.debug({
        provider: this.providerId,
        model,
        latencyMs,
        gatewayRequestId: request.gatewayRequestId,
      }, "Chat response received");

      return this.buildChatResponse(finalData, request, latencyMs);
    } catch (error) {
      // Only report final failure here — fetchWithKeyRotation handles intermediate retries
      const normalizedError = this.normalizeError(error);
      logger.error({
        provider: this.providerId,
        error: normalizedError,
        gatewayRequestId: request.gatewayRequestId,
      }, "Chat request failed");
      throw normalizedError;
    }
  }

  // ============================================================================
  // Fetch with Key Rotation
  // ============================================================================
  // On 429 rate limit, immediately rotate to next key and retry
  // (instead of wasting retries on the same rate-limited key)

  private async fetchWithKeyRotation(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    let lastError: Error | undefined;
    const maxAttempts = Math.max(2, this.config.maxRetries + 1);

    // Get first key from rotation manager (not static fallback)
    this.refreshApiKey();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check if we have a key to try — if rotation returned null, all keys exhausted
      if (!this.currentApiKey) {
        logger.warn({
          provider: this.providerId,
          attempt: attempt + 1,
        }, "No API key available — rotation exhausted, stopping retries");
        break;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        // Get fresh headers (with rotating key) for each attempt
        const headers = this.getHeaders();
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Handle 429 rate limit — rotate key immediately (no backoff)
        if (response.status === 429) {
          const errorText = await response.text();
          const keyPrefix = this.currentApiKey?.substring(0, 12) || "unknown";
          logger.warn({
            provider: this.providerId,
            attempt: attempt + 1,
            keyPrefix,
          }, "Rate limited (429), rotating to next key");

          // Report failure for this key (immediate cooldown) and rotate
          rotationManager.reportFailure(this.providerId, this.currentApiKey || "", true);
          this.refreshApiKey();
          lastError = new Error(`HTTP 429: ${errorText}`);
          continue; // Try next key immediately without backoff
        }

        // Non-retryable client errors (4xx except 429) — fail fast, don't rotate
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const errorText = await response.text();
          const errMsg = `HTTP ${response.status}: ${errorText}`;
          logger.warn({
            provider: this.providerId,
            attempt: attempt + 1,
            status: response.status,
            keyPrefix: this.currentApiKey?.substring(0, 12) || "unknown",
          }, `Client error (${response.status}), not rotating key`);
          // Mark the key as having a failure (not rate-limit), but don't rotate —
          // if all keys share the same auth issue, rotation won't help.
          // Using `break` instead of `throw` to skip the catch block's rotation logic.
          rotationManager.reportFailure(this.providerId, this.currentApiKey || "", false);
          lastError = new Error(errMsg);
          break;
        }

        // Server errors (5xx) — retryable, rotate key
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        logger.warn({
          provider: this.providerId,
          attempt: attempt + 1,
          error: lastError.message,
        }, "Request failed, rotating to next key");

        // Report failure so the key enters cooldown
        rotationManager.reportFailure(this.providerId, this.currentApiKey || "", false);
        this.refreshApiKey();

        // Exponential backoff: 1s, 2s, 4s... (but only if there's a next attempt)
        if (attempt < maxAttempts - 1) {
          const delay = Math.min(4000, Math.pow(2, attempt) * 1000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new Error("Request failed after all key rotation attempts");
  }

  // ============================================================================
  // Chat Completions (Streaming)
  // ============================================================================

  async *stream(request: NormalizedChatRequest): AsyncGenerator<NormalizedStreamChunk> {
    const startTime = Date.now();
    const model = this.mapModel(request.model);
    const url = `${this.config.baseUrl}/chat/completions`;

    const body = this.buildRequestBody(request, model);
    body.stream = true;
    body.stream_options = { include_usage: true };

    const finalBody = this.config.requestTransform
      ? this.config.requestTransform(body)
      : body;

    logger.debug({
      provider: this.providerId,
      model,
      gatewayRequestId: request.gatewayRequestId,
    }, "Starting stream request");

    let response: Response;
    try {
      response = await this.fetchWithKeyRotation(url, {
        method: "POST",
        body: JSON.stringify(finalBody),
      });
      this.reportKeySuccess();
    } catch (error) {
      // Only report final failure here — fetchWithKeyRotation handles intermediate retries
      const normalizedError = this.normalizeError(error);
      logger.error({
        provider: this.providerId,
        error: normalizedError,
        gatewayRequestId: request.gatewayRequestId,
      }, "Stream request failed");
      throw normalizedError;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw this.normalizeError(new Error("No response body for streaming"));
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let usageReported = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6);

          // Stream terminator
          if (data === "[DONE]") {
            yield this.buildStreamChunk({
              id: `stream-${request.gatewayRequestId}`,
              choices: [],
            }, request, true);
            return;
          }

          try {
            const chunk = JSON.parse(data);

            // Handle usage in final chunk (OpenAI format)
            if (chunk.usage && !usageReported) {
              usageReported = true;
            }

            yield this.buildStreamChunk(chunk, request, false);
          } catch (parseError) {
            logger.warn({
              provider: this.providerId,
              line,
              gatewayRequestId: request.gatewayRequestId,
            }, "Failed to parse stream chunk");
          }
        }
      }

      // Final chunk if no [DONE] received
      yield this.buildStreamChunk({
        id: `stream-${request.gatewayRequestId}`,
        choices: [],
      }, request, true);

    } catch (error) {
      logger.error({
        provider: this.providerId,
        error,
        gatewayRequestId: request.gatewayRequestId,
      }, "Stream processing error");
      throw this.normalizeError(error);
    } finally {
      reader.releaseLock();
    }
  }

  // ============================================================================
  // Embeddings
  // ============================================================================

  async embeddings(request: NormalizedEmbeddingRequest): Promise<NormalizedEmbeddingResponse> {
    const startTime = Date.now();
    const model = this.mapModel(request.model);
    const url = `${this.config.baseUrl}/embeddings`;

    const body = {
      model,
      input: request.input,
      encoding_format: request.encodingFormat || "float",
    };

    if (request.dimensions) {
      (body as any).dimensions = request.dimensions;
    }

    logger.debug({
      provider: this.providerId,
      model,
      gatewayRequestId: request.gatewayRequestId,
    }, "Sending embeddings request");

    try {
      const response = await this.fetchWithKeyRotation(url, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      this.reportKeySuccess();
      return this.buildEmbeddingResponse(data, request, latencyMs);
    } catch (error) {
      // Only report final failure here — fetchWithKeyRotation handles intermediate retries
      const normalizedError = this.normalizeError(error);
      logger.error({
        provider: this.providerId,
        error: normalizedError,
        gatewayRequestId: request.gatewayRequestId,
      }, "Embeddings request failed");
      throw normalizedError;
    }
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async healthCheck(): Promise<NormalizedHealthStatus> {
    const startTime = Date.now();

    try {
      // Try to list models as health check
      const models = await this.getModels();
      const latencyMs = Date.now() - startTime;

      return this.buildHealthStatus(
        models.length > 0 ? "healthy" : "degraded",
        latencyMs,
        models.length
      );
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const normalizedError = this.normalizeError(error);

      return this.buildHealthStatus(
        "unhealthy",
        latencyMs,
        0,
        normalizedError.message
      );
    }
  }

  // ============================================================================
  // Get Models
  // ============================================================================

  async getModels(): Promise<NormalizedModelInfo[]> {
    const url = `${this.config.baseUrl}/models`;

    // Use key rotation for model listing too — pick the next round-robin key
    this.refreshApiKey();

    try {
      const response = await this.fetchWithRetry(url, {
        method: "GET",
        headers: this.getHeaders(),
      }, 1); // Only 1 retry for model listing

      const data = await response.json();

      if (!data.data || !Array.isArray(data.data)) {
        // Fallback: return mapped models from config
        return this.getMappedModels();
      }

      return data.data.map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: this.providerId,
        family: this.inferFamily(m.id),
        contextWindow: m.context_window || 8192,
        maxTokens: m.max_tokens || 4096,
        supportsStreaming: this.config.supportsStreaming,
        supportsToolCalling: true,
        supportsEmbeddings: false,
        supportsVision: m.id.includes("vision") || m.id.includes("gpt-4o"),
        costPer1kPromptTokens: 0,
        costPer1kCompletionTokens: 0,
        isAvailable: true,
      }));
    } catch (error) {
      logger.warn({
        provider: this.providerId,
        error: (error as Error).message,
      }, "Failed to list models, using configured models");

      return this.getMappedModels();
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private buildRequestBody(request: NormalizedChatRequest, model: string): any {
    const body: any = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name && { name: m.name }),
        ...(m.toolCalls && {
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        }),
        ...(m.toolCallId && { tool_call_id: m.toolCallId }),
      })),
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.frequencyPenalty !== undefined) body.frequency_penalty = request.frequencyPenalty;
    if (request.presencePenalty !== undefined) body.presence_penalty = request.presencePenalty;
    if (request.stopSequences !== undefined) body.stop = request.stopSequences;
    if (request.tools !== undefined) body.tools = request.tools;
    if (request.toolChoice !== undefined) body.tool_choice = request.toolChoice;
    if (request.responseFormat !== undefined) body.response_format = request.responseFormat;

    return body;
  }

  private getMappedModels(): NormalizedModelInfo[] {
    return Object.entries(this.config.modelMapping).map(([alias, modelId]) => ({
      id: modelId,
      name: modelId,
      provider: this.providerId,
      family: this.inferFamily(modelId),
      contextWindow: 8192,
      maxTokens: 4096,
      supportsStreaming: this.config.supportsStreaming,
      supportsToolCalling: true,
      supportsEmbeddings: false,
      supportsVision: false,
      costPer1kPromptTokens: 0,
      costPer1kCompletionTokens: 0,
      isAvailable: true,
    }));
  }

  private inferFamily(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (lower.includes("llama") || lower.includes("codellama")) return "llama";
    if (lower.includes("gemini")) return "gemini";
    if (lower.includes("qwen")) return "qwen";
    if (lower.includes("command")) return "command";
    if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3")) return "gpt";
    if (lower.includes("claude")) return "claude";
    if (lower.includes("mistral") || lower.includes("mixtral")) return "mistral";
    if (lower.includes("perplexity") || lower.includes("sonar")) return "perplexity";
    return "unknown";
  }
}
