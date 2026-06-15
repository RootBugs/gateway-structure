import { z } from "zod";

// ============================================================================
// OpenAI-Compatible Request Schemas
// ============================================================================

export const OpenAIMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable().optional(),
  name: z.string().optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
  tool_call_id: z.string().optional(),
}).refine(
  (msg) => {
    // Assistant messages with tool_calls can have null content
    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      return true;
    }
    // Tool messages must have content
    if (msg.role === "tool") {
      return !!msg.content;
    }
    // System and user messages must have content
    if (msg.role === "system" || msg.role === "user") {
      return !!msg.content;
    }
    // Assistant without tool_calls must have content
    if (msg.role === "assistant") {
      return !!(msg.tool_calls && msg.tool_calls.length > 0) || !!msg.content;
    }
    return true;
  },
  {
    message: "Messages must have content, except assistant messages with tool_calls",
  }
);

export const OpenAIToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.unknown()),
  }),
});

export const OpenAIToolChoiceSchema = z.union([
  z.enum(["auto", "none"]),
  z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
    }),
  }),
]);

export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(OpenAIMessageSchema).min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  tools: z.array(OpenAIToolSchema).optional(),
  tool_choice: OpenAIToolChoiceSchema.optional(),
  response_format: z.object({
    type: z.enum(["text", "json_object", "json_schema"]),
    schema: z.record(z.unknown()).optional(),
  }).optional(),
  // Gateway-specific (not sent to provider)
  session_id: z.string().optional(),
});

export const EmbeddingRequestSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.string())]),
  encoding_format: z.enum(["float", "base64"]).optional().default("float"),
  dimensions: z.number().int().positive().optional(),
});

export const ApiKeyHeaderSchema = z.string().regex(
  /^sk-team-[a-zA-Z0-9_-]+$/,
  "Invalid API key format. Expected: sk-team-xxxxxxxx"
);

// Types
export type ValidatedChatRequest = z.infer<typeof ChatCompletionRequestSchema>;
export type ValidatedEmbeddingRequest = z.infer<typeof EmbeddingRequestSchema>;
