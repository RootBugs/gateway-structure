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
import logger from "@/lib/logger";

/**
 * HuggingFaceLegacyAdapter
 * Fallback adapter for legacy HuggingFace Inference API.
 * Uses native HF format (NOT OpenAI-compatible).
 * Streaming is NOT supported - returns complete response.
 *
 * Primary adapter for HuggingFace should be OpenAICompatibleAdapter
 * using router.huggingface.co/v1.
 * This adapter is only used if the router fails.
 */
export class HuggingFaceLegacyAdapter extends BaseAdapter {
  constructor(providerId: string, config: ProviderConfig) {
    super(providerId, config);
  }

  // ============================================================================
  // Chat Completions (Non-Streaming Only)
  // ============================================================================

  async chat(request: NormalizedChatRequest): Promise<NormalizedChatResponse> {
    const startTime = Date.now();
    const model = this.mapModel(request.model);
    const url = `https://api-inference.huggingface.co/models/${model}`;

    // Transform OpenAI messages to HF format
    const prompt = this.convertMessagesToPrompt(request.messages);

    const body = {
      inputs: prompt,
      parameters: {
        max_new_tokens: request.maxTokens || 1024,
        temperature: request.temperature || 0.7,
        top_p: request.topP || 0.95,
        return_full_text: false,
      },
    };

    logger.debug({
      provider: this.providerId,
      model,
      gatewayRequestId: request.gatewayRequestId,
    }, "Sending HF legacy chat request");

    try {
      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      // HF returns array of results
      const result = Array.isArray(data) ? data[0] : data;
      const generatedText = result.generated_text || "";

      // Remove prompt from response if included
      const cleanContent = generatedText.replace(prompt, "").trim();

      const promptTokens = this.estimateTokens(prompt);
      const completionTokens = this.estimateTokens(cleanContent);

      return {
        id: `hf-${Date.now()}`,
        gatewayRequestId: request.gatewayRequestId,
        model: request.model,
        modelFamily: request.modelFamily || "unknown",
        provider: this.providerId,
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: cleanContent,
          },
          finishReason: "stop",
        }],
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        latencyMs,
        createdAt: Math.floor(Date.now() / 1000),
      };
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      logger.error({
        provider: this.providerId,
        error: normalizedError,
        gatewayRequestId: request.gatewayRequestId,
      }, "HF legacy chat request failed");
      throw normalizedError;
    }
  }

  // ============================================================================
  // Streaming - NOT SUPPORTED
  // ============================================================================

  async *stream(request: NormalizedChatRequest): AsyncGenerator<NormalizedStreamChunk> {
    // HuggingFace legacy inference API does not support streaming
    // Return complete response as single chunk
    const response = await this.chat(request);

    yield {
      id: response.id,
      gatewayRequestId: request.gatewayRequestId,
      model: response.model,
      modelFamily: response.modelFamily,
      provider: this.providerId,
      choices: [{
        index: 0,
        delta: {
          role: "assistant",
          content: response.choices[0].message.content,
        },
        finishReason: null,
      }],
      createdAt: response.createdAt,
      isFinal: false,
    };

    yield {
      id: response.id,
      gatewayRequestId: request.gatewayRequestId,
      model: response.model,
      modelFamily: response.modelFamily,
      provider: this.providerId,
      choices: [{
        index: 0,
        delta: {},
        finishReason: "stop",
      }],
      createdAt: response.createdAt,
      isFinal: true,
    };
  }

  // ============================================================================
  // Embeddings - NOT SUPPORTED
  // ============================================================================

  async embeddings(request: NormalizedEmbeddingRequest): Promise<NormalizedEmbeddingResponse> {
    throw this.normalizeError(new Error("Embeddings not supported by HuggingFace legacy adapter"));
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async healthCheck(): Promise<NormalizedHealthStatus> {
    const startTime = Date.now();

    try {
      // Try a minimal request
      await this.chat({
        model: "coder-fast",
        messages: [{ role: "user", content: "Hi" }],
        gatewayRequestId: `health-${Date.now()}`,
      });

      return this.buildHealthStatus("healthy", Date.now() - startTime, 1);
    } catch (error) {
      return this.buildHealthStatus(
        "unhealthy",
        Date.now() - startTime,
        0,
        (error as Error).message
      );
    }
  }

  // ============================================================================
  // Get Models
  // ============================================================================

  async getModels(): Promise<NormalizedModelInfo[]> {
    return this.getMappedModels();
  }

  // ============================================================================
  // Feature Support
  // ============================================================================

  supportsFeature(feature: string) {
    const features: Record<string, boolean> = {
      streaming: false,  // NOT supported
      tool_calling: false,
      embeddings: false,
      vision: false,
      json_mode: false,
      system_prompt: true,
    };

    return {
      feature,
      supported: features[feature] ?? false,
      limitations: feature === "streaming"
        ? ["HuggingFace legacy inference API does not support streaming"]
        : undefined,
      notes: "Use OpenAI-compatible router for full feature support",
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private convertMessagesToPrompt(messages: Array<{ role: string; content: string }>): string {
    const system = messages.find(m => m.role === "system")?.content || "";
    const userMessages = messages.filter(m => m.role === "user");
    const assistantMessages = messages.filter(m => m.role === "assistant");

    let prompt = system ? `<s>[INST] ${system} [/INST]</s>\n` : "";

    for (let i = 0; i < userMessages.length; i++) {
      prompt += `<s>[INST] ${userMessages[i].content} [/INST]`;
      if (assistantMessages[i]) {
        prompt += ` ${assistantMessages[i].content}</s>\n`;
      } else {
        prompt += " ";
      }
    }

    return prompt;
  }

  private getMappedModels(): NormalizedModelInfo[] {
    return Object.entries(this.config.modelMapping).map(([alias, modelId]) => ({
      id: modelId,
      name: modelId,
      provider: this.providerId,
      family: "unknown",
      contextWindow: 4096,
      maxTokens: 1024,
      supportsStreaming: false,
      supportsToolCalling: false,
      supportsEmbeddings: false,
      supportsVision: false,
      costPer1kPromptTokens: 0,
      costPer1kCompletionTokens: 0,
      isAvailable: true,
    }));
  }

  protected buildHealthStatus(
    status: "healthy" | "degraded" | "unhealthy" | "unknown",
    latencyMs: number,
    modelsAvailable: number,
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
}
