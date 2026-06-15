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
  // Update model aliases with correct provider lists based on what's actually available
  const aliases = [
    {
      id: 'coder-fast',
      preferredProviders: JSON.stringify(['groq', 'gemini', 'cerebras']),
      fallbackProviders: JSON.stringify(['openrouter', 'sambanova', 'xiaomimimo', 'fireworks']),
    },
    {
      id: 'coder-smart',
    preferredProviders: JSON.stringify(['groq', 'gemini', 'xiaomimimo', 'openrouter']),
    fallbackProviders: JSON.stringify(['cerebras', 'sambanova', 'fireworks']),
    },
    {
      id: 'reasoning',
    preferredProviders: JSON.stringify(['gemini', 'xiaomimimo', 'openrouter', 'groq']),
    fallbackProviders: JSON.stringify(['cerebras', 'sambanova', 'fireworks']),
    },
    {
      id: 'architect',
    preferredProviders: JSON.stringify(['openrouter', 'gemini', 'xiaomimimo', 'groq']),
    fallbackProviders: JSON.stringify(['cerebras', 'sambanova', 'fireworks']),
    },
    {
      id: 'deep-research',
    preferredProviders: JSON.stringify(['gemini', 'xiaomimimo', 'openrouter']),
    fallbackProviders: JSON.stringify(['groq', 'cerebras', 'sambanova', 'fireworks']),
    },
  ];

  for (const a of aliases) {
    await prisma.modelAlias.update({
      where: { id: a.id },
      data: {
        preferredProviders: a.preferredProviders,
        fallbackProviders: a.fallbackProviders,
      },
    });
    console.log(`✅ Updated ${a.id}`);
  }

  console.log('\n✅ All model aliases updated');
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
