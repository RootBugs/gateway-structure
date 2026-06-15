import { PrismaClient } from '@prisma/client';
const client = new PrismaClient();
const keys = await client.apiKey.findMany({
  where: { isActive: true, revokedAt: null },
  include: { user: { select: { email: true } } },
  take: 5
});
console.log(JSON.stringify(keys, null, 2));
await client.$disconnect();
