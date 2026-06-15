import { prisma } from "@/lib/db/prisma";

// ============================================================================
// In-Memory Rate Limit Counter
// ============================================================================
// Replaces 2 DB upserts per request with in-memory fast-path.
// DB writes happen in background (fire-and-forget) for persistence across restarts.

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  remainingTokens: number;
  retryAfter?: number;
}

interface MinuteCounter {
  requestCount: number;
  tokenCount: number;
  windowStart: number;
}

const memoryCounters = new Map<string, MinuteCounter>();
const MEMORY_CACHE_TTL_MS = 120_000;

function cleanupMemoryCounters(): void {
  const now = Date.now();
  for (const [key, counter] of memoryCounters) {
    if (now - counter.windowStart > MEMORY_CACHE_TTL_MS) {
      memoryCounters.delete(key);
    }
  }
}

// Run cleanup every 2 minutes (skip in serverless to avoid leaked timers)
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
if (!isServerless && typeof setInterval !== "undefined") {
  setInterval(cleanupMemoryCounters, 120_000);
}



export async function checkRateLimit(
  apiKeyId: string,
  tokens: number
): Promise<RateLimitResult> {
    // === INTERNAL BYPASS for Omega OS ===
  if (apiKeyId === 'internal-omega' || apiKeyId === 'internal') {
    return { allowed: true, remaining: 999999, remainingTokens: 999999 };
  }

  const now = new Date();
  const minuteWindowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const dayWindowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const requestLimitPerMinute = parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || "60");
  const tokenLimitPerMinute = parseInt(process.env.RATE_LIMIT_TOKENS_PER_MINUTE || "80000");
  const tokenLimitPerDay = parseInt(process.env.RATE_LIMIT_TOKENS_PER_DAY || "500000");

  // ======================================================================
  // Fast path: In-memory counter check (no DB query)
  // ======================================================================
  const memKey = `${apiKeyId}:minute:${minuteWindowStart.getTime()}`;
  let memCounter = memoryCounters.get(memKey);

  if (!memCounter) {
    memCounter = { requestCount: 0, tokenCount: 0, windowStart: minuteWindowStart.getTime() };
    memoryCounters.set(memKey, memCounter);
  }

  memCounter.requestCount++;
  memCounter.tokenCount += tokens;

  // Fast-path rejection
  if (memCounter.requestCount > requestLimitPerMinute) {
    return {
      allowed: false,
      remaining: 0,
      remainingTokens: 0,
      retryAfter: 60 - now.getSeconds(),
    };
  }

  if (memCounter.tokenCount > tokenLimitPerMinute) {
    return {
      allowed: false,
      remaining: 0,
      remainingTokens: 0,
      retryAfter: 60 - now.getSeconds(),
    };
  }

  // Check daily limit from memory
  const dayKey = `${apiKeyId}:day:${dayWindowStart.getTime()}`;
  let dayCounter = memoryCounters.get(dayKey);
  if (!dayCounter) {
    dayCounter = { requestCount: 0, tokenCount: 0, windowStart: dayWindowStart.getTime() };
    memoryCounters.set(dayKey, dayCounter);
  }
  dayCounter.tokenCount += tokens;

  if (dayCounter.tokenCount > tokenLimitPerDay) {
    const msUntilMidnight = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0
    ).getTime() - now.getTime();
    return {
      allowed: false,
      remaining: 0,
      remainingTokens: 0,
      retryAfter: Math.ceil(msUntilMidnight / 1000),
    };
  }

  // ======================================================================
  // Slow path: DB writes (fire-and-forget, non-blocking)
  // ======================================================================
  Promise.all([
    prisma.rateLimit.upsert({
      where: {
        apiKeyId_windowType_windowStart: {
          apiKeyId,
          windowType: "minute",
          windowStart: minuteWindowStart,
        },
      },
      update: {
        requestCount: { increment: 1 },
        tokenCount: { increment: tokens },
      },
      create: {
        apiKeyId,
        windowType: "minute",
        windowStart: minuteWindowStart,
        requestCount: 1,
        tokenCount: tokens,
      },
    }),
    prisma.rateLimit.upsert({
      where: {
        apiKeyId_windowType_windowStart: {
          apiKeyId,
          windowType: "day",
          windowStart: dayWindowStart,
        },
      },
      update: {
        tokenCount: { increment: tokens },
      },
      create: {
        apiKeyId,
        windowType: "day",
        windowStart: dayWindowStart,
        requestCount: 0,
        tokenCount: tokens,
      },
    }),
  ]).catch(() => {});

  return {
    allowed: true,
    remaining: Math.max(0, requestLimitPerMinute - memCounter.requestCount),
    remainingTokens: Math.max(0, tokenLimitPerMinute - memCounter.tokenCount),
  };
}
