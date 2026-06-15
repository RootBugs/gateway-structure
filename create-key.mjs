import { PrismaClient } from '@prisma/client';
import pkg from 'bcryptjs';
import { randomBytes } from 'crypto';

const { hash } = pkg;

const rawKey = 'sk-team-' + randomBytes(24).toString('hex');
const keyPrefix = rawKey.substring(0, 12);
const keyHash = await hash(rawKey, 10);

const client = new PrismaClient();

// Get the first user
const user = await client.user.findFirst();
if (!user) { console.error('No users found'); process.exit(1); }

const apiKey = await client.apiKey.create({
  data: {
    userId: user.id,
    name: 'diagnostic-test-key',
    keyHash,
    keyPrefix,
    isActive: true,
  }
});

console.log('RAW KEY (save this):', rawKey);
console.log('Key ID:', apiKey.id);
await client.$disconnect();
