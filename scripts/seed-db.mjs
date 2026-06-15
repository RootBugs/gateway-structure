import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROVIDERS = [
  { id: 'gemini', name: 'gemini', displayName: 'Google Gemini', tier: 'tier1', isEnabled: true, priorityWeight: 100, quotaLimitDaily: 1000, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'groq', name: 'groq', displayName: 'Groq', tier: 'tier1', isEnabled: true, priorityWeight: 90, quotaLimitDaily: 1000, baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'openrouter', name: 'openrouter', displayName: 'OpenRouter', tier: 'tier1', isEnabled: true, priorityWeight: 80, quotaLimitDaily: 1000, baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'cerebras', name: 'cerebras', displayName: 'Cerebras', tier: 'tier2', isEnabled: true, priorityWeight: 70, quotaLimitDaily: 1000, baseUrl: 'https://api.cerebras.ai/v1' },
  { id: 'sambanova', name: 'sambanova', displayName: 'SambaNova', tier: 'tier2', isEnabled: true, priorityWeight: 60, quotaLimitDaily: 1000, baseUrl: 'https://api.sambanova.ai/v1' },
  { id: 'cohere', name: 'cohere', displayName: 'Cohere', tier: 'tier2', isEnabled: true, priorityWeight: 50, quotaLimitDaily: 1000, baseUrl: 'https://api.cohere.ai/v1' },
  { id: 'huggingface', name: 'huggingface', displayName: 'HuggingFace', tier: 'tier2', isEnabled: true, priorityWeight: 40, quotaLimitDaily: 500, baseUrl: 'https://api-inference.huggingface.co/v1' },
  { id: 'together', name: 'together', displayName: 'Together AI', tier: 'tier3', isEnabled: true, priorityWeight: 30, quotaLimitDaily: 500, baseUrl: 'https://api.together.xyz/v1' },
  { id: 'fireworks', name: 'fireworks', displayName: 'Fireworks', tier: 'tier3', isEnabled: true, priorityWeight: 20, quotaLimitDaily: 500, baseUrl: 'https://api.fireworks.ai/inference/v1' },
  { id: 'ollama', name: 'ollama', displayName: 'Ollama (Local)', tier: 'optional', isEnabled: false, priorityWeight: 10, quotaLimitDaily: 999999, baseUrl: 'http://localhost:11434/v1' },
  { id: 'vllm', name: 'vllm', displayName: 'vLLM (Local)', tier: 'optional', isEnabled: false, priorityWeight: 10, quotaLimitDaily: 999999, baseUrl: 'http://localhost:8000/v1' },
  { id: 'xiaomimimo', name: 'xiaomimimo', displayName: 'Xiaomi MiMo', tier: 'tier2', isEnabled: true, priorityWeight: 45, quotaLimitDaily: 1000, baseUrl: 'https://api.xiaomimimo.com/v1' },
];

const MODEL_ALIASES = [
  {
    id: 'coder-fast',
    alias: 'coder-fast',
    displayName: 'Coder Fast',
    description: 'Optimized for speed - quick autocomplete, simple refactoring',
    routingStrategy: 'best_score',
    preferredProviders: JSON.stringify(['groq', 'gemini', 'cerebras']),
    fallbackProviders: JSON.stringify(['openrouter', 'sambanova', 'xiaomimimo', 'together', 'fireworks']),
    maxTokens: 4096,
    temperature: 0.1,
    isActive: true,
  },
  {
    id: 'coder-smart',
    alias: 'coder-smart',
    displayName: 'Coder Smart',
    description: 'Balanced speed and quality - complex features, debugging',
    routingStrategy: 'best_score',
    preferredProviders: JSON.stringify(['groq', 'gemini', 'xiaomimimo', 'openrouter']),
    fallbackProviders: JSON.stringify(['cerebras', 'sambanova', 'cohere', 'together']),
    maxTokens: 8192,
    temperature: 0.2,
    isActive: true,
  },
  {
    id: 'reasoning',
    alias: 'reasoning',
    displayName: 'Reasoning',
    description: 'Deep reasoning - algorithm design, system architecture',
    routingStrategy: 'best_score',
    preferredProviders: JSON.stringify(['gemini', 'xiaomimimo', 'openrouter', 'groq']),
    fallbackProviders: JSON.stringify(['cerebras', 'sambanova', 'cohere', 'together']),
    maxTokens: 16384,
    temperature: 0.3,
    isActive: true,
  },
  {
    id: 'architect',
    alias: 'architect',
    displayName: 'Architect',
    description: 'High-level design - project structure, tech decisions',
    routingStrategy: 'best_score',
    preferredProviders: JSON.stringify(['openrouter', 'gemini', 'xiaomimimo', 'groq']),
    fallbackProviders: JSON.stringify(['cerebras', 'sambanova', 'cohere', 'together']),
    maxTokens: 32768,
    temperature: 0.4,
    systemPrompt: 'You are a senior software architect. Focus on design patterns, scalability, and maintainability.',
    isActive: true,
  },
  {
    id: 'deep-research',
    alias: 'deep-research',
    displayName: 'Deep Research',
    description: 'Long-context research - documentation, code review, analysis',
    routingStrategy: 'best_score',
    preferredProviders: JSON.stringify(['gemini', 'xiaomimimo', 'openrouter']),
    fallbackProviders: JSON.stringify(['groq', 'cerebras', 'together', 'fireworks']),
    maxTokens: 128000,
    temperature: 0.5,
    systemPrompt: 'You are a research assistant. Provide thorough, well-structured analysis with citations where possible.',
    isActive: true,
  },
];

async function main() {
  console.log('🌱 Seeding database...\n');

  // Seed providers
  for (const p of PROVIDERS) {
    const result = await prisma.provider.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        displayName: p.displayName,
        tier: p.tier,
        isEnabled: p.isEnabled,
        priorityWeight: p.priorityWeight,
        quotaLimitDaily: p.quotaLimitDaily,
        baseUrl: p.baseUrl,
      },
      create: p,
    });
    console.log(`  ✅ Provider: ${result.id} (enabled: ${result.isEnabled})`);
  }

  // Seed provider health
  for (const p of PROVIDERS) {
    await prisma.providerHealth.upsert({
      where: { providerId: p.id },
      update: {
        status: 'healthy',
        circuitState: 'closed',
        latencyMs: 0,
        successRate: 100,
        errorRate: 0,
        consecutiveFailures: 0,
      },
      create: {
        providerId: p.id,
        status: 'healthy',
        circuitState: 'closed',
        latencyMs: 0,
        successRate: 100,
        errorRate: 0,
        consecutiveFailures: 0,
      },
    });
    console.log(`  ✅ Health: ${p.id} (healthy, closed)`);
  }

  // Seed provider quota state
  for (const p of PROVIDERS) {
    await prisma.providerQuotaState.upsert({
      where: { providerId: p.id },
      update: {
        remainingRequests: p.quotaLimitDaily,
        remainingTokens: p.quotaLimitDaily * 1000,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      create: {
        providerId: p.id,
        remainingRequests: p.quotaLimitDaily,
        remainingTokens: p.quotaLimitDaily * 1000,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    console.log(`  ✅ Quota: ${p.id} (${p.quotaLimitDaily} req/day)`);
  }

  // Seed model aliases
  for (const a of MODEL_ALIASES) {
    await prisma.modelAlias.upsert({
      where: { id: a.id },
      update: {
        alias: a.alias,
        displayName: a.displayName,
        description: a.description,
        routingStrategy: a.routingStrategy,
        preferredProviders: a.preferredProviders,
        fallbackProviders: a.fallbackProviders,
        maxTokens: a.maxTokens,
        temperature: a.temperature,
        systemPrompt: a.systemPrompt || null,
        isActive: a.isActive,
      },
      create: a,
    });
    console.log(`  ✅ Model Alias: ${a.alias}`);
  }

  // Verify
  const providerCount = await prisma.provider.count();
  const healthCount = await prisma.providerHealth.count();
  const quotaCount = await prisma.providerQuotaState.count();
  const aliasCount = await prisma.modelAlias.count();

  console.log(`\n📊 Database seeded:`);
  console.log(`   Providers: ${providerCount}`);
  console.log(`   Health records: ${healthCount}`);
  console.log(`   Quota states: ${quotaCount}`);
  console.log(`   Model aliases: ${aliasCount}`);
  console.log(`\n✅ Done!`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
