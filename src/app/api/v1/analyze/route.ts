import { NextRequest, NextResponse } from "next/server";
import { analyzeRequest, formatAnalysisReport } from "@/lib/analysis/token-analyzer";
import { authenticateApiRequest } from "@/lib/auth/api-key-middleware";
import logger from "@/lib/logger";

export const runtime = "nodejs";

/**
 * POST /api/v1/analyze
 *
 * Diagnostic endpoint that analyzes request token inflation.
 * Requires API key authentication (same as chat completions).
 * Does NOT forward to any provider.
 *
 * Usage:
 *   curl -X POST http://localhost:3000/api/v1/analyze \
 *     -H "Content-Type: application/json" \
 *     -H "Authorization: Bearer sk-team-xxxxx" \
 *     -d @request.json
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req);
  if (!auth.success) {
    return auth.response;
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body.messages as Array<Record<string, unknown>>) || [];
  const tools = (body.tools as unknown[]) || [];

  // Run analysis
  const analysis = analyzeRequest(messages, tools);

  // Generate report
  const report = formatAnalysisReport(analysis);

  // Log report via structured logger
  logger.info({
    totalTokens: analysis.grandTotalTokens,
    report,
  }, "Analysis report");

  logger.info(
    {
      totalTokens: analysis.grandTotalTokens,
      messageCount: analysis.totalMessages,
      openClaudeTokens: analysis.openClaude.promptTokens,
      toolTokens: analysis.tools.estimatedTokens,
      duplicateSystem: analysis.duplicateSystemMessages.detected,
    },
    "Request analysis complete"
  );

  return NextResponse.json(
    {
      analysis,
      report,
    },
    {
      headers: {
        "X-Total-Tokens": String(analysis.grandTotalTokens),
        "X-OpenClaude-Tokens": String(analysis.openClaude.promptTokens),
        "X-Message-Count": String(analysis.totalMessages),
      },
    }
  );
}
