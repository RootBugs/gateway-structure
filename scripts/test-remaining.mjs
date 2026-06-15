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

async function testModel(name, baseUrl, key, model) {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply: ok' }], max_tokens: 5 }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`  ✅ ${name} ${model}: OK`);
      return true;
    } else {
      const err = data.error?.message || JSON.stringify(data).slice(0, 100);
      console.log(`  ❌ ${name} ${model}: ${err}`);
      return false;
    }
  } catch (e) {
    console.log(`  ❌ ${name} ${model}: ${e.message}`);
    return false;
  }
}

console.log('=== Testing updated model mappings ===\n');

const samKey = getEnv('SAMBANOVA_API_KEY');
if (samKey) {
  await testModel('SambaNova', 'https://api.sambanova.ai/v1', samKey, 'Meta-Llama-3.3-70B-Instruct');
  await new Promise(r => setTimeout(r, 2000));
  await testModel('SambaNova', 'https://api.sambanova.ai/v1', samKey, 'Llama-3.3-70B-Instruct');
}

const hfKey = getEnv('HUGGINGFACE_API_KEY');
if (hfKey) {
  await testModel('HF', 'https://api-inference.huggingface.co/v1', hfKey, 'meta-llama/Llama-3.1-8B-Instruct');
  await new Promise(r => setTimeout(r, 2000));
  await testModel('HF', 'https://api-inference.huggingface.co/v1', hfKey, 'meta-llama/Llama-3.1-70B-Instruct');
}

const cohereKey = getEnv('COHERE_API_KEY');
if (cohereKey) {
  await testModel('Cohere', 'https://api.cohere.ai/v1', cohereKey, 'command-r-plus');
}

const fwKey = getEnv('FIREWORKS_API_KEY');
if (fwKey) {
  await testModel('Fireworks', 'https://api.fireworks.ai/inference/v1', fwKey, 'accounts/fireworks/models/gpt-oss-120b');
  await new Promise(r => setTimeout(r, 2000));
  await testModel('Fireworks', 'https://api.fireworks.ai/inference/v1', fwKey, 'accounts/fireworks/models/kimi-k2p6');
}

const orKey = getEnv('OPENROUTER_API_KEY');
if (orKey) {
  await testModel('OpenRouter', 'https://openrouter.ai/api/v1', orKey, 'openai/gpt-4o-mini');
  await new Promise(r => setTimeout(r, 2000));
  await testModel('OpenRouter', 'https://openrouter.ai/api/v1', orKey, 'anthropic/claude-sonnet-4');
}
