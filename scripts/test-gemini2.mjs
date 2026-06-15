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

// Test with the native Gemini endpoint (not OpenAI-compatible)
const nativeModels = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite-preview-02-05',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

async function testNative(model) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say hi in one word' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'no content';
      console.log(`✅ NATIVE ${model}: OK → "${text}"`);
      return true;
    } else {
      const errMsg = data.error?.message || JSON.stringify(data).slice(0, 200);
      console.log(`❌ NATIVE ${model}: HTTP ${res.status} → ${errMsg}`);
      return false;
    }
  } catch (e) {
    console.log(`❌ NATIVE ${model}: ${e.message}`);
    return false;
  }
}

// Test with OpenAI-compatible endpoint
async function testOpenAI(model) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say hi in one word' }],
        max_tokens: 10,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const text = data.choices?.[0]?.message?.content || 'no content';
      console.log(`✅ OPENAI  ${model}: OK → "${text}"`);
      return true;
    } else {
      const errMsg = data.error?.message || JSON.stringify(data).slice(0, 200);
      console.log(`❌ OPENAI  ${model}: HTTP ${res.status} → ${errMsg}`);
      return false;
    }
  } catch (e) {
    console.log(`❌ OPENAI  ${model}: ${e.message}`);
    return false;
  }
}

console.log('=== Testing Gemini Native Endpoint ===\n');
for (const model of nativeModels) {
  await testNative(model);
  await new Promise(r => setTimeout(r, 1000));
}

console.log('\n=== Testing Gemini OpenAI-Compatible Endpoint ===\n');
for (const model of nativeModels) {
  await testOpenAI(model);
  await new Promise(r => setTimeout(r, 1000));
}
