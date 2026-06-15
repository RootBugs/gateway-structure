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

const hfKey = getEnv('HUGGINGFACE_API_KEY');

// Test router endpoint
const models = [
  'meta-llama/Llama-3.1-8B-Instruct',
  'meta-llama/Llama-3.1-70B-Instruct',
  'Qwen/Qwen3-8B',
  'Qwen/Qwen3-32B',
];

for (const model of models) {
  try {
    const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply: ok' }], max_tokens: 5 }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`  ✅ HF Router ${model}: OK`);
    } else {
      const err = data.error?.message || JSON.stringify(data).slice(0, 150);
      console.log(`  ❌ HF Router ${model}: ${err}`);
    }
  } catch (e) {
    console.log(`  ❌ HF Router ${model}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 2000));
}
