// Test script for Xiaomi MiMo provider performance
import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf8');
const match = envContent.match(/^XIAOMIMIMO_API_KEY=(.+)$/m);
const API_KEY = match ? match[1].trim().replace(/^["']|["']$/g, '') : '';

if (!API_KEY) {
  console.log('❌ No API key found');
  process.exit(1);
}

const BASE = 'https://api.xiaomimimo.com/v1';
const MODELS = ['mimo-v2.5', 'mimo-v2.5-pro'];
const PROMPTS = [
  'Reply with just the word: pineapple',
  'What is 3+5? Just the number please',
  'Write a one-line JS function to add two numbers',
];

async function testModel(model, prompt) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 100 }),
    });
    const data = await res.json();
    const ms = Date.now() - start;
    const content = data.choices?.[0]?.message?.content || '';
    const reasoning = data.choices?.[0]?.message?.reasoning_content || '';
    return { ok: res.ok, ms, content, reasoning, status: res.status };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, error: e.message };
  }
}

async function main() {
  console.log('=== Xiaomi MiMo Performance Test ===\n');

  for (const model of MODELS) {
    console.log(`\n--- Model: ${model} ---`);
    let totalMs = 0;
    let successCount = 0;

    for (const prompt of PROMPTS) {
      const result = await testModel(model, prompt);
      totalMs += result.ms;

      if (result.ok) {
        successCount++;
        const contentOk = result.content && result.content.trim().length > 0 ? '✅ has content' : '⚠️ empty content';
        const avgMs = result.ms;
        console.log(`  Prompt: "${prompt.slice(0, 40)}..."`);
        console.log(`    Status: ${result.status} | Latency: ${avgMs}ms | ${contentOk}`);
        if (result.content) console.log(`    Content: "${result.content.slice(0, 100)}"`);
        if (result.reasoning) console.log(`    Reasoning present: ${result.reasoning.slice(0, 60)}...`);
      } else {
        console.log(`  ❌ ${prompt.slice(0, 40)}... Error: ${result.error}`);
      }
      await new Promise(r => setTimeout(r, 500));
    }

    const avg = totalMs / PROMPTS.length;
    console.log(`  → Avg latency: ${Math.round(avg)}ms | ${successCount}/${PROMPTS.length} successful`);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
