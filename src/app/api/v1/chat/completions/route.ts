import { NextRequest, NextResponse } from "next/server";
import { ChatCompletionRequestSchema } from "@/lib/validation/schemas";
import { authenticateApiRequest } from "@/lib/auth/api-key-middleware";
import { logRequest, logRoutingDecision, generateRequestId, getClientIp } from "@/lib/middleware/request-logger";
import { routeChat, recordProviderResult } from "@/lib/routing/engine";
import { getProviderConfig, getModelAlias } from "@/lib/providers/config";
import { checkRateLimit } from "@/lib/rate-limiter";
import { buildContextHandoff } from "@/lib/routing/context-handoff";
import { NormalizedChatRequest, NormalizedStreamChunk } from "@/types/provider-contract";
import logger from "@/lib/logger";

// ============================================================================
// Types for Context Handoff
// ============================================================================
type MessageWithContent = { role: "system" | "user" | "assistant" | "tool"; content?: string | null; [key: string]: unknown };

interface ToolDef {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ============================================================================
// Node.js Runtime (NOT Edge)
// ============================================================================
export const runtime = "nodejs";
export const maxDuration = 300;

// ============================================================================
// POST /v1/chat/completions
// ============================================================================

export async function POST(req: NextRequest) {
  const gatewayRequestId = generateRequestId();
  const startTime = Date.now();

  // --------------------------------------------------------------------------
  // 1. Authenticate
  // --------------------------------------------------------------------------
  const auth = await authenticateApiRequest(req);
  if (!auth.success) {
    return auth.response;
  }

  const { context } = auth;

  // --------------------------------------------------------------------------
  // 2. Parse & Validate Body
  // --------------------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return createOpenAIError(400, "invalid_request", "Invalid JSON body", gatewayRequestId);
  }

  const validation = ChatCompletionRequestSchema.safeParse(body);
  if (!validation.success) {
    return createOpenAIError(
      400,
      "invalid_request",
      `Validation error: ${validation.error.errors.map((e) => e.message).join(", ")}`,
      gatewayRequestId
    );
  }

  let data = validation.data;

  // --------------------------------------------------------------------------
  // 2b. Optimize Request (Reduce Token Bloat)
  // --------------------------------------------------------------------------
  // OpenClaude sends massive system prompts with agent definitions,
  // tool schemas, and MCP config. A simple "hi" can consume 30-40K tokens.
  // This pipeline aggressively reduces the request size:
  //   1. Deduplicate identical/near-identical system messages
  //   2. Strip verbose tool descriptions and compress JSON schemas
  //   3. Consolidate multiple system messages into one
  //   4. Trim old conversation history if total exceeds provider limit
  const optimization = optimizeRequest(data.messages as MessageWithContent[], data.tools as ToolDef[] | undefined);
  // Reassign with type assertions since optimized output matches Zod schema shape
  data.messages = optimization.messages as typeof data.messages;
  if (optimization.tools) {
    data.tools = optimization.tools as typeof data.tools;
  }
  if (optimization.tokensSaved > 0) {
    logger.info({
      gatewayRequestId,
      originalMessageCount: optimization.originalMessageCount,
      optimizedMessageCount: optimization.messages.length,
      originalToolCount: optimization.originalToolCount,
      optimizedToolCount: optimization.tools?.length || 0,
      estimatedTokensSaved: optimization.tokensSaved,
    }, `Request optimized: saved ~${optimization.tokensSaved} tokens`);
  }

  // --------------------------------------------------------------------------
  // 2c. Detailed Token Breakdown & Request Optimization
  // --------------------------------------------------------------------------
  const breakdown = getDetailedTokenBreakdown(data);
  logger.info({
    gatewayRequestId,
    totalEstimatedTokens: breakdown.total,
    breakdown: {
      systemMessages: breakdown.systemTokens,
      userMessages: breakdown.userTokens,
      assistantMessages: breakdown.assistantTokens,
      toolMessages: breakdown.toolTokens,
      toolDefinitions: breakdown.toolDefTokens,
      toolCalls: breakdown.toolCallTokens,
    },
    messageCount: data.messages.length,
    toolCount: (data.tools as unknown[])?.length || 0,
  }, "Request token breakdown");

  // Apply 1.2x safety margin (reduced from 1.5x): chars/3 slightly underestimates
  // actual provider tokenization, but by only about 10-15%, not 50%.
  // Over-estimating causes providers to be incorrectly rejected for token limits,
  // which wastes tokens through unnecessary failover retries.
  const estimatedTokens = Math.ceil(breakdown.total * 1.2);

  // --------------------------------------------------------------------------
  // 3. Rate Limit Check
  // --------------------------------------------------------------------------
  const rateLimit = await checkRateLimit(context.apiKeyId, estimatedTokens);
  if (!rateLimit.allowed) {
    return createOpenAIError(
      429,
      "rate_limit_exceeded",
      `Rate limit exceeded. Retry after ${rateLimit.retryAfter}s`,
      gatewayRequestId,
      { "Retry-After": String(rateLimit.retryAfter) }
    );
  }

  // --------------------------------------------------------------------------
  // 4. Route via Routing Engine
  // --------------------------------------------------------------------------
  const normalizedRequest: NormalizedChatRequest = {
    model: data.model,
    messages: data.messages.map((m) => ({
      role: m.role,
      content: m.content ?? "",
      name: m.name,
      toolCalls: m.tool_calls?.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      toolCallId: m.tool_call_id,
    })),
    temperature: data.temperature,
    maxTokens: data.max_tokens,
    topP: data.top_p,
    frequencyPenalty: data.frequency_penalty,
    presencePenalty: data.presence_penalty,
    stopSequences: data.stop ? (Array.isArray(data.stop) ? data.stop : [data.stop]) : undefined,
    tools: data.tools?.map((tool) => ({
      type: tool.type,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    })),
    toolChoice: data.tool_choice,
    stream: data.stream,
    responseFormat: data.response_format,
    gatewayRequestId,
    sessionId: data.session_id,
    modelAlias: data.model,
  };

  let routingResult;
  try {
    routingResult = await routeChat({
      alias: data.model,
      messages: normalizedRequest.messages,
      sessionId: data.session_id,
      userId: context.userId,
      stream: data.stream,
      temperature: data.temperature,
      maxTokens: data.max_tokens,
      tools: normalizedRequest.tools,
      toolChoice: normalizedRequest.toolChoice,
      responseFormat: normalizedRequest.responseFormat,
      gatewayRequestId,
      estimatedTokens,
    });
  } catch (error) {
    logger.error({ gatewayRequestId, error: (error as Error).message }, "Routing failed");
    return createOpenAIError(
      500,
      "routing_failed",
      `Failed to route request: ${(error as Error).message}`,
      gatewayRequestId
    );
  }

  logRoutingDecision(gatewayRequestId, routingResult.decision, context);

  let adapter = routingResult.adapter;
  let providerId = routingResult.providerId;
  let modelId = routingResult.modelId;
  let modelFamily = routingResult.modelFamily;

  // --------------------------------------------------------------------------
  // 4b. P0 FIX: Cap max_tokens aggressively
  // --------------------------------------------------------------------------
  // THREE layers of capping:
  //   1. Alias-level cap: never exceed the model alias's maxTokens
  //   2. Provider capacity cap: leave 70% of provider TPM for prompt tokens
  //   3. Absolute hard cap: never exceed provider maxTokensPerRequest
  //
  // OpenClaude sends max_tokens: 32000 for trivial requests.
  // This wastes tokens in TWO ways:
  //   a) The provider generates 32K tokens of garbage instead of stopping early
  //   b) The 32K max_tokens itself counts against TPM limits, causing rate limits
  //
  // Solution: Cap to what the alias actually needs, not what the client requests.
  // --------------------------------------------------------------------------

  const providerConfig = getProviderConfig(providerId);
  const aliasConfig = getModelAlias(data.model);

  // Layer 1: Alias-level hard cap
  // coder-fast → 4096, coder-smart → 8192, reasoning → 16384, architect → 8192, deep-research → 8192
  // This is the MOST IMPORTANT cap — it prevents 32K token generations on fast models.
  const aliasMaxOutput = aliasConfig?.maxTokens || 4096;
  let cappedMaxTokens = Math.min(
    normalizedRequest.maxTokens || aliasMaxOutput,
    aliasMaxOutput
  );

  // Layer 2: Provider capacity cap
  // Reserve 70% of provider TPM for prompt tokens, use 30% max for output
  if (providerConfig?.maxTokensPerRequest) {
    const providerMax = providerConfig.maxTokensPerRequest;
    const promptBudget = Math.floor(providerMax * 0.7);
    const outputBudget = Math.floor(providerMax * 0.3);

    // If estimated prompt tokens exceed 70% of provider capacity, cap output to what's left
    if (estimatedTokens > promptBudget) {
      const availableForOutput = Math.max(256, providerMax - estimatedTokens);
      cappedMaxTokens = Math.min(cappedMaxTokens, availableForOutput);
      logger.info({
        gatewayRequestId,
        providerId,
        estimatedPromptTokens: estimatedTokens,
        providerMaxTokens: providerMax,
        promptBudget,
        cappedToTokens: availableForOutput,
      }, `Provider capacity cap: output limited to ${availableForOutput} (prompt ${estimatedTokens} > budget ${promptBudget})`);
    } else {
      // Prompt fits in budget — still cap output to 30% of provider TPM
      cappedMaxTokens = Math.min(cappedMaxTokens, outputBudget);
    }
  }

  // Layer 3: Absolute hard cap — never exceed provider's maxTokensPerRequest
  if (providerConfig?.maxTokensPerRequest) {
    cappedMaxTokens = Math.min(cappedMaxTokens, providerConfig.maxTokensPerRequest);
  }

  // Ensure at least 256 tokens output (reasonable minimum for useful responses)
  cappedMaxTokens = Math.max(256, cappedMaxTokens);

  if (cappedMaxTokens !== (normalizedRequest.maxTokens || aliasMaxOutput)) {
    logger.info({
      gatewayRequestId,
      providerId,
      modelAlias: data.model,
      originalMaxTokens: normalizedRequest.maxTokens,
      aliasMaxTokens: aliasMaxOutput,
      cappedToTokens: cappedMaxTokens,
    }, `max_tokens capped: ${normalizedRequest.maxTokens || aliasMaxOutput} → ${cappedMaxTokens}`);
    normalizedRequest.maxTokens = cappedMaxTokens;
  }

  // --------------------------------------------------------------------------
  // 5. Execute Request (with Failover)
  // --------------------------------------------------------------------------
  let providerAttempt = 1;
  let lastError: Error | null = null;
  // Reduced from 3 to 2: faster failover, avoids cascading timeouts
  // Worst case: 2 attempts × (15s Groq + 30s Gemini) = ~90s max instead of ~3min
  const MAX_PROVIDER_ATTEMPTS = 2;

  // ----------------------------------------------------------------------
  // 5a. STREAMING RESPONSE PATH (with provider failover)
  // ----------------------------------------------------------------------
  if (data.stream) {
    const encoder = new TextEncoder();
    const streamStart = Date.now();
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let streamError: Error | null = null;

    while (providerAttempt <= MAX_PROVIDER_ATTEMPTS) {
      try {
        // Eagerly start the async generator to trigger the HTTP fetch.
        // If the provider is rate-limited or down, the error surfaces here
        // where we can failover to another provider — NOT inside ReadableStream.
        const streamGenerator = adapter.stream(normalizedRequest);
        const firstResult = await streamGenerator.next();

        if (firstResult.done) {
          throw new Error("Provider returned empty stream");
        }

        // Capture first chunk's usage if present
        if (firstResult.value.usage) {
          totalTokensIn = firstResult.value.usage.promptTokens;
          totalTokensOut = firstResult.value.usage.completionTokens;
        }

        // Build ReadableStream from the working generator, prepending the first chunk
        const readable = new ReadableStream({
          async start(controller) {
            try {
              // Enqueue first chunk (already consumed during eager start)
              controller.enqueue(encoder.encode(formatSSEChunk(firstResult.value, data.model)));

              // Stream remaining chunks
              for await (const chunk of streamGenerator) {
                if (chunk.usage) {
                  totalTokensIn = chunk.usage.promptTokens;
                  totalTokensOut = chunk.usage.completionTokens;
                }

                controller.enqueue(encoder.encode(formatSSEChunk(chunk, data.model)));

                if (chunk.isFinal) {
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  controller.close();
                  return;
                }
              }

              // If generator ended without isFinal flag
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch (error) {
              streamError = error as Error;
              controller.error(error);
            }
          },
        });

        const response = new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Request-ID": gatewayRequestId,
          },
        });

        response.clone().body?.getReader().closed.then(() => {
          const latencyMs = Date.now() - streamStart;
          logRequest({
            requestId: gatewayRequestId,
            apiKeyId: context.apiKeyId,
            providerId,
            modelAlias: data.model,
            modelUsed: modelId,
            modelFamily,
            status: streamError ? "error" : "success",
            tokensIn: totalTokensIn,
            tokensOut: totalTokensOut,
            latencyMs,
            errorMessage: streamError?.message,
            sessionId: data.session_id,
            streaming: true,
            ipAddress: getClientIp(req),
            providerAttempt,
            gatewayRequestId,
          });

          if (!streamError) {
            recordProviderResult(providerId, true, latencyMs, totalTokensIn, totalTokensOut);
          } else {
            recordProviderResult(providerId, false, latencyMs, 0, 0, streamError.message);
          }
        }).catch((err) => {
          logger.warn({ gatewayRequestId, error: (err as Error).message }, "Stream body close handler error");
        });

        return response;

      } catch (error) {
        lastError = error as Error;
        logger.warn({ gatewayRequestId, providerId, attempt: providerAttempt, error: lastError.message }, "Stream provider failed, attempting failover");

        await recordProviderResult(providerId, false, Date.now() - startTime, 0, 0, lastError.message);

        await logRequest({
          requestId: gatewayRequestId,
          apiKeyId: context.apiKeyId,
          providerId,
          modelAlias: data.model,
          modelUsed: modelId,
          modelFamily,
          status: "error",
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Date.now() - startTime,
          errorMessage: lastError.message,
          sessionId: data.session_id,
          streaming: true,
          ipAddress: getClientIp(req),
          providerAttempt,
          gatewayRequestId,
        });

        if (providerAttempt < MAX_PROVIDER_ATTEMPTS) {
          providerAttempt++;
          // CRITICAL: Exclude the failed provider from failover routing
          const excludedProviders = [providerId];

          // TOKEN OPTIMIZATION: Build compressed context handoff instead of re-sending full payload
          const handoff = buildContextHandoff(
            normalizedRequest.messages as MessageWithContent[],
            normalizedRequest.tools as ToolDef[] | undefined,
            providerId,
            lastError?.message || "unknown error"
          );

          logger.info({
            gatewayRequestId,
            originalTokens: handoff.originalTokens,
            handoffTokens: handoff.handoffTokens,
            tokensSaved: handoff.tokensSaved,
            savingsPercent: Math.round((handoff.tokensSaved / handoff.originalTokens) * 100),
          }, `Failover context handoff: saved ${handoff.tokensSaved} tokens (${Math.round((handoff.tokensSaved / handoff.originalTokens) * 100)}% reduction)`);

          try {
            const newRouting = await routeChat({
              alias: data.model,
              messages: handoff.messages as NormalizedChatRequest["messages"],
              sessionId: data.session_id,  // Keep session ID for stickiness
              userId: context.userId,
              stream: true,
              temperature: data.temperature,
              maxTokens: data.maxTokens,
              tools: handoff.tools as NormalizedChatRequest["tools"],
              toolChoice: normalizedRequest.toolChoice,
              responseFormat: normalizedRequest.responseFormat,
              gatewayRequestId,
              estimatedTokens: handoff.handoffTokens * 1.2,  // Use compressed estimate
              excludeProviders: excludedProviders,
            });

            routingResult = newRouting;
            adapter = newRouting.adapter;
            providerId = newRouting.providerId;
            modelId = newRouting.modelId;
            modelFamily = newRouting.modelFamily;

            // Re-apply max_tokens cap for the new provider (same aggressive approach)
            const newProviderConfig = getProviderConfig(providerId);
            const aliasConfig = getModelAlias(data.model);
            const aliasMaxOutput = aliasConfig?.maxTokens || 4096;
            let cappedMaxTokens = Math.min(
              normalizedRequest.maxTokens || aliasMaxOutput,
              aliasMaxOutput
            );
            if (newProviderConfig?.maxTokensPerRequest) {
              const providerMax = newProviderConfig.maxTokensPerRequest;
              const promptBudget = Math.floor(providerMax * 0.7);
              const outputBudget = Math.floor(providerMax * 0.3);
              if (estimatedTokens > promptBudget) {
                const availableForOutput = Math.max(256, providerMax - estimatedTokens);
                cappedMaxTokens = Math.min(cappedMaxTokens, availableForOutput);
              } else {
                cappedMaxTokens = Math.min(cappedMaxTokens, outputBudget);
              }
              cappedMaxTokens = Math.min(cappedMaxTokens, newProviderConfig.maxTokensPerRequest);
            }
            cappedMaxTokens = Math.max(256, cappedMaxTokens);
            const failoverPrevMax = normalizedRequest.maxTokens || aliasMaxOutput;
            if (cappedMaxTokens !== failoverPrevMax) {
              normalizedRequest.maxTokens = cappedMaxTokens;
              logger.info({
                gatewayRequestId,
                providerId,
                modelAlias: data.model,
                originalMaxTokens: failoverPrevMax,
                aliasMaxTokens: aliasMaxOutput,
                cappedToTokens: cappedMaxTokens,
              }, `max_tokens re-capped for failover provider: ${failoverPrevMax} → ${cappedMaxTokens}`);
            }

            logger.warn({
              gatewayRequestId,
              failedProvider: providerId,
              newProvider: newRouting.providerId,
              attempt: providerAttempt,
              estimatedTokensWasted: estimatedTokens,
              reason: lastError?.message,
            }, `Stream failover: ~${estimatedTokens} prompt tokens reprocessed by ${newRouting.providerId} (${providerId} failed: ${lastError?.message})`);
            continue;
          } catch (routeError) {
            logger.error({ gatewayRequestId, error: (routeError as Error).message }, "Failover routing failed");
            break;
          }
        }

        break;
      }
    }

    logger.error({ gatewayRequestId, attempts: providerAttempt, maxAttempts: MAX_PROVIDER_ATTEMPTS, lastError: lastError?.message }, "All streaming provider attempts failed");

    return createOpenAIError(
      500,
      "provider_error",
      `All providers failed after ${providerAttempt} attempts. Last error: ${lastError?.message}`,
      gatewayRequestId
    );
  }

  // ----------------------------------------------------------------------
  // 5b. NON-STREAMING RESPONSE PATH (with provider failover)
  // ----------------------------------------------------------------------
  while (providerAttempt <= MAX_PROVIDER_ATTEMPTS) {
    try {
      const response = await adapter.chat(normalizedRequest);
      const latencyMs = Date.now() - startTime;

      await logRequest({
        requestId: gatewayRequestId,
        apiKeyId: context.apiKeyId,
        providerId,
        modelAlias: data.model,
        modelUsed: modelId,
        modelFamily,
        status: "success",
        tokensIn: response.usage.promptTokens,
        tokensOut: response.usage.completionTokens,
        latencyMs,
        sessionId: data.session_id,
        streaming: false,
        ipAddress: getClientIp(req),
        providerAttempt,
        gatewayRequestId,
      });

      await recordProviderResult(
        providerId,
        true,
        latencyMs,
        response.usage.promptTokens,
        response.usage.completionTokens
      );

      return NextResponse.json({
        id: response.id,
        object: "chat.completion",
        created: response.createdAt,
        model: data.model,
        choices: response.choices.map((c: Record<string, unknown>) => ({
          index: (c as { index: number }).index,
          message: {
            role: (c as { message: { role: string } }).message.role,
            content: (c as { message: { content?: string } }).message.content,
            tool_calls: (c as { message: { toolCalls?: Array<Record<string, unknown>> } }).message.toolCalls?.map((tc) => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: (tc.function as Record<string, unknown>).name,
                arguments: (tc.function as Record<string, unknown>).arguments,
              },
            })),
          },
          finish_reason: (c as { finishReason?: string }).finishReason,
        })),
        usage: {
          prompt_tokens: response.usage.promptTokens,
          completion_tokens: response.usage.completionTokens,
          total_tokens: response.usage.totalTokens,
        },
      }, {
        headers: { "X-Request-ID": gatewayRequestId },
      });

    } catch (error) {
      lastError = error as Error;
      logger.warn({ gatewayRequestId, providerId, attempt: providerAttempt, error: lastError.message }, "Provider request failed, attempting failover");

      await recordProviderResult(providerId, false, Date.now() - startTime, 0, 0, lastError.message);

      await logRequest({
        requestId: gatewayRequestId,
        apiKeyId: context.apiKeyId,
        providerId,
        modelAlias: data.model,
        modelUsed: modelId,
        modelFamily,
        status: "error",
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - startTime,
        errorMessage: lastError.message,
        sessionId: data.session_id,
        streaming: false,
        ipAddress: getClientIp(req),
        providerAttempt,
        gatewayRequestId,
      });        if (providerAttempt < MAX_PROVIDER_ATTEMPTS) {
          providerAttempt++;
          // CRITICAL: Exclude the failed provider from failover routing
          const excludedProviders = [providerId];

          // TOKEN OPTIMIZATION: Build compressed context handoff instead of re-sending full payload
          const handoff = buildContextHandoff(
            normalizedRequest.messages as MessageWithContent[],
            normalizedRequest.tools as ToolDef[] | undefined,
            providerId,
            lastError?.message || "unknown error"
          );

          logger.info({
            gatewayRequestId,
            originalTokens: handoff.originalTokens,
            handoffTokens: handoff.handoffTokens,
            tokensSaved: handoff.tokensSaved,
            savingsPercent: Math.round((handoff.tokensSaved / handoff.originalTokens) * 100),
          }, `Failover context handoff: saved ${handoff.tokensSaved} tokens (${Math.round((handoff.tokensSaved / handoff.originalTokens) * 100)}% reduction)`);

          try {
            const newRouting = await routeChat({
              alias: data.model,
              messages: handoff.messages as NormalizedChatRequest["messages"],
              sessionId: data.session_id,  // Keep session ID for stickiness
              userId: context.userId,
              stream: false,
              temperature: data.temperature,
              maxTokens: data.maxTokens,
              tools: handoff.tools as NormalizedChatRequest["tools"],
              toolChoice: normalizedRequest.toolChoice,
              responseFormat: normalizedRequest.responseFormat,
              gatewayRequestId,
              estimatedTokens: handoff.handoffTokens * 1.2,  // Use compressed estimate
              excludeProviders: excludedProviders,
            });

          routingResult = newRouting;
          adapter = newRouting.adapter;
          providerId = newRouting.providerId;
          modelId = newRouting.modelId;
          modelFamily = newRouting.modelFamily;
          logger.warn({
            gatewayRequestId,
            failedProvider: providerId,
            newProvider: newRouting.providerId,
            attempt: providerAttempt,
            estimatedTokensWasted: estimatedTokens,
            reason: lastError?.message,
          }, `Non-streaming failover: ~${estimatedTokens} prompt tokens reprocessed by ${newRouting.providerId} (${providerId} failed: ${lastError?.message})`);

          continue;
        } catch (routeError) {
          logger.error({ gatewayRequestId, error: (routeError as Error).message }, "Failover routing failed");
          break;
        }
      }

      break;
    }
  }    logger.error({ gatewayRequestId, attempts: providerAttempt, maxAttempts: MAX_PROVIDER_ATTEMPTS, lastError: lastError?.message }, "All provider attempts failed");

  return createOpenAIError(
    500,
    "provider_error",
    `All providers failed after ${providerAttempt} attempts. Last error: ${lastError?.message}`,
    gatewayRequestId
  );
}

// ============================================================================
// Request Optimization Pipeline
// ============================================================================
// OpenClaude sends massive payloads for simple messages:
//   - System prompts: 20-40K tokens (agent definitions, MCP configs)
//   - Tool definitions: 10-20K tokens (verbose JSON schemas)
//   - Conversation history: grows with each turn
//   - Actual user message: 5-10 tokens
// This pipeline aggressively reduces bloat.
// ============================================================================

interface OptimizeResult {
  messages: MessageWithContent[];
  tools: ToolDef[] | undefined;
  tokensSaved: number;
  originalMessageCount: number;
  optimizedMessageCount: number;
  originalToolCount: number;
  optimizedToolCount: number;
}

// ---------- Main optimization pipeline ----------

function optimizeRequest(
  messages: MessageWithContent[],
  tools: ToolDef[] | undefined
): OptimizeResult {
  const originalMsgCount = messages.length;
  const originalToolCount = tools?.length || 0;
  let totalCharsSaved = 0;

  // Step 1: Deduplicate system messages
  const deduped = deduplicateSystemMessages(messages);
  totalCharsSaved += deduped.savedTokens * 4;
  let result = deduped.messages;    // Step 2: Compress tool definitions (strip verbose descriptions, minify schemas)
  let optimizedTools: ToolDef[] | undefined = tools;
  if (tools && tools.length > 0) {
    const before = JSON.stringify(tools).length;
    optimizedTools = compressToolDefinitions(tools);
    const after = JSON.stringify(optimizedTools).length;
    totalCharsSaved += before - after;
  }

  // Step 3: Merge multiple system messages into one consolidated message
  const merged = mergeSystemMessages(result);
  totalCharsSaved += merged.savedChars;
  result = merged.messages;

  // Step 4: Trim conversation history if total exceeds provider limit
  const trimmed = trimConversationHistory(result);
  totalCharsSaved += trimmed.savedChars;
  result = trimmed.messages;

  // Step 5: AGGRESSIVE system prompt truncation
  // OpenClaude sends 30-40K chars of system prompts (agent definitions, MCP configs).
  // No LLM needs 30K chars of instructions. Hard-cap system prompts to save tokens.
  const truncated = truncateSystemPrompts(result);
  totalCharsSaved += truncated.savedChars;
  result = truncated.messages;

  return {
    messages: result,
    tools: optimizedTools,
    tokensSaved: Math.ceil(totalCharsSaved / 4),
    originalMessageCount: originalMsgCount,
    optimizedMessageCount: result.length,
    originalToolCount,
    optimizedToolCount: optimizedTools?.length || 0,
  };
}

// ---------- Step 1: Deduplicate system messages ----------

function deduplicateSystemMessages(
  messages: MessageWithContent[]
): { messages: MessageWithContent[]; savedTokens: number } {
  const seen = new Map<string, number>();
  const deduplicated: MessageWithContent[] = [];
  let totalSavedChars = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "system") {
      deduplicated.push(msg);
      continue;
    }

    const content = typeof msg.content === "string" ? msg.content : "";
    // Normalize: lowercase, collapse whitespace, trim
    const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
    const key = normalized.substring(0, 500);

    if (seen.has(key)) {
      totalSavedChars += content.length + 20;
    } else {
      seen.set(key, deduplicated.length);
      deduplicated.push(msg);
    }
  }

  return { messages: deduplicated, savedTokens: Math.ceil(totalSavedChars / 4) };
}

// ---------- Step 2: Compress tool definitions ----------
// Strip verbose descriptions, minimize parameter schemas
// OpenClaude tools often have 500-1000 char descriptions per tool.
// With 20+ tools, this alone can be 10-20K tokens.
// --------------------------------------------------------------------------

function compressToolDefinitions(tools: ToolDef[]): ToolDef[] {
  return tools.map(tool => {
    const fn = { ...tool.function };

    // Keep tool descriptions intact — LLMs need them for accurate function calling.
    // Only trim truly excessive descriptions (>500 chars).
    if (fn.description && fn.description.length > 500) {
      fn.description = fn.description.substring(0, 497) + "...";
    }

    // Minify parameter schemas: strip descriptions, examples, defaults
    if (fn.parameters && typeof fn.parameters === "object") {
      fn.parameters = minifyJsonSchema(fn.parameters);
    }

    return { ...tool, function: fn };
  });
}

function minifyJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return schema;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    // Keep parameter descriptions — LLMs need them for accurate function calling.
    // Only trim truly excessive descriptions (>500 chars).
    if (key === "description" && typeof value === "string" && value.length > 500) {
      result[key] = value.substring(0, 497) + "...";
      continue;
    }
    // Remove examples, UI metadata
    if (key === "examples" || key === "title" || key === "$schema") {
      continue;
    }
    // Keep simple defaults (string/number/boolean), strip complex ones
    if (key === "default" && (typeof value === "object" || Array.isArray(value))) {
      continue;
    }
    // Recurse into nested objects
    if (key === "properties" && typeof value === "object" && value !== null) {
      const props = value as Record<string, unknown>;
      const minimizedProps: Record<string, unknown> = {};
      for (const [propKey, propVal] of Object.entries(props)) {
        if (typeof propVal === "object" && propVal !== null) {
          minimizedProps[propKey] = minifyJsonSchema(propVal as Record<string, unknown>);
        } else {
          minimizedProps[propKey] = propVal;
        }
      }
      result[key] = minimizedProps;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.map(item =>
        typeof item === "object" && item !== null
          ? minifyJsonSchema(item as Record<string, unknown>)
          : item
      );
      continue;
    }
    if (typeof value === "object" && value !== null) {
      result[key] = minifyJsonSchema(value as Record<string, unknown>);
      continue;
    }
    result[key] = value;
  }
  return result;
}

// ---------- Step 3: Merge multiple system messages ----------
// OpenClaude often sends 3-5 separate system messages.
// Merge them into one to reduce overhead.
// --------------------------------------------------------------------------

function mergeSystemMessages(
  messages: MessageWithContent[]
): { messages: MessageWithContent[]; savedChars: number } {
  const systemMessages: string[] = [];
  const nonSystemMessages: MessageWithContent[] = [];
  let savedChars = 0;

  for (const msg of messages) {
    if (msg.role === "system") {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (content.length > 0) {
        systemMessages.push(content);
      }
    } else {
      nonSystemMessages.push(msg);
    }
  }

  if (systemMessages.length <= 1) {
    return { messages, savedChars: 0 };
  }

  // Merge: combine all system messages with separator
  // Save overhead of repeated role/formatting per message
  const mergedContent = systemMessages.join("\n\n---\n\n");
  // Actual savings: difference between all system messages combined vs merged
  const totalSystemChars = systemMessages.reduce((s, c) => s + c.length, 0);
  const mergedLen = mergedContent.length;
  savedChars = Math.max(0, totalSystemChars - mergedLen);

  return {
    messages: [{ role: "system", content: mergedContent }, ...nonSystemMessages],
    savedChars,
  };
}

// ---------- Step 4: Trim conversation history ----------
// For multi-turn sessions, OpenClaude accumulates full history (user/assistant/tool).
// This can grow to 50K+ tokens. Keep the most recent messages while preserving
// context: always keep system messages, last N user/assistant pairs, and recent tool results.
// --------------------------------------------------------------------------  // Max tokens to keep for conversation history (leaving room for system + tools + response)
// Kept generous: agents need full context to work properly
const MAX_HISTORY_TOKENS = 16000;

// Max total chars for ALL system prompts combined
// LLMs handle long system prompts fine — don't aggressively truncate.
// Only trim if genuinely excessive (>20K chars). Most providers handle this.
const MAX_SYSTEM_PROMPT_CHARS = 20000;

function trimConversationHistory(
  messages: MessageWithContent[]
): { messages: MessageWithContent[]; savedChars: number } {
  // Separate system messages from conversation
  const systemMessages: MessageWithContent[] = [];
  const conversation: MessageWithContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemMessages.push(msg);
    } else {
      conversation.push(msg);
    }
  }

  // Estimate current conversation token count
  const conversationChars = conversation.reduce((sum, msg) => {
    const content = typeof msg.content === "string" ? msg.content : "";
    const toolCalls = msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0;
    const toolCallId = typeof msg.tool_call_id === "string" ? msg.tool_call_id.length : 0;
    return sum + content.length + toolCalls + toolCallId + 40; // 40 = JSON overhead per message
  }, 0);
  const conversationTokens = Math.ceil(conversationChars / 4);

  if (conversationTokens <= MAX_HISTORY_TOKENS) {
    return { messages, savedChars: 0 };
  }

  // Need to trim — keep the most recent messages that fit within the limit
  // Always keep the last user message (the actual request)
  const savedChars = conversationChars - MAX_HISTORY_TOKENS * 4;
  const keptMessages: MessageWithContent[] = [];
  let currentChars = 0;
  const limitChars = MAX_HISTORY_TOKENS * 4;

  // Walk backwards from the end, keeping messages until we hit the limit
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i];
    const content = typeof msg.content === "string" ? msg.content : "";
    const toolCalls = msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0;
    const msgChars = content.length + toolCalls + 40;

    if (currentChars + msgChars > limitChars && keptMessages.length > 0) {
      // We've hit the limit — insert a truncation notice and stop
      keptMessages.unshift({
        role: "user",
        content: "[History truncated]",
      });
      break;
    }

    currentChars += msgChars;
    keptMessages.unshift(msg);
  }

  logger.info({
    originalConversationTokens: conversationTokens,
    trimmedToTokens: Math.ceil(currentChars / 4),
    messagesRemoved: conversation.length - keptMessages.length + 1,
  }, "Conversation history trimmed to fit provider limits");

  return {
    messages: [...systemMessages, ...keptMessages],
    savedChars,
  };
}

// ---------- Step 5: Aggressive system prompt truncation ----------
// OpenClaude sends 30-40K chars of agent definitions, MCP configs, etc.
// This hard-caps total system prompt size to MAX_SYSTEM_PROMPT_CHARS.
// --------------------------------------------------------------------------

function truncateSystemPrompts(
  messages: MessageWithContent[]
): { messages: MessageWithContent[]; savedChars: number } {
  // Separate system and non-system messages
  const systemMessages: MessageWithContent[] = [];
  const nonSystem: MessageWithContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemMessages.push(msg);
    } else {
      nonSystem.push(msg);
    }
  }

  if (systemMessages.length === 0) {
    return { messages, savedChars: 0 };
  }

  // Calculate total system prompt chars
  const totalChars = systemMessages.reduce((sum, msg) => {
    return sum + (typeof msg.content === "string" ? msg.content.length : 0);
  }, 0);

  if (totalChars <= MAX_SYSTEM_PROMPT_CHARS) {
    return { messages, savedChars: 0 };
  }

  // Merge all system messages into one and truncate to budget
  const allContent = systemMessages
    .map(m => typeof m.content === "string" ? m.content : "")
    .join("\n\n");

  const truncatedContent = allContent.substring(0, MAX_SYSTEM_PROMPT_CHARS);
  // Find last sentence boundary for clean cut
  const lastSentence = truncatedContent.lastIndexOf(".");
  const lastNewline = truncatedContent.lastIndexOf("\n");
  const cutPoint = Math.max(lastSentence, lastNewline, MAX_SYSTEM_PROMPT_CHARS - 200);

  const savedChars = totalChars - cutPoint;

  logger.info({
    originalSystemChars: totalChars,
    truncatedToChars: cutPoint,
    savedChars,
    messageCount: systemMessages.length,
  }, `System prompts truncated: ${totalChars} → ${cutPoint} chars (saved ~${Math.ceil(savedChars / 3)} tokens)`);

  return {
    messages: [
      { role: "system" as const, content: truncatedContent.substring(0, cutPoint) + "\n\n[Instructions truncated for brevity]" },
      ...nonSystem,
    ],
    savedChars,
  };
}

// ---------- Token Breakdown (Diagnostic) ----------

interface TokenBreakdown {
  total: number;
  systemTokens: number;
  userTokens: number;
  assistantTokens: number;
  toolTokens: number;
  toolDefTokens: number;
  toolCallTokens: number;
}

function getDetailedTokenBreakdown(data: Record<string, unknown>): TokenBreakdown {
  const breakdown: TokenBreakdown = {
    total: 0,
    systemTokens: 0,
    userTokens: 0,
    assistantTokens: 0,
    toolTokens: 0,
    toolDefTokens: 0,
    toolCallTokens: 0,
  };

  // Messages breakdown
  const messages = data.messages as Array<{
    role: string;
    content?: string | null;
    tool_calls?: unknown[];
  }> | undefined;

  if (messages) {
    for (const msg of messages) {
      const contentLen = typeof msg.content === "string" ? msg.content.length : 0;
      const toolCallsLen = msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0;
      const tokens = Math.ceil((contentLen + toolCallsLen) / 3);

      switch (msg.role) {
        case "system":
          breakdown.systemTokens += tokens;
          break;
        case "user":
          breakdown.userTokens += tokens;
          break;
        case "assistant":
          breakdown.assistantTokens += tokens;
          break;
        case "tool":
          breakdown.toolTokens += tokens;
          break;
      }

      if (toolCallsLen > 0) {
        breakdown.toolCallTokens += Math.ceil(toolCallsLen / 4);
      }
    }
  }

  // Tool definitions breakdown
  const tools = data.tools as Array<Record<string, unknown>> | undefined;
  if (tools) {
    breakdown.toolDefTokens = Math.ceil(JSON.stringify(tools).length / 3);
  }

  // toolCallTokens is already included in the role-based totals above
  breakdown.total =
    breakdown.systemTokens +
    breakdown.userTokens +
    breakdown.assistantTokens +
    breakdown.toolTokens +
    breakdown.toolDefTokens;

  return breakdown;
}

// ============================================================================
// SSE Formatting Helper
// ============================================================================

function formatSSEChunk(
  chunk: NormalizedStreamChunk,
  model: string
): string {
  return `data: ${JSON.stringify({
    id: chunk.id,
    object: "chat.completion.chunk",
    created: chunk.createdAt,
    model,
    choices: chunk.choices.map((c) => ({
      index: c.index,
      delta: {
        role: c.delta.role,
        content: c.delta.content,
        tool_calls: c.delta.toolCalls?.map((tc) => ({
          index: tc.index,
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function?.name,
            arguments: tc.function?.arguments,
          },
        })),
      },
      finish_reason: c.finishReason,
    })),
  })}\n\n`;
}

// ============================================================================
// OpenAI-Compatible Error Helper
// ============================================================================

function createOpenAIError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    {
      error: {
        message,
        type: code,
        param: null,
        code,
      },
      request_id: requestId,
    },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        ...(extraHeaders || {}),
      },
    }
  );
}
