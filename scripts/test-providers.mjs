import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);
const envContent = readFileSync(join(PROJECT_ROOT, '.env'), 'utf8');
const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/g, '');
};

const tests = [
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    key: getEnv('GROQ_API_KEY'),
    models: ['llama-3.3-70b-versatile', 'llama3.1-8b', 'llama-3.1-8b-instant'],
  },
  {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    key: getEnv('CEREBRAS_API_KEY'),
    models: ['llama3.1-8b', 'llama-3.3-70b'],
  },
  {
    name: 'Cohere',
    baseUrl: 'https://api.cohere.ai/v1',
    key: getEnv('COHERE_API_KEY'),
    models: ['command-r7b-12-2024', 'command-r-plus-08-2024', 'command-r-plus'],
  },
  {
    name: 'SambaNova',
    baseUrl: 'https://api.sambanova.ai/v1',
    key: getEnv('SAMBANOVA_API_KEY'),
    models: ['Meta-Llama-3.3-70B-Instruct', 'Meta-Llama-3.1-70B-Instruct'],
  },
  {
    name: 'HuggingFace',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    key: getEnv('HUGGINGFACE_API_KEY'),
    models: ['meta-llama/Llama-3.2-3B-Instruct', 'meta-llama/Llama-3.1-8B-Instruct'],
  },
  {
    name: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    key: getEnv('FIREWORKS_API_KEY'),
    models: ['accounts/fireworks/models/llama-v3p2-3b-instruct', 'accounts/fireworks/models/llama-v3p1-70b-instruct'],
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    key: getEnv('OPENROUTER_API_KEY'),
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
  },
];

for (const provider of tests) {
  if (!provider.key || provider.key.length === 0) {
    console.log(`⬜ ${provider.name}: NO API KEY`);
    continue;
  }
  console.log(`\n=== ${provider.name} ===`);
  for (const model of provider.models) {
    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply: ok' }],
          max_tokens: 5,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const text = data.choices?.[0]?.message?.content || 'OK';
        console.log(`  ✅ ${model}: "${text}"`);
      } else {
        const err = data.error?.message || JSON.stringify(data).slice(0, 150);
        console.log(`  ❌ ${model}: ${err}`);
      }
    } catch (e) {
      console.log(`  ❌ ${model}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}
