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

const apiKey = getEnv('FIREWORKS_API_KEY');
const baseUrl = 'https://api.fireworks.ai/inference/v1';

const res = await fetch(`${baseUrl}/models`, {
  headers: { 'Authorization': `Bearer ${apiKey}` },
});
const data = await res.json();
const models = data.data?.map((m) => m.id) || [];
console.log('Fireworks models:', models.join(', '));
