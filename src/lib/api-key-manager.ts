import { prisma } from "@/lib/db/prisma";
import { hash, compare } from "bcryptjs";
import { nanoid } from "nanoid";
import logger from "@/lib/logger";

const KEY_PREFIX = "sk-team-";
const KEY_LENGTH = 32;

export async function createApiKey(
  userId: string,
  name: string
): Promise<{ key: string; id: string }> {
  const rawKey = `${KEY_PREFIX}${nanoid(KEY_LENGTH)}`;
  const keyHash = await hash(rawKey, 10);
  const keyPrefix = rawKey.substring(0, 12);

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyHash,
      keyPrefix,
    },
  });

  logger.info({ userId, keyId: apiKey.id }, "API key created");

  return { key: rawKey, id: apiKey.id };
}

// validateApiKey removed — use authenticateApiRequest from api-key-middleware.ts instead
// (middleware has 60s auth cache, fire-and-forget lastUsedAt, and proper error handling)

export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!apiKey) return false;

  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });

  logger.info({ keyId, userId }, "API key revoked");
  return true;
}

export async function renameApiKey(
  keyId: string,
  userId: string,
  newName: string
): Promise<boolean> {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!apiKey) return false;

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { name: newName },
  });

  return true;
}

export async function getApiKeysForUser(userId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { requestLogs: true },
      },
    },
  });

  // Aggregate token usage in a single query instead of N+1 per key
  const keyIds = keys.map(k => k.id);
  const tokenSums = keyIds.length > 0
    ? await prisma.requestLog.groupBy({
        by: ["apiKeyId"],
        where: { apiKeyId: { in: keyIds } },
        _sum: { tokensIn: true, tokensOut: true },
      })
    : [];

  const tokenMap = new Map<string, number>();
  for (const row of tokenSums) {
    if (row.apiKeyId) {
      tokenMap.set(row.apiKeyId, (row._sum.tokensIn ?? 0) + (row._sum.tokensOut ?? 0));
    }
  }

  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.keyPrefix,
    isActive: key.isActive,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    totalRequests: key._count.requestLogs,
    totalTokens: tokenMap.get(key.id) || 0,
  }));
}
