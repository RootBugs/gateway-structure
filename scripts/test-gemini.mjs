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
const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';

// Test different model names
const modelNames = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash-002',
];

async function testModel(model) {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ ${model}: OK → "${data.choices?.[0]?.message?.content || 'no content'}"`);
      return true;
    } else {
      const errMsg = data.error?.message || JSON.stringify(data).slice(0, 150);
      console.log(`❌ ${model}: HTTP ${res.status} → ${errMsg}`);
      return false;
    }
  } catch (e) {
    console.log(`❌ ${model}: ${e.message}`);
    return false;
  }
}

console.log('Testing Gemini model names...\n');
for (const model of modelNames) {
  await testModel(model);
  await new Promise(r => setTimeout(r, 500)); // rate limit protection
}
