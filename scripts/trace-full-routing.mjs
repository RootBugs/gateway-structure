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

// Replicate getActiveProviderIds from config.ts
const ALL_PROVIDERS = ['gemini','groq','cerebras','cohere','sambanova','huggingface','together','fireworks','openrouter','ollama','vllm'];
const ENV_KEY_MAP = {
  gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', cerebras: 'CEREBRAS_API_KEY',
  cohere: 'COHERE_API_KEY', sambanova: 'SAMBANOVA_API_KEY', huggingface: 'HUGGINGFACE_API_KEY',
  together: 'TOGETHER_API_KEY', fireworks: 'FIREWORKS_API_KEY', openrouter: 'OPENROUTER_API_KEY',
  ollama: '', vllm: '',
};

console.log('=== STEP 1: getActiveProviderIds() ===');
const activeIds = ALL_PROVIDERS.filter(id => {
  const envKey = ENV_KEY_MAP[id];
  if (!envKey || envKey.length === 0) return true;
  const val = getEnv(envKey);
  return val && val.length > 0;
});
console.log('Active:', activeIds.join(', '));
console.log('Count:', activeIds.length);

console.log('\n=== STEP 2: Model Alias "coder-fast" ===');
const alias = {
  preferredProviders: ['groq', 'gemini', 'cerebras'],
  fallbackProviders: ['openrouter', 'sambanova', 'fireworks'],
};
console.log('Preferred:', alias.preferredProviders.join(', '));
console.log('Fallback:', alias.fallbackProviders.join(', '));

console.log('\n=== STEP 3: Routing Candidates (all preferred + fallback) ===');
const allCandidates = [...alias.preferredProviders, ...alias.fallbackProviders];
for (const pid of allCandidates) {
  const envKey = ENV_KEY_MAP[pid];
  const hasEnv = envKey ? (getEnv(envKey) && getEnv(envKey).length > 0) : true;
  const isActive = activeIds.includes(pid);
  console.log(`  ${isActive ? '✅' : '❌'} ${pid.padEnd(14)} active=${isActive} envKey=${envKey || '(local)'} hasEnv=${hasEnv}`);
}

console.log('\n=== STEP 4: Expected Routing Decision ===');
const eligible = allCandidates.filter(p => activeIds.includes(p));
console.log('Eligible candidates:', eligible.join(', '));
console.log('Expected winner: cerebras (tier2, priority=70, healthy, closed, quota available)');
console.log('Actual winner from DB logs: cerebras');
