import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { compare } from "bcryptjs";
import logger from "@/lib/logger";

// ============================================================================
// API Key Authentication Middleware
// ============================================================================
// Validates Bearer sk-team-xxxxx against hashed keys in database.
// Returns user context for downstream use.
// ============================================================================

export interface AuthenticatedContext {
  apiKeyId: string;
  userId: string;
  userEmail: string;
  userRole: string;
  keyName: string;
}

// ============================================================================
// In-Memory Auth Cache
// ============================================================================
// Caches verified API key lookups to skip DB + bcrypt on repeated requests.
// TTL: 60 seconds. Keys are invalidated on failure or revocation.

interface AuthCacheEntry {
  context: AuthenticatedContext;
  expiresAt: number;
}

const AUTH_CACHE_TTL_MS = 60_000; // 60 seconds
const authCache = new Map<string, AuthCacheEntry>();

function getCachedAuth(keyPrefix: string): AuthenticatedContext | null {
  const entry = authCache.get(keyPrefix);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(keyPrefix);
    return null;
  }
  return entry.context;
}

function setCachedAuth(keyPrefix: string, context: AuthenticatedContext): void {
  authCache.set(keyPrefix, {
    context,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
}

// ============================================================================
// Main Auth Function
// ============================================================================

export async function authenticateApiRequest(
  req: NextRequest
): Promise<
  | { success: true; context: AuthenticatedContext }
  | { success: false; response: NextResponse }
> {
const requestId = req.headers.get("X-Request-ID") || `req_${Date.now()}`;

  // === LOCALHOST BYPASS (development only) ===
  if (process.env.NODE_ENV !== "production") {
    const _host = req.headers.get("host") || "";
    if (_host.includes("localhost") || _host.includes("127.0.0.1")) {
      return {
        success: true,
        context: { apiKeyId: "internal", userId: "internal", userEmail: "dev@local", userRole: "admin", keyName: "dev-bypass" },
      };
    }
  }


  // Extract Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    logger.warn(
  {
    requestId,
    ip: req.headers.get("x-forwarded-for") ?? "unknown",
  },
  "Missing Authorization header"
);
    return {
      success: false,
      response: createErrorResponse(401, "missing_authorization", "Missing Authorization header", requestId),
    };
  }

  // Parse Bearer token
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    logger.warn({ requestId, authHeader }, "Invalid Authorization format");
    return {
      success: false,
      response: createErrorResponse(
        401,
        "invalid_authorization",
        "Invalid Authorization format. Use: Bearer sk-team-xxxxxxxx",
        requestId
      ),
    };
  }

  const rawKey = parts[1];

  // Validate key format
  if (!rawKey.startsWith("sk-team-")) {
    logger.warn({ requestId, keyPrefix: rawKey.substring(0, 12) }, "Invalid API key prefix");
    return {
      success: false,
      response: createErrorResponse(401, "invalid_key_format", "Invalid API key format", requestId),
    };
  }

  // Check cache first (skip DB + bcrypt)
  const keyPrefix = rawKey.substring(0, 12);
  const cached = getCachedAuth(keyPrefix);
  if (cached) {
    logger.info({ requestId, apiKeyId: cached.apiKeyId, cached: true }, "API key authenticated (cached)");
    return { success: true, context: cached };
  }

  // Cache miss — query DB and verify hash
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      keyPrefix,
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (apiKeys.length === 0) {
    logger.warn({ requestId, keyPrefix }, "API key not found");
    return {
      success: false,
      response: createErrorResponse(401, "invalid_api_key", "Invalid API key", requestId),
    };
  }

  // Verify hash against all matching keys
  let matchedKey = null;
  for (const key of apiKeys) {
    const isValid = await compare(rawKey, key.keyHash);
    if (isValid) {
      matchedKey = key;
      break;
    }
  }

  if (!matchedKey) {
    logger.warn({ requestId, keyPrefix }, "API key hash mismatch");
    return {
      success: false,
      response: createErrorResponse(401, "invalid_api_key", "Invalid API key", requestId),
    };
  }

  const context: AuthenticatedContext = {
    apiKeyId: matchedKey.id,
    userId: matchedKey.userId,
    userEmail: matchedKey.user.email,
    userRole: matchedKey.user.role,
    keyName: matchedKey.name,
  };

  // Cache for future requests
  setCachedAuth(keyPrefix, context);

  // Update last used timestamp (fire-and-forget, don't block response)
  prisma.apiKey.update({
    where: { id: matchedKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {}); // Ignore errors

  logger.info({
    requestId,
    apiKeyId: matchedKey.id,
    userId: matchedKey.userId,
    keyName: matchedKey.name,
  }, "API key authenticated");

  return { success: true, context };
}

// ============================================================================
// OpenAI-Compatible Error Response
// ============================================================================

function createErrorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string
): NextResponse {
  return NextResponse.json(
    {
      error: {
        message,
        type: code,
        param: null,
        code,
      },
      request_id: requestId,
    },
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
    }
  );
}
