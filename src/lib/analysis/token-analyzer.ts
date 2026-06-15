/**
 * Token Analyzer — Measures prompt inflation in chat completion requests
 *
 * Estimates token counts using the 1 token ≈ 4 characters heuristic.
 * Identifies OpenClaude system prompts and detects duplication.
 */

// ============================================================================
// Token Estimation
// ============================================================================

/** Rough token estimate: 1 token ≈ 4 characters */
export function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / 4);
}

/** Estimate tokens for tool definitions */
export function estimateToolTokens(tools: unknown[]): number {
  if (!tools || tools.length === 0) return 0;
  return estimateTokens(JSON.stringify(tools));
}

// ============================================================================
// OpenClaude Detection
// ============================================================================

// Compound markers only — avoid false positives on single common words
const OPENCLAUDE_MARKERS = [
  "<system-reminder>",
  "Available agent types",
  "Claude Code",
  "Claude Agent SDK",
  "You are OWL",
  "You are OpenClaude",
  "<local-command",
  "<task-notification",
  "agent types for the Agent",
  "OpenClaude connects to",
];

export function isOpenClaudeSystemPrompt(content: string): boolean {
  if (!content || typeof content !== "string") return false;
  return OPENCLAUDE_MARKERS.some((marker) => content.includes(marker));
}

// ============================================================================
// Message Analysis
// ============================================================================

export interface MessageAnalysis {
  index: number;
  role: string;
  contentLength: number;
  estimatedTokens: number;
  toolCallTokens: number;
  totalTokens: number;
  contentPreview: string;
  isOpenClaudePrompt: boolean;
}

export interface RequestAnalysis {
  // Per-message breakdown
  messages: MessageAnalysis[];

  // Aggregated by role
  byRole: {
    system: { count: number; tokens: number };
    user: { count: number; tokens: number };
    assistant: { count: number; tokens: number };
    tool: { count: number; tokens: number };
  };

  // OpenClaude specific
  openClaude: {
    promptCount: number;
    promptTokens: number;
    percentageOfTotal: number;
  };

  // Tools
  tools: {
    count: number;
    estimatedTokens: number;
    percentageOfTotal: number;
  };

  // Totals
  totalMessages: number;
  totalMessageTokens: number;
  grandTotalTokens: number;

  // Duplication detection
  duplicateSystemMessages: {
    detected: boolean;
    systemMessageCount: number;
    uniquePrefixes: number;
  };

  // Top 10 largest messages
  top10Largest: MessageAnalysis[];
}

export function analyzeRequest(
  messages: Array<Record<string, unknown>>,
  tools?: unknown[]
): RequestAnalysis {
  // Analyze each message
  const analyzedMessages: MessageAnalysis[] = messages.map((msg, index) => {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
    const toolCallTokens = msg.tool_calls ? estimateTokens(JSON.stringify(msg.tool_calls)) : 0;
    const contentTokens = estimateTokens(content);
    const totalTokens = contentTokens + toolCallTokens + 10; // +10 for role/formatting overhead

    return {
      index,
      role: (msg.role as string) || "unknown",
      contentLength: content.length,
      estimatedTokens: contentTokens,
      toolCallTokens,
      totalTokens,
      contentPreview: content.substring(0, 120).replace(/\n/g, " "),
      isOpenClaudePrompt: msg.role === "system" && isOpenClaudeSystemPrompt(content),
    };
  });

  // Aggregate by role
  const byRole = {
    system: { count: 0, tokens: 0 },
    user: { count: 0, tokens: 0 },
    assistant: { count: 0, tokens: 0 },
    tool: { count: 0, tokens: 0 },
  };

  let openClaudeTokens = 0;
  let openClaudeCount = 0;

  for (const msg of analyzedMessages) {
    const role = msg.role as keyof typeof byRole;
    if (byRole[role]) {
      byRole[role].count++;
      byRole[role].tokens += msg.totalTokens;
    }
    if (msg.isOpenClaudePrompt) {
      openClaudeTokens += msg.totalTokens;
      openClaudeCount++;
    }
  }

  // Tool analysis
  const toolTokens = estimateToolTokens(tools || []);

  // Total message tokens
  const totalMessageTokens = analyzedMessages.reduce((sum, m) => sum + m.totalTokens, 0);

  // Grand total
  const grandTotalTokens = totalMessageTokens + toolTokens;

  // Duplicate detection
  const systemMsgs = analyzedMessages.filter((m) => m.role === "system");
  const uniquePrefixes = new Set(
    systemMsgs.map((m) => m.contentPreview.substring(0, 200))
  );

  // Top 10 largest
  const top10Largest = [...analyzedMessages]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10);

  return {
    messages: analyzedMessages,
    byRole,
    openClaude: {
      promptCount: openClaudeCount,
      promptTokens: openClaudeTokens,
      percentageOfTotal:
        grandTotalTokens > 0
          ? Math.round((openClaudeTokens / grandTotalTokens) * 100)
          : 0,
    },
    tools: {
      count: (tools || []).length,
      estimatedTokens: toolTokens,
      percentageOfTotal:
        grandTotalTokens > 0
          ? Math.round((toolTokens / grandTotalTokens) * 100)
          : 0,
    },
    totalMessages: messages.length,
    totalMessageTokens,
    grandTotalTokens,
    duplicateSystemMessages: {
      detected: systemMsgs.length > uniquePrefixes.size,
      systemMessageCount: systemMsgs.length,
      uniquePrefixes: uniquePrefixes.size,
    },
    top10Largest,
  };
}

// ============================================================================
// Console-Friendly Report
// ============================================================================

export function formatAnalysisReport(analysis: RequestAnalysis): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║              PROMPT INFLATION ANALYSIS REPORT               ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");

  // Overview
  lines.push("━━━ OVERVIEW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`  Total messages:        ${analysis.totalMessages}`);
  lines.push(`  Total message tokens:  ~${analysis.totalMessageTokens.toLocaleString()}`);
  lines.push(`  Tool definition tokens: ~${analysis.tools.estimatedTokens.toLocaleString()}`);
  lines.push(`  GRAND TOTAL:           ~${analysis.grandTotalTokens.toLocaleString()} tokens`);
  lines.push("");

  // By Role
  lines.push("━━━ TOKENS BY ROLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const [role, data] of Object.entries(analysis.byRole)) {
    const pct = analysis.grandTotalTokens > 0
      ? Math.round((data.tokens / analysis.grandTotalTokens) * 100)
      : 0;
    lines.push(`  ${role.padEnd(12)} ${String(data.count).padStart(4)} messages  ~${data.tokens.toLocaleString().padStart(8)} tokens  (${pct}%)`);
  }
  lines.push("");

  // OpenClaude
  lines.push("━━━ OPENCLAUDE SYSTEM PROMPTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`  Prompts detected:    ${analysis.openClaude.promptCount}`);
  lines.push(`  Tokens consumed:     ~${analysis.openClaude.promptTokens.toLocaleString()}`);
  lines.push(`  % of total:          ${analysis.openClaude.percentageOfTotal}%`);
  lines.push("");

  // Tools
  lines.push("━━━ TOOL DEFINITIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`  Tools defined:       ${analysis.tools.count}`);
  lines.push(`  Tokens consumed:     ~${analysis.tools.estimatedTokens.toLocaleString()}`);
  lines.push(`  % of total:          ${analysis.tools.percentageOfTotal}%`);
  lines.push("");

  // Duplication
  lines.push("━━━ DUPLICATE DETECTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`  System messages:     ${analysis.duplicateSystemMessages.systemMessageCount}`);
  lines.push(`  Unique prefixes:     ${analysis.duplicateSystemMessages.uniquePrefixes}`);
  lines.push(`  Duplicates found:    ${analysis.duplicateSystemMessages.detected ? "YES ⚠️" : "No"}`);
  lines.push("");

  // Top 10 Largest
  lines.push("━━━ TOP 10 LARGEST MESSAGES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const msg of analysis.top10Largest) {
    const marker = msg.isOpenClaudePrompt ? " [OpenClaude]" : "";
    lines.push(`  #${String(msg.index).padStart(2)} ${msg.role.padEnd(10)} ~${String(msg.totalTokens).padStart(6)} tokens${marker}`);
    lines.push(`       Preview: ${msg.contentPreview.substring(0, 60)}...`);
  }
  lines.push("");

  // Provider Limits Comparison
  lines.push("━━━ PROVIDER TOKEN LIMITS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const limits = [
    { name: "Groq (Llama 3.3 70B)", inputTokens: 12000 },
    { name: "Cerebras (GPT-OSS 120B)", inputTokens: 8000 },
    { name: "Gemini 2.5 Flash", inputTokens: 1000000 },
    { name: "Gemini 2.5 Pro", inputTokens: 1000000 },
    { name: "OpenRouter (Claude)", inputTokens: 200000 },
  ];

  for (const limit of limits) {
    const pct = Math.round((analysis.grandTotalTokens / limit.inputTokens) * 100);
    const status = pct > 100 ? "❌ OVER LIMIT" : pct > 80 ? "⚠️ NEAR LIMIT" : "✅ OK";
    lines.push(`  ${limit.name.padEnd(30)} Limit: ${String(limit.inputTokens).padStart(8)} tokens  Usage: ${String(pct).padStart(3)}%  ${status}`);
  }
  lines.push("");

  // Recommendations
  lines.push("━━━ ESTIMATION NOTE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("  Token estimates use chars/4 heuristic — actual tokenization ±20%");
  lines.push("");
  lines.push("━━━ RECOMMENDATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (analysis.duplicateSystemMessages.detected) {
    lines.push("  🔴 CRITICAL: Duplicate system messages detected — deduplicate before sending");
  }
  if (analysis.openClaude.percentageOfTotal > 50) {
    lines.push("  🔴 CRITICAL: OpenClaude system prompts consume >50% of request — consider summarization");
  }
  if (analysis.tools.percentageOfTotal > 30) {
    lines.push("  ⚠️ WARNING: Tool definitions consume >30% — consider lazy-loading or reducing tool count");
  }
  if (analysis.grandTotalTokens > 8000) {
    lines.push("  ⚠️ WARNING: Total request exceeds Groq/Cerebras limits — route to higher-capacity providers");
  }
  if (analysis.openClaude.promptCount > 1) {
    lines.push("  ⚠️ WARNING: Multiple OpenClaude system prompts — likely duplicated in conversation history");
  }
  lines.push("");

  return lines.join("\n");
}
