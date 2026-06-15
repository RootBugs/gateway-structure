import { prisma } from "@/lib/db/prisma";

export async function getDashboardStats() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalRequests,
    totalTokens,
    activeConversations,
    avgLatency,
    recentRequests,
  ] = await Promise.all([
    prisma.requestLog.count({
      where: { createdAt: { gte: last24h } },
    }),
    prisma.requestLog.aggregate({
      where: { createdAt: { gte: last24h } },
      _sum: {
        tokensIn: true,
        tokensOut: true,
      },
    }),
    prisma.conversation.count({
      where: { isActive: true, updatedAt: { gte: last24h } },
    }),
    prisma.requestLog.aggregate({
      where: { 
        createdAt: { gte: last24h },
        status: "success",
      },
      _avg: {
        latencyMs: true,
      },
    }),
    prisma.requestLog.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        providerId: true,
        modelAlias: true,
        modelUsed: true,
        status: true,
        tokensIn: true,
        tokensOut: true,
        latencyMs: true,
        createdAt: true,
        streaming: true,
        provider: {
          select: {
            displayName: true,
          },
        },
      },
    }),
  ]);

  return {
    totalRequests,
    totalTokens: (totalTokens._sum.tokensIn || 0) + (totalTokens._sum.tokensOut || 0),
    activeConversations,
    avgLatency: Math.round(avgLatency._avg.latencyMs || 0),
    recentRequests: recentRequests.map(r => ({
      id: r.id,
      providerName: r.provider?.displayName || r.providerId,
      modelAlias: r.modelAlias,
      modelUsed: r.modelUsed,
      status: r.status,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      latencyMs: r.latencyMs,
      createdAt: r.createdAt,
      streaming: r.streaming,
    })),
  };
}
