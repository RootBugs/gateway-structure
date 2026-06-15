import logger from "@/lib/logger";

// ============================================================================
// Context Handoff for Failover
// ============================================================================
// When a provider fails mid-request, we need to re-send the conversation
// to a new provider. Instead of sending the FULL payload (35-110K tokens),
// we compress it to minimize token waste.
//
// Strategy:
//   1. Aggressively truncate system prompts (max 2000 chars)
//   2. Keep only last 3-5 messages (recent context)
//   3. Compress tool definitions to names only
//   4. Add a context summary message
//
// Savings: 60-80% token reduction on failover
// ============================================================================

interface MessageWithContent {
  role: string;
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
  [key: string]: unknown;
}

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

interface HandoffResult {
  messages: MessageWithContent[];
  tools: ToolDef[] | undefined;
  originalTokens: number;
  handoffTokens: number;
  tokensSaved: number;
}

// Max chars for system prompt in handoff (aggressive truncation)
const HANDOFF_SYSTEM_MAX_CHARS = 2000;

// Max messages to keep in handoff (recent context)
const HANDOFF_MAX_MESSAGES = 5;

/**
 * Build a compressed version of the conversation for failover.
 * This dramatically reduces tokens consumed by the second provider.
 */
export function buildContextHandoff(
  messages: MessageWithContent[],
  tools: ToolDef[] | undefined,
  failedProviderId: string,
  error: string
): HandoffResult {
  const startTime = Date.now();

  // Estimate original token count
  const originalTokens = estimateTokens(messages, tools);

  // Step 1: Separate system and conversation messages
  const systemMessages: MessageWithContent[] = [];
  const conversation: MessageWithContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemMessages.push(msg);
    } else {
      conversation.push(msg);
    }
  }

  // Step 2: Compress system prompts aggressively
  const compressedSystem = compressSystemMessages(systemMessages);

  // Step 3: Keep only recent conversation messages
  const recentConversation = trimToRecent(conversation, HANDOFF_MAX_MESSAGES);

  // Step 4: Add failover context message
  const handoffMessage: MessageWithContent = {
    role: "system",
    content: `[Context: Previous provider "${failedProviderId}" failed with error: ${error.substring(0, 200)}. Continuing from where we left off.]`,
  };

  // Step 5: Compress tool definitions
  const compressedTools = compressToolsForHandoff(tools);

  // Build result
  const resultMessages = [...compressedSystem, handoffMessage, ...recentConversation];
  const handoffTokens = estimateTokens(resultMessages, compressedTools);
  const tokensSaved = originalTokens - handoffTokens;

  logger.info({
    originalMessages: messages.length,
    handoffMessages: resultMessages.length,
    originalTools: tools?.length || 0,
    handoffTools: compressedTools?.length || 0,
    originalTokens,
    handoffTokens,
    tokensSaved,
    savingsPercent: Math.round((tokensSaved / originalTokens) * 100),
    buildMs: Date.now() - startTime,
  }, "Context handoff built");

  return {
    messages: resultMessages,
    tools: compressedTools,
    originalTokens,
    handoffTokens,
    tokensSaved,
  };
}

/**
 * Compress system messages for handoff.
 * Keeps essential instructions but truncates verbose definitions.
 */
function compressSystemMessages(messages: MessageWithContent[]): MessageWithContent[] {
  if (messages.length === 0) return [];

  // Merge all system messages into one
  const allContent = messages
    .map(m => typeof m.content === "string" ? m.content : "")
    .filter(c => c.length > 0)
    .join("\n\n");

  if (allContent.length <= HANDOFF_SYSTEM_MAX_CHARS) {
    return [{ role: "system", content: allContent }];
  }

  // Truncate to budget, finding a clean break point
  const truncated = allContent.substring(0, HANDOFF_SYSTEM_MAX_CHARS);
  const lastSentence = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = Math.max(lastSentence, lastNewline, HANDOFF_SYSTEM_MAX_CHARS - 200);

  return [{
    role: "system",
    content: truncated.substring(0, cutPoint) + "\n\n[System context compressed for failover]",
  }];
}

/**
 * Keep only the most recent N messages.
 * Preserves the last user message (the actual request) and recent context.
 */
function trimToRecent(messages: MessageWithContent[], maxMessages: number): MessageWithContent[] {
  if (messages.length <= maxMessages) return messages;

  // Always keep the last user message
  const lastUserIdx = messages.findLastIndex(m => m.role === "user");
  if (lastUserIdx === -1) {
    // No user message, just take last N
    return messages.slice(-maxMessages);
  }

  // Take last N messages, but ensure we include the last user message
  const recent = messages.slice(-maxMessages);

  // If last user message isn't in recent, add it
  if (!recent.some(m => m.role === "user")) {
    recent.unshift(messages[lastUserIdx]);
  }

  return recent;
}

/**
 * Compress tool definitions for handoff.
 * Keeps only tool names and minimal descriptions.
 */
function compressToolsForHandoff(tools: ToolDef[] | undefined): ToolDef[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(tool => ({
    ...tool,
    function: {
      ...tool.function,
      // Keep only first 100 chars of description
      description: tool.function.description
        ? tool.function.description.substring(0, 100) + (tool.function.description.length > 100 ? "..." : "")
        : undefined,
      // Keep parameters but strip verbose schema details
      parameters: compressToolParameters(tool.function.parameters),
    },
  }));
}

/**
 * Compress tool parameters - keep structure but strip descriptions.
 */
function compressToolParameters(params: Record<string, unknown>): Record<string, unknown> {
  if (!params || typeof params !== "object") return params;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    // Skip verbose fields
    if (key === "description" || key === "examples" || key === "title" || key === "$schema") {
      continue;
    }

    // Keep type and required
    if (key === "type" || key === "required") {
      result[key] = value;
      continue;
    }

    // Recurse into properties
    if (key === "properties" && typeof value === "object" && value !== null) {
      const props = value as Record<string, unknown>;
      const compressedProps: Record<string, unknown> = {};

      for (const [propKey, propVal] of Object.entries(props)) {
        if (typeof propVal === "object" && propVal !== null) {
          // Keep only type from nested objects
          const propObj = propVal as Record<string, unknown>;
          compressedProps[propKey] = { type: propObj.type || "string" };
        } else {
          compressedProps[propKey] = propVal;
        }
      }

      result[key] = compressedProps;
      continue;
    }

    // Pass through everything else
    result[key] = value;
  }

  return result;
}

/**
 * Estimate token count from messages and tools.
 */
function estimateTokens(messages: MessageWithContent[], tools: ToolDef[] | undefined): number {
  let totalChars = 0;

  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : "";
    totalChars += content.length;

    if (msg.tool_calls) {
      totalChars += JSON.stringify(msg.tool_calls).length;
    }
  }

  if (tools) {
    totalChars += JSON.stringify(tools).length;
  }

  // Rough estimate: 1 token ≈ 4 chars
  return Math.ceil(totalChars / 4);
}
