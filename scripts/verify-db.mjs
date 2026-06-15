import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);

console.log('=== AI Gateway Verification ===\n');

// Read .env
const envContent = readFileSync(join(PROJECT_ROOT, '.env'), 'utf8');
const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^["']|["']$/g, '');
};

// 1. Check env vars
console.log('1. Environment Variables:');
const keys = [
  'GEMINI_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'COHERE_API_KEY',
  'SAMBANOVA_API_KEY', 'HUGGINGFACE_API_KEY', 'FIREWORKS_API_KEY',
  'TOGETHER_API_KEY', 'OPENROUTER_API_KEY', 'DATABASE_URL', 'JWT_SECRET'
];
for (const key of keys) {
  const val = getEnv(key);
  const status = val && val.length > 0 ? '✅' : '❌';
  console.log(`   ${status} ${key}: ${val ? val.slice(0, 30) + '...' : 'MISSING'}`);
}

// 2. Check DB
console.log('\n2. Database:');
const dbUrl = getEnv('DATABASE_URL');
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
try {
  const providers = await prisma.provider.findMany({ orderBy: { id: 'asc' } });
  const enabled = providers.filter(p => p.isEnabled);
  console.log(`   Providers: ${providers.length} total, ${enabled.length} enabled`);
  for (const p of providers) {
    console.log(`     ${p.isEnabled ? '✅' : '⬜'} ${p.id} (${p.name})`);
  }

  const health = await prisma.providerHealth.findMany({ orderBy: { providerId: 'asc' } });
  const healthy = health.filter(h => h.circuitState === 'closed');
  console.log(`   Health: ${healthy.length}/${health.length} circuit=closed`);
  for (const h of health) {
    const status = h.circuitState === 'closed' ? '✅' : '❌';
    console.log(`     ${status} ${h.providerId}: status=${h.status} circuit=${h.circuitState}`);
  }

  const quota = await prisma.providerQuotaState.findMany({ orderBy: { providerId: 'asc' } });
  console.log(`   Quota: ${quota.length} records`);
  for (const q of quota) {
    console.log(`     ✅ ${q.providerId}: ${q.remainingRequests} req remaining`);
  }

  const aliases = await prisma.modelAlias.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } });
  console.log(`   Model Aliases: ${aliases.length} active`);
  for (const a of aliases) {
    console.log(`     ✅ ${a.alias} (${a.displayName})`);
  }

  const users = await prisma.user.findMany();
  console.log(`   Users: ${users.length}`);
  for (const u of users) {
    console.log(`     ✅ ${u.email} (${u.role})`);
  }
} catch (e) {
  console.log(`   ❌ Error: ${e.message}`);
} finally {
  await prisma.$disconnect();
}

console.log('\n=== Done ===');
