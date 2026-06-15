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

const apiKey = getEnv('CEREBRAS_API_KEY');
const baseUrl = 'https://api.cerebras.ai/v1';

// List available models
const res = await fetch(`${baseUrl}/models`, {
  headers: { 'Authorization': `Bearer ${apiKey}` },
});
const data = await res.json();
console.log('Cerebras models:', JSON.stringify(data, null, 2).slice(0, 2000));
