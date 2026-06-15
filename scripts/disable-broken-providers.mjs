import { PrismaClient } from '@prisma/client';
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

const dbUrl = getEnv('DATABASE_URL');
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function main() {
  // Disable providers that don't work
  const toDisable = [];

  // HuggingFace - no Inference Providers permission
  toDisable.push('huggingface');

  // Cohere - v1 endpoint returns unexpected JSON
  toDisable.push('cohere');

  for (const id of toDisable) {
    await prisma.provider.update({ where: { id }, data: { isEnabled: false } });
    console.log(`⬜ Disabled: ${id}`);
  }

  // Verify final state
  const providers = await prisma.provider.findMany({ orderBy: { id: 'asc' } });
  console.log('\nFinal provider state:');
  for (const p of providers) {
    const key = getEnv(`${p.id.toUpperCase()}_API_KEY`) || '';
    const hasKey = key && key.length > 0;
    const status = p.isEnabled ? '✅' : '⬜';
    console.log(`  ${status} ${p.id} (key: ${hasKey ? 'yes' : 'no'})`);
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
