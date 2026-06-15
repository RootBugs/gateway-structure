import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);
const envContent = readFileSync(join(PROJECT_ROOT, '.env'), 'utf8');
const getEnv = (key) => {
  const m = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};

const PROVIDER_CONFIGS = {
  gemini: { id: 'gemini', apiKeyEnvVar: 'GEMINI_API_KEY', modelMapping: { 'coder-fast': 'gemini-2.5-flash' } },
  groq: { id: 'groq', apiKeyEnvVar: 'GROQ_API_KEY', modelMapping: { 'coder-fast': 'llama-3.1-8b-instant' } },
  cerebras: { id: 'cerebras', apiKeyEnvVar: 'CEREBRAS_API_KEY', modelMapping: { 'coder-fast': 'gpt-oss-120b' } },
  cohere: { id: 'cohere', apiKeyEnvVar: 'COHERE_API_KEY', modelMapping: { 'coder-fast': 'command-r-plus' } },
  sambanova: { id: 'sambanova', apiKeyEnvVar: 'SAMBANOVA_API_KEY', modelMapping: { 'coder-fast': 'Meta-Llama-3.3-70B-Instruct' } },
  huggingface: { id: 'huggingface', apiKeyEnvVar: 'HUGGINGFACE_API_KEY', modelMapping: { 'coder-fast': 'meta-llama/Llama-3.1-8B-Instruct' } },
  together: { id: 'together', apiKeyEnvVar: 'TOGETHER_API_KEY', modelMapping: { 'coder-fast': 'meta-llama/Llama-3.2-3B-Instruct-Turbo' } },
  fireworks: { id: 'fireworks', apiKeyEnvVar: 'FIREWORKS_API_KEY', modelMapping: { 'coder-fast': 'accounts/fireworks/models/gpt-oss-120b' } },
  openrouter: { id: 'openrouter', apiKeyEnvVar: 'OPENROUTER_API_KEY', modelMapping: { 'coder-fast': 'openai/gpt-4o-mini' } },
  ollama: { id: 'ollama', apiKeyEnvVar: '', modelMapping: { 'coder-fast': 'codellama' } },
  vllm: { id: 'vllm', apiKeyEnvVar: '', modelMapping: { 'coder-fast': 'default' } },
};

const MODEL_ALIASES = {
  'coder-fast': {
    preferredProviders: ['groq', 'gemini', 'cerebras'],
    fallbackProviders: ['openrouter', 'sambanova', 'fireworks'],
  },
};

console.log('========== ROUTING TRACE: coder-fast ==========\n');

// Step 1: getActiveProviderIds
console.log('1. getActiveProviderIds():');
const activeIds = Object.entries(PROVIDER_CONFIGS)
  .filter(([_, config]) => {
    if (!config.apiKeyEnvVar || config.apiKeyEnvVar.length === 0) return true;
    const key = getEnv(config.apiKeyEnvVar);
    return key && key.length > 0;
  })
  .map(([id]) => id);
console.log('   Result:', activeIds.join(', '));

// Step 2: Model alias
const alias = MODEL_ALIASES['coder-fast'];
console.log('\n2. Model alias "coder-fast":');
console.log('   Preferred:', alias.preferredProviders.join(', '));
console.log('   Fallback:', alias.fallbackProviders.join(', '));

// Step 3: Routing candidates
console.log('\n3. Routing candidates:');
const allCandidates = [...alias.preferredProviders, ...alias.fallbackProviders];
for (const pid of allCandidates) {
  const config = PROVIDER_CONFIGS[pid];
  const hasEnvKey = config.apiKeyEnvVar && getEnv(config.apiKeyEnvVar);
  const isActive = activeIds.includes(pid);
  const model = config.modelMapping['coder-fast'];
  const status = isActive ? '✅ ELIGIBLE' : '❌ REJECTED';
  const reason = !isActive ? ` (no env key: ${config.apiKeyEnvVar}=${getEnv(config.apiKeyEnvVar) || 'empty'})` : '';
  console.log(`   ${status} ${pid} → model: ${model}${reason}`);
}

console.log('\n4. Expected winner: groq (first preferred with env key)');
console.log('   Model sent to groq: llama-3.1-8b-instant');
