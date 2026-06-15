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

const prisma = new PrismaClient({ datasources: { db: { url: getEnv('DATABASE_URL') } } });

async function main() {
  const users = await prisma.user.findMany();
  console.log('Users in DB:');
  for (const u of users) {
    console.log(`  id=${u.id} email=${u.email} name=${u.name} role=${u.role}`);
  }
  if (users.length === 0) {
    console.log('  NO USERS FOUND - need to create admin user');
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
