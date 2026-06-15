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
console.log(`API Key: ${apiKey ? apiKey.slice(0, 20) + '...' : 'MISSING'}\n`);

// List available models
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
const data = await res.json();

if (data.models) {
  console.log('Available Gemini models:');
  for (const m of data.models) {
    const methods = m.supportedGenerationMethods?.join(', ') || 'none';
    if (methods.includes('generateContent')) {
      console.log(`  ✅ ${m.name} → ${m.displayName} [${methods}]`);
    }
  }
} else {
  console.log('Error:', JSON.stringify(data, null, 2));
}

// Also test OpenAI-compatible listing
console.log('\nOpenAI-compatible models:');
const res2 = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/models', {
  headers: { 'Authorization': `Bearer ${apiKey}` },
});
const data2 = await res2.json();
if (data2.data) {
  for (const m of data2.data) {
    console.log(`  ✅ ${m.id}`);
  }
} else {
  console.log('Error:', JSON.stringify(data2, null, 2).slice(0, 500));
}
