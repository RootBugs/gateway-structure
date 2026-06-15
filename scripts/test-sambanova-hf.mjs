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

// SambaNova
const samKey = getEnv('SAMBANOVA_API_KEY');
if (samKey) {
  const res = await fetch('https://api.sambanova.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${samKey}` },
  });
  const data = await res.json();
  const models = data.data?.map((m) => m.id) || [];
  console.log('SambaNova models:', models.join(', '));
} else {
  console.log('SambaNova: NO KEY');
}

// HuggingFace
const hfKey = getEnv('HUGGINGFACE_API_KEY');
if (hfKey) {
  const res = await fetch('https://api-inference.huggingface.co/v1/models', {
    headers: { 'Authorization': `Bearer ${hfKey}` },
  });
  const data = await res.json();
  const models = data.data?.map((m) => m.id) || [];
  console.log('HF models count:', models.length);
  console.log('HF models (first 10):', models.slice(0, 10).join(', '));
} else {
  console.log('HuggingFace: NO KEY');
}
