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

const PROVIDERS = [
  { id: 'gemini', envKey: 'GEMINI_API_KEY', model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'groq', envKey: 'GROQ_API_KEY', model: 'llama-3.1-8b-instant', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'openrouter', envKey: 'OPENROUTER_API_KEY', model: 'openai/gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'cerebras', envKey: 'CEREBRAS_API_KEY', model: 'gpt-oss-120b', baseUrl: 'https://api.cerebras.ai/v1' },
  { id: 'sambanova', envKey: 'SAMBANOVA_API_KEY', model: 'Meta-Llama-3.3-70B-Instruct', baseUrl: 'https://api.sambanova.ai/v1' },
  { id: 'cohere', envKey: 'COHERE_API_KEY', model: 'command-r-plus', baseUrl: 'https://api.cohere.ai/v1' },
  { id: 'huggingface', envKey: 'HUGGINGFACE_API_KEY', model: 'meta-llama/Llama-3.1-8B-Instruct', baseUrl: 'https://api-inference.huggingface.co/v1' },
  { id: 'together', envKey: 'TOGETHER_API_KEY', model: 'meta-llama/Llama-3.2-3B-Instruct-Turbo', baseUrl: 'https://api.together.xyz/v1' },
  { id: 'fireworks', envKey: 'FIREWORKS_API_KEY', model: 'accounts/fireworks/models/gpt-oss-120b', baseUrl: 'https://api.fireworks.ai/inference/v1' },
  { id: 'ollama', envKey: '', model: 'codellama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'vllm', envKey: '', model: 'default', baseUrl: 'http://localhost:8000/v1' },
  { id: 'xiaomimimo', envKey: 'XIAOMIMIMO_API_KEY', model: 'mimo-v2.5', baseUrl: 'https://api.xiaomimimo.com/v1' },
];

console.log('=== Per-Provider Verification ===\n');

for (const p of PROVIDERS) {
  const apiKey = p.envKey ? getEnv(p.envKey) : '';
  const hasKey = p.envKey ? (apiKey && apiKey.length > 0) : true; // local providers don't need key

  // Test direct API call
  let apiOk = false;
  let apiError = '';
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey || 'dummy'}` },
      body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: 'ok' }], max_tokens: 5 }),
    });
    const data = await res.json();
    if (res.ok) {
      apiOk = true;
    } else {
      apiError = data.error?.message || `HTTP ${res.status}`;
    }
  } catch (e) {
    apiError = e.message;
  }

  const status = apiOk ? '✅ WORKS' : `❌ FAIL`;
  const keyStatus = p.envKey ? (hasKey ? 'has key' : 'NO KEY') : 'local';
  console.log(`${status} ${p.id.padEnd(14)} model=${p.model.padEnd(55)} key=${keyStatus}`);
  if (!apiOk && apiError) {
    console.log(`                  └─ ${apiError.slice(0, 100)}`);
  }

  await new Promise(r => setTimeout(r, 1000));
}
