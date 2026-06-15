import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authenticateApiRequest } from "@/lib/auth/api-key-middleware";
import logger from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Require admin authentication
  const auth = await authenticateApiRequest(request);
  if (!auth.success) {
    return auth.response;
  }

  // Require admin role
  const user = await prisma.user.findUnique({
    where: { id: auth.context.userId },
    select: { role: true },
  });
  if (!user || (user.role !== "admin" && user.role !== "owner")) {
    return NextResponse.json({ error: "Forbidden: admin access required" }, { status: 403 });
  }

  try {
    // Get all API keys with their status
    const keys = await prisma.apiKey.findMany({
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      isActive: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      user: {
        select: { email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

    return NextResponse.json({
      totalKeys: keys.length,
      activeKeys: keys.filter((k) => k.isActive && !k.revokedAt).length,
      keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix + "...",
      isActive: k.isActive,
      isRevoked: !!k.revokedAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
        userEmail: k.user.email,
      })),
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Failed to fetch API keys");
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }
}
