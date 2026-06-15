// Provider Configuration - Static definitions for all 12 providers
// All providers now use OpenAI-compatible endpoints (verified 2026)

export interface ProviderConfig {
  id: string;
  name: string;
  displayName: string;
  tier: "tier1" | "tier2" | "tier3" | "optional";
  baseUrl: string;
  apiKeyEnvVar: string;
  headers: Record<string, string>;
  modelMapping: Record<string, string>;
  supportsStreaming: boolean;
  maxRetries: number;
  timeoutMs: number;
  // Maximum tokens per request (provider-specific TPM limit)
  maxTokensPerRequest?: number;
  // Provider-specific request/response transformations
  requestTransform?: (body: any) => any;
  responseTransform?: (data: any) => any;
  // Special headers for this provider    // Extra headers to add to every request
    extraHeaders?: Record<string, string>;
  }

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  gemini: {
    id: "gemini",
    name: "gemini",
    displayName: "Google Gemini",
    tier: "tier1",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnvVar: "GEMINI_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "gemini-2.5-flash",
      "coder-smart": "gemini-2.5-pro",
      "reasoning": "gemini-2.5-pro",
      "architect": "gemini-2.5-pro",
      "deep-research": "gemini-2.5-pro",
    },
    supportsStreaming: true,
    maxRetries: 3,
    timeoutMs: 30000,
    // Gemini: 1M+ token context window
    maxTokensPerRequest: 1000000,
  },

  groq: {
    id: "groq",
    name: "groq",
    displayName: "Groq",
    tier: "tier1",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnvVar: "GROQ_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "llama-3.3-70b-versatile",
      "coder-smart": "meta-llama/llama-4-scout-17b-16e-instruct",
      "reasoning": "qwen/qwen3-32b",
      "architect": "qwen/qwen3-32b",
      "deep-research": "meta-llama/llama-4-scout-17b-16e-instruct",
    },
    supportsStreaming: true,
    maxRetries: 3,
    timeoutMs: 15000,
    // Groq free tier: 12K TPM limit per request
    maxTokensPerRequest: 12000,
  },

  openrouter: {
    id: "openrouter",
    name: "openrouter",
    displayName: "OpenRouter",
    tier: "tier1",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnvVar: "OPENROUTER_API_KEYS",
    headers: {
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000",
      "X-Title": "AI Gateway",
    },
    modelMapping: {
      "coder-fast": "openai/gpt-4o-mini",
      "coder-smart": "openrouter/owl-alpha",
      "reasoning": "openrouter/owl-alpha",
      "architect": "openrouter/owl-alpha",
      "deep-research": "openrouter/owl-alpha",
    },
    supportsStreaming: true,
    maxRetries: 2,
    timeoutMs: 30000,
    // Owl Alpha: FREE model with 1M context, great for coding & agentic tasks
    maxTokensPerRequest: 1000000,
    // OpenRouter models (esp. perplexity) need min 16 max_tokens
    requestTransform: (body) => {
      if (body.max_tokens && body.max_tokens < 16) {
        return { ...body, max_tokens: 16 };
      }
      return body;
    },
  },

  cerebras: {
    id: "cerebras",
    name: "cerebras",
    displayName: "Cerebras",
    tier: "tier2",
    baseUrl: "https://api.cerebras.ai/v1",
    apiKeyEnvVar: "CEREBRAS_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "gpt-oss-120b",
      "coder-smart": "zai-glm-4.7",
      "reasoning": "zai-glm-4.7",
      "architect": "zai-glm-4.7",
      "deep-research": "zai-glm-4.7",
    },
    supportsStreaming: true,
    maxRetries: 2,
    timeoutMs: 20000,
    // Cerebras free tier: ~8K TPM limit
    maxTokensPerRequest: 8000,
    // Cerebras drops unsupported params
    requestTransform: (body) => {
      const { frequency_penalty, logit_bias, presence_penalty, ...rest } = body;
      return rest;
    },
  },

  sambanova: {
    id: "sambanova",
    name: "sambanova",
    displayName: "SambaNova",
    tier: "tier2",
    baseUrl: "https://api.sambanova.ai/v1",
    apiKeyEnvVar: "SAMBANOVA_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "Meta-Llama-3.3-70B-Instruct",
      "coder-smart": "Meta-Llama-3.3-70B-Instruct",
      "reasoning": "Meta-Llama-3.3-70B-Instruct",
      "architect": "Meta-Llama-3.3-70B-Instruct",
      "deep-research": "Meta-Llama-3.3-70B-Instruct",
    },
    supportsStreaming: true,
    maxRetries: 2,
    timeoutMs: 20000,
    // SambaNova: generous limits, ~100K per request
    maxTokensPerRequest: 100000,
  },

  cohere: {
    id: "cohere",
    name: "cohere",
    displayName: "Cohere",
    tier: "tier3",
    baseUrl: "https://api.cohere.ai/v1",
    apiKeyEnvVar: "COHERE_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "command-r-plus",
      "coder-smart": "command-r-plus",
      "reasoning": "command-r-plus",
      "architect": "command-r-plus",
      "deep-research": "command-r-plus",
    },
    supportsStreaming: true,
    // Reduced: no API key configured, fail fast
    maxRetries: 0,
    timeoutMs: 5000,
  },

  huggingface: {
    id: "huggingface",
    name: "huggingface",
    displayName: "Hugging Face",
    tier: "tier3",
    baseUrl: "https://router.huggingface.co/v1",
    apiKeyEnvVar: "HUGGINGFACE_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "meta-llama/Llama-3.1-8B-Instruct",
      "coder-smart": "meta-llama/Llama-3.1-70B-Instruct",
      "reasoning": "meta-llama/Llama-3.1-70B-Instruct",
      "architect": "meta-llama/Llama-3.1-70B-Instruct",
      "deep-research": "meta-llama/Llama-3.1-70B-Instruct",
    },
    supportsStreaming: true,
    // HF key returns 403 (insufficient permissions), fail fast
    maxRetries: 0,
    timeoutMs: 8000,
  },

  together: {
    id: "together",
    name: "together",
    displayName: "Together AI",
    tier: "tier3",
    baseUrl: "https://api.together.xyz/v1",
    apiKeyEnvVar: "TOGETHER_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "meta-llama/Llama-3.2-3B-Instruct-Turbo",
      "coder-smart": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "reasoning": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "architect": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "deep-research": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    },
    supportsStreaming: true,
    // Reduced: no API key configured, fail fast
    maxRetries: 0,
    timeoutMs: 5000,
  },

  fireworks: {
    id: "fireworks",
    name: "fireworks",
    displayName: "Fireworks AI",
    tier: "tier3",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    apiKeyEnvVar: "FIREWORKS_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "accounts/fireworks/models/gpt-oss-120b",
      "coder-smart": "accounts/fireworks/models/kimi-k2p6",
      "reasoning": "accounts/fireworks/models/kimi-k2p6",
      "architect": "accounts/fireworks/models/kimi-k2p6",
      "deep-research": "accounts/fireworks/models/deepseek-v4-pro",
    },
    supportsStreaming: true,
    maxRetries: 2,
    timeoutMs: 30000,
    // Fireworks: generous limits
    maxTokensPerRequest: 100000,
  },

  ollama: {
    id: "ollama",
    name: "ollama",
    displayName: "Ollama (Local)",
    tier: "optional",
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    apiKeyEnvVar: "",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "codellama",
      "coder-smart": "codellama:70b",
      "reasoning": "llama3.1:70b",
      "architect": "llama3.1:70b",
      "deep-research": "llama3.1:70b",
    },
    supportsStreaming: true,
    maxRetries: 1,
    timeoutMs: 60000,
  },

  vllm: {
    id: "vllm",
    name: "vllm",
    displayName: "vLLM (Local)",
    tier: "optional",
    baseUrl: process.env.VLLM_BASE_URL || "http://localhost:8000/v1",
    apiKeyEnvVar: "",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "default",
      "coder-smart": "default",
      "reasoning": "default",
      "architect": "default",
      "deep-research": "default",
    },
    supportsStreaming: true,
    maxRetries: 1,
    timeoutMs: 60000,
  },

  xiaomimimo: {
    id: "xiaomimimo",
    name: "xiaomimimo",
    displayName: "Xiaomi MiMo",
    tier: "tier3",
    baseUrl: "https://api.xiaomimimo.com/v1",
    apiKeyEnvVar: "XIAOMIMIMO_API_KEY",
    headers: { "Content-Type": "application/json" },
    modelMapping: {
      "coder-fast": "mimo-v2.5",
      "coder-smart": "mimo-v2.5-pro",
      "reasoning": "mimo-v2.5-pro",
      "architect": "mimo-v2.5-pro",
      "deep-research": "mimo-v2.5-pro",
    },
    supportsStreaming: true,
    // Reduced from 30s: MiMo is ~11s, fail faster
    maxRetries: 1,
    timeoutMs: 15000,
    maxTokensPerRequest: 128000,
  },
};

// Model alias definitions
export const MODEL_ALIASES: Record<string, {
  displayName: string;
  description: string;
  routingStrategy: "best_score" | "weighted" | "sticky";
  preferredProviders: string[];
  fallbackProviders: string[];
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
}> = {
  "coder-fast": {
    displayName: "Coder Fast",
    description: "Optimized for speed - quick autocomplete, simple refactoring",
    routingStrategy: "best_score",
    preferredProviders: ["groq", "openrouter", "gemini"],
    fallbackProviders: ["cerebras", "sambanova", "fireworks", "xiaomimimo"],
    maxTokens: 4096,
    temperature: 0.1,
  },
  "coder-smart": {
    displayName: "Coder Smart",
    description: "Balanced speed and quality - complex features, debugging",
    routingStrategy: "best_score",
    preferredProviders: ["groq", "gemini", "openrouter", "sambanova"],
    fallbackProviders: ["cerebras", "fireworks", "xiaomimimo"],
    maxTokens: 8192,
    temperature: 0.2,
  },
  "reasoning": {
    displayName: "Reasoning",
    description: "Deep reasoning - algorithm design, system architecture",
    routingStrategy: "best_score",
    preferredProviders: ["gemini", "openrouter", "groq"],
    fallbackProviders: ["cerebras", "sambanova", "fireworks", "xiaomimimo"],
    maxTokens: 16384,
    temperature: 0.3,
  },
  "architect": {
    displayName: "Architect",
    description: "High-level design - project structure, tech decisions",
    routingStrategy: "best_score",
    preferredProviders: ["openrouter", "gemini", "groq"],
    fallbackProviders: ["cerebras", "sambanova", "fireworks", "xiaomimimo"],
    maxTokens: 32768,
    temperature: 0.4,
    systemPrompt: "You are a senior software architect. Focus on design patterns, scalability, and maintainability.",
  },
  "deep-research": {
    displayName: "Deep Research",
    description: "Long-context research - documentation, code review, analysis",
    routingStrategy: "best_score",
    preferredProviders: ["gemini", "openrouter", "sambanova"],
    fallbackProviders: ["groq", "cerebras", "fireworks", "xiaomimimo"],
    maxTokens: 128000,
    temperature: 0.5,
    systemPrompt: "You are a research assistant. Provide thorough, well-structured analysis with citations where possible.",
  },
};

// System prompts per alias
export const SYSTEM_PROMPTS: Record<string, string> = {
  "coder-fast": "You are a fast coding assistant. Provide concise, accurate code suggestions.",
  "coder-smart": "You are an expert programmer. Write clean, efficient, well-documented code.",
  "reasoning": "You are a reasoning engine. Think step-by-step and explain your logic clearly.",
  "architect": "You are a senior software architect. Focus on design patterns, scalability, and maintainability.",
  "deep-research": "You are a research assistant. Provide thorough, well-structured analysis with citations where possible.",
};

// Model family mapping for preservation
export const MODEL_FAMILIES: Record<string, string[]> = {
  "gemini-2.5-flash": ["gemini"],
  "gemini-2.5-pro": ["gemini"],
  "gemini-2.0-flash": ["gemini"],
  "gemini-2.0-flash-001": ["gemini"],
  "gemini-2.0-flash-lite": ["gemini"],
  "gemini-3-flash-preview": ["gemini"],
  "gemini-3.1-flash-lite": ["gemini"],
  "llama-3.3-70b-versatile": ["llama"],
  "llama-3.1-8b-instant": ["llama"],
  "llama-3.1-8b": ["llama"],
  "llama-3.3-70b": ["llama"],
  "Meta-Llama-3.3-70B-Instruct": ["llama"],
  "Llama-3.3-70B-Instruct": ["llama"],
  "meta-llama/Llama-3.2-3B-Instruct-Turbo": ["llama"],
  "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo": ["llama"],
  "openai/gpt-4o-mini": ["gpt"],
  "anthropic/claude-sonnet-4": ["claude"],
  "perplexity/sonar-reasoning": ["perplexity"],
  "perplexity/sonar-reasoning-pro": ["perplexity"],
  "perplexity/sonar-pro": ["perplexity"],
  "perplexity/sonar": ["perplexity"],
  "perplexity/sonar-deep-research": ["perplexity"],
  "perplexity/sonar-pro-search": ["perplexity"],
  "command-r-plus": ["command"],
  "meta-llama/Llama-3.1-8B-Instruct": ["llama"],
  "meta-llama/Llama-3.1-70B-Instruct": ["llama"],
  "qwen/qwen3-32b": ["qwen"],
  "meta-llama/llama-4-scout-17b-16e-instruct": ["llama"],
  "openai/gpt-oss-20b": ["llama"],
  "gpt-oss-120b": ["llama"],
  "zai-glm-4.7": ["glm"],
  "kimi-k2p6": ["kimi"],
  "deepseek-v4-pro": ["deepseek"],
  "accounts/fireworks/models/llama4-scout-17b-16e-instruct": ["llama"],
  "accounts/fireworks/models/llama4-maverick-17b-128e-instruct": ["llama"],
  "accounts/fireworks/models/gpt-oss-120b": ["llama"],
  "accounts/fireworks/models/kimi-k2p6": ["kimi"],
  "accounts/fireworks/models/deepseek-v4-pro": ["deepseek"],
  "default": ["llama"],

  // Xiaomi MiMo models
  "mimo-v2.5": ["mimo"],
  "mimo-v2.5-pro": ["mimo"],

  // OpenRouter Owl Alpha (free, agentic/coding-optimized)
  "openrouter/owl-alpha": ["owl"],
};

export function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return PROVIDER_CONFIGS[providerId];
}

export function getModelAlias(alias: string) {
  return MODEL_ALIASES[alias];
}

export function getSystemPrompt(alias: string): string | undefined {
  return SYSTEM_PROMPTS[alias];
}

export function getModelFamily(modelId: string): string {
  const families = MODEL_FAMILIES[modelId];
  return families?.[0] || "unknown";
}

export function getAllProviderIds(): string[] {
  return Object.keys(PROVIDER_CONFIGS);
}

export function getActiveProviderIds(): string[] {
  const isProduction = process.env.NODE_ENV === "production";
  return Object.entries(PROVIDER_CONFIGS)
    .filter(([_, config]) => {
      // Skip local providers (ollama/vllm) in production — they won't be reachable
      if (!config.apiKeyEnvVar || config.apiKeyEnvVar.length === 0) {
        return !isProduction;
      }
      // Check both plural (KEYS) and singular (KEY) env vars
      // (key-rotation.ts handles this, but we need it here too for routing decisions)
      const raw = process.env[config.apiKeyEnvVar] || process.env[config.apiKeyEnvVar.replace("_KEYS", "_KEY")] || "";
      const hasKey = raw.split(",").some(k => k.trim().length > 0);
      return hasKey;
    })
    .map(([id]) => id);
}

export function getProvidersByFamily(family: string): string[] {
  return Object.entries(PROVIDER_CONFIGS)
    .filter(([_, config]) => {
      return Object.values(config.modelMapping).some(modelId => {
        const families = MODEL_FAMILIES[modelId];
        return families?.includes(family);
      });
    })
    .map(([id]) => id);
}
