import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/db/prisma";
import logger from "@/lib/logger";

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production!");
  }
  logger.warn("JWT_SECRET not set — using insecure dev fallback. NEVER deploy without JWT_SECRET!");
}

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-only-insecure-jwt-key-do-not-use-in-prod-32ch"
);

export async function createSession(userId: string, email: string): Promise<string> {
  const token = await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(secret);

  return token;
}

export async function verifyAuth(req: Request): Promise<{ id: string; email: string } | null> {
  try {
    const token = req.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];
    if (!token) return null;

    const { payload } = await jwtVerify(token, secret, {
      clockTolerance: 60,
    });

    if (!payload.userId || !payload.email) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId as string },
    });

    if (!user) return null;

    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}
