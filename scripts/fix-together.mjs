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
  // Disable Together since TOGETHER_API_KEY is empty
  const togetherKey = getEnv('TOGETHER_API_KEY');
  if (!togetherKey || togetherKey.length === 0) {
    console.log('TOGETHER_API_KEY is empty, disabling Together provider...');
    await prisma.provider.update({ where: { id: 'together' }, data: { isEnabled: false } });
    console.log('✅ Together disabled');
  } else {
    console.log('TOGETHER_API_KEY is set, keeping Together enabled');
  }

  // Verify active providers match env vars
  const activeProviders = await prisma.provider.findMany({ where: { isEnabled: true }, orderBy: { id: 'asc' } });
  console.log('\nActive providers in DB:');
  for (const p of activeProviders) {
    const key = getEnv(`${p.id.toUpperCase()}_API_KEY`) || getEnv(`${p.id.toUpperCase().replace('-', '_')}_API_KEY`);
    const hasKey = key && key.length > 0;
    const localProvider = ['ollama', 'vllm'].includes(p.id);
    const status = localProvider ? '🔧 local' : (hasKey ? '✅ has key' : '❌ NO KEY');
    console.log(`  ${p.id}: ${status}`);
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
