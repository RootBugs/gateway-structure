import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

console.log('=== Verification Script ===\n');

// 1. Check .env
console.log('1. Checking .env...');
const envContent = readFileSync('.env', 'utf8');
const keys = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'COHERE_API_KEY', 'SAMBANOVA_API_KEY', 'HUGGINGFACE_API_KEY', 'FIREWORKS_API_KEY', 'TOGETHER_API_KEY', 'OPENROUTER_API_KEY', 'DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET'];
for (const key of keys) {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  const val = match ? match[1].trim() : '';
  const status = val && val.length > 0 ? '✅' : '❌ EMPTY';
  console.log(`   ${status} ${key}: ${val ? val.slice(0, 20) + '...' : 'MISSING'}`);
}

// 2. Check Prisma DB connection
console.log('\n2. Checking database connection...');
const prisma = new PrismaClient();
try {
  const providers = await prisma.provider.findMany({ orderBy: { id: 'asc' } });
  console.log(`   ✅ Connected. ${providers.length} providers in DB.`);

  const enabled = providers.filter(p => p.isEnabled);
  console.log(`   ✅ ${enabled.length} providers enabled: ${enabled.map(p => p.id).join(', ')}`);

  const health = await prisma.providerHealth.findMany();
  const healthy = health.filter(h => h.circuitState === 'closed');
  console.log(`   ✅ ${healthy.length}/${health.length} providers circuit=closed`);

  const quota = await prisma.providerQuotaState.findMany();
  console.log(`   ✅ ${quota.length} quota records`);

  const aliases = await prisma.modelAlias.findMany({ where: { isActive: true } });
  console.log(`   ✅ ${aliases.length} active model aliases: ${aliases.map(a => a.alias).join(', ')}`);

  const users = await prisma.user.findMany();
  console.log(`   ✅ ${users.length} users`);

  // 3. Check each provider's model mapping
  console.log('\n3. Provider model mappings:');
  const { PROVIDER_CONFIGS, MODEL_ALIASES, getActiveProviderIds } = await import('./src/lib/providers/config.ts');
  const activeIds = getActiveProviderIds();
  console.log(`   Active providers (env vars): ${activeIds.join(', ')}`);

  for (const alias of aliases) {
    const aliasConfig = MODEL_ALIASES[alias.alias];
    if (aliasConfig) {
      const pref = aliasConfig.preferredProviders.filter(p => activeIds.includes(p));
      const fall = aliasConfig.fallbackProviders.filter(p => activeIds.includes(p));
      console.log(`   ${alias.alias}: preferred=[${pref.join(',')}] fallback=[${fall.join(',')}]`);
      if (pref.length === 0 && fall.length === 0) {
        console.log(`   ❌ NO ACTIVE PROVIDERS for ${alias.alias}!`);
      }
    }
  }
} catch (e) {
  console.log(`   ❌ DB Error: ${e.message}`);
} finally {
  await prisma.$disconnect();
}

console.log('\n=== Done ===');
