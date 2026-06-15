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

const apiKey = getEnv('GEMINI_API_KEY');

// Test models that are actually available
const models = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
];

for (const model of models) {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with just: OK' }],
        max_tokens: 5,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const text = data.choices?.[0]?.message?.content || JSON.stringify(data).slice(0, 100);
      console.log(`✅ ${model}: "${text}"`);
    } else {
      const err = data.error?.message?.[0]?.error?.message || data.error?.message || JSON.stringify(data).slice(0, 150);
      console.log(`❌ ${model}: ${err}`);
    }
  } catch (e) {
    console.log(`❌ ${model}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 2000));
}
