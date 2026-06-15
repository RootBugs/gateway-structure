import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import logger from "@/lib/logger";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = LoginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid email or password format" },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Check if user accepted terms
    const needsTermsAcceptance = !user.termsAcceptedAt;

    const token = await createSession(user.id, user.email);

    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const ipAddress = req.headers.get("x-forwarded-for") || null;
    const userAgent = req.headers.get("user-agent") || null;

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    logger.info({ userId: user.id, email: user.email, needsTermsAcceptance }, "User logged in");

    const response = NextResponse.json({
      success: true,
      needsTermsAcceptance,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        termsAcceptedAt: user.termsAcceptedAt,
      },
    });
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return response;
  } catch (error) {
    logger.error({ error: (error as Error).message }, "Login failed");
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
