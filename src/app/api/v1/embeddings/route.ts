import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/auth/api-key-middleware";
import { routeEmbedding } from "@/lib/routing/engine";
import { generateRequestId, getClientIp, logRequest } from "@/lib/middleware/request-logger";
import { EmbeddingRequestSchema } from "@/lib/validation/schemas";
import { NormalizedEmbeddingRequest } from "@/types/provider-contract";
import { checkRateLimit } from "@/lib/rate-limiter";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gatewayRequestId = generateRequestId();
  const startTime = Date.now();

  // 1. Authenticate
  const auth = await authenticateApiRequest(req);
  if (!auth.success) {
    return auth.response;
  }

  const { context } = auth;

  // 2. Parse & Validate
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body", type: "invalid_request", code: "invalid_request" }, request_id: gatewayRequestId },
      { status: 400 }
    );
  }

  const validation = EmbeddingRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: { message: `Validation error: ${validation.error.errors.map((e) => e.message).join(", ")}`, type: "invalid_request", code: "invalid_request" }, request_id: gatewayRequestId },
      { status: 400 }
    );
  }

  const data = validation.data;

  // 3. Rate Limit Check
  const inputText = Array.isArray(data.input) ? data.input.join(" ") : data.input;
  const estimatedTokens = Math.ceil(inputText.length / 4) * 1.2;
  const rateLimit = await checkRateLimit(context.apiKeyId, Math.ceil(estimatedTokens));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: { message: `Rate limit exceeded. Retry after ${rateLimit.retryAfter}s`, type: "rate_limit_exceeded", code: "rate_limit_exceeded" }, request_id: gatewayRequestId },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
    );
  }

  try {
    const normalizedRequest: NormalizedEmbeddingRequest = {
      model: data.model,
      input: data.input,
      encodingFormat: data.encoding_format,
      dimensions: data.dimensions,
      gatewayRequestId,
    };

    const { providerId, modelId, adapter } = await routeEmbedding({
      alias: data.model,
      input: data.input,
      gatewayRequestId,
    });

    const response = await adapter.embeddings(normalizedRequest);
    const latencyMs = Date.now() - startTime;

    await logRequest({
      requestId: gatewayRequestId,
      apiKeyId: context.apiKeyId,
      providerId,
      modelAlias: data.model,
      modelUsed: modelId,
      modelFamily: "embedding",
      status: "success",
      tokensIn: response.usage.promptTokens,
      tokensOut: 0,
      latencyMs,
      streaming: false,
      ipAddress: getClientIp(req),
      providerAttempt: 1,
      gatewayRequestId,
    });

    return NextResponse.json({
      object: "list",
      data: response.data.map((d: { index: number; embedding: number[]; object: string }) => ({
        object: "embedding",
        index: d.index,
        embedding: d.embedding,
      })),
      model: data.model,
      usage: {
        prompt_tokens: response.usage.promptTokens,
        total_tokens: response.usage.totalTokens,
      },
    }, {
      headers: { "X-Request-ID": gatewayRequestId },
    });

  } catch (error) {
    logger.error({ gatewayRequestId, error: (error as Error).message }, "Embedding request failed");
    return NextResponse.json(
      { error: { message: (error as Error).message, type: "provider_error", code: "provider_error" }, request_id: gatewayRequestId },
      { status: 500 }
    );
  }
}
